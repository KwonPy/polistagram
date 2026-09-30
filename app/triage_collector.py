"""articles_raw(1계층)의 본문을 Gemini로 분류해 articles_triage(2계층)에 저장한다.

docs/schema.md 3절(2계층 필드)을 그대로 따른다. LLM 호출은 짧은 분류 1회뿐이고,
`status = active`인 문서만 대상이다 (schema.md 1절 전체 흐름 참고).

로컬 실행:
    python -m app.triage_collector          # 전체 처리
    python -m app.triage_collector 3        # 앞 3건만 (검증용)
"""

import json
import os
import time

from google import genai
from google.genai import types

from app.sheets import get_or_create_worksheet, get_spreadsheet, join_list

MODEL = "gemini-3.5-flash-lite"
CALL_INTERVAL_SECONDS = 4  # 무료 티어 분당 호출 제한을 피하려고 호출 사이 대기

# schema.md 3절에 정한 허용 값. Gemini 응답도, 사후 검증도 이 목록만 쓴다.
DOC_TYPES = ["support_program", "rule_change", "plan", "info", "admin"]
TOPICS = ["대출", "주거·전세", "저축·자산형성", "투자·주식", "보험", "창업·사업자금", "취업·채용", "기타"]
PERSONAL_RELEVANCE = ["direct", "indirect", "none"]
AUDIENCE_GROUPS = ["근로자", "구직자", "소상공인·자영업자", "대학생", "프리랜서·특수고용직"]

TRIAGE_HEADERS = [
    "article_id", "doc_type", "topics", "personal_relevance",
    "one_line_summary", "audience_groups",
]

# Gemini의 structured output 기능으로 위 허용 값을 API 레벨에서부터 강제한다.
# 모델이 "가상자산" 같은 목록 밖 값을 지어내는 것 자체가 불가능해진다.
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "doc_type": {"type": "STRING", "enum": DOC_TYPES},
        "topics": {"type": "ARRAY", "items": {"type": "STRING", "enum": TOPICS}},
        "personal_relevance": {"type": "STRING", "enum": PERSONAL_RELEVANCE},
        "one_line_summary": {"type": "STRING"},
        "audience_groups": {"type": "ARRAY", "items": {"type": "STRING", "enum": AUDIENCE_GROUPS}},
    },
    "required": ["doc_type", "topics", "personal_relevance", "one_line_summary", "audience_groups"],
}

PROMPT_TEMPLATE = """당신은 대한민국 금융위원회 보도자료를 분류하는 분류기다.
아래 5개 필드를 정확히 이 기준으로 채운다. 근거 없는 값은 만들지 않는다.

[doc_type] 5개 중 1개만 고른다.
- support_program: 지원·혜택 프로그램
- rule_change: 제도·규정·법률 변경
- plan: 계획·방향 발표
- info: 통계·회의·행사·캠페인 안내
- admin: 제재·인사·시험 등 행정공지

[topics] 아래 8개 중 해당하는 것을 복수 선택한다. 이 목록에 없는 주제(가상자산, 사기예방, 신용·연체 등)는 전부 "기타"로 분류한다.
대출 / 주거·전세 / 저축·자산형성 / 투자·주식 / 보험 / 창업·사업자금 / 취업·채용 / 기타

[personal_relevance] 셋 중 하나.
- direct: 개인이 지금 신청·이용·신고할 수 있는 것이 있다
- indirect: 개인에게 영향은 있으나 당장 할 행동이 없다
- none: 기관·업계 대상

주의: doc_type만 보고 판단하지 말 것. 예를 들어 "채용박람회 개최" 안내(info 유형)라도
날짜·장소·신청방법이 있으면 direct다. "펀드 운용사 대상 지원"(support_program 유형)이라도
대상이 기관이면 none이다.

[one_line_summary] 한 문장으로 핵심만 요약한다.

[audience_groups] 정책이 특정 직업군을 콕 집어 대상으로 할 때만 채운다. 일반 국민 대상이면 빈 배열.
근로자 / 구직자 / 소상공인·자영업자 / 대학생 / 프리랜서·특수고용직

---
제목: {title}
본문: {body_text}
"""


