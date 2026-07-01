import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
TEXTS_PATH = BASE_DIR / "texts.json"


def get_text(key: str) -> str:
    with TEXTS_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data[key].replace("\\n", "\n")
