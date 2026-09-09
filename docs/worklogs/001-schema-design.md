# FSC 보도자료 실측 조사 및 스키마 논의

> 작성일: 2026-09-04
> 상태: **논의 단계 — 스키마 미확정, 서비스 코드 없음**

---

## 1. 한 줄 요약

금융위원회 보도자료 20건을 실제로 가져와 본문까지 읽어보고, 어떤 데이터가 실제로 존재하는지 확인한 뒤 스키마 방향을 논의했다.

**아직 아무것도 확정하지 않았다.**

---

## 2. 왜 했는가

스키마를 상상으로 정하면 틀린다는 걸 확인하고 싶었다.

처음에는 이런 필드가 당연히 필요할 거라 생각했다.

- `eligibility` (자격요건)
- `application_method` (신청방법)
- `action_steps` (행동 단계)
- 사용자 `income_range` (소득구간)

실제 보도자료를 열어보니 **이 정보들이 원문에 거의 없었다.**

없는 정보를 필드로 만들어두면 AI가 그 칸을 채우려고 **없는 사실을 지어낸다.**
그래서 코드를 짜기 전에 실제 데이터를 먼저 보는 단계를 넣었다.

---

## 3. 한 것

⚠️ **서비스 코드가 아니라 조사용 스크립트다.**

- 금융위 RSS에서 최신 10건 수집 → 본문 저장
- 게시판 2페이지에서 과거 10건 수집 → 본문 저장
- HTML에서 본문 텍스트를 뽑는 규칙 실험
- 20건을 읽고 유형별로 분류해봄
- 스키마 방향 논의 (문서로만, 미확정)

---

## 4. 동작 흐름

```
금융위 RSS (최신 10건)
  ↓  feedparser
제목 / 링크 / 발행일 / 본문 HTML
  ↓  BeautifulSoup
태그 제거 → 순수 텍스트
  ↓
사람이 읽고 분류 → 스키마 논의
```

RSS는 최신 10건만 주기 때문에, 과거 글은 게시판 페이지에서 직접 가져왔다.

```
게시판 2페이지 → 링크에서 article_id 추출 → 상세 페이지 10건 요청
```

---

## 5. 주요 파일

**프로젝트에는 아직 코드 파일이 없다.** (`CLAUDE.md`, `.claude/`, `docs/`만 존재)

조사용 스크립트는 임시 폴더(scratchpad)에 있고 언젠가 사라진다.
중요한 코드는 아래 6번에 옮겨 적어 두었다.

---

## 6. 확인한 사실 (이건 확정)

스키마는 미정이지만, **아래는 실제로 찍어본 결과라 사실이다.**

### (1) RSS 읽기

```python
import feedparser

RSS_URL = "http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111"
feed = feedparser.parse(RSS_URL)
```

**쉽게 말하면:** 금융위가 "새 글 올렸어요" 하고 알려주는 목록을 읽어오는 코드다.

- `import feedparser` : RSS를 읽는 도구를 가져온다.
- `RSS_URL = "..."` : 읽고 싶은 주소를 변수에 담아둔다.
- `feedparser.parse(...)` : 그 주소에 접속해서 내용을 가져와 Python이 다룰 수 있는 형태로 바꾼다.
- `feed = ` : 결과를 `feed` 변수에 저장한다.

**정확한 용어:** RSS는 사이트가 새 글 목록을 기계가 읽기 쉬운 형식(XML)으로 제공하는 규격이다.

### (2) RSS가 실제로 주는 것

| 있는 것 | 없는 것 |
|---|---|
| `title` (제목) | `published` — `updated`만 있고 시각은 항상 `00:00:00` |
| `link` (원문 주소) | `author` (작성자) |
| `summary` (**본문 HTML 전체**) | `category` (분류) |
| `updated` (날짜) | 첨부파일, 담당부서 |

**수확:** `summary`에 본문이 통째로 있다. 별도 크롤링 없이 원문을 쓸 수 있다.

**주의:** 고유 번호가 별도 필드로 없다. 주소 끝 숫자가 사실상 ID다.

```
https://www.fsc.go.kr/no010101/87646
                                └── 이 숫자
```

### (3) HTML에서 텍스트만 뽑기

```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(raw_html, "html.parser")
text = soup.get_text("\n")
```

**쉽게 말하면:** 웹페이지에 섞인 `<p>`, `<span>` 같은 꾸미기 기호를 걷어내고 글자만 남긴다.

