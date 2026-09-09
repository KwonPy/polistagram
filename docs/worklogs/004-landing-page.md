# 첫 화면 (index.html) — 프로필 입력 폼

> 작성일: 2026-09-06
> 관련 문서: [docs/schema.md](../schema.md), [003-mock-database.md](003-mock-database.md)

---

## 1. 한 줄 요약

빌드 도구 없는 단일 `index.html`로 첫 화면(사용자 프로필 입력 폼)을 만들고, Google Sheets 목업 데이터를 CSV로 미리 불러와두는 코드까지 준비했다.

## 2. 왜 만들었는가

프론트엔드 프레임워크가 아직 정해지지 않은 상태(`CLAUDE.md` 10절 미정 사항)에서, 가장 간단한 형태로라도 "사용자 프로필을 입력받는 화면"부터 눈으로 볼 수 있게 만들고 싶었다. 프레임워크·빌드 도구를 고르는 데 시간을 쓰기보다, 지금 확정된 스키마(사용자 프로필 5절)를 그대로 화면에 옮기는 걸 우선했다.

## 3. 구현한 것

- `index.html` 한 파일 (HTML + CSS + JS 전부 포함, 빌드 도구 없음)
- Pico.css CDN으로 스타일링 (별도 CSS 프레임워크 설치·빌드 없이 `<link>` 한 줄로 적용)
- `schema.md` 5절 그대로 따른 프로필 입력 폼: 거주지역 → 성별 → 생년월일 → 개인특성 → 관심분야, 한 화면에 순서대로 나열
- 제출 시 `localStorage`에 프로필 JSON 저장, 재방문 시 자동 복원
- PapaParse로 Google Sheets의 `articles_raw`/`articles_triage`를 CSV로 불러와 `window.__articles`에 합쳐두는 코드 (이번 화면에는 표시하지 않음)
- Google 스프레드시트 공유 설정을 "링크가 있는 모든 사용자 보기"로 변경 (사용자가 직접 진행)

## 4. 동작 흐름

```
브라우저가 index.html을 연다
  ↓
PapaParse가 구글시트 CSV(articles_raw, articles_triage)를 동시에 가져온다
  ↓
article_id 기준으로 두 데이터를 합쳐 window.__articles에 저장 (콘솔에서만 확인 가능)

사용자가 폼을 입력하고 제출한다
  ↓
localStorage에 프로필 JSON을 저장한다
```

## 5. 주요 파일

- `index.html`: 첫 화면 전체 (폼 UI, 스타일, CSV 로딩, 저장 로직)

## 6. 핵심 코드 / 개념

**콜백을 Promise로 감싸기**

```javascript
function fetchCsv(gid) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl(gid), {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}
```

`Papa.parse`는 "다 끝나면 이 함수를 불러줘(`complete`)" 방식(콜백 기반)으로 동작한다. 이걸 `new Promise(...)`로 한 번 감싸면, `await fetchCsv(...)`처럼 마치 결과를 바로 받는 것처럼 쓸 수 있다. 콜백 API를 Promise로 감싸는 패턴은 자주 나온다.

**CSV export 주소의 `gid`**

```javascript
`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
```

구글시트 한 파일 안에 탭이 여러 개 있으면, 탭마다 고유한 `gid` 번호가 있다. 이 번호를 주소에 붙이면 원하는 탭 하나만 CSV로 받을 수 있다.

**localStorage 저장/복원**

```javascript
localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
```

브라우저에 남는 간단한 저장소다. 새로고침해도 남아있지만, 이 브라우저·이 기기에서만 보인다. 지금은 백엔드가 없어서 이 방식을 임시로 썼다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| Pico.css (CDN) | 클래스를 거의 안 붙여도 기본 태그를 깔끔하게 스타일링 |
| PapaParse (CDN) | CSV 텍스트/URL을 자바스크립트 배열로 변환 |
| `localStorage` | 브라우저에 값을 저장하는 웹 표준 API |
| CSS Grid | 관심분야 체크박스를 2열 → 모바일에서 1열로 반응형 배치 |

## 8. 문제와 해결

- **문제:** 브라우저에서 PapaParse로 구글시트 CSV 주소에 접속하면 401(권한 없음)이 떴다
- **원인:** 스프레드시트가 기본적으로 비공개였다. 서비스 계정에 준 편집 권한과, "누구나 이 링크로 보기"는 완전히 다른 설정이다
- **해결:** 시트를 "링크가 있는 모든 사용자 보기" 권한으로 공유 설정을 바꿨다 (Drive 권한이라 서비스 계정 코드로는 바꿀 수 없어 사용자가 직접 진행)
- **배운 점:** API 접근 권한(서비스 계정)과 브라우저에서 직접 접근 가능한 공개 범위는 서로 다른 권한 체계다.

## 9. 의사결정

- **왜 프레임워크 없이 순수 HTML/JS로 만들었나** — 아직 프론트엔드 프레임워크가 미정이고, 4주라는 기간 제약상 빌드 도구 세팅보다 눈에 보이는 화면을 빨리 만드는 걸 우선했다.
- **왜 이번 화면에 정책 목록을 안 보여줬나** — 이번 화면의 범위를 "프로필 입력만"으로 명확히 하고, CSV 연동 코드는 다음 화면(맞춤 정책 목록)에서 바로 쓸 수 있게 미리 준비만 해두기로 했다.
- **왜 폼을 위저드(단계별) 방식이 아니라 한 화면 스크롤형으로 만들었나** — 구현이 간단하고 모바일에서도 자연스럽다고 판단했다.

## 10. 배운 것

1. 정적 파일 하나로도 CDN 라이브러리 + 외부 데이터(구글시트) 연동까지 충분히 만들 수 있다. 빌드 도구가 없어도 프로토타입은 빠르게 만들 수 있다.
2. "API로 접근 가능한가"와 "누구나 공개적으로 볼 수 있는가"는 다른 질문이다. 구글 API를 쓸 때는 이 둘을 구분해서 생각해야 한다.

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 프로필이 `localStorage`에만 저장됨 | 브라우저나 기기를 바꾸면 입력한 프로필이 사라진다 (백엔드 없음) |
| 정책 데이터가 화면에 안 보임 | CSV로 불러온 `window.__articles`는 콘솔에서만 확인 가능하다 |
| 매칭 로직 미연결 | `schema.md` 6절의 점수 계산 로직이 아직 코드로 연결되지 않았다 |

## 12. 다음 단계

저장된 프로필과 `window.__articles`를 이용해 실제 매칭 점수를 계산하고, 그 결과(맞춤 정책 목록)를 보여주는 다음 화면을 만든다.
