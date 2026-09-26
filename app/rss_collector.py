"""금융위원회 RSS에서 신규 보도자료를 가져와 articles_raw에 저장한다.

docs/schema.md 3절(공식 데이터 출처는 RSS)과 11절(1계층만 먼저 만든다, LLM 없음)에
따른 구현이다. Vercel Cron이 매일 이 모듈의 collect_new_articles()를 호출한다
(app/main.py의 GET /api/collect 참고).

로컬에서 직접 실행:
    python -m app.rss_collector
"""

from datetime import datetime, timezone

import feedparser
import requests

from app.article_extract import RAW_HEADERS, build_raw_row, extract_article_id
from app.sheets import get_or_create_worksheet, get_spreadsheet

RSS_URL = "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111"


def fetch_feed_entries() -> list:
    """RSS를 가져와 feedparser로 파싱한다. 최신 항목 10개가 들어있다."""
    response = requests.get(RSS_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
    response.raise_for_status()
    return feedparser.parse(response.content).entries


def collect_new_articles() -> dict:
    """RSS 최신 항목 중 아직 시트에 없는 article_id만 articles_raw에 추가한다.

    "오늘 날짜인지"가 아니라 "이미 시트에 있는지"로 신규 여부를 판단한다.
    이렇게 하면 하루이틀 실행을 걸러도(또는 이번처럼 서비스를 막 시작해도)
    RSS에 남아있는 한 자동으로 놓친 분까지 채워진다.
    """
    spreadsheet = get_spreadsheet()
    worksheet = get_or_create_worksheet(spreadsheet, "articles_raw", RAW_HEADERS)
    existing_ids = set(worksheet.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

    entries = fetch_feed_entries()
    collected_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    new_rows = []
    for entry in entries:
        article_id = extract_article_id(entry.link)
        if article_id in existing_ids:
            continue
        published_at = entry.updated.split(" ")[0]  # "2026-09-22 00:00:00" -> "2026-09-22"
        new_rows.append(
            build_raw_row(article_id, entry.title, published_at, entry.summary, collected_at)
        )

    if new_rows:
        worksheet.append_rows(new_rows)

    return {"checked": len(entries), "added": len(new_rows)}


if __name__ == "__main__":
    result = collect_new_articles()
    print(f"RSS {result['checked']}건 확인, 신규 {result['added']}건 저장")