- `BeautifulSoup(raw_html, "html.parser")` : HTML을 분석해 구조를 이해한 객체를 만든다.
- `soup.get_text("\n")` : 태그를 빼고 글자만 뽑되 사이에 줄바꿈을 넣는다.

### (4) ⭐ `<table>`이 표가 아니었다 — 이번 조사 최대 발견

**처음 생각:** "표는 텍스트로 바꾸면 숫자만 나열돼서 AI가 헷갈린다. 다 빼자."

**실제로 해보니:** 금융위는 `<table>`을 **표가 아니라 강조 박스로 쓴다.**

불법사금융 보도자료 하나에 `<table>`이 12개 있었는데:

| 실제 내용 | 개수 |
|---|---|
| 요약 박스, 제도 설명, "☞ 무엇이 달라지나요?", 사례, 섹션 제목 | **10개** |
| 진짜 숫자 표 | **2개** |

표를 다 지우니 이런 게 통째로 사라졌다.

```
< 입법예고 관련 안내사항 >
￭ 예고기간 : 2026.8.27일(목) ~ 2026.10.6일(화), (41일)
￭ 의견서 제출처
 - 일반우편 : 서울시 종로구 세종대로 209 정부서울청사 금융위원회 가계금융과
 - 전자우편 : parkms165289@korea.kr  - 팩스 : 02-2100-2639
```

`<table>` 안에 있었지만 **사용자가 실제로 할 수 있는 행동 그 자체**였다.

그래서 "표 모양인가"가 아니라 **"격자형 데이터인가"**로 판정하는 규칙을 만들었다.

```python
def is_data_table(table):
    """격자형 데이터 표인가? (True면 제거)"""
    trs = table.find_all("tr")
    if not trs:
        return False

    n_cols = max(len(tr.find_all(["td", "th"])) for tr in trs)
    cells = [c.get_text(" ", strip=True) for tr in trs for c in tr.find_all(["td", "th"])]
    cells = [c for c in cells if c]
    if not cells:
        return True

    avg = sum(len(c) for c in cells) / len(cells)

    if n_cols < 2:                        # 열이 1개면 표가 아니라 박스
        return False
    return (n_cols >= 3 and avg < 40) or avg < 15
```

한 줄씩 읽으면:

- `trs = table.find_all("tr")` : 표의 **행**들을 찾는다. (`tr` = table row)
- `n_cols = max(...)` : 각 행의 칸 수를 세서 **가장 많은 열 개수**를 구한다. (`td` = 칸)
- `cells = [...]` : 모든 칸의 글자를 모은다.
- `avg = ...` : **칸 하나당 평균 글자 수**를 구한다.
- `if n_cols < 2: return False` : 열이 1개면 박스이므로 살린다.
- `return (n_cols >= 3 and avg < 40) or avg < 15` : 열이 여럿인데 칸이 짧으면 진짜 표로 본다.

**판정 근거는 두 가지다.** 열이 1개면 박스다. 열이 여러 개여도 칸에 긴 문장이 있으면 서술이다.

**20건 전수 검증:** 오분류 0건, 본문 6,655자(+25%) 복구.

원래 의도한 "표 대신 텍스트 설명"은 그대로 지켜진다. 숫자 격자를 지워도 본문에 서술이 남기 때문이다.

> 시행 이후 약 6달간 **821명**이 방문하여 피해상담을 받았으며, 그 중 **656명**이 **4,705건**을 신고하였다.

### (5) 보도자료가 다 같은 문서가 아니다

20건을 읽어보니 성격이 제각각이었다.

- 제도 시행 / 계획 발표 / 규정 변경 / 규정변경예고 / 제재 / 승인·지정 / 통계 / 회의 / 캠페인 / 인사 공지

그리고 **개인이 직접 행동할 수 있는 문서는 20건 중 3건(15%)뿐**이었다.

본문이 사실상 없는 문서도 3건 있었다. 한 건은 본문 전체가 이거였다.

> 자세한 내용은 첨부파일 참고 부탁드립니다. *(23자)*

---

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| `feedparser` | RSS를 Python 데이터로 변환 |
| `requests` | 웹페이지 HTML 가져오기 |
| `BeautifulSoup` (bs4) | HTML 분석·태그 제거 |

---

## 8. 문제와 해결

### 문제 1 — 한글이 깨지고 프로그램이 죽음

