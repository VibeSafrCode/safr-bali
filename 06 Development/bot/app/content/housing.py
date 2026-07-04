import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
HOUSING_PATH = BASE_DIR / "housing.json"


def get_housing_card(key: str) -> str:
    with HOUSING_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data[key]["text"].replace("\\n", "\n")
