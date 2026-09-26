# RSS 실제 연동 + 2계층(articles_triage) Gemini 분류

> 작성일: 2026-09-23
> 관련 문서: [schema.md](../schema.md), [007-matching-api-and-deploy.md](007-matching-api-and-deploy.md)

---

## 1. 한 줄 요약

목업 데이터를 걷어내고, 금융위 RSS에서 실제 보도자료를 가져와 `articles_raw`를 채우는 자동 수집기를 만들었다. 이어서 Gemini로 문서를 분류해 `articles_triage`(2계층)를 채우는 파이프라인도 만들어 일부(3/23건) 처리까지 확인했다. `articles_detail`(3계층)은 프롬프트·검증 방식만 설계하고 구현은 다음으로 미뤘다.

## 2. 왜 만들었는가

`CLAUDE.md` 9절 우선순위상 지금까지는 목업 20건으로 구조만 검증한 상태였다(003 작업일지). 실제 서비스가 되려면 (1) 진짜 RSS 데이터가 들어와야 하고 (2) `schema.md` 11절이 정한 순서대로 "1계층 → 2계층" 구조화가 이어져야 한다. 이번 작업이 그 두 단계다.

## 3. 구현한 것

- `app/article_extract.py`: RSS/게시판 본문에서 데이터표를 걸러내고 텍스트만 뽑는 공통 로직 (`schema.md` 8절 v3 규칙)
- `app/rss_collector.py`: 금융위 RSS를 매일 확인해 신규 보도자료만 `articles_raw`에 저장 — Vercel Cron이 매일 호출 (`app/main.py`의 `GET /api/collect`, `vercel.json`의 `crons`)
- `scripts/backfill_articles.py`: RSS가 못 보여주는 과거분(9/14~)을 게시판 목록 페이지에서 한 번만 채우는 일회성 스크립트
- 목업 데이터(90001~90020) 3개 탭 전부 삭제
- `app/triage_collector.py`: `articles_raw`(`status=active`)를 Gemini로 분류해 `articles_triage`에 저장하는 2계층 수집기 — 23건 중 3건 처리 완료, 나머지는 무료 티어 일일 한도로 내일 이어감

## 4. 동작 흐름

```
[매일] 금융위 RSS
  → 이미 시트에 있는 article_id는 건너뜀
  → 본문에서 데이터표 제거
  → articles_raw 저장 (status: active / skipped_no_body)

[1회성] 게시판 목록 페이지(9/14~)
  → article_id/제목/날짜 목록 확인
  → 상세페이지에서 본문만 추출
  → articles_raw에 없는 것만 저장

[2계층] articles_raw (status=active, 아직 분류 안 된 것)
  → Gemini(gemini-3.5-flash)에 제목+본문 전달
  → doc_type/topics/personal_relevance/one_line_summary/audience_groups JSON으로 응답
  → 허용 값인지 코드로 한 번 더 검증
  → articles_triage 저장
```

## 5. 주요 파일

- `app/article_extract.py`: 본문 추출 공통 로직 (표 판별, article_id 추출, 1계층 행 생성) — RSS 수집기와 백필 스크립트가 공유
- `app/rss_collector.py`: 매일 자동 실행되는 진짜 수집기 (dedup 방식)
- `scripts/backfill_articles.py`: 과거분 일회성 수집 (게시판 HTML 페이지네이션)
- `app/main.py`: `GET /api/collect` 추가 (Vercel Cron이 호출, `CRON_SECRET`으로 무단 호출 방지)
- `vercel.json`: `crons` 설정 — 매일 UTC 21시(한국시간 06시) 1회
- `app/triage_collector.py`: 2계층 분류기 — 프롬프트, structured output 스키마, 사후 검증, 재시도, 시트 저장

## 6. 핵심 코드 / 개념

**"오늘 날짜"가 아니라 "이미 있는지"로 신규 여부 판단**

```python
existing_ids = set(worksheet.col_values(1)[1:])
if article_id in existing_ids:
    continue
```

RSS는 최신 10건만 보여준다. 그래서 실행을 하루 걸러도, 오늘처럼 서비스를 막 시작해도 dedup 방식이면 RSS에 남아있는 한 자동으로 누락분까지 채워진다. 실제로 서비스 시작일 기준 어제(9/21)치까지 이 방식만으로 자연스럽게 들어왔다.

**RSS가 못 보여주는 과거분은 게시판 HTML로 우회**

RSS는 페이지 파라미터를 줘도 항상 최신 10건만 준다. 대신 게시판 목록 페이지(`fsc.go.kr/no010101?curPage=2`)는 페이지가 넘어간다는 걸 확인해서, 정규식으로 `(article_id, title, published_at)`을 뽑고 날짜가 목표(9/14)보다 오래된 게 나오면 멈추는 방식으로 과거분을 채웠다. 이건 매일 도는 코드가 아니라 딱 한 번 실행하는 보조 스크립트다.

**Gemini structured output으로 "지어낸 값" 원천 차단**

```python
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "doc_type": {"type": "STRING", "enum": DOC_TYPES},
        "topics": {"type": "ARRAY", "items": {"type": "STRING", "enum": TOPICS}},
        ...
    },
}
```

