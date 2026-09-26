"""Story View 카드뉴스 콘텐츠를 Gemini로 생성해 articles_cards에 저장한다.

articles_triage + articles_detail의 구조화 데이터(target/benefit/key_dates 등)를
"사람이 읽기 위한 짧은 카피"로 재가공한다 — 필드를 그대로 나열하지 않는다.
docs/card-content-design.md에서 설계만 해두고 미뤘던 "카드뉴스 콘텐츠 생성" 단계다.

- personal_relevance가 direct/indirect인 문서만 대상 (none은 카드 자체가 없음)
- user_profile은 프롬프트에 넣지 않는다 — feed_card_generator.py와 같은 이유로,
  article_id 하나로 캐싱하려면 생성 시점에 특정 사용자를 알아선 안 된다. 실제로 이
  사용자에게 hook을 보여줄지는 지금처럼 코드(match.js)가 판단한다.
- source 카드는 LLM 출력에 없다. 원문 링크는 환각 위험이 있어 코드가 그대로 붙인다
  (docs/card-content-design.md 4절 원칙을 이번에도 유지).

로컬 실행:
    python -m app.card_generator          # 전체 처리
    python -m app.card_generator 3        # 앞 3건만 (검증용)
"""

import json
import os
import time

from google import genai
from google.genai import types

from app.sheets import get_or_create_worksheet, get_spreadsheet

MODEL = "gemini-3.5-flash-lite"
CALL_INTERVAL_SECONDS = 4  # 무료 티어 분당 호출 제한을 피하려고 호출 사이 대기

# source는 뺀다 — 원문 링크는 코드가 붙인다.
CARD_TYPES = ["hook", "policy", "key_change", "personal_impact", "action_timing"]

CARDS_HEADERS = ["article_id", "has_hook", "cards_json", "generated_at"]

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "cards": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "card_number": {"type": "INTEGER"},
                    "type": {"type": "STRING", "enum": CARD_TYPES},
                    "headline": {"type": "STRING"},
                    "copy": {"type": "STRING"},
                    "highlight": {"type": "STRING", "nullable": True},
                },
                "required": ["card_number", "type", "headline", "copy"],
            },
        },
    },
    "required": ["cards"],
}

PROMPT_TEMPLATE = """당신은 금융위원회 보도자료의 구조화된 정책 데이터를 받아, 인스타그램
카드뉴스처럼 짧고 핵심적으로 읽히는 콘텐츠로 재가공하는 역할이다.

**핵심 원칙: 정책의 모든 정보를 전달하지 않는다. 사용자가 알아야 할 핵심만 고른다.**
데이터 필드명이나 표 형식을 그대로 노출하지 않는다. 예:
- "target: 19~34세 청년" -> "34세 이하 청년이라면 확인해보세요"
- "benefit: 저금리 대출 및 자산형성 지원" -> "대출 부담은 낮추고 자산형성을 도와줘요"
- "key_dates: 2026년 10월 시행" -> "10월부터 달라집니다"

원문/구조화 데이터에 없는 내용은 추가하지 않는다. 숫자·조건·일정 같은 사실은 정확히
유지한다. 광고처럼 과장하지 않는다.

[개인화] personal_relevance가 direct이고 target이 뚜렷하면 "지금 당신의 상황과 직접
관련된 정책이에요" 같은 자연스러운 문장을 hook에 쓸 수 있다. indirect이거나 대상이
불분명하면 억지로 개인화하지 않는다.

[카드 구성] 아래 5가지 타입 중 데이터가 있는 것만 골라 4~6장으로 구성한다. 불필요한
카드는 생략한다 (예: 신청 방법/일정 정보가 없으면 action_timing 생략).
- hook: 개인화 정책이면 왜 나에게 떴는지, 일반 정책이면 가장 중요한 핵심 메시지
- policy: 이 정책이 무엇인지 한 문장으로
- key_change: 무엇이 달라지는지 핵심만
- personal_impact: 사용자에게 어떤 의미/혜택이 있는지 (target/benefit 근거가 있을 때만)
- action_timing: 일정·신청방법이 중요할 때만 (key_dates/deadline/how_to_apply 근거가 있을 때만)

[글자수] headline 15~25자, copy 30~70자, highlight(있다면) 10~20자.

---
제목: {title}
한줄요약: {one_line_summary}
문서유형: {doc_type}
개인관련성: {personal_relevance}
대상: {target}
혜택: {benefit}
주요일정: {key_dates}
마감일: {deadline}
신청방법: {how_to_apply}
지역범위: {region_scope}
"""


