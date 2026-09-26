# My Feed / Story View 카드 콘텐츠 실제 생성 + 화면 리디자인

> 작성일: 2026-09-26
> 관련 문서: [card-content-design.md](../card-content-design.md), [009](009-detail-collection-and-story-view.md)

## 1. 한 줄 요약

009에서 필드 조합으로 즉석 합성하던 카드 문구를, 실제 Gemini 생성 결과로 교체했다.
My Feed 목록 카드용(`app/feed_card_generator.py`)과 Story View 카드뉴스용
(`app/card_generator.py`) 두 개를 새로 만들었고, 화면도 인스타그램 스토리/실제
레퍼런스에 맞춰 다시 디자인했다.

## 2. 왜 만들었는가

`docs/card-content-design.md`가 이미 "정책 스키마는 정확한 정보 저장용, 카드는 사람이
읽기 위한 콘텐츠"라고 설계해뒀지만 구현은 미뤄둔 상태였다. 009에서 만든 즉석 합성은
`target`/`benefit` 같은 필드를 거의 그대로 붙여넣는 수준이라 "카드뉴스처럼 읽히는 짧은
카피"는 아니었다. 그리고 사용자가 실제 디자인 레퍼런스(인스타그램 스토리 스타일, My
Feed 카드 목업)를 전달하면서, 화면도 그에 맞게 다시 만들 필요가 생겼다.

## 3. 구현한 것

- `app/feed_card_generator.py`: My Feed 목록에 보이는 티저 카드 콘텐츠(제목, 개인화
  한 줄, 시각 테마, 태그)를 생성해 `articles_feed_card`에 저장
- `app/card_generator.py`: Story View 카드뉴스 본문(hook/policy/key_change/
  personal_impact/action_timing)을 생성해 `articles_cards`에 저장
- `app/matching.py`: 두 시트를 합쳐 API 응답에 포함, 시트가 아직 없어도(생성 전) 에러
  없이 빈 값으로 대체
- `match.js`가 실제 생성된 카드가 있으면 그걸 쓰고, 없으면 009의 즉석 합성으로 자동
  대체하도록 연결 (`buildCardsFromReal` / `buildStoryCards` 이중 경로)
- My Feed 리스트 카드와 Story View 화면을 레퍼런스에 맞춰 다시 디자인:
  - My Feed: 브랜드 바 + 개인화 뱃지 + 강조 제목 + 화살표 CTA + 3D 아이콘 + 태그
  - Story View: 인스타그램 웹처럼 화면 가운데 좁고 긴 세로 카드 하나만 두고 나머지는
    반투명 블러 배경 (데스크톱에서 배너처럼 옆으로 안 늘어나게)
- `assets/icons/`: 정책 주제(topics) 8개별 3D 아이콘 — Microsoft Fluent Emoji 3D
  (MIT 라이선스, 무료)
- `match.html`에 있던 `<style>`/`<script>`를 `styles.css`/`match.js`로 분리 (빌드
  도구 없이 `<link>`/`<script src>`로만 연결)

## 4. 동작 흐름

```
articles_triage + articles_detail (article_id로 join)
  → direct/indirect만 대상 (user_profile은 프롬프트에 안 넣음 — 아래 9절 참고)
  → Gemini 호출 1회
      - feed_card_generator: 짧은 티저 문구 (제목/개인화 한 줄/시각 테마/태그)
      - card_generator: 카드뉴스 본문 4~6장 (데이터 부족하면 카드 종류 자체를 생략)
  → 검증 통과분만 articles_feed_card / articles_cards에 저장 (article_id당 1번, 캐싱)

[화면]
  My Feed 목록 → feed_card 있으면 그 문구, 없으면 one_line_summary 등으로 대체
  카드 클릭 → Story View → articles_cards 있으면 그 카드, 없으면 즉석 합성
  → 마지막엔 항상 코드가 붙인 출처(source) 카드
```

## 5. 주요 파일

- `app/feed_card_generator.py`: My Feed 티저 카드 생성기
- `app/card_generator.py`: Story View 카드뉴스 생성기
- `app/matching.py`: `articles_feed_card`/`articles_cards`를 API 응답에 병합
- `match.js`: `buildFeedCard()`(목록 카드), `buildCardsFromReal()`/`buildStoryCards()`
  (Story View, 실제/즉석 이중 경로), 아이콘 SVG·주제별 색 테마 정의
