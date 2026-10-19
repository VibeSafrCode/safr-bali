"""Main-bot adapter to the shared branded messaging lease protocol."""
from datetime import datetime, timezone
import importlib
import logging
from pathlib import Path
import sys

import httpx
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from app.core.config import settings
from app.services.json_storage import save_json
from app.services.onboarding import read_store, store_path

LOG = logging.getLogger(__name__)
_runtime = None


async def api(method, path, payload=None):
    try:
        async with httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False) as client:
            response = await client.request(method, settings.BACKEND_API_URL.rstrip("/") + "/api/bot-messaging" + path,
                json=payload, headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN})
            response.raise_for_status()
            result = response.json()
            if path == "/claim" and isinstance(result, list):
                from app.services.conversation_store import ensure_client_record
                for item in result:
                    if item.get("step") == "help" and (item.get("telegram_id") not in settings.operations_chat_ids
                            or ensure_client_record(item["client_telegram_id"]).get("restricted_to_owner") and item["telegram_id"] != settings.ADMIN_CHAT_ID):
                        await api("POST", f"/deliveries/{item['id']}/settle", {"delivery_kind": "welcome",
                            "lease_token": item["lease_token"], "state": "FAILED", "error_code": "RECIPIENT_REVOKED"})
                        return []
            return result
    except Exception:
        LOG.warning("main_messaging_backend_unavailable")
        return None


def runtime(bot):
    global _runtime
    if _runtime is None:
        root = Path(settings.BOT_MESSAGING_MODULE_ROOT) if settings.BOT_MESSAGING_MODULE_ROOT else Path(__file__).resolve().parents[3] / "shared/python"
        if not root.is_absolute() or not (root / "safr_messaging/transport.py").is_file():
            raise RuntimeError("messaging_shared_module_missing")
        sys.path.insert(0, str(root))
        module = importlib.import_module("safr_messaging.transport")
        _runtime = module.MessagingTransport(bot_key="safrway", api=api, send=bot.send_message,
            journal=module.ReceiptJournal(store_path("branded_receipts")), keyboard=keyboard)
    return _runtime


def keyboard(item):
    if item.get("step") == "followup":
        ru = item["locale"] == "ru"
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Да, всё понятно" if ru else "Yes, everything is clear", callback_data=f"onboard:yes:{item['enrollment_id']}"),
            InlineKeyboardButton(text="Задать вопрос менеджеру" if ru else "Ask a manager a question", callback_data=f"onboard:manager:{item['enrollment_id']}")]])
    if item.get("step") == "help":
        return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="↩️ Ответить", callback_data=f"onboardreply:{item['enrollment_id']}")]])
    return None


async def contact(event):
    """Persist verified metadata before replay; no text or credentials in store."""
    if not settings.BOT_MESSAGING_ENABLED:
        return
    actor = getattr(event, "from_user", None)
    message = getattr(event, "message", None) or event
    chat = getattr(message, "chat", None)
    if not actor or actor.is_bot or chat is None or chat.type != "private" or chat.id != actor.id:
        return
    from app.services.locale import resolve_user_locale
    locale = await resolve_user_locale(actor.id, getattr(actor, "language_code", None))
    occurred = datetime.now(timezone.utc) if getattr(event, "message", None) else message.date
    pending = read_store("contacts")
    key = f"{actor.id}:{message.message_id}:{occurred.isoformat()}"
    if len(pending) >= 10000 and key not in pending:
        raise RuntimeError("messaging_contact_queue_full")
    pending.setdefault(key, {"telegram_id": actor.id, "private_chat_id": chat.id,
        "message_id": message.message_id, "occurred_at": occurred.astimezone(timezone.utc).isoformat(), "locale": locale})
    save_json(store_path("contacts"), pending)
    if await api("POST", "/contact", pending[key]) is not None:
        pending = read_store("contacts"); pending.pop(key, None)
        save_json(store_path("contacts"), pending)


async def retry_contacts():
    for actor_id, payload in sorted(read_store("contacts").items(), key=lambda item: item[1]["occurred_at"])[:3]:
        if await api("POST", "/contact", payload) is not None:
            pending = read_store("contacts"); pending.pop(actor_id, None)
            save_json(store_path("contacts"), pending)
