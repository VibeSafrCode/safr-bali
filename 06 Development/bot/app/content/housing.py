import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
HOUSING_PATH = BASE_DIR / "housing.json"


def get_housing_card(key: str) -> str:
    with HOUSING_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data[key]["text"].replace("\\n", "\n")


def get_housing_pages(key: str) -> list[str]:
    text = get_housing_card(key)
    if key != "search_housing":
        return [text]

    page_markers = (
        "3️⃣ ПРОВЕРКА ВИЛЛЫ НА МЕСТЕ",
        "💰 СТОИМОСТЬ",
        "🛎 ДОПОЛНИТЕЛЬНЫЙ КОНСЬЕРЖ-СЕРВИС",
    )
    marker_positions = [text.index(marker) for marker in page_markers]
    page_starts = [0, *marker_positions]
    page_ends = [*marker_positions, len(text)]
    raw_pages = [
        text[start:end].strip()
        for start, end in zip(page_starts, page_ends)
    ]
    page_count = len(raw_pages)
    return [
        f"{page}\n\n📄 Страница {index} из {page_count}"
        for index, page in enumerate(raw_pages, start=1)
    ]
