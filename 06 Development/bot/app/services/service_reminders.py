"""Client expiry delivery adapter. Scheduling and consent belong to the backend."""
import asyncio
from datetime import date
import logging

import httpx
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.core.config import settings
from app.handlers.visas import cabinet_url
from app.services.backend_client import backend_sync_enabled


logger = logging.getLogger(__name__)
LABELS = {
    "ru": {"visa": "Виза", "housing": "Жильё", "bike": "Байк", "insurance": "Страховка", "other": "Услуга"},
    "en": {"visa": "Visa", "housing": "Housing", "bike": "Bike", "insurance": "Insurance", "other": "Service"},
}


async def api(path, payload=None):
    if not backend_sync_enabled():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                settings.BACKEND_API_URL.rstrip("/") + "/api/service/service-reminders" + path,
                json=payload, headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN})
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        # Do not include URLs, tokens, client identities or transport bodies in logs.
        logger.warning("Service reminder backend unavailable: %s", type(exc).__name__)
        return None


def render(item):
    locale = "en" if item.get("locale") == "en" else "ru"
    payload = item.get("payload") or {}
    kind = payload.get("kind")
    days = payload.get("days_remaining")
    if kind not in LABELS[locale] or type(days) is not int or not 1 <= days <= 3660:
        raise ValueError("Invalid reminder payload")
    end = date.fromisoformat(payload["end_date"]).strftime("%d.%m.%Y")
    title = " ".join(str(payload.get("title") or "").split())[:200]
    lines = [f"⏰ {LABELS[locale][kind]}" + (f": {title}" if title else "")]
    if locale == "ru":
        lines += [f"Дата окончания: {end}", f"Осталось дней: {days}", "Свяжитесь с менеджером, чтобы обсудить дальнейшие действия."]
    else:
        lines += [f"End date: {end}", f"Days remaining: {days}", "Contact your manager to discuss the next steps."]
    buttons = []
    account = cabinet_url("visas" if kind == "visa" else "life")
    if account:
        buttons.append([InlineKeyboardButton(text="Открыть услугу" if locale == "ru" else "Open service", web_app=WebAppInfo(url=account))])
    support = cabinet_url("support")
    if support:
        buttons.append([InlineKeyboardButton(text="Написать менеджеру" if locale == "ru" else "Contact manager", web_app=WebAppInfo(url=support))])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None


async def deliver(bot, item):
    result = {"lease_token": item["lease_token"], "state": "UNKNOWN", "error_code": "AMBIGUOUS_SEND"}
    try:
        text, keyboard = render(item)
    except (ValueError, TypeError, KeyError):
        result.update(state="FAILED", error_code="INVALID_PAYLOAD")
    else:
        try:
            message = await bot.send_message(item["telegram_id"], text, parse_mode=None,
                                             reply_markup=keyboard, request_timeout=20)
            result = {"lease_token": item["lease_token"], "state": "DELIVERED", "telegram_message_id": str(message.message_id)}
        except (TelegramBadRequest, TelegramForbiddenError) as exc:
            result.update(state="FAILED", error_code=type(exc).__name__)
        except Exception as exc:
            logger.warning("Service reminder send outcome unknown: %s", type(exc).__name__)
    # Retry only the idempotent settlement. Telegram sends are never retried.
    for _ in range(2):
        if await api(f"/deliveries/{item['id']}/settle", result) is not None:
            break


async def run_bridge(bot):
    while True:
        try:
            response = await api("/claim")
            for item in (response or {}).get("items", []):
                await deliver(bot, item)
        except Exception as exc:
            logger.warning("Service reminder bridge failed: %s", type(exc).__name__)
        await asyncio.sleep(15)
