# Story View 카드 내용 다듬기 (policy 카드 분량, change 카드 대조 억지 제거, 관련성 이유 노출)

## 1. 한 줄 요약

Story View 카드뉴스에서 실제로 써보고 나온 피드백 세 가지를 반영했다: policy 카드가 너무 짧아 정책 설명이 부족했던 것, change 카드가 비교할 대상이 없는데도 억지로 "기존 vs 변경" 박스를 만들던 것, 목록(My Feed) 카드에서 "관련 있어요"라고만 뜨고 왜 관련 있는지 안 보이던 것.

## 2. 왜 만들었는가

010에서 Gemini로 실제 카드 콘텐츠를 만들기 시작한 뒤, 화면에 뜬 카드를 직접 읽어보면서 세 가지가 눈에 걸렸다.

* `policy`(정책 소개) 카드가 다른 카드와 같은 글자 수 제한(20~70자)을 쓰다 보니, "이 정책이 뭔지" 설명이 한두 문장으로 끊겨서 부족했다.
* `change`(달라지는 점) 카드는 무조건 Before/After 비교박스를 그렸는데, `doc_type`별로 미리 정해둔 "기존" 문구(`BEFORE_LABEL_BY_DOC_TYPE`)를 채워 넣다 보니 완전히 새로 생기는 지원사업에도 "이전에는 없던 지원이에요" 같은 억지 문장이 붙었다. 비교할 "기존"이 실제로 없는데 있는 것처럼 보이는 게 문제였다.
* My Feed 목록 카드는 `personalized_signal`이 LLM 생성 문구가 없을 때 "나에게 관련 있어요"라는 코드 폴백 문구만 보여줬다. 관심사 매칭으로 떴다는 걸 알면서도 그 이유를 화면에 안 알려주고 있었다.

이 프로젝트의 핵심 가치는 "정책 발견 → 쉬운 설명 → **개인 관련성** → 행동 안내"인데(CLAUDE.md 1절), 관련성 이유를 안 보여주는 건 그 핵심을 놓치는 것이었다.

## 3. 구현한 것

### (1) policy 카드만 더 길게 쓰도록 프롬프트 예외 추가

`app/card_generator.py`의 `PROMPT_TEMPLATE`에서 카드 타입별 가이드에 policy 카드 전용 예외를 추가했다: copy 100~160자, 3~4문장, 4~5줄까지 허용. 다른 카드 타입(hook/change/impact/action_timing 등)은 기존 20~70자 제한을 그대로 유지한다 — policy만 "정책 자체를 이해시키는" 역할이라 예외를 둔 것이다.

### (2) change 카드: 원문에 실제 대조 표현이 있을 때만 Before/After

* `RESPONSE_SCHEMA`에 `before`/`after` 필드(둘 다 nullable string)를 추가해서, Gemini가 카드를 만들 때 이 두 값을 채우거나 비워두게 했다.
* 프롬프트에 규칙을 넣었다: "기존에는 ~였으나", "~에서 ~로 변경" 같은 **실제 대조 표현이 원문에 있을 때만** before/after를 채우고, 완전히 새로 생기는 지원사업처럼 비교 대상이 없으면 **반드시 둘 다 null**로 두게 했다. "기존에는 없었어요" 같은 억지 대조를 지어내지 말라고 명시했다.
* `match.js`의 `buildChangeDiagram`을 두 갈래로 나눴다:
  * `card.beforeText`/`card.afterText`가 둘 다 있으면 → 기존처럼 Before/After 비교박스.
  * 없으면 → 억지 채움 문구(`BEFORE_LABEL_BY_DOC_TYPE`, doc_type별로 미리 정해둔 문구) 자체를 삭제하고, 대신 변화 내용을 체크리스트(`splitToItems`로 쪼갤 수 있으면) 또는 요약 박스 하나로 보여준다.
* `buildCardsFromReal`에서 change 타입 카드에 `changeHighlight`/`beforeText`/`afterText`도 같이 담아 넘기도록 했다.