- `styles.css`: My Feed 카드·Story View 오버레이 스타일 (분리된 파일)
- `assets/icons/*.png`: 주제별 3D 아이콘 (8개)
- `scripts/generate_topic_icons.py`: Gemini 이미지 생성으로 아이콘을 직접 만들려던
  스크립트 — 지금은 할당량 문제로 안 쓰지만, 나중에 결제를 등록하면 쓸 수 있어 남겨둠

## 6. 핵심 코드 / 개념

**`user_profile`을 프롬프트에서 뺀 이유 — 캐싱과 개인화를 분리**

```python
# feed_card_generator.py, card_generator.py 공통 원칙
# LLM: "이 정책이 누구를 겨냥하는지"만 판단 (기사 단위, article_id로 캐싱)
# 코드: "지금 보는 이 사용자가 그 대상에 실제로 해당하는지" 판단 (조회 단위)
```

`user_profile`까지 프롬프트에 넣으면 "기사 × 사용자 조합"마다 Gemini를 새로 불러야 해서
무료 할당량으로는 감당이 안 된다. 대신 LLM은 정책 자체가 특정 대상(청년, 소상공인 등)을
뚜렷하게 겨냥하는지만 글로 쓰고, "이 사용자가 그 대상과 겹치는지"는 지금까지처럼
`match.js`가 관심사/지역/직업군을 비교해서 판단한다. 그래서 캐시 키는 여전히
`article_id` 하나뿐이다.

**카드 개수 검증 기준을 실제 테스트로 조정**

```python
# 처음엔 "기본 4~6장"이라는 스펙 문구를 그대로 따라 4장 미만을 전부 스킵시켰다.
# 실제로 9건 중 6건이 스킵됐다 — personal_impact/action_timing 근거가 약한 기사는
# hook+policy+key_change 3장이 자연스러운 결과였다.
if not isinstance(cards, list) or not (3 <= len(cards) <= 6):
    return False
```

스펙 문서에 적힌 숫자를 곧이곧대로 코드에 옮기기 전에, 실제 데이터로 몇 건이나
통과/실패하는지 작게 돌려보고 기준을 조정하는 게 중요하다는 걸 다시 확인했다 (008
작업일지의 "topics 8개" 결정 때와 같은 패턴).

**Story View를 "레터박스 + 세로 스테이지" 구조로 변경**

```css
#cardsOverlay { /* 화면 전체, 반투명 블러 배경 */
  background: rgba(10, 20, 35, 0.45);
  backdrop-filter: blur(8px);
}
#cardsStage { /* 실제 카드 — 좁고 길게 고정 */
  max-width: 430px;
  max-height: 920px;
}
```

처음엔 오버레이 자체가 카드였어서, 데스크톱의 넓은 창에서는 스토리가 옆으로 늘어난
배너처럼 보였다("가로형태"). 실제 인스타그램 웹처럼 오버레이(배경)와 스테이지(카드)를
분리하니, 모바일 폭에서는 스테이지가 화면을 자연스럽게 채우고 데스크톱에서는 휴대폰
비율의 카드로 중앙에 고정된다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| Gemini `gemini-3.5-flash-lite` | 텍스트 생성 (카드 문구) — 기존 2/3계층과 동일 모델 |
| Gemini `gemini-2.5-flash-image` (Nano Banana) | 이미지 생성 시도 — 무료 티어 할당량 0으로 실패 |
| Microsoft Fluent Emoji 3D (MIT) | 무료 3D 아이콘 대체 |
| `backdrop-filter: blur()` | 오버레이 뒤 화면을 블러 처리 |
| `touch-action: manipulation` | 모바일 탭 반응 지연(300ms) 제거 |

## 8. 문제와 해결

- **문제**: Gemini 이미지 생성 모델(Nano Banana) 호출 시 `429 RESOURCE_EXHAUSTED`,
  `limit: 0`
  **원인**: 텍스트 생성 모델과 달리 이미지 생성 모델은 무료 티어 자체에 할당량이
  아예 배정돼 있지 않음 (결제 등록이 필요)
  **해결**: 사용자와 상의해 무료 스톡 3D 아이콘(Microsoft Fluent Emoji 3D)으로 대체.
  스크립트(`scripts/generate_topic_icons.py`)는 나중을 위해 남겨둠
  **배운 점**: 같은 API 키라도 "텍스트 생성"과 "이미지 생성"은 완전히 별개의 할당량
  체계를 가질 수 있다 — 새 기능을 쓰기 전엔 반드시 작게 테스트해봐야 한다