`response_schema`에 허용 값(enum)을 박아두면, Gemini가 "가상자산" 같은 목록 밖 값을 답으로 내놓는 것 자체가 API 레벨에서 불가능해진다. 이게 `schema.md` 8~9절의 "값이 부족하다고 확인되기 전엔 임의로 안 늘린다" 원칙을 코드로 강제하는 방법이다. 그래도 혹시 몰라서 응답을 받은 뒤 코드에서 한 번 더 허용 값 안인지 확인한다 (`is_valid` 함수) — 이중 방어선.

**프롬프트에 "반례"를 직접 박아둔다**

```
주의: doc_type만 보고 판단하지 말 것. 예를 들어 "채용박람회 개최" 안내(info 유형)라도
날짜·장소·신청방법이 있으면 direct다. "펀드 운용사 대상 지원"(support_program 유형)이라도
대상이 기관이면 none이다.
```

`schema.md` 3절에 있던 실제 반례 2건을 프롬프트에 그대로 넣었다. "기준만 설명"하는 것보다 "이 기준으로 이렇게 틀릴 수 있다"는 반례를 보여주는 쪽이 LLM 판단을 덜 흔들리게 한다는 게 schema.md 설계 당시의 결론이었고, 실제로 3건 테스트에서 "전통시장 방문"(표면적으로는 행사 안내)이 소상공인 지원 프로그램 때문에 `direct`로 정확히 분류됐다.

**호출마다 바로 저장 — 배치 끝날 때 한 번에 안 씀**

```python
for i, row in enumerate(targets):
    result = classify_with_retry(client, row["title"], row["body_text"])
    if is_valid(result):
        triage_ws.append_row(build_triage_row(str(row["article_id"]), result))
```

처음엔 전부 처리한 뒤 한 번에 저장했는데, 20건 넘게 순차 호출하다 보니 중간에 멈출 위험이 실제로 있었다(8번 참고). 건마다 바로 저장하면, 중간에 뭐가 터져도 그 전까지 처리한 건 이미 안전하게 시트에 남는다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| `feedparser` | RSS XML을 파이썬이 다루기 쉬운 객체로 파싱 |
| `requests` | RSS/게시판 HTML을 HTTP로 가져옴 |
| `BeautifulSoup` | HTML에서 표를 지우고 텍스트만 추출 |
| `google-genai` | Gemini API 호출용 공식 SDK (구 `google-generativeai`는 지원 종료됨) |
| Gemini `response_schema` | LLM 응답을 enum 기반 JSON으로 강제 |
| Vercel Cron | 배포된 서버리스 함수를 매일 정해진 시간에 자동 호출 |

## 8. 문제와 해결

- **문제**: 목업 데이터를 지우려고 시트를 1행(헤더)까지 줄이려 하니 `Sorry, it is not possible to delete all non-frozen rows` 에러
  **원인**: 헤더 행이 "고정(frozen)"되어 있어서, 비고정 행을 0개로 만드는 건 구글시트 API가 막아둠
  **해결**: 최소 1개의 비고정 행은 남기고(`resize(rows=2)`), 그 행의 내용만 비움
  **배운 점**: 목업 정리 도중 생긴 빈 행이 이후 2계층 dedup 로직에서 "빈 article_id도 있는 셈"이 돼 혼란을 줬다 — 정리 작업의 부작용을 다음 단계 시작 전에 반드시 확인해야 한다

- **문제**: 2계층 재실행 시 이미 처리한 기사(87766, 87753)가 다시 저장돼 중복 발생
  **원인**: 구글시트에서 읽은 숫자 셀은 `get_all_records()`가 자동으로 int로 바꾸는데, dedup 비교 대상(`col_values()`)은 항상 문자열이라 `int != str`로 항상 "새 글"로 오판
  **해결**: 비교 전에 `str()`로 타입을 맞춤
  **배운 점**: 구글시트 라이브러리가 셀 타입을 "똑똑하게" 추론해주는 게 오히려 dedup 같은 정확한 비교 로직에서는 함정이 될 수 있다

- **문제**: Gemini 호출에 timeout을 안 걸어놨더니 네트워크 문제로 프로세스가 8분 넘게 멈춰서 강제 종료해야 했음
  **원인**: `genai.Client`에 `http_options`를 안 주면 기본 timeout이 매우 길거나 없음
  **해결**: `timeout=60_000`(60초)을 명시하고, 504 같은 일시적 서버 오류는 잠깐 쉬었다 최대 3번 재시도하는 로직 추가
  **배운 점**: 외부 API를 여러 번 순차 호출하는 배치 코드는 "언젠가 한 번은 응답이 안 온다"고 가정하고 짜야 한다