def get_client() -> genai.Client:
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=60_000),
    )


def generate_with_retry(client: genai.Client, prompt: str, attempts: int = 3) -> dict:
    """서버 과부하(503) 같은 일시적 오류는 잠깐 쉬었다 다시 시도한다."""
    for attempt in range(1, attempts + 1):
        try:
            return generate_cards(client, prompt)
        except genai.errors.ServerError:
            if attempt == attempts:
                raise
            wait = 5 * attempt
            print(f"  서버 오류, {wait}초 후 재시도 ({attempt}/{attempts})", flush=True)
            time.sleep(wait)


def generate_cards(client: genai.Client, prompt: str) -> dict:
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
        ),
    )
    return json.loads(response.text)


def split_list(cell: str) -> list[str]:
    return cell.split("|") if cell else []


def build_prompt(row: dict) -> str:
    return PROMPT_TEMPLATE.format(
        title=row["title"],
        one_line_summary=row["one_line_summary"],
        doc_type=row["doc_type"],
        personal_relevance=row["personal_relevance"],
        target=row.get("target") or "(없음)",
        benefit=row.get("benefit") or "(없음)",
        key_dates=", ".join(split_list(row.get("key_dates", ""))) or "(없음)",
        deadline=row.get("deadline") or "(없음)",
        how_to_apply=row.get("how_to_apply") or "(없음)",
        region_scope=", ".join(split_list(row.get("region_scope", ""))) or "전국",
    )


def is_valid(result: dict) -> bool:
    cards = result.get("cards")
    # 스펙은 "기본 4~6장"이지만 "불필요한 카드는 생략한다"도 명시했다 — personal_impact/
    # action_timing 근거가 약한 기사는 hook+policy+key_change 3장만 나오는 게 정상이라,
    # 하한을 3으로 완화했다 (처음엔 4로 뒀다가 실제 배치에서 6/9건이 스킵돼 조정함).
    if not isinstance(cards, list) or not (3 <= len(cards) <= 6):
        return False
    return all(
        c.get("type") in CARD_TYPES and bool(c.get("headline")) and bool(c.get("copy"))
        for c in cards
    )


def build_cards_row(article_id: str, result: dict) -> list:
    has_hook = any(c["type"] == "hook" for c in result["cards"])
    return [
        article_id,
        "TRUE" if has_hook else "FALSE",
        json.dumps(result, ensure_ascii=False),
        time.strftime("%Y-%m-%dT%H:%M:%S"),
    ]


def process_cards(limit: int | None = None) -> dict:
    """articles_triage+detail을 합쳐, 아직 카드뉴스가 없는 direct/indirect 문서만 생성한다."""
    spreadsheet = get_spreadsheet()
    triage_ws = spreadsheet.worksheet("articles_triage")
    detail_ws = spreadsheet.worksheet("articles_detail")
    cards_ws = get_or_create_worksheet(spreadsheet, "articles_cards", CARDS_HEADERS)

    detail_by_id = {str(r["article_id"]): r for r in detail_ws.get_all_records()}
    triage_rows = triage_ws.get_all_records()
    existing_ids = set(cards_ws.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

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
        detail = detail_by_id.get(article_id, {})
        print(f"[{i + 1}/{len(targets)}] {article_id} ({triage_row['personal_relevance']}) 처리 중...", flush=True)

        row = {
            "title": triage_row["one_line_summary"],  # 카드용 제목 축약 원본은 one_line_summary로 충분
            "one_line_summary": triage_row["one_line_summary"],
            "doc_type": triage_row["doc_type"],
            "personal_relevance": triage_row["personal_relevance"],
            "target": detail.get("target"),
            "benefit": detail.get("benefit"),
            "key_dates": detail.get("key_dates", ""),
            "deadline": detail.get("deadline"),
            "how_to_apply": detail.get("how_to_apply"),
            "region_scope": detail.get("region_scope", ""),
        }
        result = generate_with_retry(client, build_prompt(row))
        if is_valid(result):
            cards_ws.append_row(build_cards_row(article_id, result))
            added += 1
        else:
            skipped.append({"article_id": article_id, "reason": "카드 4~6장 검증 실패", "raw": result})

        if i < len(targets) - 1:
            time.sleep(CALL_INTERVAL_SECONDS)

    return {"checked": len(targets), "added": added, "skipped": skipped}


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")

    arg_limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    outcome = process_cards(limit=arg_limit)
    print(f"대상 {outcome['checked']}건, 저장 {outcome['added']}건, 스킵 {len(outcome['skipped'])}건")
    for item in outcome["skipped"]:
        print("  스킵:", item)
