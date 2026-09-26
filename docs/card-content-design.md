# 카드뉴스 콘텐츠 구성 설계

> 작성일: 2026-09-23 (2026-09-26 카드 구조 6종으로 개정 — 4절 참고)
> 상태: **콘텐츠 구조는 확정, 실제 LLM 생성은 미구현** — `match.html`에 목업 데이터로 Story View
> UI까지는 만들어졌다 (3계층 `articles_detail`이 아직 비어있어도 목업으로 검증).
> 관련 문서: [schema.md](schema.md), [worklogs/008](worklogs/008-rss-collection-and-triage.md)

디자인(색상/폰트/템플릿)은 다루지 않는다. 카드별 **콘텐츠와 문구 구성**만 정한다.

---

## 1. 이 단계가 전체 흐름에서 어디에 들어가는가

```
articles_raw + articles_triage + articles_detail
   ↓
app/matching.py (기존, LLM 없음) — 점수 계산 + "왜 매칭됐는지" 근거 산출
   ↓
카드뉴스 콘텐츠 생성 (신규, Gemini 1회) — 이번에 설계하는 부분
   ↓
cards_cache 시트 (신규) — article_id 기준으로 캐싱
   ↓
프론트엔드가 캐시를 읽어 카드 렌더링 (디자인 템플릿 3~4개 중 매칭)
```

`schema.md` 1절 원래 계획은 "개인화는 저장 안 하고 요청마다 생성"이었는데, 이번에 Gemini 무료 티어가 **하루 20회** 한도라는 걸 실제로 겪었다(008 작업일지). 사용자 요청마다 매번 LLM을 부르면 하루 20명도 못 받는다. 그래서 이번 설계는 **캐싱을 전제로** 한다.

## 2. 캐싱 설계

**캐시 키: `article_id` 하나만 쓴다.** 사용자별로 캐싱하지 않는다.

이유: 후킹 카드(3절)를 제외하면 카드 내용 자체는 "이 정책이 무엇인지" 설명이라 사용자마다 달라질 이유가 없다. 후킹 카드도 "무엇과 겹치는지"(관심사/지역/직업군)까지는 코드가 결정하지만, 실제 걸리는 조합의 가짓수는 `interests`(7개 중 선택) × `occupation_type`(6가지) × `region` 정도로 사용자 수보다 훨씬 적게 나뉜다. 지금 단계에서는 이 조합까지 캐싱 키에 넣지 않고, **1차로는 article_id당 1세트만 캐싱**하고 후킹 카드 문구는 캐싱된 결과 위에 코드가 매칭 근거 문장만 살짝 바꿔 끼우는 정도로 단순화한다. (사용자별 후킹 문구까지 완전히 달라야 한다면 이 부분은 추후 재논의)

**저장 위치: 새 시트 탭 `articles_cards`**

| 필드 | 설명 |
|---|---|
| `article_id` | PK, `articles_raw`와 연결 |
| `has_hook` | 이 정책이 후킹형으로 생성됐는지 (`TRUE`/`FALSE`) — 3절 기준으로 코드가 결정한 값을 그대로 기록 |
| `cards_json` | Gemini가 만든 `{"cards": [...]}` 그대로 문자열로 저장 |
| `generated_at` | 생성 시각 (ISO) |

**언제 다시 생성하는가**: `articles_detail`이 갱신되면(정책 변경 감지, schema.md 10절 미정 사항) 재생성 대상이 된다. 지금은 "한 번 생성하면 그대로 쓴다" 수준으로만 설계해두고, 갱신 트리거는 변경 감지 로직이 나올 때 같이 정한다.

## 3. 개인화 후킹 여부 — 코드가 점수로 결정

LLM에게 "관련 있는지 판단해서 후킹 써라"라고 맡기지 않는다. `app/matching.py`의 `score()`가 이미 계산하는 값을 그대로 근거로 쓴다.

```python
def build_match_reasons(profile: dict, article: dict) -> dict:
    """후킹 여부와, 후킹에 쓸 "왜 겹치는지" 근거를 코드로 결정한다."""
    topic_overlap = set(profile["interests"]) & set(article["topics"])
    region_hit = bool(article["region_scope"] and profile["region"] in article["region_scope"])
    occupation_hit = bool(
        article["audience_groups"] and profile["occupation_type"]
        and profile["occupation_type"] in article["audience_groups"]
    )

    use_hook = (
        article["personal_relevance"] == "direct"
        and (len(topic_overlap) >= 2 or region_hit or occupation_hit)
    )

    return {
        "use_hook": use_hook,
        "topic_overlap": sorted(topic_overlap),
        "region_hit": region_hit,
        "occupation_hit": occupation_hit,
    }
```

- `personal_relevance == "direct"`이면서, **관심사가 2개 이상 겹치거나 / 지역이 일치하거나 / 직업군이 일치하면** 후킹 사용
- 그 외(indirect이거나, direct라도 매칭 근거가 관심사 1개뿐인 약한 경우)는 후킹 없이 정책 소개부터 시작

> ⚠️ **아직 확정 아님**: "관심사 2개 이상" 기준은 지금은 임의로 잡은 문턱값이다. 실제 데이터로 몇 건이 후킹형/일반형으로 갈리는지 본 뒤 조정이 필요할 수 있다.