def get_client() -> genai.Client:
    # timeout(ms)을 안 정해두면 네트워크가 멈췄을 때 호출이 영원히 안 끝날 수 있다.
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=60_000),
    )


def classify_with_retry(client: genai.Client, title: str, body_text: str, attempts: int = 3) -> dict:
    """서버 과부하(504) 같은 일시적 오류는 잠깐 쉬었다 다시 시도한다."""
    for attempt in range(1, attempts + 1):
        try:
            return classify_article(client, title, body_text)
        except genai.errors.ServerError:
            if attempt == attempts:
                raise
            wait = 5 * attempt
            print(f"  서버 오류, {wait}초 후 재시도 ({attempt}/{attempts})", flush=True)
            time.sleep(wait)


def classify_article(client: genai.Client, title: str, body_text: str) -> dict:
    """Gemini를 호출해 5개 필드를 담은 딕셔너리를 받는다."""
    response = client.models.generate_content(
        model=MODEL,
        contents=PROMPT_TEMPLATE.format(title=title, body_text=body_text),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
        ),
    )
    return json.loads(response.text)


def is_valid(result: dict) -> bool:
    """API가 스키마를 지켜도, 코드에서 한 번 더 허용 값 안인지 확인한다 (방어선 이중화)."""
    return (
        result.get("doc_type") in DOC_TYPES
        and result.get("personal_relevance") in PERSONAL_RELEVANCE
        and set(result.get("topics", [])) <= set(TOPICS)
        and set(result.get("audience_groups", [])) <= set(AUDIENCE_GROUPS)
        and bool(result.get("one_line_summary"))
    )


def build_triage_row(article_id: str, result: dict) -> list:
    return [
        article_id,
        result["doc_type"],
        join_list(result["topics"]),
        result["personal_relevance"],
        result["one_line_summary"],
        join_list(result["audience_groups"]),
    ]


def triage_new_articles(limit: int | None = None) -> dict:
    """articles_raw(active)에서 아직 분류 안 된 것만 골라 Gemini로 분류해 저장한다."""
    spreadsheet = get_spreadsheet()
    raw_ws = spreadsheet.worksheet("articles_raw")
    triage_ws = get_or_create_worksheet(spreadsheet, "articles_triage", TRIAGE_HEADERS)

    raw_rows = raw_ws.get_all_records()
    existing_ids = set(triage_ws.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

    # gspread의 get_all_records()는 "87766"처럼 숫자로 보이는 셀을 자동으로 int로
    # 바꾼다. col_values()는 항상 문자열이라, str()로 맞춰주지 않으면 매번
    # "다 새 글"로 오판해서 같은 기사를 중복으로 append하게 된다.
    targets = [
        row for row in raw_rows
        if row["status"] == "active" and str(row["article_id"]) not in existing_ids
    ]
    if limit is not None:
        targets = targets[:limit]

    client = get_client()
    added = 0
    skipped = []

    for i, row in enumerate(targets):
        print(f"[{i + 1}/{len(targets)}] {row['article_id']} 분류 중...", flush=True)
        result = classify_with_retry(client, row["title"], row["body_text"])
        if not is_valid(result):
            skipped.append({"article_id": row["article_id"], "raw": result})
        else:
            # 호출마다 바로 append한다 — 중간에 하나가 멈추거나 실패해도
            # 그 전까지 처리한 결과는 시트에 이미 남아있어 다시 돌릴 필요가 없다.
            triage_ws.append_row(build_triage_row(str(row["article_id"]), result))
            added += 1

        if i < len(targets) - 1:
            time.sleep(CALL_INTERVAL_SECONDS)

    if added:
        # article_id는 기사 URL 번호라 클수록 최신이다. 매번 append로 쌓이므로
        # 실행 끝에 한 번만 정렬해서 시트가 항상 최신순을 유지하게 한다.
        triage_ws.sort((1, "des"), range=f"A2:Z{triage_ws.row_count}")

    return {"checked": len(targets), "added": added, "skipped": skipped}


if __name__ == "__main__":
    import sys

    arg_limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    outcome = triage_new_articles(limit=arg_limit)
    print(f"대상 {outcome['checked']}건, 저장 {outcome['added']}건, 스킵 {len(outcome['skipped'])}건")
    for item in outcome["skipped"]:
        print("  스킵:", item)