- **문제**: 카드뉴스 오버레이를 열 때 검은 배경이 순간적으로 나타나 어색함
  **원인**: 불투명한 색(`#0b0f16`)을 `display: none/flex`로 그냥 토글해서 전환 효과가
  없었음
  **해결**: `opacity`/`visibility` 트랜지션 + 반투명 블러로 교체
  **배운 점**: `display` 속성은 트랜지션이 안 걸리므로, 부드러운 등장/퇴장이 필요하면
  `opacity`+`visibility` 조합을 써야 한다

- **문제**: 모달(카드뉴스 오버레이)을 열어도 키보드 포커스가 뒤쪽 피드에 남아있음
  **원인**: 오버레이를 열 때 포커스를 옮기는 코드가 없었음
  **해결**: 열 때 닫기 버튼에 포커스, 닫을 때 원래 누르던 카드로 포커스 복귀
  **배운 점**: `role="dialog"`를 붙이는 것만으로는 부족하고, 포커스를 실제로 옮기고
  되돌리는 코드가 있어야 접근성이 완성된다

## 9. 의사결정

- **왜 `source` 카드는 이번에도 LLM 출력에서 뺐나** — 사용자가 준 스펙엔 "필요하면 출처
  카드도 포함"이라고 돼 있었지만, 원문 링크를 LLM이 다루면 오탈자/환각 위험이 있다는
  009의 원칙을 그대로 지켰다. 코드가 `source_url`을 마지막에 항상 붙인다.
- **왜 이미지 생성 대신 무료 스톡 아이콘을 골랐나** — 결제 등록은 사용자 본인의 계정
  설정이 필요한 일이라 Claude가 대신 결정할 수 없는 영역이었다(`CLAUDE.md` 10절 "새로운
  외부 서비스 연결"). 무료 스톡이 레퍼런스와 100% 같지는 않지만 비용 없이 바로 쓸 수
  있어서 사용자가 이 방향을 택했다.
- **왜 `match.html`을 CSS/JS 파일로 분리했나** — 사용자가 명시적으로 요청. `CLAUDE.md`
  11절의 "빌드 도구 없는 단일 파일" 방침은 유지하되(번들러 없음), 화면 하나가 `<style>`
  수백 줄+`<script>` 수백 줄로 너무 길어져서 가독성이 떨어졌던 걸 `<link>`/`<script src>`
  로만 나눴다.

## 10. 배운 것

1. LLM이 "무엇을 판단할지"와 코드가 "무엇을 판단할지"를 나누면(개인화 대상 여부는
   LLM, 실제 매칭 여부는 코드), 사용자별 재생성 없이도 캐싱이 가능해진다
2. 검증 기준(카드 개수, 필수 필드 등)은 스펙 문서만 보고 정하지 말고, 실제 데이터를
   작게 돌려서 통과율을 확인한 뒤 조정하는 게 안전하다
3. 무료 티어 API도 기능(텍스트 생성 vs 이미지 생성)마다 할당량이 완전히 다를 수 있다
4. `opacity`+`visibility` 트랜지션, `backdrop-filter`, 포커스 관리(모달 접근성) 같은
   기본적인 프론트엔드 디테일이 실제 사용 경험의 "어색함"을 크게 좌우한다

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| Story View 콘텐츠 일부 미생성 | direct/indirect 9건 중 1건(`87714`)은 데이터가 얇아 카드 3장도 안 나와서 즉석 합성으로 대체됨 |
| 3D 아이콘이 레퍼런스와 정확히 일치하지 않음 | 무료 스톡이라 정책별 맞춤 오브젝트 조합은 아님 (단일 아이콘) |
| `articles_cards`/`articles_feed_card` 재생성 트리거 없음 | 정책이 갱신돼도 캐시를 다시 만드는 로직이 없음 (변경 감지 로직 자체가 아직 미정, `schema.md` 10절) |

## 12. 다음 단계

1. 정책 변경 감지 로직이 정해지면, 캐시(`articles_cards`/`articles_feed_card`) 재생성
   트리거도 같이 설계
2. 결제가 필요 없는 범위에서 아이콘을 정책별로 더 다양하게 조합할지 검토
3. 남은 direct/indirect 스킵 건들 재검토 (근거 데이터 자체가 얇은 경우는 그대로 즉석
   합성 경로를 쓰는 것으로 유지할지 결정)
