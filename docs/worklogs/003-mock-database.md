# Google Sheets 목업 DB 구축

> 작성일: 2026-09-06
> 관련 문서: [docs/schema.md](../schema.md)

---

## 1. 한 줄 요약

Google Sheets를 정식 DB로 실제 연결하고, 확정된 3계층 스키마(`articles_raw`/`articles_triage`/`articles_detail`)에 맞춰 실제 금융정책과 비슷한 목업 데이터 20건을 채워 넣었다.

## 2. 왜 만들었는가

RSS 실시간 수집 파이프라인을 만들기 전에, 분류·개인화 같은 핵심 기능부터 먼저 테스트해보고 싶었다. `docs/schema.md`에서 스키마 자체는 이미 확정했지만, 실제 Google Sheets에 이 구조로 데이터가 들어가 있던 적은 한 번도 없었다. 코드(매칭 로직 등)를 짜기 전에, 그 코드가 다룰 실제 데이터부터 만들어두는 순서를 택했다.

## 3. 구현한 것

- 서비스 계정(Service Account) 방식으로 Google Sheets API 인증
- 사용자가 빈 스프레드시트를 직접 만들고 서비스 계정에 편집자 권한을 공유 → Drive API 없이 Sheets API 권한만으로 충분하도록 설계
- `.env`로 인증 파일 경로와 시트 ID를 분리, `credentials/`와 `.env`는 `.gitignore`에 등록해 키가 git에 올라가지 않게 함
- `app/sheets.py`: 인증, 워크시트 열기/생성, 리스트→파이프 문자열 직렬화 등 공통 헬퍼
- `scripts/seed_mock_data.py`: 정책 20건(성격·대상·지역이 다양한 목업)을 정의하고 3개 시트에 적재
- 처음엔 `users` 탭도 만들었다가, 원래 요청 범위("정책 20건 DB")를 벗어난다고 사용자가 지적해 확인 후 삭제

## 4. 동작 흐름

```
scripts/seed_mock_data.py 실행
  ↓
ARTICLES 목록의 각 항목에서 raw / triage / detail 행을 만든다
  ↓  personal_relevance로 detail 포함 여부 결정
     (direct·indirect만 detail 행 생성, none은 스킵)
  ↓
app.sheets 모듈로 인증 → 3개 워크시트에 헤더는 유지하고 데이터만 덮어쓰기
```

## 5. 주요 파일

- `app/sheets.py`: Google Sheets 연결과 공통 헬퍼(`get_client`, `get_spreadsheet`, `get_or_create_worksheet`, `join_list`, `to_cell`)
- `scripts/seed_mock_data.py`: 목업 데이터 20건 정의 + 시트 적재 로직
- `.env` / `.env.example`: 실제 인증값(비공개) / 템플릿(공개 가능)
- `.gitignore`: `credentials/`, `.env` 제외

## 6. 핵심 코드 / 개념

**서비스 계정 인증**

```python
creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
return gspread.authorize(creds)
```

쉽게 말하면: 사람이 아이디/비밀번호로 로그인하는 대신, 미리 발급받은 "로봇 계정" 키 파일로 구글에 인증하는 방식이다. 이 키를 `.env`에 적힌 경로에서 읽어오기 때문에, 키 자체는 코드 어디에도 직접 적히지 않는다.

**직렬화 규칙 (schema.md 7절과 동일)**

```python
def join_list(values):
    if not values:
        return ""
    return "|".join(values)
```

리스트를 파이프(`|`)로 이어붙여 시트 한 칸에 넣는다. 빈 리스트나 `None`이면 빈 칸으로 만든다.

**게이트 필터링**

```python
detail_rows = [
    build_detail_row(a) for a in ARTICLES
    if a["personal_relevance"] in ("direct", "indirect")
]
```

