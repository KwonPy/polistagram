"""Google Sheets 연결 및 공통 헬퍼.

.env 파일의 두 값을 읽어서 인증한다.
- GOOGLE_SHEETS_CREDENTIALS_PATH: 서비스 계정 JSON 키 파일 경로
- GOOGLE_SHEETS_ID: 사용할 스프레드시트 ID

서비스 계정 키(비밀번호 역할)를 코드에 직접 적지 않고 .env로 분리해서,
.env가 git에 올라가지 않는 한 키가 저장소에 노출되지 않는다.
"""

import os

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

# .env 파일을 읽어서 os.environ에 등록한다.
load_dotenv()

# 이 서비스로 무엇을 할 수 있는지 범위를 지정한다. 시트 읽기/쓰기만 허용.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def get_client() -> gspread.Client:
    """서비스 계정 키로 인증된 gspread 클라이언트를 만든다."""
    creds_path = os.environ["GOOGLE_SHEETS_CREDENTIALS_PATH"]
    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    return gspread.authorize(creds)


def get_spreadsheet() -> gspread.Spreadsheet:
    """.env에 지정된 스프레드시트를 연다."""
    client = get_client()
    sheet_id = os.environ["GOOGLE_SHEETS_ID"]
    return client.open_by_key(sheet_id)


def get_or_create_worksheet(
    spreadsheet: gspread.Spreadsheet, title: str, headers: list[str]
) -> gspread.Worksheet:
    """title이라는 이름의 탭이 있으면 가져오고, 없으면 새로 만들어 헤더를 채운다."""
    try:
        worksheet = spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(
            title=title, rows=200, cols=max(len(headers), 10)
        )
        worksheet.append_row(headers)
        return worksheet

    # 이미 있는 탭이면 1행(헤더)이 최신 스키마와 같은지 확인하고 다르면 맞춘다.
    if worksheet.row_values(1) != headers:
        worksheet.update("A1", [headers])
    return worksheet


def join_list(values: list[str] | None) -> str:
    """리스트를 파이프(|)로 이어붙인다. (schema.md 7절 규칙)

    None이거나 빈 리스트면 빈 문자열을 준다.
    """
    if not values:
        return ""
    return "|".join(values)


def to_cell(value):
    """파이썬 값을 Sheets 셀에 넣을 문자열로 바꾼다.

    None -> 빈 칸, True/False -> "TRUE"/"FALSE", 나머지는 그대로.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return value