- **문제:** `UnicodeEncodeError: 'cp949' codec can't encode character '▸'` 로 중단
- **원인:** Windows 터미널 기본 인코딩이 `cp949`인데 보도자료에 `▸` `｢` 같은 특수문자가 있음
- **메시지 핵심:** `'cp949' codec can't encode` → "cp949로는 이 글자를 못 쓴다"
- **해결:** 화면에 찍지 말고 UTF-8 파일로 저장 후 읽기
  ```python
  with open("article_0.txt", "w", encoding="utf-8") as f:
      f.write(text)
  ```
- **배운 점:** Windows에서 한글을 다룰 때 파일 입출력에 `encoding="utf-8"`을 **항상 명시**한다.

### 문제 2 — RSS가 10건만 준다

- **문제:** 표본이 더 필요한데 RSS에는 10건뿐
- **원인:** RSS는 "최신 목록"만 제공하는 규격
- **해결:** 게시판 2페이지에서 직접 수집
- **배운 점 (중요):** **RSS만 믿으면 글을 놓칠 수 있다.** 하루 10건 넘게 올라오면 수집 주기가 길 때 사이 글이 사라진다. 실측은 4일에 10건이라 아직 여유가 있지만 확인이 필요하다.

### 문제 3 — 표를 다 지웠더니 핵심 정보가 사라짐

- **문제:** 의견 제출 방법, 제도 설명, 요약 박스가 통째로 소실
- **원인:** 금융위는 `<table>`을 레이아웃 박스로 사용 (12개 중 10개)
- **해결:** 격자형만 골라 제거 (6번 코드)
- **배운 점:** **추측을 실제 데이터로 검증해야 한다.** 20건 전수로 확인했다.

### 문제 4 — 본문이 사실상 없는 문서

- **문제:** 본문이 23자인 보도자료 발견
- **원인:** 실제 내용이 `.hwp` / `.pdf` 첨부에만 있음
- **해결:** 아직 없음. 걸러내는 방향으로 논의 중
- **배운 점:** 이런 문서에 AI 구조화를 돌리면 **근거가 없으니 지어낸다.**

---

## 9. 논의된 방향 (전부 미확정)

⚠️ **아래는 결정이 아니라 "이런 방향을 이야기했다"는 기록이다.**
실제 스키마는 데이터가 더 쌓인 뒤 다시 검토하기로 했다.

| 논점 | 논의된 방향 | 근거 |
|---|---|---|
| 저장 구조 | Google Sheets를 **3계층**으로 나누는 안 (원본 / 분류 / 상세) | 20건 중 개인 관련 3건뿐이라, 전부 상세 추출하면 Gemini 할당량 낭비 |
| `action_steps` | **저장 필드로 두지 않는** 방향 | 개인 관련성 1위 문서조차 개인 신청 절차가 원문에 없었음 |
| `eligibility` | 구조화된 필드 대신 **문자열 목록**으로 두는 방향 | 숫자 자격요건이 나온 문서가 거의 없고, "성장등급이 높은" 같은 자가 진단 불가 표현이 대부분 |
| 사용자 `income_range` | **빼는** 방향 | 20건 중 개인 소득구간을 조건으로 쓴 정책 0건 |
| 사용자 `housing_status` | **빼는** 방향 | 주거 정책이 표본에 거의 없음 (국토부 소관) |
| 개인 대상 표현 | `individual` 하나로 뭉치지 말고 **청년 / 신혼부부 / 소상공인** 등으로 나누는 방향 | 원문에 "청년·신혼부부 보금자리"처럼 직접 등장 |
| 본문 없는 문서 | **제외**하되 재수집 방지를 위해 ID는 남기는 방향 | 20건 중 3건 |
| 표 처리 | 격자형만 제거 (6번) | 20건 검증 완료 — 이건 사실상 확정 |

---

## 10. 배운 것

1. **스키마는 상상이 아니라 데이터에서 나온다.**
   당연히 있을 거라 생각한 `eligibility`, `application_method`, `income_range`가 실제로는 거의 없었다.

2. **필드를 만들면 AI는 그 칸을 채우려 한다.**
   근거 없는 필드는 편의 기능이 아니라 **환각 발생 장치**다.

3. **RSS 필드는 사이트마다 다르다.**
   `published`, `author`, `category`가 당연히 있을 줄 알았는데 전부 없었다.