- **문제**: `gemini-3.5-flash` 무료 티어가 **하루 20회**로 제한돼 있어서, 23건 중 3건만 처리하고 나머지 19건은 `429 RESOURCE_EXHAUSTED`로 막힘
  **원인**: 무료 티어의 일일 요청 수 자체가 낮게 잡혀 있음 (다른 최신 모델 `gemini-3.6-flash`는 별도 할당량이라 정상 동작 확인)
  **해결**: 사용자와 상의해 오늘은 여기서 멈추고, 내일 할당량이 리셋되면 같은 모델로 이어서 처리하기로 결정 (모델을 임의로 바꾸지 않음 — `CLAUDE.md` 10절)
  **배운 점**: 무료 API 티어를 쓸 땐 분당 한도(RPM)뿐 아니라 **일일 한도(RPD)** 도 미리 확인해야 한다

## 9. 의사결정

- **왜 RSS 본문을 기사 페이지에서 따로 안 긁어왔나** — RSS의 `<description>`에 이미 본문 HTML 전체가 들어있는 걸 확인했다. 페이지를 추가로 요청할 필요가 없어서, 매일 자동 실행되는 수집기는 RSS 호출 한 번으로 끝난다
- **왜 "오늘 날짜"가 아니라 "이미 시트에 있는지"로 신규를 판단했나** — 날짜 기준이면 서비스를 막 시작한 날 그 전날치가 비어 보이는 문제가 있었다. dedup 기준이면 이 문제가 별도 로직 없이 자연히 해결된다
- **왜 과거분(9/14~)은 RSS 대신 게시판 HTML로 가져왔나** — RSS는 페이지네이션이 안 먹혀서 항상 최신 10건만 준다. 게시판 목록 페이지는 페이지가 넘어가서, 데이터셋을 늘리려는 목적에는 이쪽이 유일한 방법이었다
- **왜 매일 자동 실행을 Vercel Cron으로 했나** — GitHub Actions도 후보였지만, 이미 Vercel에 구글 인증 정보가 환경변수로 등록돼 있어서(007 작업일지) 새로운 비밀 저장소를 안 만들어도 됐다. Vercel Hobby 플랜도 하루 1회 cron은 무료로 지원한다
- **왜 Gemini 모델을 `gemini-3.5-flash`로 정했나** — `CLAUDE.md` 10절에 따라 Claude가 임의로 정하지 않고 사용자가 직접 선택함. 할당량 문제가 드러난 뒤에도 모델을 바꾸지 않고 "기다렸다 계속"을 택함 — 정확도가 검증된 선택을 유지하는 쪽을 우선함
- **왜 3계층(articles_detail)은 이번에 구현 안 했나** — 3계층은 2계층의 `personal_relevance` 결과에 따라 처리 방식이 갈리는 구조라(직접 실행할 데이터가 없음), 2계층이 전부 끝난 뒤에 시작하는 게 순서상 맞다. 이번엔 프롬프트·검증 방식(아래 12절)만 설계하고 구현은 다음으로 미룸

## 10. 배운 것

1. `response_schema`로 LLM 응답을 enum까지 강제할 수 있다는 것 — 프롬프트로 "이 값만 써줘"라고 부탁하는 것보다 훨씬 확실한 방법이다
2. 무료 API 티어는 RPM(분당)뿐 아니라 RPD(일일) 한도도 따로 있고, 이 둘을 구분해서 에러 메시지를 읽어야 원인을 정확히 알 수 있다
3. 구글시트처럼 "타입을 자동으로 추론해주는" 라이브러리는 편하지만, 정확한 비교가 필요한 곳(dedup)에서는 명시적으로 타입을 맞춰야 한다
4. 배치 작업은 "끝나고 한 번에 저장"보다 "건마다 바로 저장"이 장애 대응에 훨씬 유리하다

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 2계층 미완료 | 23건 중 3건만 처리, 19건은 내일 할당량 리셋 후 이어서 실행 필요 |
| 3계층 미구현 | `articles_detail`은 아직 코드 없음 — 프롬프트/검증 방식만 설계됨 |
| `CRON_SECRET` 미등록 | Vercel 배포본의 `/api/collect`가 아직 무단 호출에 열려있음 (dedup 덕에 중복 저장은 안 되지만 API 호출 낭비는 가능) |
| 모델별 정확한 무료 할당량 불명 | 공식 문서에 로그인 없이는 수치가 안 나와서, 실제 호출로 부딪혀보고서야 `gemini-3.5-flash`가 하루 20회라는 걸 알았다 |

## 12. 다음 단계

1. 내일 할당량 리셋 후 `python -m app.triage_collector`로 남은 19건 마저 처리
2. 3계층(`articles_detail`) 구현 — 설계는 아래처럼 정해뒀다:
   - `personal_relevance`가 `none`이면 호출 자체를 안 하고, `indirect`면 `summary_easy`만 묻는 가벼운 호출, `direct`면 8개 필드 전부 묻는 무거운 호출로 나눈다
   - 프롬프트에 "원문에 없으면 반드시 null, 추측 금지"를 강하게 명시하고, `evidence_quotes`를 원문 그대로 인용하게 시킨다
   - 응답을 받은 뒤 `evidence_quotes`가 실제로 `body_text` 안에 있는지 코드로 대조해서, 못 찾으면 환각 의심으로 저장을 보류한다
3. `/api/collect`에 `CRON_SECRET` 환경변수 등록
