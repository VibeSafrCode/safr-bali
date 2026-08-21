from __future__ import annotations

import asyncio
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from app.handlers.visas import cabinet_url
from app.services.backend_client import claim_visa_notifications, settle_visa_notification

logger = logging.getLogger(__name__)


def notification_text(item: dict) -> str:
    locale = item.get("locale") if item.get("locale") in {"ru", "en"} else "ru"
    kind = item.get("notification_type")
    if locale == "en":
        return "🛂 A visa has appeared in your SAFRWAY cabinet." if kind == "CASE_PUBLISHED" else "🛂 Your visa information has been updated."
    return "🛂 В кабинете SAFRWAY появилась виза." if kind == "CASE_PUBLISHED" else "🛂 Информация по вашей визе обновлена."


async def run_visa_notification_bridge(bot: Bot) -> None:
    while True:
        for item in await claim_visa_notifications():
            settlement = {"lease_token": item["lease_token"], "state": "UNKNOWN", "error_code": "AMBIGUOUS_SEND"}
            try:
                message = await bot.send_message(item["telegram_id"], f"{notification_text(item)}\n\n{cabinet_url()}")
                settlement = {"lease_token": item["lease_token"], "state": "DELIVERED", "telegram_message_id": str(message.message_id)}
            except (TelegramBadRequest, TelegramForbiddenError) as exc:
                settlement = {"lease_token": item["lease_token"], "state": "FAILED", "error_code": type(exc).__name__[:80]}
            except Exception:
                logger.exception("Ambiguous visa notification delivery %s", item.get("id"))
            await settle_visa_notification(item["id"], settlement)
        await asyncio.sleep(15)
