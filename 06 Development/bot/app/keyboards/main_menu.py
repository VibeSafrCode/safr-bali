from __future__ import annotations

import json
from pathlib import Path

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

from app.core.config import settings


BASE_DIR = Path(__file__).resolve().parents[1]
MENU_PATH = BASE_DIR / "content" / "menu.json"
MINI_APP_BUTTON_TEXT = "🚀 Меню App"


def load_main_menu_buttons() -> list[list[str]]:
    with MENU_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return data["main_menu"]


def mini_app_button() -> KeyboardButton | None:
    if not settings.MINI_APP_URL.strip():
        return None
    return KeyboardButton(text=MINI_APP_BUTTON_TEXT)


def mini_app_launch_keyboard(
    url: str | None = None,
) -> InlineKeyboardMarkup | None:
    target_url = (url or settings.MINI_APP_URL).strip()
    if not target_url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Открыть SAFR App",
                    web_app=WebAppInfo(url=target_url),
                )
            ]
        ]
    )


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    keyboard = [
        [KeyboardButton(text=button_text) for button_text in row]
        for row in load_main_menu_buttons()
    ]
    app_button = mini_app_button()
    if app_button is not None:
        for row in keyboard:
            if len(row) == 1 and row[0].text == "🌍 Сменить направление":
                row.append(app_button)
                break

    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите, что вам нужно",
    )
