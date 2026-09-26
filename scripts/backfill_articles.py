"""RSS는 최신 10건만 보여줘서, 서비스를 막 시작한 시점에는 그 이전 데이터가 비어
보이는 문제가 있다. 이 스크립트는 금융위 게시판 "목록 페이지"(HTML, RSS가 아니다)를
날짜 역순으로 넘겨가며 지정한 시작일 이후 보도자료를 한 번에 채워 넣는다.

일회성 실행용이며 cron 대상이 아니다. 매일 자동 수집은 app/rss_collector.py(RSS)가
담당한다 — CLAUDE.md 3절이 정한 공식 데이터 출처는 RSS이고, 이 스크립트는 그 RSS가
보여주지 못하는 과거분만 한 번 메우는 보조 도구다.

실행:
    python scripts/backfill_articles.py --since 2026-09-14
"""

import argparse
import html
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# app 패키지를 import할 수 있도록 프로젝트 루트를 경로에 추가한다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.article_extract import RAW_HEADERS, build_raw_row
from app.sheets import get_or_create_worksheet, get_spreadsheet

LIST_URL = "https://www.fsc.go.kr/no010101"
DETAIL_URL = "https://www.fsc.go.kr/no010101/{article_id}"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# 목록 페이지 하나의 HTML에서 (article_id, title, published_at)을 순서대로 뽑는 정규식.
# 게시글 하나의 <a href="/no010101/87708?...">에 title 속성으로 제목이 들어있고,
# 같은 항목 블록 끝에 <div class="day">2026-09-14</div>가 날짜로 붙어있다.
LIST_ITEM_PATTERN = re.compile(
    r'href="/no010101/(\d+)\?[^"]*"[^>]*title="([^"]*)"[^>]*>.*?'
    r'<div class="day">([\d-]+)</div>',
    re.S,
)


def list_page_items(page: int) -> list[tuple[str, str, str]]:
    """목록 페이지 하나에서 (article_id, title, published_at)을 최신순으로 뽑는다."""
    response = requests.get(LIST_URL, params={"curPage": page}, headers=HEADERS, timeout=10)
    response.raise_for_status()
    return [
        (article_id, html.unescape(title), published_at)
        for article_id, title, published_at in LIST_ITEM_PATTERN.findall(response.text)
    ]


def fetch_detail_body_html(article_id: str) -> str:
    """기사 상세 페이지에서 본문이 들어있는 부분만 HTML로 가져온다."""
    response = requests.get(DETAIL_URL.format(article_id=article_id), headers=HEADERS, timeout=10)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    body_container = soup.select_one(".board-view-wrap .cont")
    return str(body_container) if body_container else ""


def backfill(since: str) -> dict:
    """since(YYYY-MM-DD) 이후 게시물 중 시트에 없는 것만 articles_raw에 추가한다."""
    spreadsheet = get_spreadsheet()
    worksheet = get_or_create_worksheet(spreadsheet, "articles_raw", RAW_HEADERS)
    existing_ids = set(worksheet.col_values(1)[1:])  # 1행은 헤더라 건너뛴다.

    collected_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new_rows = []
    page = 1
    reached_cutoff = False

    while not reached_cutoff:
        items = list_page_items(page)
        if not items:
            break  # 더 이상 페이지가 없다.

        for article_id, title, published_at in items:
            if published_at < since:
                reached_cutoff = True  # 목록이 날짜 역순이라, 여기서부터는 더 오래된 글이다.
                break
            if article_id in existing_ids:
                continue  # RSS로 이미 수집된 최신 글은 건너뛴다.

            body_html = fetch_detail_body_html(article_id)
            new_rows.append(
                build_raw_row(article_id, title, published_at, body_html, collected_at)
            )
            time.sleep(0.3)  # 상세 페이지를 너무 빠르게 연속 요청하지 않도록 잠깐 쉰다.

        page += 1

    if new_rows:
        worksheet.append_rows(new_rows)

    return {"added": len(new_rows), "pages_checked": page - 1}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="금융위 보도자료 과거분 일회성 수집")
    parser.add_argument("--since", default="2026-09-14", help="YYYY-MM-DD, 이 날짜 포함 이후만 수집")
    args = parser.parse_args()

    result = backfill(args.since)
    print(f"{args.since} 이후 {result['pages_checked']}페이지 확인, 신규 {result['added']}건 저장")
