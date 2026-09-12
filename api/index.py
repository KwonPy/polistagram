"""Vercel의 Python 서버리스 함수 진입점.

Vercel은 api/ 폴더 안의 파일에서 `app`이라는 이름의 ASGI 앱을 찾아 실행한다.
실제 로직은 전부 app/main.py에 있고, 여기서는 그걸 그대로 가져오기만 한다.
"""

from app.main import app
