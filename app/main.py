"""Polistagram API 서버.

프론트엔드(index.html)가 사용자 프로필을 보내면, 매칭된 정책을
카드뉴스에 필요한 필드만 담아 JSON으로 돌려준다.

로컬 실행:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.matching import match_articles

app = FastAPI(title="Polistagram API")

# index.html을 파일로 직접 열거나(origin이 null) 다른 포트의 로컬 서버로 열 수도 있어서,
# 개발 단계에서는 모든 출처(origin)를 허용한다. 배포 시점에 다시 좁힐 항목.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Profile(BaseModel):
    """프론트엔드가 보내는 프로필 형태. schema.md 5절과 동일하다."""
    region: str
    gender: str
    birth_date: str
    occupation_type: str | None = None
    interests: list[str]


@app.post("/api/match")
def match(profile: Profile):
    """프로필을 받아 매칭된 정책 목록을 점수 높은 순으로 반환한다."""
    return match_articles(profile.model_dump())


# 아래 두 라우트는 로컬에서 `uvicorn app.main:app`만으로 프론트+API를 한 주소에서
# 테스트하기 위한 것이다. Vercel 배포본에서는 vercel.json이 /api/* 이외의 요청을
# 이 함수까지 오기 전에 정적 파일로 직접 응답하므로, 이 라우트는 실행되지 않는다.
@app.get("/")
@app.get("/index.html")
def index_page():
    return FileResponse("index.html")


@app.get("/match.html")
def match_page():
    return FileResponse("match.html")
