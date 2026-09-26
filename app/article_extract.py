"""RSS/게시판 HTML에서 보도자료 본문을 뽑아 1계층(articles_raw) 행을 만드는 공통 로직.

docs/schema.md 2절(articles_raw 필드)과 8절(본문 추출 규칙 v3)을 그대로 옮긴 것이다.
`app/rss_collector.py`(매일 자동 수집)와 `scripts/backfill_articles.py`(과거분 일회성
수집)가 이 모듈을 함께 쓴다 — 같은 규칙으로 본문을 뽑아야 두 경로로 들어온 데이터가
일관되기 때문이다.
"""

import hashlib
import re

from bs4 import BeautifulSoup

# schema.md 2절: 본문이 300자 미만이면 첨부파일에만 내용이 있는 문서로 보고 skip한다.
BODY_MIN_LENGTH = 300

RAW_HEADERS = [
    "article_id", "title", "source_url", "published_at", "body_text",
    "body_char_count", "content_hash", "collected_at", "status",
]


def is_data_table(table) -> bool:
    """격자형 데이터 표인가? (schema.md 8절 v3 규칙)

    True면 본문에서 제거 대상. 금융위 게시글은 <table>을 표가 아니라
    강조 박스로도 쓰기 때문에, "표 모양인가"가 아니라 "칸이 여러 개고
    칸마다 글자 수가 짧은가"(=숫자 격자인가)로 판정한다.
    """
    trs = table.find_all("tr")
    if len(trs) < 2:  # 1행짜리는 섹션 제목을 표로 그린 것일 뿐 데이터표가 아니다.
        return False

    n_cols = max(len(tr.find_all(["td", "th"])) for tr in trs)
    cells = [c.get_text(" ", strip=True) for tr in trs for c in tr.find_all(["td", "th"])]
    cells = [c for c in cells if c]
    if not cells:
        return True

    avg = sum(len(c) for c in cells) / len(cells)
    if n_cols < 2:  # 열이 1개면 박스이지 표가 아니다.
        return False
    return (n_cols >= 3 and avg < 40) or avg < 15


def extract_body(html: str) -> str:
    """본문 HTML에서 데이터표를 지우고 순수 텍스트만 남긴다."""
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        if is_data_table(table):
            table.decompose()
    return soup.get_text("\n", strip=True)


def extract_article_id(url: str) -> str:
    """기사 URL 끝의 숫자를 article_id로 쓴다. (schema.md 2절 — RSS에 별도 ID 필드가 없다)"""
    match = re.search(r"/(\d+)(?:[/?]|$)", url)
    return match.group(1)


def build_raw_row(
    article_id: str, title: str, published_at: str, body_html: str, collected_at: str
) -> list:
    """(기사 ID, 제목, 게시일, 본문 HTML)로 articles_raw 한 행을 만든다."""
    body = extract_body(body_html)
    body_char_count = len(body)
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
    status = "active" if body_char_count >= BODY_MIN_LENGTH else "skipped_no_body"
    return [
        article_id,
        title,
        f"https://www.fsc.go.kr/no010101/{article_id}",
        published_at,
        body,
        body_char_count,
        content_hash,
        collected_at,
        status,
    ]