### (3) 목록 카드에 관련성 근거 노출

`match.js`에 `buildRelevanceReason(match, profile, overlap)` 함수를 추가했다. LLM이 만든 `feed_personalized_line`이 없고 코드 폴백 신호("나에게 관련 있어요")로 뜬 경우에만, 관심사 겹침 → 지역 매칭 → 직업군 매칭 순으로 실제 매칭 근거를 한 줄로 만들어 보여준다. `buildFeedCard`에서 우선순위를 `feed_personalized_line` → (폴백 신호일 때) `buildRelevanceReason` → `one_line_summary` 순으로 바꿨다.

### (4) 그 외 자잘한 스타일 정리

* Story 카드 세로 정렬을 `center`에서 `flex-start`로 바꾸고 패딩을 줄였다 — 본문 짧은 카드(hook, change)가 화면 가운데 떠 보이는 문제.
* `summary-box`/`tip-box`의 초록/노랑 톤을 브랜드 블루 톤(`var(--brand-dark)`, `#eaf2fb`)으로 통일 — 카드마다 색이 제각각이라 브랜드 색이 안 느껴진다는 점을 정리.
* `.story-headline .hl`이 부모(font-weight 900)보다 얇은 700을 덮어써서 강조 글자가 더 얇아 보이던 것을 headline은 색만 바꾸도록 수정.

## 4. 동작 흐름

```
원문(articles_detail)
→ Gemini (app/card_generator.py, PROMPT_TEMPLATE)
→ 카드별 headline/copy/highlight + change 카드는 before/after(대조가 있을 때만)
→ Google Sheets 저장
→ match.js가 카드 읽어서 화면 렌더
   - policy 카드: 긴 설명 그대로 표시
   - change 카드: before/after 있으면 비교박스, 없으면 체크리스트/요약박스
→ My Feed 목록에서는 personalized_signal이 폴백일 때 buildRelevanceReason으로
  관심사/지역/직업군 매칭 근거를 한 줄 더 보여줌
```

## 5. 주요 파일

* `app/card_generator.py`: 카드 콘텐츠를 만드는 Gemini 프롬프트와 응답 스키마. policy 예외, change의 before/after 필드와 규칙을 여기서 정의.
* `match.js`: 프론트엔드에서 카드 데이터를 화면용 HTML로 조립. `buildChangeDiagram`(change 카드 렌더), `buildRelevanceReason`(목록 카드 관련성 근거), `buildFeedCard`(목록 카드 조립)가 이번에 바뀐 함수들.
* `styles.css`: Story 카드 레이아웃/색상 스타일.

## 6. 핵심 코드 / 개념

```js
function buildChangeDiagram(match, card) {
  ...
  if (card?.beforeText && card?.afterText) {
    return `...비교박스...`;
  }
  const text = card?.changeText || match.one_line_summary || "";
  const items = splitToItems(text, 4);
  if (items.length > 0) {
    return `...체크리스트...`;
  }
  return `...요약박스...`;
}
```

* `card?.beforeText && card?.afterText`: 둘 다 값이 있을 때만 비교박스를 그린다. 하나라도 null이면(Gemini가 대조 표현을 못 찾았으면) 이 분기를 타지 않는다.
* `splitToItems(text, 4)`: 긴 문장을 콤마/쉼표 등 기준으로 최대 4개 항목으로 쪼갠다(기존에 다른 카드에서도 쓰던 함수를 재사용). 쪼개지면 체크리스트, 안 쪼개지면 요약박스 하나.

```js
const changeText = cardMap.cssType === "change" ? item.copy : undefined;
const changeHighlight = cardMap.cssType === "change" ? item.highlight : undefined;
```

