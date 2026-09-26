"""My Feed 목록에 보이는 짧은 티저 카드 콘텐츠를 Gemini로 생성해 articles_feed_card에 저장한다.

Story View(articles_detail, app/detail_collector.py)와는 다른 카드다 — 이건 목록에서
사용자가 2~3초 안에 "무슨 정책인지 / 왜 나에게 뜨는지"를 파악하고 클릭하게 만드는
티저용이라, 상세 내용을 전부 담지 않는다.

articles_raw + articles_triage + articles_detail을 article_id로 합쳐서 입력으로 쓴다.
personal_relevance가 direct/indirect인 문서만 대상이다 (none은 애초에 피드에 안 보인다).

**user_profile은 프롬프트에 넣지 않는다.** 넣으면 "기사 × 사용자 프로필 조합"마다 Gemini를
다시 불러야 해서, article_id 하나로 캐싱하는 원칙(docs/card-content-design.md 2절)이
깨진다. 대신 Gemini는 "이 정책이 특정 대상을 뚜렷하게 겨냥하는지"만 판단해
personalized_signal/personalized_line을 쓰고, "지금 보는 이 사용자가 그 대상에 실제로
해당하는지"는 지금까지처럼 코드(app/matching.py, match.js)가 판단해 표시 여부를 정한다.

로컬 실행:
    python -m app.feed_card_generator          # 전체 처리
    python -m app.feed_card_generator 3        # 앞 3건만 (검증용)
"""

import json
import os
import time

from google import genai
from google.genai import types

from app.sheets import get_or_create_worksheet, get_spreadsheet, join_list

MODEL = "gemini-3.5-flash-lite"
CALL_INTERVAL_SECONDS = 4  # 무료 티어 분당 호출 제한을 피하려고 호출 사이 대기 (triage_collector와 동일)

VISUAL_THEMES = ["soft_3d_object", "clean_infographic", "flat_illustration", "editorial_minimal"]

FEED_CARD_HEADERS = [
    "article_id", "personalized_signal", "title", "personalized_line",
    "visual_theme", "visual_elements", "tags",
]

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "personalized_signal": {"type": "STRING", "nullable": True},
        "title": {"type": "STRING"},
        "personalized_line": {"type": "STRING", "nullable": True},
        "visual_theme": {"type": "STRING", "enum": VISUAL_THEMES},
        "visual_elements": {"type": "ARRAY", "items": {"type": "STRING"}},
        "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["title", "visual_theme", "visual_elements", "tags"],
}

PROMPT_TEMPLATE = """당신은 금융위원회 보도자료를 바탕으로 Polistagram My Feed에 노출될
정책 카드를 구성하는 역할이다. 이 카드는 목록에서 2~3초 안에 훑어보는 티저용이라,
정책을 전부 설명하지 않는다 — "이건 나랑 관련 있네, 자세히 봐야겠다"는 관심만 만든다.

**원문에 없는 내용은 지어내지 않는다.** 근거가 없으면 해당 필드는 반드시 null이다.

[personalized_signal] 이 정책이 특정 대상(예: 청년, 소상공인)을 뚜렷하게 겨냥할 때만,
그 대상을 가리키는 아주 짧은 문구를 쓴다 (예: "청년에게 도움되는 정책이에요"). 대상이
뚜렷하지 않은 일반 정보성 정책이면 반드시 null. personal_relevance 값 자체("direct"
등)를 문구에 그대로 쓰지 않는다.

[title] 정책의 핵심을 15~25자로 짧고 명확하게. 원문 제목이 길면 자연스럽게 축약하되
과장하거나 원문에 없는 의미를 더하지 않는다.

[personalized_line] 대상(target)과 정책 성격을 바탕으로, 왜 이 정책이 그 대상에게
관련 있는지 25~50자로 설명한다 (예: "20대 청년의 자산형성과 관련된 정책이에요"). 특정
대상이 불분명하면 반드시 null — 일반 정보성 정책에 억지로 개인화 문구를 붙이지 않는다.

[visual_theme] 정책 성격에 가장 잘 맞는 디자인 스타일 하나를 고른다.
- soft_3d_object: 저금통·집·카드·동전 같은 입체적 금융 오브젝트가 어울릴 때
- clean_infographic: 수치·비율·그래프 중심으로 보여주는 게 나을 때
- flat_illustration: 단순하고 친근한 도형/아이콘이 어울릴 때
- editorial_minimal: 오브젝트보다 핵심 문장 자체가 강조돼야 할 때 (텍스트 중심)

[visual_elements] 정책 내용을 상징하는 오브젝트·아이콘·그래프 키워드를 2~4개, 짧은
한국어 명사로 나열한다 (예: "저금통", "상승 그래프"). 나이나 성별에 맞춘 사람 캐릭터는
쓰지 않는다.

[tags] topics를 바탕으로 짧은 태그 1~2개 (# 기호 없이, 예: "청년금융").

---
제목: {title}
본문: {body_text}
한줄요약: {one_line_summary}
주제: {topics}
개인관련성: {personal_relevance}
쉬운설명: {summary_easy}
대상: {target}
혜택: {benefit}
"""


