"""정책 주제(topics)별 3D 일러스트 아이콘을 Gemini 이미지 생성 모델로 만든다.

match.html의 My Feed 카드 디자인 레퍼런스(ref.png, 2026-09-26)에 맞춘 "soft 3D object"
스타일 아이콘이다. 이미지 생성이라 텍스트 분류(triage_collector 등)와는 다른 모델을
쓴다 — Gemini "Nano Banana"(gemini-2.5-flash-image)는 이미지를 실제로 그려주는
모델이고, 지금까지 쓰던 gemini-3.5-flash-lite는 텍스트(JSON)만 만든다.

새 외부 서비스를 연결하는 게 아니라, 이미 쓰고 있는 GEMINI_API_KEY로 같은 Gemini API의
다른 모델을 호출하는 것뿐이다.

로컬 실행:
    python scripts/generate_topic_icons.py --topic 저축·자산형성   # 1개만 (검증용)
    python scripts/generate_topic_icons.py                        # 8개 전부
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

MODEL = "gemini-2.5-flash-image"  # Nano Banana — 빠르고 저비용인 이미지 생성 모델
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "icons"

# schema.md 3절의 8개 topics와, 레퍼런스(ref.png) 카드에 쓰인 오브젝트 구성을 맞춘 프롬프트.
# 사람 캐릭터는 쓰지 않는다 (CLAUDE.md 논의 결과 — 카테고리마다 캐릭터를 새로 만들지 않음).
TOPIC_PROMPTS = {
    "대출": "a stack of gold coins with a small percentage/interest rate symbol floating above it",
    "주거·전세": "a small house with a green roof, a key leaning against it, and small plant leaves beside it",
    "저축·자산형성": "a pink piggy bank with a coin dropping into its slot, next to a small stack of gold coins and a rising bar chart",
    "투자·주식": "an orange rising arrow chart, a small pie chart, and a magnifying glass examining a bar chart",
    "보험": "a purple shield with a white checkmark, a small padlock, and a credit card behind it",
    "창업·사업자금": "a brown leather briefcase with a small rising growth chart and a stack of gold coins beside it",
    "취업·채용": "a document with a checkmark/resume lines and a handshake icon beside it",
    "기타": "a simple document/folder icon with a small question mark badge",
}

PROMPT_TEMPLATE = """A cute soft 3D clay-render icon illustration of {objects}.
Style: soft 3D rendered objects (like Fluent 3D emoji / clay mockup style), smooth
rounded shapes, soft gradient lighting, subtle drop shadows, pastel color palette,
centered composition, plain white background, no text, no letters, no people,
no human characters, high quality product render, square composition.
"""


def get_client() -> genai.Client:
    return genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=60_000),
    )


def generate_icon(client: genai.Client, topic: str) -> bytes | None:
    prompt = PROMPT_TEMPLATE.format(objects=TOPIC_PROMPTS[topic])
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            image_config=types.ImageConfig(aspect_ratio="1:1"),
        ),
    )
    for part in response.candidates[0].content.parts:
        if getattr(part, "inline_data", None) and part.inline_data.mime_type.startswith("image/"):
            return part.inline_data.data
    return None


# 파일명은 한글 대신 영문 slug로 — OS/URL 호환성 때문에.
TOPIC_SLUG = {
    "대출": "loan",
    "주거·전세": "housing",
    "저축·자산형성": "savings",
    "투자·주식": "invest",
    "보험": "insurance",
    "창업·사업자금": "business",
    "취업·채용": "job",
    "기타": "etc",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", help="이 주제 하나만 생성 (예: 저축·자산형성). 안 주면 8개 전부.")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = get_client()
    topics = [args.topic] if args.topic else list(TOPIC_PROMPTS.keys())

    for topic in topics:
        print(f"생성 중: {topic} ...", flush=True)
        image_bytes = generate_icon(client, topic)
        if image_bytes is None:
            print(f"  실패: {topic} — 이미지가 생성되지 않았습니다.")
            continue
        out_path = OUTPUT_DIR / f"{TOPIC_SLUG[topic]}.png"
        out_path.write_bytes(image_bytes)
        print(f"  저장: {out_path}")


if __name__ == "__main__":
    main()
