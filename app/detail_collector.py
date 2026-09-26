"""articles_triage(2계층)에서 personal_relevance가 direct/indirect인 문서만 골라
Gemini로 상세 정보를 뽑아 articles_detail(3계층)에 저장한다.

docs/schema.md 4절(3계층 필드, 처리 게이트)을 그대로 따른다.

- direct: 8개 필드 전부 추출 (긴 호출)
- indirect: summary_easy 하나만 추출 (짧은 호출)
- none: 3계층 자체를 스킵 (호출 안 함)

로컬 실행:
    python -m app.detail_collector          # 전체 처리
    python -m app.detail_collector 3        # 앞 3건만 (검증용)
"""

import json
import os
import re
import time

from google import genai
from google.genai import types

from app.sheets import get_or_create_worksheet, get_spreadsheet, join_list

MODEL = "gemini-3.5-flash-lite"
CALL_INTERVAL_SECONDS = 4  # 무료 티어 분당 호출 제한을 피하려고 호출 사이 대기 (triage_collector와 동일)

DETAIL_HEADERS = [
    "article_id", "summary_easy", "target", "benefit", "how_to_apply",
    "key_dates", "deadline", "region_scope", "evidence_quotes",
]

# direct 문서용 — 8개 필드 전부. schema.md 4절 표 그대로다.
FULL_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary_easy": {"type": "STRING"},
        "target": {"type": "STRING"},
        "benefit": {"type": "STRING", "nullable": True},
        "how_to_apply": {"type": "STRING", "nullable": True},
        "key_dates": {"type": "ARRAY", "items": {"type": "STRING"}},
        "deadline": {"type": "STRING", "nullable": True},
        "region_scope": {"type": "ARRAY", "items": {"type": "STRING"}, "nullable": True},
        "evidence_quotes": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["summary_easy", "target", "key_dates", "evidence_quotes"],
}

# indirect 문서용 — summary_easy 하나만 강제.
SUMMARY_ONLY_SCHEMA = {
    "type": "OBJECT",
    "properties": {"summary_easy": {"type": "STRING"}},
    "required": ["summary_easy"],
}

FULL_PROMPT_TEMPLATE = """당신은 대한민국 금융위원회 보도자료에서 개인이 실제로 신청·이용할 수 있는
정보를 뽑아내는 분석기다. 아래 규칙을 정확히 지킨다.

**가장 중요한 규칙: 원문에 없는 내용은 절대 지어내지 않는다.**
값을 모르거나 원문에 명시돼 있지 않으면 반드시 null(해당 필드가 배열이면 빈 배열)을 준다.
"아마 그럴 것이다" 같은 추측은 금지한다.

[summary_easy] 쉬운 말로 3~5문장 요약. 전문 용어를 풀어서 설명한다.

[target] 이 정책의 대상이 누구인지 원문 표현을 기반으로 적는다.

[benefit] 무엇을 받는지. 원문에 없으면 null.

[how_to_apply] 신청 방법. **원문에 실제로 신청 방법이 나와 있을 때만 적고, 없으면 반드시 null.**
"[별첨] 참고" 같은 첨부파일 안내만 있고 본문에 방법이 없으면 null이다.

[key_dates] 원문에 나온 날짜 관련 표현을 그대로 옮긴다 (예: "연말부터 투자집행 개시",
"10월까지 운용사 선정"). 날짜를 임의로 계산하거나 형식을 바꾸지 않는다.

[deadline] 원문에 명확한 마감일(예: "9월 30일까지 신청")이 있을 때만 YYYY-MM-DD로 적는다.
애매한 표현("연말부터", "하반기 중")뿐이면 반드시 null.

[region_scope] 특정 지역 한정 정책일 때만 지역명 배열로 적는다. 전국 대상이면 null.

[evidence_quotes] 위 필드들을 채운 근거가 된 원문 문장을 2~3개, **원문 그대로** 인용한다.
바꿔 쓰지 않는다 — 나중에 코드가 이 문장이 원문에 실제로 있는지 대조한다.

---
제목: {title}
본문: {body_text}
"""

SUMMARY_PROMPT_TEMPLATE = """당신은 대한민국 금융위원회 보도자료를 쉬운 말로 요약하는 분석기다.

[summary_easy] 아래 제목과 본문을 초등학생도 이해할 수 있는 쉬운 말로 3~5문장 요약한다.
전문 용어는 풀어서 설명한다. 원문에 없는 내용은 지어내지 않는다.

---
제목: {title}
본문: {body_text}
"""


def get_client() -> genai.Client:
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=60_000),
    )


def _generate(client: genai.Client, prompt: str, schema: dict) -> dict:
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
        ),
    )
    return json.loads(response.text)


def _generate_with_retry(client: genai.Client, prompt: str, schema: dict, attempts: int = 3) -> dict:
    """서버 과부하(503) 같은 일시적 오류는 잠깐 쉬었다 다시 시도한다. (triage_collector와 동일)"""
    for attempt in range(1, attempts + 1):
        try:
            return _generate(client, prompt, schema)
        except genai.errors.ServerError:
            if attempt == attempts:
                raise
            wait = 5 * attempt
            print(f"  서버 오류, {wait}초 후 재시도 ({attempt}/{attempts})", flush=True)
            time.sleep(wait)


