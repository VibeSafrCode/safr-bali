from __future__ import annotations

import json
from pathlib import Path

from app.services.i18n import all_button_texts


STATIC_BUTTON_TEXTS = {
    # Common navigation
    "📋 Обратно в меню",
    "📋 Выйти в меню",
    "📋 Показать меню",

    # Main menu / legacy aliases
    "✍️ Написать человеку",
    "✍️ Написать менеджеру",
    "🛂 Сделать визу",
    "🛂 Визы",
    "🏡 Найти жильё",
    "🏡 Найти виллу / жильё",
    "🏡 Жильё",
    "💬 Заказать консультацию",
    "💬 Консультация",
    "💱 Обмен валюты",
    "🧮 Открыть калькулятор",
    "🧮 Калькулятор USDT → IDR наличные",
    "🔄 Другой обмен",
    "👤 Мой личный кабинет",
    "🚀 Открыть SAFR App",
    "🚀 Меню App",
    "🎁 Мои SAFR Points",
    "🎁 Мой баланс SAFR Points",
    "🔗 Моя ссылка",
    "🔗 Моя рефка",

    # Destinations
    "🌴 Бали",
    "🇹🇭 Таиланд",
    "🇷🇺 Россия",
    "🇳🇵 Непал",
    "🌍 Сменить направление",
    "🌉 Санкт-Петербург",
    "🏔 Челябинск",
    "⛰ Урал",
    "🏔 Кавказ",
    "↩️ Назад к городам России",
    "↩️ Назад к России",

    # Thailand
    "💱 Обмен — Таиланд",
    "🛂 Визы — Таиланд",
    "🏠 Недвижимость — Таиланд",
    "⛵ Яхты — Таиланд",

    # Russia
    "🏄 SUP-туры — Петербург",
    "🚤 Прогулка на катере — Петербург",
    "🔥 Посиделки у костра — Петербург",
    "🏄 SUP-тур — Челябинск",
    "🛶 Сплав — Челябинск",
    "🔥 Посиделки у костра — Челябинск",
    "🧘 Организовать ретрит — Челябинск",
    "🏄 SUP-тур — Урал",
    "🛶 Сплав — Урал",
    "🔥 Посиделки у костра — Урал",
    "🧘 Организовать ретрит — Урал",

    # Nepal
    "🏔 Трекинг на Кайлас",
    "🏔 Трекинг к Эвересту",
    "⛰ Хребет Аннапурна",
    "🚐 Трансфер — Непал",
    "🏡 Жильё — Непал",
    "🧭 Гид — Непал",

    # Personal account
    "🌐 Моя сеть",
    "📦 Мои купленные услуги",
    "🛠 Тех. поддержка",

    # Visa
    "ITAS E33G — 1 год",
    "E33G",
    "D12 — 1/2 года",
    "D12",
    "D1/D2 — 1/2/5 лет",
    "D1/D2",
    "C1 — по ситуации",
    "C1",
    "VOA — короткий срок",
    "eVOA — короткий срок",
    "VOA",
    "Другая виза",
    "Задать вопрос по визе",
    "❓ А если нет всех документов?",

    # Housing
    "Найти виллу",
    "Найти гест",
    "Купить недвижимость",
    "Проверить объект",
    "🎥 Видео про жильё",
    "⚠️ Риски аренды",
    "Задать вопрос по жилью",
    "🏡 Поиск жилья на Бали",

    # Client dialog controls
    "↩️ Ответить",
    "✅ Закончить диалог",
    "↩️ Вернуться в диалог",
    "🆕 Новый диалог",
    "🚨 Жалоба ГлавБоссу",

    # Admin panel
    "📊 Заявки",
    "🛂 Визовые вопросы",
    "🏡 Вопросы по жилью",
    "🌐 Реферальная сеть",
    "👥 Новые пользователи",
    "👀 Наблюдение за ботом",
    "📣 Рупор",
    "🗑 Удалить сообщение",
    "📜 Последние действия",
    "⚙️ Настройки",
}


MENU_WORD_FRAGMENTS = (
    "найти жиль",
    "сделать виз",
    "выйти в меню",
    "показать меню",
    "обратно в меню",
    "написать человеку",
    "написать менеджеру",
    "заказать консультац",
    "обмен валют",
    "калькулятор usdt",
    "другой обмен",
    "мой личный кабинет",
    "закончить диалог",
    "сменить направление",
)


def _load_main_menu_buttons() -> set[str]:
    menu_path = Path(__file__).resolve().parents[1] / "content" / "menu.json"

    if not menu_path.exists():
        return set()

    try:
        menu = json.loads(menu_path.read_text())
    except Exception:
        return set()

    buttons: set[str] = set()

    for row in menu.get("main_menu", []):
        if not isinstance(row, list):
            continue

        for button in row:
            if isinstance(button, str):
                buttons.add(button.strip())

    return buttons


_KNOWN_BUTTON_TEXTS_CACHE: set[str] | None = None


def known_button_texts() -> set[str]:
    """Return all known button texts.

    The result is cached in memory because this function is called on many
    incoming messages. Reading menu.json on every update can add avoidable
    latency on a small VPS.
    """
    global _KNOWN_BUTTON_TEXTS_CACHE

    if _KNOWN_BUTTON_TEXTS_CACHE is None:
        _KNOWN_BUTTON_TEXTS_CACHE = (
            {button.strip() for button in STATIC_BUTTON_TEXTS}
            | _load_main_menu_buttons()
            | all_button_texts()
        )

    return _KNOWN_BUTTON_TEXTS_CACHE


def reset_known_button_texts_cache() -> None:
    """Reset cache manually if menu.json is changed at runtime."""
    global _KNOWN_BUTTON_TEXTS_CACHE
    _KNOWN_BUTTON_TEXTS_CACHE = None


def is_known_button_text(text: str | None) -> bool:
    if not text:
        return False

    normalized = text.strip()

    if normalized in known_button_texts():
        return True

    if normalized.startswith(
        ("ITAS E33G —", "D12 —", "D1/D2 —", "C1 —", "eVOA —")
    ):
        return True

    lowered = normalized.lower()
    return any(fragment in lowered for fragment in MENU_WORD_FRAGMENTS)
