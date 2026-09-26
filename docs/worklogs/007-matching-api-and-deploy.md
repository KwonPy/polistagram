# 정책 매칭 API 백엔드 + 배포

> 작성일: 2026-09-12
> 관련 문서: [schema.md](../schema.md), [design-brief.md](../design-brief.md), [005-vercel-deploy.md](005-vercel-deploy.md)

---

## 1. 한 줄 요약

프로필을 받아 구글시트의 정책 데이터와 매칭시켜 JSON으로 돌려주는 FastAPI 백엔드를 만들고, `Vercel`에 프론트엔드와 함께 배포했다.

## 2. 왜 만들었는가

지금까지는 `schema.md` 6절에 매칭 계산식만 정해뒀을 뿐, 실제로 그 계산을 돌려주는 서버가 없었다. `CLAUDE.md` 9절 우선순위상 "개인화"가 다음 차례였고, 카드뉴스 디자인을 만들기 전에 먼저 "매칭이 실제로 되는가"부터 확인하기로 했다 — 디자인은 다음 단계로 미루고, 이번에는 필요한 데이터가 JSON으로 잘 나오는지만 검증하는 게 목표였다.

## 3. 구현한 것

- `app/matching.py`: 구글시트 3개 탭(`articles_raw`/`articles_triage`/`articles_detail`)을 `article_id` 기준으로 합치고, `schema.md` 6절 점수식을 그대로 옮겨 매칭
- `app/main.py`: FastAPI 서버. `POST /api/match`로 프로필을 받아 매칭 결과를 반환
- `match.html`: 저장된 프로필로 API를 호출해, 돌아온 JSON을 화면에 그대로 출력 (카드 디자인은 다음 단계)
- `index.html`: 제출 성공 메시지에 `match.html`로 가는 링크 추가, 더 이상 안 쓰는 CSV 직접 로딩 코드 제거
- Vercel 배포: `api/index.py`(Vercel Python 진입점), `vercel.json` 라우팅, `app/sheets.py`에 환경변수 기반 인증 추가, `.vercelignore`에서 백엔드 제외 해제

## 4. 동작 흐름

```
사용자가 index.html에서 프로필 입력·저장 (localStorage)
  ↓
match.html이 localStorage에서 프로필을 읽어 /api/match로 전송
  ↓
FastAPI가 구글시트 3개 탭을 읽어 article_id로 합침
  ↓
schema.md 6절 점수식으로 프로필과 비교 (마감·지역·직업군 필터 + 관심사 교집합 점수)
  ↓
점수 > 0인 정책만, 점수 높은 순으로 정렬해 JSON 반환
  ↓
match.html이 JSON을 그대로 화면에 출력
```

## 5. 주요 파일

- `app/matching.py`: 데이터 병합 + 점수 계산 (외부 통신 없는 순수 로직 부분과 구글시트 조회 부분이 섞여 있음)
- `app/main.py`: FastAPI 서버, `/api/match` 엔드포인트, CORS 설정
- `api/index.py`: Vercel이 찾는 진입점. `app/main.py`의 `app`을 그대로 가져오기만 함
- `app/sheets.py`: 구글시트 인증 — 로컬은 파일 경로, 배포 환경은 환경변수(JSON 문자열) 두 가지 방식 지원하도록 수정
- `match.html`: 매칭 결과를 보여주는 새 화면
- `vercel.json`: `/api/*` 요청을 전부 `api/index.py` 하나로 보내는 라우팅 규칙

## 6. 핵심 코드 / 개념

**구글시트 3개 탭을 하나로 합치기**

```python
triage_by_id = {row["article_id"]: row for row in triage_rows}
```

정책 하나마다 다른 탭에서 같은 `article_id`를 찾아야 하는데, 리스트를 매번 처음부터 뒤지면 느리다. `article_id`를 키로 하는 딕셔너리로 미리 바꿔두면 조회가 훨씬 빠르다 (딕셔너리 컴프리헨션 문법).

**매칭 점수 계산 (schema.md 6절 그대로)**

```python
def score(profile: dict, article: dict) -> int:
    if article["deadline"] and article["deadline"] < today:
        return 0
    if article["region_scope"] and profile["region"] not in article["region_scope"]:
        return 0
    if (article["audience_groups"] and profile["occupation_type"]
            and profile["occupation_type"] not in article["audience_groups"]):
        return 0
    return len(set(profile["interests"]) & set(article["topics"]))
```

마감·지역·직업군 중 하나라도 안 맞으면 0점(제외). 다 통과하면 관심사가 겹치는 개수를 점수로 준다. 이 계산식 자체는 새로 만든 게 아니라 `schema.md`에 이미 정해둔 것을 코드로 옮긴 것.

**FastAPI 엔드포인트**

```python
class Profile(BaseModel):
    region: str
    gender: str
    birth_date: str
    occupation_type: str | None = None
    interests: list[str]

@app.post("/api/match")
def match(profile: Profile):
    return match_articles(profile.model_dump())
```

`Profile(BaseModel)`은 "요청 데이터가 이런 모양이어야 한다"는 설계도(Pydantic 모델)다. FastAPI가 요청 본문을 자동으로 이 모양에 맞는지 검사하고 변환해준다 — JSON을 직접 파싱하는 코드를 안 짜도 된다.

