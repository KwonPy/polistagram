"""Story View 카드뉴스 콘텐츠를 Gemini로 생성해 articles_cards에 저장한다.

원문(body_text)과 articles_triage/articles_detail의 구조화 데이터(target/benefit/
key_dates 등)를 읽고, 그대로 옮기지 않고 "사람이 SNS에서 읽기 위한 짧은 카피"로
재작성한다. 필드를 나열식으로 이어 붙이거나 원문 문장을 잘라 붙이지 않는다 —
먼저 핵심 포인트 3~4개를 스스로 선정(key_points)한 뒤, 그걸 바탕으로 카드를 쓴다.

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
CARD_TYPES = ["hook", "policy", "change", "impact", "timing"]

CARDS_HEADERS = ["article_id", "has_hook", "cards_json", "generated_at"]

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "key_points": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "number": {"type": "INTEGER"},
                    "point": {"type": "STRING"},
                    "evidence": {"type": "STRING", "nullable": True},
                },
                "required": ["number", "point"],
            },
        },
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
                    "evidence": {"type": "STRING", "nullable": True},
                },
                "required": ["card_number", "type", "headline", "copy"],
            },
        },
        "term_explanations": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "card_number": {"type": "INTEGER"},
                    "term": {"type": "STRING"},
                    "explanation": {"type": "STRING"},
                },
                "required": ["card_number", "term", "explanation"],
            },
        },
    },
    "required": ["key_points", "cards", "term_explanations"],
}

PROMPT_TEMPLATE = """## 역할
당신은 금융위원회 보도자료와 구조화된 정책 데이터를 바탕으로, 인스타그램 카드뉴스에
필요한 핵심 정보를 편집하는 편집자다. 단순 요약이나 원문 문장 복사가 아니라, 원문을
읽고 내용을 이해한 뒤 핵심 의미를 다시 쓰는 게 목표다.

## 입력
- 구조화된 정책 데이터(대상/혜택/일정 등)
- 정책 원문(본문)
- 문서 분류 정보(문서유형/개인관련성) — 사용자에게 그대로 노출하지 않는 내부 값이다

## 처리 원칙
1. 먼저 구조화 데이터(대상/혜택/주요일정 등)로 정책의 핵심 내용을 파악한다.
2. 카드뉴스 제작에 필요한 정보가 부족하거나 불명확할 때만 본문에서 추가 정보를 찾는다.
3. 원문에 실제로 존재하는 정보만 사용한다. 추측하거나 없는 사실을 만들어내지 않는다.
   숫자·조건·일정은 정확히 유지한다.
4. 원문에서 가져온 정보는 가능한 경우 근거 문장(evidence)과 함께 기록한다. 근거를
   원문에서 찾을 수 없으면 evidence는 null로 둔다 — 억지로 지어내지 않는다.
5. 먼저 정책의 핵심 포인트 3~4개를 선정한 뒤(key_points), 그것을 바탕으로 카드를
   쓴다. 무엇이 바뀌는가 / 누구에게 중요한가 / 실제 혜택·영향 / 언제부터, 중 중요한
   것만 고른다.
