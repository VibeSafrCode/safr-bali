from __future__ import annotations

from datetime import date

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.core.config import settings
from app.services.backend_client import get_user_visa_cases
from app.services.i18n import matches

router = Router()

STATUS = {
    "ru": {"NOT_ISSUED": "оформление", "ISSUED_NOT_ACTIVATED": "готово", "ACTIVE": "активна", "EXPIRING": "скоро продление", "EXTENSION_PROCESSING": "продление оформляется", "EXTENDED": "продлена", "ACTION_REQUIRED": "требуется действие"},
    "en": {"NOT_ISSUED": "processing", "ISSUED_NOT_ACTIVATED": "ready", "ACTIVE": "active", "EXPIRING": "renewal approaching", "EXTENSION_PROCESSING": "extension in progress", "EXTENDED": "extended", "ACTION_REQUIRED": "action required"},
}

STATUS_HELP = {
    "ru": {
        "NOT_ISSUED": "В SAFRWAY выдача визы ещё не подтверждена менеджером.",
        "ISSUED_NOT_ACTIVATED": "Менеджер подтвердил выдачу документа о визе; въезд или активация в SAFRWAY ещё не отмечены.",
        "ACTIVE": "В SAFRWAY виза отмечена как активная на основании подтверждённых менеджером данных.",
        "EXPIRING": "В SAFRWAY отмечено приближение подтверждённой контрольной даты; детали уточняйте у менеджера.",
        "EXTENSION_PROCESSING": "В SAFRWAY зафиксирован процесс продления; это не подтверждение результата.",
        "EXTENDED": "Менеджер отметил в SAFRWAY подтверждённое обновление визового периода.",
        "EXPIRED": "В SAFRWAY виза отмечена как завершившая срок по подтверждённым данным.",
        "CANCELLED": "В SAFRWAY визовый кейс отмечен как отменённый.",
        "REFUSED": "В SAFRWAY зафиксирован подтверждённый отказ по визовому кейсу.",
        "ISSUED": "В SAFRWAY зафиксирована подтверждённая выдача визы.",
    },
    "en": {
        "NOT_ISSUED": "Visa issuance has not yet been confirmed by a SAFRWAY manager.",
        "ISSUED_NOT_ACTIVATED": "A manager confirmed issuance of the visa document; entry or activation is not yet recorded in SAFRWAY.",
        "ACTIVE": "SAFRWAY records the visa as active based on manager-confirmed information.",
        "EXPIRING": "SAFRWAY flags an approaching confirmed review date; ask a manager for details.",
        "EXTENSION_PROCESSING": "SAFRWAY records an extension process; this does not confirm its outcome.",
        "EXTENDED": "A manager recorded a confirmed visa-period update in SAFRWAY.",
        "EXPIRED": "SAFRWAY records the visa period as ended based on confirmed information.",
        "CANCELLED": "SAFRWAY records the visa case as cancelled.",
        "REFUSED": "SAFRWAY records a confirmed refusal for the visa case.",
        "ISSUED": "SAFRWAY records confirmed visa issuance.",
    },
}


def status_help(code: str, locale: str) -> str:
    fallback = ("SAFRWAY показывает официальный код без дополнительной интерпретации. Уточните состояние у менеджера." if locale == "ru" else "SAFRWAY shows the official code without additional interpretation. Ask a manager for clarification.")
    explanation = STATUS_HELP[locale].get(code, fallback)
    disclaimer = "Это справка о состоянии в системе, а не юридическая консультация." if locale == "ru" else "This explains the system state and is not legal advice."
    return f"ℹ️ {code}\n{explanation}\n\n{disclaimer}"


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
        key_date = item.get("stay_end") or item.get("entry_deadline") or item.get("recommended_contact_at")
        date_line = ""
        if isinstance(key_date, str) and len(key_date) >= 10:
            parsed = date.fromisoformat(key_date[:10])
            date_line = (f" · до {parsed:%d.%m.%Y}" if locale == "ru" else f" · until {parsed:%d.%m.%Y}")
        lines.append(f"\n🇮🇩 {visa}\n{status_key or 'UNKNOWN'}{date_line}")
    return locale, "\n".join(lines)


@router.message(Command("visas"))
@router.message(F.text.func(lambda value: matches(value, "button.visa.mine")))
async def my_visas(message: Message):
    if not message.from_user:
        return
    payload = await get_user_visa_cases(message.from_user.id)
    locale, body = summary(payload or {"locale": "ru", "items": []})
    url = cabinet_url()
    statuses = []
    for item in (payload or {}).get("items", []):
        code = "ACTION_REQUIRED" if item.get("service_status") == "ACTION_REQUIRED" else str(item.get("lifecycle_status") or "UNKNOWN")
        if code not in statuses:
            statuses.append(code)
    rows = [
        [InlineKeyboardButton(
            text=(f"ℹ️ Что означает {code}?" if locale == "ru" else f"ℹ️ What does {code} mean?"),
            callback_data=f"visahelp:{code}",
        )]
        for code in statuses
    ]
    if url:
        rows.append([InlineKeyboardButton(text="Открыть кабинет" if locale == "ru" else "Open cabinet", web_app=WebAppInfo(url=url))])
    keyboard = InlineKeyboardMarkup(inline_keyboard=rows) if rows else None
    await message.answer(body, reply_markup=keyboard)


@router.callback_query(F.data.startswith("visahelp:"))
async def visa_status_help(callback: CallbackQuery):
    if not callback.from_user:
        return
    code = (callback.data or "").split(":", 1)[1] or "UNKNOWN"
    payload = await get_user_visa_cases(callback.from_user.id)
    locale = (payload or {}).get("locale") if (payload or {}).get("locale") in {"ru", "en"} else "ru"
    await callback.message.answer(status_help(code, locale))
    await callback.answer()
