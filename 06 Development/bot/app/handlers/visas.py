from __future__ import annotations

from datetime import date

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.core.config import settings
from app.services.backend_client import get_user_visa_cases
from app.services.i18n import matches

router = Router()

STATUS = {
    "ru": {"NOT_ISSUED": "оформление", "ISSUED_NOT_ACTIVATED": "готово", "ACTIVE": "активна", "EXPIRING": "скоро продление", "EXTENSION_PROCESSING": "продление оформляется", "EXTENDED": "продлена", "ACTION_REQUIRED": "требуется действие"},
    "en": {"NOT_ISSUED": "processing", "ISSUED_NOT_ACTIVATED": "ready", "ACTIVE": "active", "EXPIRING": "renewal approaching", "EXTENSION_PROCESSING": "extension in progress", "EXTENDED": "extended", "ACTION_REQUIRED": "action required"},
}


def cabinet_url() -> str:
    base = settings.MINI_APP_URL.strip().split("#", 1)[0].rstrip("/")
    return f"{base}/#/visas" if base else ""


def summary(payload: dict) -> tuple[str, str]:
    locale = payload.get("locale") if payload.get("locale") in {"ru", "en"} else "ru"
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    if not items:
        return locale, ("У вас пока нет опубликованных активных виз." if locale == "ru" else "You have no published active visas yet.")
    lines = ["🛂 Мои визы" if locale == "ru" else "🛂 My visas"]
    for item in items:
        visa = item.get("custom_visa_name") or item.get("visa_type", {}).get("name") or "Visa"
        status_key = "ACTION_REQUIRED" if item.get("service_status") == "ACTION_REQUIRED" else item.get("lifecycle_status")
        human = STATUS[locale].get(status_key, "статус уточняется" if locale == "ru" else "status pending")
        key_date = item.get("stay_end") or item.get("entry_deadline") or item.get("recommended_contact_at")
        date_line = ""
        if isinstance(key_date, str) and len(key_date) >= 10:
            parsed = date.fromisoformat(key_date[:10])
            date_line = (f" · до {parsed:%d.%m.%Y}" if locale == "ru" else f" · until {parsed:%d.%m.%Y}")
        lines.append(f"\n🇮🇩 {visa}\n{human}{date_line}")
    return locale, "\n".join(lines)


@router.message(Command("visas"))
@router.message(F.text.func(lambda value: matches(value, "button.visa.mine")))
async def my_visas(message: Message):
    if not message.from_user:
        return
    payload = await get_user_visa_cases(message.from_user.id)
    locale, body = summary(payload or {"locale": "ru", "items": []})
    url = cabinet_url()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть кабинет" if locale == "ru" else "Open cabinet", web_app=WebAppInfo(url=url))]]) if url else None
    await message.answer(body, reply_markup=keyboard)