def classify_detail_direct(client: genai.Client, title: str, body_text: str) -> dict:
    """direct 문서용 — 8개 필드 전부 채운 딕셔너리를 받는다."""
    prompt = FULL_PROMPT_TEMPLATE.format(title=title, body_text=body_text)
    return _generate_with_retry(client, prompt, FULL_SCHEMA)


def classify_detail_indirect(client: genai.Client, title: str, body_text: str) -> dict:
    """indirect 문서용 — summary_easy만 채운 딕셔너리를 받는다."""
    prompt = SUMMARY_PROMPT_TEMPLATE.format(title=title, body_text=body_text)
    return _generate_with_retry(client, prompt, SUMMARY_ONLY_SCHEMA)


def _normalize(text: str) -> str:
    """공백/줄바꿈 차이를 무시하고 비교하려고, 공백을 전부 지운 문자열을 만든다."""
    return re.sub(r"\s+", "", text)


def evidence_supported(evidence_quotes: list, body_text: str) -> bool:
    """evidence_quotes가 실제로 body_text 안에 있는지 대조한다 (환각 방지 이중 검증).

    quote 안의 줄바꿈/띄어쓰기가 원문과 완전히 같지 않을 수 있어서, 둘 다 공백을 지우고
    부분 문자열로 비교한다. 하나라도 원문에서 못 찾으면 지어낸 근거로 보고 False를 준다.
    """
    if not evidence_quotes:
        return False
    normalized_body = _normalize(body_text)
    return all(_normalize(quote) in normalized_body for quote in evidence_quotes)


def is_valid_direct(result: dict, body_text: str) -> bool:
    """direct 응답은 필수 필드가 다 있고, evidence_quotes가 원문에 실제로 있어야 통과한다."""
    return (
        bool(result.get("summary_easy"))
        and bool(result.get("target"))
        and isinstance(result.get("key_dates"), list)
        and evidence_supported(result.get("evidence_quotes", []), body_text)
    )


def is_valid_indirect(result: dict) -> bool:
    return bool(result.get("summary_easy"))


def build_detail_row(article_id: str, result: dict) -> list:
    """direct/indirect 공통 — 없는 필드는 빈 값으로 채워서 DETAIL_HEADERS 9칸을 맞춘다."""
    return [
        article_id,
        result.get("summary_easy") or "",
        result.get("target") or "",
        result.get("benefit") or "",
        result.get("how_to_apply") or "",
        join_list(result.get("key_dates")),
        result.get("deadline") or "",
        join_list(result.get("region_scope")),
        join_list(result.get("evidence_quotes")),
    ]


def process_details(limit: int | None = None) -> dict:
    """articles_triage(direct/indirect)에서 아직 3계층이 없는 것만 골라 처리해 저장한다."""
    spreadsheet = get_spreadsheet()
    raw_ws = spreadsheet.worksheet("articles_raw")
    triage_ws = spreadsheet.worksheet("articles_triage")
    detail_ws = get_or_create_worksheet(spreadsheet, "articles_detail", DETAIL_HEADERS)

    raw_by_id = {str(row["article_id"]): row for row in raw_ws.get_all_records()}
    triage_rows = triage_ws.get_all_records()
    existing_ids = set(detail_ws.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

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

    for i, row in enumerate(targets):
        article_id = str(row["article_id"])
        raw = raw_by_id.get(article_id)
        title = raw["title"] if raw else None
        body_text = raw["body_text"] if raw else None
        print(f"[{i + 1}/{len(targets)}] {article_id} ({row['personal_relevance']}) 처리 중...", flush=True)

        if not body_text:
            skipped.append({"article_id": article_id, "reason": "articles_raw에 본문 없음"})
        elif row["personal_relevance"] == "direct":
            result = classify_detail_direct(client, title, body_text)
            if is_valid_direct(result, body_text):
                detail_ws.append_row(build_detail_row(article_id, result))
                added += 1
            else:
                skipped.append({"article_id": article_id, "reason": "필수 필드 누락 또는 evidence 대조 실패", "raw": result})
        else:  # indirect
            result = classify_detail_indirect(client, title, body_text)
            if is_valid_indirect(result):
                detail_ws.append_row(build_detail_row(article_id, result))
                added += 1
            else:
                skipped.append({"article_id": article_id, "reason": "summary_easy 없음", "raw": result})

        if i < len(targets) - 1:
            time.sleep(CALL_INTERVAL_SECONDS)

    return {"checked": len(targets), "added": added, "skipped": skipped}


if __name__ == "__main__":
    import sys

    # Windows 콘솔 기본 인코딩(cp949)은 "·" 같은 일부 한글 문장부호를 못 담아서,
    # 그대로 print하면 한글 결과를 출력할 때 UnicodeEncodeError로 죽는다.
    sys.stdout.reconfigure(encoding="utf-8")

    arg_limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    outcome = process_details(limit=arg_limit)
    print(f"대상 {outcome['checked']}건, 저장 {outcome['added']}건, 스킵 {len(outcome['skipped'])}건")
    for item in outcome["skipped"]:
        print("  스킵:", item)