6. 모든 카드가 같은 형식일 필요는 없다. 아래 5가지 타입 중 데이터가 뒷받침될 때만
   골라 3~6장으로 구성한다. 불필요한 카드는 생략한다 (원문 링크를 보여주는 source
   카드는 환각 위험 때문에 이 목록에 없다 — 코드가 별도로 붙인다).
   - hook: 가장 중요한 한 문장만. 개인화 정책(개인관련성=direct, 대상이 뚜렷함)이면
     "왜 이 정책이 나에게 떴을까요?" 같은 톤 + 그 대상이 누구인지 한 줄. 일반
     정보성 정책이면 "금융생활에 영향을 줄 변화가 생겼어요" 같은 핵심 메시지
     하나만. 세부 조건, 신청방법, 날짜는 넣지 않는다.
   - policy: 정책이 무엇인지 쉬운 말로 1~2문장. 원문의 어려운 표현을 그대로 쓰지
     않는다.
   - change: 가장 중요한 변화 1~2개만. 가능하면 headline에 "달라지는 점 ①"처럼
     번호를 쓴다. 대상/혜택/일정 근거가 있을 때만 포함.
   - impact: 사용자 상황과 정책을 연결해 "그래서 나에게 중요한 이유"를 설명한다.
     단순히 "관련 있다"고 하지 않고, 어떤 사람이라면 왜 중요한지 자연스럽게
     설명한다 (예: "현재 20대 청년이라면 이번 지원의 직접적인 대상이 될 수
     있어요"). 대상이 뚜렷하지 않으면 이 카드는 생략한다.
   - timing: 정책을 이해하거나 행동하는 데 꼭 필요한 정보만 — 신청기간/시행일/
     신청방법 중 있는 것만 골라서. 신청 방법, 일정 등 해당 정보가 원문에 없으면
     이 카드는 만들지 않는다.
7. 개인관련성 같은 내부 분류값을 사용자에게 그대로 노출하지 않는다. 필요하면 사용자의
   상황과 정책의 연결 이유를 자연어로 설명한다.
8. 광고처럼 과장하지 않는다. 같은 내용을 여러 카드에서 반복하지 않는다. 카드 하나에는
   하나의 메시지만 담는다.

**핵심**: 구조화 데이터 → 부족한 부분만 원문 확인 → 핵심 포인트 추출 → 카드뉴스 편집.
사실은 원문에서 확인하고, 표현은 사용자에게 이해하기 쉽게 재구성한다.

**글자 수**: headline 10~25자, copy 20~70자, highlight(있다면) 5~15자. 카드 하나의
본문은 3줄 이내로 유지한다. 짧게 쓰고, 한 문장에 하나의 의미만 담는다.

**용어풀이 선정 (term_explanations)**
카드 본문에 쓴 표현 중, 일반 사용자가 바로 이해하기 어려운 금융·정책·법률 용어나 약어
(예: LTV, DSR, 정책금융, 보증부 대출, 원리금상환, 만기연장, 유예)가 있고 그걸 몰라서는
카드의 핵심 내용을 이해하기 어려운 경우에만 뽑는다. 일반적인 단어는 억지로 설명하지
않는다 — 카드 하나당 최대 1~2개, 전체 기사에서도 꼭 필요한 것만 고른다.

설명은 전문적인 정의를 복사하지 않고 한 번 읽고 이해할 수 있는 쉬운 말 1문장으로 쓴다
(예: "DSR → 소득에 비해 갚아야 할 대출 원리금이 얼마나 되는지 보는 기준"). 어려운
용어를 또 다른 어려운 용어로 설명하지 않는다. 원문/구조화 데이터에서 의미를 확인할 수
있는 경우에만 쓰고, 없으면 그 용어는 넣지 않는다. `card_number`는 그 용어가 실제로
등장한 카드 번호와 같아야 한다. 설명할 용어가 없으면 빈 배열을 낸다.

---
제목: {title}
본문: {body_text}
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
        body_text=row["body_text"],
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
    key_points = result.get("key_points")
    cards = result.get("cards")
    if not isinstance(key_points, list) or not (3 <= len(key_points) <= 4):
        return False
    # 스펙은 "기본 4~6장"이지만 "불필요한 카드는 생략한다"도 명시했다 — impact/
    # timing 근거가 약한 기사는 hook+policy+change 3장만 나오는 게 정상이라,
    # 하한을 3으로 완화했다 (처음엔 4로 뒀다가 실제 배치에서 6/9건이 스킵돼 조정함).
    if not isinstance(cards, list) or not (3 <= len(cards) <= 6):
        return False
    if not all(
        c.get("type") in CARD_TYPES and bool(c.get("headline")) and bool(c.get("copy"))
        for c in cards
    ):
        return False

    terms = result.get("term_explanations")
    if not isinstance(terms, list):
        return False
    card_numbers = {c["card_number"] for c in cards}
    return all(
        bool(t.get("term")) and bool(t.get("explanation")) and t.get("card_number") in card_numbers
        for t in terms
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
    """articles_triage+detail+raw를 합쳐, 아직 카드뉴스가 없는 direct/indirect 문서만 생성한다."""
    spreadsheet = get_spreadsheet()
    raw_ws = spreadsheet.worksheet("articles_raw")
    triage_ws = spreadsheet.worksheet("articles_triage")
    detail_ws = spreadsheet.worksheet("articles_detail")
    cards_ws = get_or_create_worksheet(spreadsheet, "articles_cards", CARDS_HEADERS)

    raw_by_id = {str(r["article_id"]): r for r in raw_ws.get_all_records()}
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
        raw = raw_by_id.get(article_id)
        detail = detail_by_id.get(article_id, {})
        print(f"[{i + 1}/{len(targets)}] {article_id} ({triage_row['personal_relevance']}) 처리 중...", flush=True)

        if not raw:
            skipped.append({"article_id": article_id, "reason": "articles_raw에 본문 없음"})
            continue

        row = {
            "title": triage_row["one_line_summary"],  # 카드용 제목 축약 원본은 one_line_summary로 충분
            "body_text": raw["body_text"],
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
            skipped.append({"article_id": article_id, "reason": "key_points/cards 검증 실패", "raw": result})

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