이렇게 나온 `use_hook`/`topic_overlap`/`region_hit`/`occupation_hit`을 프롬프트에 **그대로 사실로** 건네준다. LLM은 "관련 있는지" 자체를 판단하지 않고, 이미 결정된 사실을 자연어로 풀어쓰는 역할만 한다.

## 4. `card_type` — 6개로 고정 (2026-09-26 개정)

`source` 카드는 LLM이 만들지 않는다. 출처는 `source_url`을 코드가 그대로 붙이는 카드라
LLM이 문구를 만들 이유가 없다 (URL을 텍스트로 옮겨적게 하면 오탈자/환각 위험만 생긴다).
프론트엔드가 카드 목록 맨 끝에 `source_url` 카드를 코드로 추가한다.

```
hook       - 왜 이 정책이 나에게 떴는지 (직접 관련 + 관심사 등이 실제로 겹칠 때만 등장)
intro      - 정책이 무엇인지, 쉬운 설명
change     - 이 정책으로 무엇이 달라지는지 (doc_type 기반, 개인화 여부와 무관하게 항상 등장)
impact     - 나에게 어떤 의미·혜택이 있는지 (target/benefit 원문 근거가 있을 때만)
schedule   - 주요 일정 / 신청방법 (신청방법은 원문에 있을 때만, 8절 참고)
source     - 원문 링크 (코드가 추가, LLM 관여 없음)
```

`hook`/`impact`/`schedule`은 원문 근거가 없으면 생략한다 — 카드 개수는 정책마다 달라질 수 있다.
`intro`/`change`/`source`는 근거가 약해도(=요약문 정도는 항상 있으므로) 항상 등장한다.

이전 초안(5개: hook/intro/relevance/benefit/schedule)에서 `relevance`+`benefit`을 `impact` 하나로
합치고, "이 정책 자체가 무엇을 바꾸는지" 설명하는 `change`를 새로 추가했다. `relevance`(나와 관련
있는지)와 `benefit`(혜택이 뭔지)이 실제 목업 작성 중 내용이 겹쳐서 사용자가 읽기에 두 카드로
나눌 이유가 약했고, 대신 "정책 자체의 변화"와 "나에게 미치는 영향"을 분리하는 편이 6단계 흐름
(`hook → intro → change → impact → schedule → source`)에서 각 카드의 역할이 더 뚜렷해졌다.

`card_type`이 템플릿과 1:1은 아니다. 지금 `match.html` 구현은 `card_type`마다 배경색을 고정하고,
`intro` 카드에만 정책 주제(`topics`)에 따라 아이콘이 바뀌는 "고정 디자인 시스템 + 가변 시각
콘텐츠" 구조를 쓴다 — 카테고리별로 사람 캐릭터를 새로 만드는 대신 아이콘/오브젝트만 바꾼다.

## 5. 프롬프트 입력 필드

기존 지침에 `article_id`를 추가했다 (캐싱 키로 필요).

```
article_id, title, body_text, published_at, source_url,
one_line_summary, topics, personal_relevance, summary_easy,
target, benefit, key_dates, deadline, how_to_apply, region_scope,

# 3절에서 코드가 미리 계산해 넘기는 값 (LLM이 스스로 판단 안 함)
use_hook, topic_overlap, region_hit, occupation_hit
```

`user_profile` 원본 전체 대신 `topic_overlap`/`region_hit`/`occupation_hit`만 넘기는 이유: LLM이 "왜 겹치는지" 다시 계산하게 하면 2계층 때처럼 판단이 흔들릴 수 있고, 코드가 이미 계산한 사실만 문장으로 풀면 되니 프롬프트도 더 짧아진다.

## 6. 글자 수 가이드라인

| 필드 | 권장 길이 |
|---|---|
| `title` | 15~25자 |
| `body` | 40~80자 |
| `highlight` | 10~20자 |

첫 번째 후킹 카드(`hook`)는 위 기준보다 더 간결하게 (제목 15자 내외, body는 한 문장). 강제 규칙이 아니라 가이드라인이라 프롬프트에는 "권장" 톤으로 명시한다.

## 7. 출력 스키마 (source 제외, 5개 card_type)

```json
{
  "cards": [
    {
      "card_number": 1,
      "card_type": "hook | intro | relevance | benefit | schedule",
      "title": "",
      "body": "",
      "highlight": ""
    }
  ]
}
```

`response_schema`로 `card_type`을 enum(5개)으로 강제하는 건 2계층 때 검증된 방식(008 작업일지)을 그대로 재사용한다. `card_number`는 1부터 순서대로, `highlight`는 없어도 되는 카드면 빈 문자열 허용.

## 8. 아직 안 정한 것 (다음에 같이 결정)

1. **후킹 판단 문턱값** — "관심사 2개 이상" 기준이 실데이터에 맞는지, 3계층 데이터가 쌓이면 재점검 필요
2. **캐시 무효화 시점** — 정책 변경 감지 로직이 아직 없어서, 지금은 "한 번 생성하면 안 바뀐다"고 가정
3. **디자인 템플릿 3~4개와 `card_type` 5개의 매핑표** — 디자인 레퍼런스가 나오면 결정
4. **`relevance` 카드를 일반형에도 쓸지** — 지금은 "보통 생략"으로만 적어뒀는데, 실제 원문에 대상 설명이 뚜렷한 일반형 정책이 얼마나 되는지 봐야 함
