import json
from pathlib import Path

from aiogram.types import ReplyKeyboardMarkup, KeyboardButton


BASE_DIR = Path(__file__).resolve().parents[1]
MENU_PATH = BASE_DIR / "content" / "menu.json"


def load_main_menu_buttons() -> list[list[str]]:
    with MENU_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data["main_menu"]


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    button_rows = load_main_menu_buttons()

    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=button_text) for button_text in row]
            for row in button_rows
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите, что вам нужно",
    )