`personal_relevance`가 `none`인 문서는 애초에 `articles_detail`에 행 자체를 만들지 않는다. 스키마에서 정한 "3계층 스킵" 규칙을 코드로 그대로 옮긴 것이다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| `gspread` | Python에서 Google Sheets를 읽고 쓰는 라이브러리 |
| `google-auth` (`Credentials`) | 서비스 계정 키로 구글 API 인증 |
| `python-dotenv` | `.env` 파일의 값을 환경변수로 불러옴 |

## 8. 문제와 해결

### 문제 1 — 요청 범위보다 큰 결과물 (`users` 탭)

- **문제:** 정책 20건 DB만 요청받았는데, 매칭 테스트를 대비해 `users` 탭까지 임의로 만들어 4개 탭이 됨
- **원인:** "`schema.md` 5절에 프로필 구조가 이미 있으니 만들어도 된다"고 스스로 판단함
- **해결:** 이유를 설명하고 사용자에게 확인받은 뒤 탭과 관련 코드(`USERS`, `USER_HEADERS`, `build_user_row` 등)를 전부 삭제
- **배운 점:** 스키마에 정의돼 있다는 것과, 지금 요청받은 작업 범위에 포함된다는 것은 다른 문제다. 범위를 넓히고 싶으면 미리 확인받아야 한다.

### 문제 2 — `gspread` deprecation 경고

- **문제:** `ws.update("A2", rows)` 호출 시 인자 순서 관련 경고 발생
- **원인:** 최신 `gspread`(6.x)에서 `update()`의 인자 순서가 바뀜
- **해결:** `ws.update(range_name="A2", values=rows)`처럼 이름 붙은 인자로 명시
- **배운 점:** 라이브러리 버전이 바뀌면 API 시그니처(인자 순서 등)도 바뀔 수 있다. 경고 메시지를 무시하지 않고 최신 방식으로 맞춰두면 나중에 더 큰 버전에서 깨지는 걸 막을 수 있다.

## 9. 의사결정

- **왜 서비스 계정 + `.env` 방식을 택했나** — 키를 코드에 하드코딩하지 않고, 실수로도 git에 올라가지 않게 하기 위해서다. 사용자가 빈 시트를 직접 만들고 서비스 계정에 공유하는 방식을 택해, Drive API 권한 없이 Sheets API 권한만으로 충분하게 설계했다.
- **왜 20건을 direct 6 / indirect 8 / none 6으로 나눴나** — `schema.md`에서 확인한 실측 비율(direct 17% / indirect 40% / none 43%)과 비슷한 감을 유지하면서도, `topics`(8개)·`doc_type`(5개)·`audience_groups`(5개) 값이 전부 최소 1건 이상 등장하도록 구성했다.

## 10. 배운 것

1. 목업 데이터를 만들 때도 실제 서비스 규칙(게이트, 직렬화 방식)을 그대로 지켜야, 나중에 매칭 로직을 이 데이터로 검증할 수 있다.
2. Google API에는 "시트 안에서 탭을 추가/수정하는 권한"(Sheets API)과 "누구에게 공유할지 정하는 권한"(Drive API)이 분리돼 있다. 서비스 계정에 시트 편집 권한을 줘도, 그 시트를 다른 사람에게 공개하는 건 별개의 권한이다.
3. 요청받지 않은 걸 "스키마에 있으니까"라는 이유로 임의로 넓히면 안 된다.

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 전부 목업 데이터 | 실제 RSS 수집 파이프라인은 아직 없다 |
| 배포 환경 미고려 | `credentials.json`이 로컬에만 있고, Vercel 등에 배포할 때 어떻게 옮길지 아직 안 정함 |
| 통째로 덮어쓰기 | 스크립트를 다시 돌리면 2행부터 전부 지우고 새로 쓴다. 실제 운영에서는 "새 글만 추가"하는 방식으로 바꿔야 한다 |

## 12. 다음 단계

이 데이터를 프론트엔드에서 CSV로 읽어와 화면에 보여주고([004-landing-page.md](004-landing-page.md)), 이후 `schema.md` 6절의 매칭 로직을 실제로 연결한다.
