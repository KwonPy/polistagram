# 3계층 상세 추출 + Story View 카드뉴스 화면

> 작성일: 2026-09-26
> 관련 문서: [schema.md](../schema.md), [card-content-design.md](../card-content-design.md), [008](008-rss-collection-and-triage.md)

## 1. 한 줄 요약

`articles_triage`(2계층)만 있던 상태에서, `personal_relevance`에 따라 상세 정보를 뽑는
`articles_detail`(3계층)을 만들고, 정책 하나를 눌렀을 때 인스타그램 스토리처럼 카드를
넘겨보는 Story View 화면(`match.html`)을 처음 만들었다.

## 2. 왜 만들었는가

`CLAUDE.md` 9절 우선순위상 3계층은 계속 "미착수"였다. 2계층까지만 있으면 "정책이 뭔지,
나랑 관련 있는지"까지는 알 수 있지만, "신청 방법이 뭔지, 언제까지인지" 같은 실제 행동에
필요한 정보가 없었다. 그리고 지금까지 `match.html`은 매칭된 정책을 목록으로만 보여줬는데,
`CLAUDE.md` 1절이 처음부터 정의한 핵심 가치("카드뉴스 형태의 개인화 피드")를 실제로
구현하려면 카드 하나를 눌렀을 때 상세 내용을 카드뉴스로 넘겨보는 화면이 있어야 했다.

## 3. 구현한 것

- `app/detail_collector.py`: `personal_relevance`가 `direct`면 8개 필드 전부, `indirect`면
  `summary_easy`만 Gemini로 추출해 `articles_detail`에 저장하는 3계층 수집기
- `match.html`/`match.js`/`styles.css`: 정책 카드를 누르면 전체 화면 오버레이로 열리는
  Story View — 스와이프(좌우) + 탭(좌 1/4=이전, 우 3/4=다음)으로 카드를 넘긴다
- 이 시점엔 카드 문구를 만드는 전용 LLM 호출이 없어서, 이미 있는 필드
  (`one_line_summary`, `summary_easy`, `target`, `benefit`, `key_dates` 등)를 조합해
  카드 6종(hook/intro/change/impact/schedule/source)을 화면에서 즉석으로 합성했다
  (`buildStoryCards()`)
- Gemini 모델을 `gemini-3.5-flash-lite`로 교체 (기존 `gemini-3.5-flash`는 무료 티어
  하루 20회 한도라 2계층 나머지를 처리할 수 없었음)

## 4. 동작 흐름

```
articles_triage (2계층, personal_relevance)
  → direct/indirect만 골라 articles_raw의 본문을 Gemini에 전달
  → direct: summary_easy/target/benefit/how_to_apply/key_dates/deadline/
            region_scope/evidence_quotes 8개 필드
  → indirect: summary_easy 하나만
  → evidence_quotes가 실제로 본문(body_text)에 있는지 코드로 대조
  → 통과한 것만 articles_detail에 저장

[화면] 사용자가 My Feed에서 카드 클릭
  → openCards(match) 호출
  → buildStoryCards()가 match 객체(2/3계층 필드)로 카드 6종을 즉석 조합
  → 전체 화면 오버레이에 스와이프/탭으로 카드 렌더링
  → 마지막 카드에서 source_url로 원문 연결 (코드가 붙임, LLM 관여 없음)
```

## 5. 주요 파일

- `app/detail_collector.py`: 3계층 수집기 — 프롬프트, direct/indirect 분기, evidence 대조 검증, 시트 저장
- `match.html`: Story View 오버레이의 HTML 골격 (`#cardsOverlay`, `#cardsTrack` 등)
- `match.js`: `buildStoryCards()`(카드 콘텐츠 즉석 합성), `openCards()`/스와이프·탭 이벤트
- `styles.css`: 카드 타입별 배경색, 스와이프 트랙 스타일 (`scroll-snap-type`)

## 6. 핵심 코드 / 개념

**`evidence_quotes`로 환각을 코드가 한 번 더 잡는다**

```python
def evidence_supported(evidence_quotes: list, body_text: str) -> bool:
    if not evidence_quotes:
        return False
    normalized_body = _normalize(body_text)
    return all(_normalize(quote) in normalized_body for quote in evidence_quotes)
```

Gemini에게 "이 필드를 채운 근거가 된 원문 문장을 그대로 인용해라"라고 시킨 뒤, 그 인용문이
진짜로 본문 안에 있는지 코드로 대조한다. 없으면 지어낸 내용일 가능성이 높다고 보고 저장을
보류한다. `_normalize()`는 공백/줄바꿈을 지우고 비교해서, 개행 위치 차이 때문에 멀쩡한
인용이 틀렸다고 오판하는 걸 막는다.

**`scroll-snap-type: x mandatory`로 스와이프를 브라우저에 맡긴다**

```css
#cardsTrack {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
.story-card {
  flex: 0 0 100%;
  scroll-snap-align: start;
}
```

