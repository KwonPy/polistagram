# Vercel 배포

> 작성일: 2026-09-06
> 관련 문서: [004-landing-page.md](004-landing-page.md)

---

## 1. 한 줄 요약

빌드 도구 없는 `index.html`을 Vercel에 정적 사이트로 배포해서, `https://polistagram.vercel.app` 주소로 누구나 접속할 수 있게 만들었다.

## 2. 왜 만들었는가

지금까지는 `index.html`을 로컬 컴퓨터에서만 열어볼 수 있었다. 다른 사람(또는 다른 기기)이 접속해보려면 인터넷에 올라간 주소가 필요하다. `CLAUDE.md` 7절에서 배포 대상으로 이미 Vercel을 정해뒀기 때문에, 이번에는 그 방침대로 실제 배포까지 진행했다.

## 3. 구현한 것

- Vercel CLI(`npx vercel`)로 로그인하고, 프로젝트를 하나 생성해 배포
- `.vercelignore` 추가: `credentials/`(구글 서비스 계정 비밀키), `.env`, 아직 안 쓰는 `app/`·`scripts/`·`requirements.txt`·`docs/`를 배포 대상에서 제외
- `vercel.json`에 `{"framework": null}` 추가: Vercel이 이 프로젝트를 정적 사이트로 다루도록 명시
- 프로젝트의 SSO 배포 보호(Deployment Protection)를 해제: Polistagram은 로그인 없이 누구나 쓰는 서비스(`CLAUDE.md` 1절)라, 배포 주소도 로그인 없이 열려야 하기 때문

## 4. 동작 흐름

```
로컬 폴더 (index.html + .vercelignore + vercel.json)
  ↓ npx vercel --prod
Vercel이 .vercelignore에 없는 파일만 업로드
  ↓
vercel.json의 framework: null을 보고 "정적 사이트"로 빌드 (별도 빌드 과정 없이 파일 그대로 서빙)
  ↓
https://polistagram.vercel.app 로 접속 가능
```

## 5. 주요 파일

- `.vercelignore`: 배포에서 제외할 파일/폴더 목록 (비밀키, 미완성 백엔드 코드)
- `vercel.json`: Vercel 배포 설정 (`framework: null`로 정적 사이트 지정)

## 6. 핵심 코드 / 개념

**`.vercelignore`**

```
credentials/
.env
.env.example
app/
scripts/
requirements.txt
docs/
.claude/
```

`.gitignore`가 git에 안 올릴 파일을 정하는 것처럼, `.vercelignore`는 배포에 안 올릴 파일을 정한다. 두 파일은 별개라서, git과 무관하게 Vercel 배포 시점에도 따로 챙겨야 한다. 특히 `credentials/` 안의 구글 서비스 계정 키 파일은 여기 빠뜨리면 인터넷에 그대로 공개될 뻔했다.

**`vercel.json`**

```json
{
  "framework": null
}
```

Vercel은 폴더 안 파일들을 보고 어떤 프레임워크로 만들어진 프로젝트인지 자동으로 추측한다(zero-config). `framework: null`은 "추측하지 말고 프레임워크 없는 정적 파일로 취급해줘"라는 명시적인 지시다.

## 7. 사용한 기술

| 기술 | 하는 일 |
|---|---|
| Vercel CLI (`npx vercel`) | 터미널에서 로그인·배포·설정 변경까지 처리하는 도구 |
| `.vercelignore` | 배포 시 제외할 파일 목록 지정 |
| `vercel.json` | 배포 방식(프레임워크, 빌드 설정 등) 지정 |
| Deployment Protection (SSO) | Vercel이 기본 제공하는 배포 접근 제어 기능 |

## 8. 문제와 해결

- **문제 1:** 첫 배포가 `No python entrypoint found` 오류로 실패했다
  - **원인:** 프로젝트 루트에 `requirements.txt`가 있어서, Vercel이 이 프로젝트를 "Python 서버 프로젝트"로 자동 인식했다. 그런데 실제로는 실행 가능한 Python 서버 코드(FastAPI 앱 등)가 없어 진입점을 못 찾은 것이다.
  - **해결:** `vercel.json`에 `framework: null`을 추가해 정적 사이트로 명시했다.
  - **배운 점:** 배포 플랫폼의 자동 감지(zero-config)는 편리하지만, 프로젝트 구조가 애매하면(백엔드 코드는 있는데 아직 안 쓰는 경우 등) 오작동할 수 있다. 이럴 땐 설정 파일로 명시하는 게 안전하다.

- **문제 2:** 배포는 성공했는데 주소로 접속하면 Vercel 로그인 화면으로 넘어갔다
  - **원인:** 프로젝트에 SSO 배포 보호(Deployment Protection)가 기본으로 켜져 있어서, Vercel 팀 계정에 로그인한 사람만 접속할 수 있는 상태였다.
  - **해결:** 프로젝트 설정에서 SSO 보호를 껐다 (`vercel project protection disable --sso`).
  - **배운 점:** "배포됨"과 "누구나 접속 가능함"은 다른 상태일 수 있다. 배포 후에는 실제로 로그인하지 않은 상태(시크릿 창 등)에서 한 번 접속해보고 확인하는 습관이 필요하다.

## 9. 의사결정

- **왜 `.vercelignore`로 `app/`·`scripts/`·`requirements.txt`까지 제외했나** — `CLAUDE.md` 9절 기준으로 아직 미착수인 백엔드 코드다. 지금 배포는 "완성된 프론트엔드 화면"만 대상으로 하고, 백엔드가 실제로 붙으면 그때 배포 설정을 다시 논의하기로 했다.
- **왜 SSO 배포 보호를 껐나** — Polistagram은 회원가입/로그인 없는 서비스가 목표(`CLAUDE.md` 1절)라, 배포 주소 자체도 로그인 장벽 없이 열려 있어야 실제 서비스 목표와 맞는다.

## 10. 배운 것

1. 배포 플랫폼의 자동 감지 기능은 프로젝트 안에 있는 파일(예: `requirements.txt`)만 보고 판단하기 때문에, 실제 의도와 다르게 추측할 수 있다. 애매하면 설정 파일로 명시하는 게 낫다.
2. `.gitignore`와 `.vercelignore`는 목적이 비슷해 보여도 서로 다른 파일이라, 비밀 정보는 두 곳 다 챙겨야 한다.
3. 배포 성공 여부와 "공개 접속 가능 여부"는 별개로 확인해야 하는 항목이다.

## 11. 현재 한계

| 한계 | 내용 |
|---|---|
| 백엔드 미배포 | FastAPI 백엔드는 아직 개발되지 않아 배포 대상에서 제외했다. 지금 배포된 건 정적 프론트엔드뿐이다 |
| Git 연동 없음 | Vercel CLI로 폴더를 직접 업로드하는 방식이라, 이 프로젝트는 아직 Git 저장소가 없다. 코드를 고칠 때마다 다시 수동으로 `vercel --prod`를 실행해야 한다 |

## 12. 다음 단계

Git 저장소를 만들고 GitHub과 연동하면, 코드를 푸시할 때마다 Vercel이 자동으로 재배포하도록 만들 수 있다. 이후 FastAPI 백엔드가 생기면 그 부분의 배포 방식(`.vercelignore` 조정 등)을 다시 논의한다.