def get_client() -> genai.Client:
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=60_000),
    )


def generate_with_retry(client: genai.Client, prompt: str, attempts: int = 3) -> dict:
    """서버 과부하(503) 같은 일시적 오류는 잠깐 쉬었다 다시 시도한다. (triage_collector와 동일)"""
    for attempt in range(1, attempts + 1):
        try:
            return generate_feed_card(client, prompt)
        except genai.errors.ServerError:
            if attempt == attempts:
                raise
            wait = 5 * attempt
            print(f"  서버 오류, {wait}초 후 재시도 ({attempt}/{attempts})", flush=True)
            time.sleep(wait)


def generate_feed_card(client: genai.Client, prompt: str) -> dict:
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
        ),
    )
    return json.loads(response.text)


def build_prompt(row: dict) -> str:
    return PROMPT_TEMPLATE.format(
        title=row["title"],
        body_text=row["body_text"],
        one_line_summary=row["one_line_summary"],
        topics=", ".join(row["topics"]),
        personal_relevance=row["personal_relevance"],
        summary_easy=row.get("summary_easy") or "(없음)",
        target=row.get("target") or "(없음)",
        benefit=row.get("benefit") or "(없음)",
    )


def is_valid(result: dict) -> bool:
    return (
        bool(result.get("title"))
        and result.get("visual_theme") in VISUAL_THEMES
        and isinstance(result.get("visual_elements"), list)
        and len(result["visual_elements"]) > 0
        and isinstance(result.get("tags"), list)
        and len(result["tags"]) > 0
    )


def build_feed_card_row(article_id: str, result: dict) -> list:
    return [
        article_id,
        result.get("personalized_signal") or "",
        result["title"],
        result.get("personalized_line") or "",
        result["visual_theme"],
        join_list(result["visual_elements"]),
        join_list(result["tags"]),
    ]


def split_list(cell: str) -> list[str]:
    return cell.split("|") if cell else []


def process_feed_cards(limit: int | None = None) -> dict:
    """articles_raw+triage+detail을 합쳐, 아직 피드 카드가 없는 direct/indirect 문서만 생성한다."""
    spreadsheet = get_spreadsheet()
    raw_ws = spreadsheet.worksheet("articles_raw")
    triage_ws = spreadsheet.worksheet("articles_triage")
    detail_ws = spreadsheet.worksheet("articles_detail")
    feed_card_ws = get_or_create_worksheet(spreadsheet, "articles_feed_card", FEED_CARD_HEADERS)

    raw_by_id = {str(r["article_id"]): r for r in raw_ws.get_all_records()}
    detail_by_id = {str(r["article_id"]): r for r in detail_ws.get_all_records()}
    triage_rows = triage_ws.get_all_records()
    existing_ids = set(feed_card_ws.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

    targets = [
        row for row in triage_rows
        if row["personal_relevance"] in ("direct", "indirect")
        and str(row["article_id"]) not in existing_ids
    ]
    if limit is not None:
        targets = targets[:limit]

    client = get_client()
    added = 0
    skipped = []

    for i, triage_row in enumerate(targets):
        article_id = str(triage_row["article_id"])
        raw = raw_by_id.get(article_id)
        detail = detail_by_id.get(article_id, {})
        print(f"[{i + 1}/{len(targets)}] {article_id} ({triage_row['personal_relevance']}) 처리 중...", flush=True)

        if not raw:
            skipped.append({"article_id": article_id, "reason": "articles_raw에 없음"})
        else:
            row = {
                "title": raw["title"],
                "body_text": raw["body_text"],
                "one_line_summary": triage_row["one_line_summary"],
                "topics": split_list(triage_row["topics"]),
                "personal_relevance": triage_row["personal_relevance"],
                "summary_easy": detail.get("summary_easy"),
                "target": detail.get("target"),
                "benefit": detail.get("benefit"),
            }
            result = generate_with_retry(client, build_prompt(row))
            if is_valid(result):
                feed_card_ws.append_row(build_feed_card_row(article_id, result))
                added += 1
            else:
                skipped.append({"article_id": article_id, "reason": "필수 필드 누락", "raw": result})

        if i < len(targets) - 1:
            time.sleep(CALL_INTERVAL_SECONDS)

    return {"checked": len(targets), "added": added, "skipped": skipped}


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")

    arg_limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    outcome = process_feed_cards(limit=arg_limit)
    print(f"대상 {outcome['checked']}건, 저장 {outcome['added']}건, 스킵 {len(outcome['skipped'])}건")
    for item in outcome["skipped"]:
        print("  스킵:", item)