**배포 환경에서 구글 인증하기**

```python
creds_json = os.environ.get("GOOGLE_SHEETS_CREDENTIALS_JSON")
if creds_json:
    creds = Credentials.from_service_account_info(json.loads(creds_json), scopes=SCOPES)
else:
    creds_path = os.environ["GOOGLE_SHEETS_CREDENTIALS_PATH"]
    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
```

로컬에서는 서비스 계정 키 "파일"을 쓰지만, Vercel 같은 서버리스 환경은 파일을 올릴 수 없어서(비밀키라 `.gitignore`/`.vercelignore`로 애초에 배포 대상에서 뺐음) 키 내용 전체를 환경변수 문자열로 넣고 그걸 읽게 만들었다. 두 방식을 `if/else`로 분기해서, 로컬 개발 흐름은 그대로 유지했다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| FastAPI | Python 웹 API 서버 프레임워크 (`CLAUDE.md` 7절에서 이미 정한 백엔드 스택) |
| Pydantic (`BaseModel`) | 요청 데이터의 타입을 검사·변환 |
| `CORSMiddleware` | 브라우저가 다른 출처(origin)의 서버에 요청 보내는 걸 허용 |
| Vercel Python 런타임 | `api/` 폴더의 ASGI 앱(`app`)을 서버리스 함수로 실행 |
| Vercel CLI (`vercel env add`) | 비밀키를 대시보드 없이 터미널에서 환경변수로 등록 |

## 8. 문제와 해결

- **문제**: `vercel env add` 실행 시 이 환경(비대화형 터미널)에서는 값을 붙여넣으라는 프롬프트가 안 뜨고 "missing_value" 에러가 남
- **원인**: `vercel env add`는 원래 대화형으로 값을 입력받는데, 비대화형 셸에서는 `--value`나 표준입력(stdin)으로 값을 줘야 함
- **해결**: `cat credentials/파일.json | npx vercel env add GOOGLE_SHEETS_CREDENTIALS_JSON production`처럼 파일 내용을 stdin으로 흘려보내는 방식으로 해결. 비밀값을 명령줄 인자(`--value`)로 직접 쓰면 터미널 기록에 남으므로 피함
- **배운 점**: 자동화 스크립트에서 비밀값을 다룰 때는 항상 "이 값이 어디에 로그로 남는가"를 먼저 생각해야 한다 (명령줄 인자 vs stdin vs 파일)

## 9. 의사결정

- **왜 지금은 카드 디자인 대신 원본 JSON만 화면에 찍었나** — "매칭 로직·데이터가 맞는지 먼저 검증하고, 디자인은 나중에 하자"고 사용자와 합의함. 디자인까지 한 번에 하면 로직 문제와 디자인 문제가 섞여서 둘 다 검증하기 어려워짐
- **왜 백엔드를 처음엔 로컬 실행만 하기로 했다가 이번에 바로 배포했나** — 처음엔 "로컬에서 먼저 검증"으로 범위를 좁혀 진행했고, 로컬 테스트가 끝난 뒤 사용자가 배포를 요청해서 진행함. 단계를 나눠서 진행하니 배포 전에 로직 오류를 먼저 걸러낼 수 있었음
- **왜 정책용어(용어사전) 풀이 기능은 넣지 않았나** — 지금 데이터 스키마(`schema.md` 3~4계층)에 용어별 설명을 담는 필드가 없다. 스키마는 이미 "확정"된 상태라 추가하려면 별도 논의가 필요해서, 이번엔 보류하고 넘어감
- **왜 정렬 기준을 "점수 높은 순"으로만 했나** — `design-brief.md`에 미정 사항으로 남겨뒀던 부분인데, 우선 동작하는 걸 만들기 위해 가장 단순한 기준으로 임시 결정함. 나중에 마감 임박순 등을 섞고 싶으면 `matching.py`의 `sort` 부분만 바꾸면 됨

## 10. 배운 것

1. Pydantic 모델을 쓰면 "요청 데이터 검증 코드"를 따로 안 짜도, 타입만 선언해두면 FastAPI가 대신 검사해준다.
2. 서버리스 배포 환경(Vercel)은 로컬과 파일 시스템이 다르게 동작하므로, 비밀키처럼 "파일"에 의존하던 코드는 배포 전에 환경변수 방식도 지원하도록 바꿔줘야 한다.
3. 비밀값을 CLI로 다룰 때 stdin을 쓰면 명령줄 인자로 넘길 때보다 흔적이 덜 남는다.

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 카드뉴스 디자인 미착수 | `match.html`은 JSON을 그대로 출력할 뿐, 실제 카드 UI는 없음 |
| 매 요청마다 구글시트를 새로 읽음 | 캐싱이 없어서 요청이 늘어나면 구글시트 API 호출 한도에 걸릴 수 있음 |
| 정렬 기준이 점수 하나뿐 | 마감 임박도, 최신순 등 다른 기준은 아직 반영 안 함 |
| 용어풀이(정책 용어 하이라이트) 기능 없음 | 스키마에 필드가 없어 보류 상태 |

## 12. 다음 단계

`ui-ux-pro-max` 스킬을 활용해 `match.html`의 JSON을 실제 카드뉴스 UI로 디자인하는 작업.
