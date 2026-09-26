"""정책 매칭 로직.

Google Sheets의 3개 탭(articles_raw, articles_triage, articles_detail)을
article_id 기준으로 합치고, docs/schema.md 6절 점수 계산식으로
사용자 프로필과 얼마나 맞는지 점수를 매긴다.

personal_relevance가 direct/indirect인 문서만 다룬다 (none은 카드로 안 보여줄 정책).
"""

import json
from datetime import date

import gspread

from app.sheets import get_spreadsheet


def split_list(cell: str) -> list[str]:
    """"대출|보험" 같은 파이프 구분 문자열을 리스트로 되돌린다. (schema.md 7절 역변환)"""
    return cell.split("|") if cell else []


def load_articles() -> list[dict]:
    """구글시트 3개 탭을 읽어서 article_id 기준으로 합친 딕셔너리 리스트를 만든다."""
    spreadsheet = get_spreadsheet()
    raw_rows = spreadsheet.worksheet("articles_raw").get_all_records()
    triage_rows = spreadsheet.worksheet("articles_triage").get_all_records()
    detail_rows = spreadsheet.worksheet("articles_detail").get_all_records()
    try:
        feed_card_rows = spreadsheet.worksheet("articles_feed_card").get_all_records()
    except gspread.WorksheetNotFound:
        # app/feed_card_generator.py를 아직 한 번도 안 돌렸으면 시트 자체가 없을 수 있다 —
        # 그 경우 My Feed 카드는 기존 필드(one_line_summary 등)로 대체 표시한다.
        feed_card_rows = []
    try:
        cards_rows = spreadsheet.worksheet("articles_cards").get_all_records()
    except gspread.WorksheetNotFound:
        # app/card_generator.py를 아직 한 번도 안 돌렸으면 시트 자체가 없을 수 있다 —
        # 그 경우 Story View는 프론트가 기존 필드로 카드를 즉석 합성한다(match.js).
        cards_rows = []

    # article_id를 키로 하는 딕셔너리로 바꿔두면, raw 하나당 O(1)로 짝을 찾을 수 있다.
    triage_by_id = {row["article_id"]: row for row in triage_rows}
    detail_by_id = {row["article_id"]: row for row in detail_rows}
    feed_card_by_id = {row["article_id"]: row for row in feed_card_rows}
    cards_by_id = {row["article_id"]: row for row in cards_rows}

    articles = []
    for raw in raw_rows:
        article_id = raw["article_id"]
        triage = triage_by_id.get(article_id)
        if triage is None or triage["personal_relevance"] not in ("direct", "indirect"):
            continue  # 2계층이 없거나(비정상) none이면 카드 후보에서 제외

        detail = detail_by_id.get(article_id, {})
        feed_card = feed_card_by_id.get(article_id, {})
        cards_row = cards_by_id.get(article_id, {})

        articles.append({
            "article_id": article_id,
            "title": raw["title"],
            "source_url": raw["source_url"],
            "published_at": raw["published_at"],
            "doc_type": triage["doc_type"],
            "topics": split_list(triage["topics"]),
            "personal_relevance": triage["personal_relevance"],
            "one_line_summary": triage["one_line_summary"],
            "audience_groups": split_list(triage["audience_groups"]),
            "summary_easy": detail.get("summary_easy") or None,
            "target": detail.get("target") or None,
            "benefit": detail.get("benefit") or None,
            "how_to_apply": detail.get("how_to_apply") or None,
            "key_dates": split_list(detail.get("key_dates", "")),
            "deadline": detail.get("deadline") or None,
            "region_scope": split_list(detail.get("region_scope", "")) or None,
            "evidence_quotes": split_list(detail.get("evidence_quotes", "")),
            # My Feed 티저 카드용 (app/feed_card_generator.py). 아직 생성 전이면 전부 None —
            # 프론트가 기존 필드(one_line_summary 등)로 대체 표시한다.
            "feed_personalized_signal": feed_card.get("personalized_signal") or None,
            "feed_title": feed_card.get("title") or None,
            "feed_personalized_line": feed_card.get("personalized_line") or None,
            "feed_visual_elements": split_list(feed_card.get("visual_elements", "")),
            "feed_tags": split_list(feed_card.get("tags", "")),
            # Story View 카드뉴스 본문 (app/card_generator.py). 아직 생성 전이면 빈 배열 —
            # 프론트가 기존 필드 조합으로 카드를 즉석 합성한다(match.js의 buildStoryCards).
            "story_cards": json.loads(cards_row["cards_json"])["cards"] if cards_row.get("cards_json") else [],
            # 카드별 용어풀이 (card_number로 story_cards와 연결). 옛날에 생성된 캐시라
            # term_explanations 자체가 없을 수도 있어 .get으로 기본값을 둔다.
            "term_explanations": (
                json.loads(cards_row["cards_json"]).get("term_explanations", [])
                if cards_row.get("cards_json") else []
            ),
        })

    return articles


def score(profile: dict, article: dict) -> int:
    """schema.md 6절 매칭 점수 계산식을 그대로 옮긴 것."""
    today = date.today().isoformat()

    if article["deadline"] and article["deadline"] < today:
        return 0  # 마감 지남
    if article["region_scope"] and profile["region"] not in article["region_scope"]:
        return 0  # 지역 안 맞음
    if (article["audience_groups"] and profile["occupation_type"]
            and profile["occupation_type"] not in article["audience_groups"]):
        return 0  # 특정 직업군 대상인데 나는 해당 안 됨

    return len(set(profile["interests"]) & set(article["topics"]))


def match_articles(profile: dict) -> list[dict]:
    """프로필과 맞는(점수 > 0) 정책만 골라, 점수 높은 순으로 정렬해 반환한다."""
    articles = load_articles()

    scored = []
    for article in articles:
        s = score(profile, article)
        if s > 0:
            scored.append({**article, "match_score": s})

    scored.sort(key=lambda a: a["match_score"], reverse=True)
    return scored