* 여기서 `item.copy`(원문 그대로의 텍스트, `<span>` 태그 안 섞인 상태)를 넘기는 게 중요하다. 화면에 보여줄 `lead`(이미 `wrapHighlight`로 `<span class="hl">` 태그가 섞인 HTML 문자열)를 그대로 넘기면, `buildChangeDiagram`이 나중에 텍스트를 쉼표로 다시 쪼갤 때 `</span>` 태그 안의 `/`에서 잘려 태그가 깨진다. 그래서 순서를 "먼저 쪼개고 → 그 다음 하이라이트 입히기"로 뒤집었다.

## 7. 사용한 기술

새로운 라이브러리나 기술 스택 변경은 없다. 기존 Gemini 프롬프트/스키마 패턴과 기존 JS 헬퍼 함수(`splitToItems`, `wrapHighlight`, `josaWaGwa`)를 재사용했다.

## 8. 문제와 해결

* 문제: change 카드에 `lead`(HTML 하이라이트 태그가 섞인 문자열)를 그대로 넘겼더니, 나열형으로 쪼갤 때 `</span>` 안의 `/` 때문에 태그가 깨짐.
* 원인: 쪼개는 로직(`splitToItems`)이 원문 구두점 기준으로 문자열을 자르는데, 이미 HTML 태그가 섞인 문자열을 자르면 태그 중간이 잘릴 수 있다.
* 해결: 태그 없는 원문(`item.copy`)과 하이라이트 대상(`item.highlight`)을 따로 넘겨서, 먼저 원문을 쪼갠 다음 조각별로 하이라이트를 입히도록 순서를 바꿨다.
* 배운 점: 문자열을 가공(쪼개기, 자르기)해야 하는 경우에는 HTML을 입히기 **전** 원본 텍스트 상태로 가공해야 한다. 가공과 렌더링(태그 삽입) 순서가 섞이면 태그가 깨지기 쉽다.

## 9. 의사결정

* **change 카드의 before/after를 코드가 아니라 Gemini가 판단하게 한 이유**: 원문에 실제 대조 표현이 있는지는 문서마다 다르고 정형화된 패턴이 아니라서, `doc_type` 같은 코드 값만으로는 판단할 수 없다. 원문 해석이 필요한 부분이라 LLM에게 맡기고, "대조가 없으면 null" 같은 명확한 판단 기준은 프롬프트로 강제했다 (CLAUDE.md 6절: "명확한 로직은 코드로, LLM은 비정형 문서 해석에 집중").
* **policy 카드만 글자 수 예외를 둔 이유**: 다른 카드 타입(hook, impact, action_timing)은 이미 짧게 유지되는 게 잘 작동하고 있어서 전체 기준을 바꾸지 않고, 실제로 부족했던 policy 카드 하나만 예외로 뒀다.

## 10. 배운 것

* HTML 문자열을 다시 텍스트로 가공(쪼개기)하려면 태그가 섞이기 전 원본 데이터를 따로 들고 있어야 한다.
* LLM 프롬프트에서 "이럴 때는 반드시 null" 같은 명시적 금지 규칙을 주면, 모델이 그럴듯한 값을 지어내는 것(hallucination)을 줄일 수 있다.

## 11. 현재 한계

* `buildRelevanceReason`은 관심사 → 지역 → 직업군 순으로 하나만 골라 보여준다. 여러 이유가 동시에 해당해도 한 줄만 보여준다.
* change 카드가 나열형(체크리스트)로 갈지 요약박스로 갈지는 `splitToItems`가 쪼갤 수 있는 텍스트인지에 따라 자동으로 정해진다 — 사람이 보기에 항상 적절한 형태인지는 계속 지켜봐야 한다.

## 12. 다음 단계

CLAUDE.md 9절 기준으로 아직 미착수인 "변경 감지"(기존 정책의 의미 있는 변경을 자동으로 포착하는 로직)가 남아 있다. 지금 만든 change 카드의 before/after 구조는 감지된 변경을 "어떻게 보여줄지"의 화면 쪽 준비이고, "무엇을 변경으로 감지할지"의 기준은 아직 정해지지 않았다(CLAUDE.md 10절: Claude가 임의로 결정하지 않는 미정 사항).