4. **HTML 태그 이름과 실제 용도는 다를 수 있다.**
   `<table>`이 표가 아니라 박스였다. 데이터를 뜯어보지 않으면 몰랐을 일이다.

5. **표본 10건과 20건은 결론이 다르다.**
   1차에서 "회의 유형은 필요 없다"고 판단했는데, 2차에서 순수 회의 문서가 나와 되돌렸다. **표본이 적으면 판단이 흔들린다. 그래서 지금 확정하지 않는다.**

---

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| **스키마 미확정** | 방향만 논의했고 필드를 정하지 않았다 |
| **서비스 코드 0줄** | 조사용 스크립트만 있고 프로젝트에 저장된 코드가 없다 |
| **표본 20건 (8일치)** | 유형 분포를 확정하기엔 부족하다 |
| **변경 감지 미검증** | 금융위가 올린 글을 나중에 수정하는지 확인 못 했다 |
| **첨부파일 못 읽음** | `.hwp` 파싱이 없어 본문 없는 문서는 버려야 한다 |
| **"1 보도자료 = 1 정책"이 아님** | 상생보험 1건에 7개 지자체 × 2종의 다른 상품이 들어있었다 |

---

## 12. 다음 단계

### 바로 다음

**RSS → Google Sheets 저장만 먼저 만든다. LLM은 쓰지 않는다.**

이유:

1. LLM 없이도 눈에 보이는 결과가 나온다
2. 며칠 돌리면 **하루 몇 건 올라오는지, 글이 수정되는지** 알 수 있다
3. 그 관찰 결과로 스키마를 정한다 ← **스키마 확정을 여기까지 미룬다**

만들 것 (예정):

- RSS 수집 + 본문 추출 (6번의 `is_data_table` 포함)
- Google Sheets 저장
- 실행 진입점

### 그 다음

1. 데이터 50~100건 쌓기
2. 쌓인 데이터로 **스키마 확정**
3. 분류 → 상세 구조화 → 개인화 → 알림 → 최소 UI

### 먼저 확인할 것

- Google Sheets API 인증 방식 (서비스 계정 키 발급)
- 수집 주기 (RSS가 10건만 유지하므로 하루 1회로 충분한지)

---

## 13. 부록 — 현재까지 논의된 스키마 구조 (초안)

> ⚠️ **확정 아님.** 20건 표본에서 나온 논의 결과를 잊어버리지 않으려고 적어둔다.
> 데이터 50~100건 쌓은 뒤 다시 검토해서 확정한다.

### 전체 구조: Google Sheets 3계층

```
articles_raw      RSS 원본          LLM 없음, 전 건 저장
      ↓
articles_triage   분류              짧은 LLM 1회, status=active만
      ↓
articles_detail   상세 구조화       긴 LLM 1회, 일부 문서만
      ↓
(개인화)          저장 안 함        사용자 요청 시 생성
```

**나눈 이유:** 20건 중 개인 관련 문서가 3건뿐이라, 전부 상세 추출하면 Gemini 무료 할당량이 낭비되고 근거 없는 문서에서 환각이 생긴다. `articles_raw`만 만들어도 동작하는 서비스가 된다.

### 1계층 — `articles_raw`

| 필드 | 타입 | 비고 |
|---|---|---|
| `article_id` | string | PK. URL 끝 숫자 (`87646`) |
| `title` | string | |
| `source_url` | string | |
| `published_at` | `YYYY-MM-DD` | RSS `updated`의 날짜부만 (시각은 항상 `00:00:00`) |
| `body_text` | string | 격자형 표만 제거한 본문 |
| `body_char_count` | int | 본문 없는 문서 판정용 |
| `content_hash` | string | 변경 감지용 |
| `collected_at` | ISO datetime | |
| `status` | `active` \| `skipped_no_body` | 300자 미만이면 skip, **ID는 남겨 재수집 방지** |

### 2계층 — `articles_triage`

| 필드 | 후보값 |
|---|---|
| `doc_type` | `program_launch` / `plan_announcement` / `rule_change` / `rule_notice` / `enforcement` / `approval_case` / `report_statistics` / `meeting_note` / `campaign_guide` / `admin_notice` |
| `audience_scope` | `individual` / `business` / `institution` / `general_public` |
| `audience_groups` | 청년 / 직장인 / 청소년 / 대학생 / 사회초년생 / 소상공인·개인사업자 / 고령층 /|
| `topics` | 대출 / 보험 / 저축·자산형성 / 투자·주식 / 사기예방 / 창업·사업자금 / 신용·연체 / 주거·전세 / 금융교육 |
| `one_line_summary` | 한 문장 |
| `personal_relevance` | `direct` / `indirect` / `none` |
| `source_completeness` | `full_in_body` / `partial_attachment_only` |