JS로 스와이프 애니메이션을 직접 계산하지 않아도, 트랙에 `scroll-snap-type`을 주면
스크롤이 카드 경계에 딱 맞춰 멈춘다. 탭 넘김은 별도로 `cardsTrack.scrollBy()`를 호출해서
구현했다 — 터치 드래그(스크롤)와 클릭(탭)이 서로 다른 이벤트라 부딪히지 않는다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| Gemini `response_schema` + `nullable` | `how_to_apply`처럼 "없으면 null"이어야 하는 필드를 API 레벨에서 강제 |
| CSS `scroll-snap` | 스와이프를 브라우저 네이티브 기능으로 처리 |
| `role="dialog" aria-modal="true"` | 전체 화면 오버레이가 스크린리더에게 "대화상자"임을 알림 |

## 8. 문제와 해결

- **문제**: `gemini-3.5-flash` 무료 티어가 하루 20회라 2계층/3계층을 다 처리하지 못함
  **해결**: 사용자와 상의해 `gemini-3.5-flash-lite`로 교체. 같은 무료 API 키인데 모델별로
  할당량이 따로 잡혀있어서, 모델만 바꿔도 그날 바로 이어서 처리할 수 있었다.
  **배운 점**: 무료 티어 할당량은 계정 단위가 아니라 "모델별"로 따로 관리된다.

- **문제**: `detail_collector.py`에서 `row["title"]`을 호출했더니 `KeyError: 'title'`
  **원인**: `articles_triage`에는 `title`이 없다 — `articles_raw`에만 있는 필드를 triage
  쪽 딕셔너리에서 꺼내려 했음
  **해결**: `articles_raw`를 article_id로 딕셔너리화(`raw_by_id`)해서 제목/본문을 거기서
  가져오도록 수정
  **배운 점**: 여러 시트를 합칠 때는 "이 필드가 어느 시트 소속인지"를 매번 확인해야 한다

- **문제**: 스킵 내역을 출력하는 마지막 줄에서 `UnicodeEncodeError: 'cp949' codec can't
  encode character '‧'`로 스크립트가 죽음
  **원인**: Windows 콘솔 기본 인코딩(cp949)이 일부 한글 문장부호(가운뎃점 등)를 못 담음.
  실제 데이터 저장은 이미 끝난 뒤였어서 손실은 없었음
  **해결**: `sys.stdout.reconfigure(encoding="utf-8")`을 `__main__` 블록 맨 앞에 추가
  **배운 점**: Windows 로컬 실행 스크립트는 콘솔 인코딩이 UTF-8이 아닐 수 있다는 걸
  가정하고 짜야 한다

## 9. 의사결정

- **왜 3계층 카드 문구를 이번엔 LLM으로 안 만들고 필드 조합으로 합성했나** — 카드뉴스
  전용 문구 생성은 별도의 콘텐츠 설계(`docs/card-content-design.md`)가 필요한 작업이라,
  이번엔 Story View "화면"이 실제로 스와이프/탭으로 동작하는지부터 검증하는 데 집중했다.
  즉석 합성 함수(`buildStoryCards`)는 나중에 실제 생성 결과로 교체하기 쉽게, 입력(match
  객체)과 출력(카드 배열) 형태를 미리 그 설계 문서 구조에 맞춰뒀다.
- **왜 `source` 카드는 항상 코드가 붙이나** — 원문 URL을 LLM이 텍스트로 다루게 하면
  오탈자나 존재하지 않는 링크를 지어낼 위험이 있다. 이 원칙은 이후 실제 카드 생성
  파이프라인(010 작업일지)에서도 그대로 유지했다.

## 10. 배운 것

1. Gemini 무료 티어 할당량은 모델별로 완전히 분리돼 있어서, 한 모델이 막히면 다른
   모델로 우회할 수 있다 (단, 모델 선택은 임의로 안 바꾸고 사용자와 상의해서 정함)
2. "근거 문장을 그대로 인용하게 시키고, 그 인용이 원문에 있는지 코드로 대조"하는 방식이
   evidence_quotes 하나로 여러 필드(target/benefit/deadline 등)의 신뢰도를 한 번에
   검증할 수 있는 효율적인 방법이라는 것
3. CSS `scroll-snap`만으로 상당히 매끄러운 스와이프 UI를 만들 수 있다는 것 — 프레임워크나
   별도 라이브러리 없이도 가능했다

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 카드 문구가 즉석 합성 | 실제 카드뉴스 전용 문구가 아니라 기존 필드를 재배열한 수준 (010에서 해결) |
| `articles_detail` 일부 미완료 | evidence 대조 실패로 스킵된 몇 건은 재시도해도 계속 스킵될 수 있음 |

## 12. 다음 단계

1. My Feed 목록 카드와 Story View 카드뉴스 콘텐츠를 실제 Gemini 생성 결과로 교체
   (→ [010 작업일지](010-feed-and-story-card-generation.md))
2. 카드뉴스 디자인을 실제 레퍼런스에 맞춰 다듬기