**`doc_type` 처리 그룹**

| 그룹 | 해당 유형 | 3계층 처리 |
|---|---|---|
| A | `program_launch`, `rule_notice`, `plan_announcement` | 전체 필드 추출 |
| B | `rule_change`, `report_statistics`, `campaign_guide`, `approval_case`, `meeting_note` | `summary_easy`만 |
| C | `enforcement`, `admin_notice` | 스킵 |

**`audience_groups` 어휘는 20건 원문에 실제로 등장한 표현만 넣었다.** 추측으로 만든 값이 없다.

### 3계층 — `articles_detail`

| 필드 | 타입 | 비고 |
|---|---|---|
| `summary_easy` | string | 쉬운 말 3~6문장 |
| `status_policy` | `in_effect` / `partially_launched` / `scheduled` / `proposed` / `completed` | |
| `target_description` | string | 원문 표현 기반 |
| `region_scope` | string[] \| null | 지자체 정책 필터링용 |
| `conditions` | string[] | 원문 명시 조건만 |
| `benefit` | string \| null | |
| `key_dates` | object[] | 아래 구조 |
| `how_to_apply` | string \| **null** | **원문에 있을 때만.** 없으면 반드시 null |
| `related_orgs` | string[] | |
| `evidence_quotes` | string[] | 환각 검증용 근거 문장 |

**`key_dates` 구조**

```json
{
  "label": "생명보험 상품 출시",
  "date": "2026-09-01",
  "precision": "day | month | half_year | year",
  "is_confirmed": true,
  "quote": "각 지자체별 보험상품은 9.1일 출시된다."
}
```

`precision`과 `is_confirmed`가 필요한 이유: 원문 날짜가 `"연말까지"`, `"'27년 하반기"`, `"10월 7일 잠정"` 수준이라 그냥 ISO 날짜로 저장하면 사용자에게 거짓 마감일을 알리게 된다.

### 사용자 프로필

```json
{
  "user_id": "string",
  "email": "string",

  "birth_year": 2002,
  "region": "경기",
  "occupation_type": "student | office_worker | business_owner | job_seeker | military | freelancer | retired | other",
  "interests": ["저축·자산형성", "사기예방"],

  "notify_email": true
}
```

**입력 필드는 4개뿐이다.** `income_range`, `housing_status`, `situations`는 빼기로 논의됐다.

`audience_groups`가 12개인데 프로필이 4개인 이유는, **프로필을 늘리지 않고 코드로 그룹을 유도**하기 때문이다.

```python
def derive_groups(profile) -> set[str]:
    g = set()
    age = TODAY.year - profile["birth_year"] + 1
    if 19 <= age <= 34:                g.add("청년")
    if age < 19:                       g.add("아동·청소년")
    if age >= 65:                      g.add("고령층")

    occ = profile["occupation_type"]
    if occ == "business_owner":        g.add("소상공인·개인사업자")
    if occ == "military":              g.add("군복무자")
    if occ == "student" and age >= 19: g.add("대학생")
    if occ == "office_worker" and age <= 29: g.add("사회초년생")
    return g
```

매칭도 LLM 없이 집합 연산으로 된다.

```python
score = len(derive_groups(profile) & set(article["audience_groups"]))
```

`CLAUDE.md` 6절의 "명확한 로직은 일반 코드로, LLM은 해석과 설명에 집중"에 맞춘 구조다.

`신혼부부`, `무주택·임차인`, `중·저신용자`, `취약계층`, `금융피해자`는 프로필에서 유도할 수 없다. 20건 중 `신혼부부`가 1건뿐이라 지금은 빼고, 빈도가 올라가면 그때 프로필 필드를 추가하기로 논의했다.

### 아직 논의 안 된 것

- Google Sheets에서 배열·객체 필드(`topics`, `key_dates`)를 셀에 어떻게 넣을지 (JSON 문자열?)
- `region_scope` 표기 통일 ("경남" vs "경상남도")
- 변경 감지 기준 (같은 글 수정 vs 후속 보도자료)
- 담당부서·첨부파일 수집 여부 (RSS에 없고 상세 페이지에만 있음)
