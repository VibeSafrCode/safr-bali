import asyncio
import json
import logging
import fcntl
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from app.core.config import settings
from app.services.json_storage import save_json

logger = logging.getLogger(__name__)


def store_path(name):
    return Path(__file__).resolve().parents[1] / "data" / f"onboarding_{name}.json"


def read_store(name):
    path = store_path(name)
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError:
        return {}
    # Corrupted or inaccessible receipts/provenance must never be replaced silently.
    if not isinstance(value, dict):
        raise ValueError("Invalid onboarding durable store")
    return value


def acquire_runtime_lock():
    """One polling bot per shared data directory; JSON updates are synchronous."""
    path = store_path("runtime_lock")
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = os.fdopen(os.open(path, os.O_CREAT | os.O_RDWR, 0o600), "a")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        handle.close()
        raise RuntimeError("Another bot process owns the onboarding data directory") from exc
    return handle


def trusted_provenance(record):
    if not isinstance(record, dict) or record.get("verified_new_bot_registration") is not True:
        raise ValueError("Registration provenance is not trusted")
    return {key: record[key] for key in (
        "verified_new_bot_registration", "registration_event", "registration_occurred_at")}


def stage_registration(telegram_id, event, payload):
    pending = read_store("registrations")
    record = pending.get(str(telegram_id))
    if record and record.get("registration_event") == event:
        if "payload" not in record:
            record["payload"] = dict(payload)
            save_json(store_path("registrations"), pending)
        return dict(record["payload"])
    return {**payload, "verified_new_bot_registration": False}


def confirm_registration(telegram_id, event):
    pending = read_store("registrations")
    key = str(telegram_id)
    if pending.get(key, {}).get("registration_event") == event:
        del pending[key]
        save_json(store_path("registrations"), pending)


def registration_provenance(message):
    """Fail closed until deployment verifies completeness of historical local stores."""
    if not settings.ONBOARDING_REGISTRATION_HISTORY_VERIFIED:
        return {}
    root = Path(__file__).resolve().parents[1] / "data"
    try:
        pending = read_store("registrations")
        if str(message.from_user.id) in pending:
            return trusted_provenance(pending[str(message.from_user.id)])
        for name in ("user_activity.json", "referrals.json", "referral_codes.json", "conversations.json"):
            data = json.loads((root / name).read_text())
            if not isinstance(data, dict) or str(message.from_user.id) in data:
                return {}
    except (OSError, ValueError, KeyError, TypeError):
        return {}
    provenance = {"verified_new_bot_registration": True,
        "registration_event": f"telegram-start:{message.chat.id}:{message.message_id}",
        "registration_occurred_at": message.date.astimezone(timezone.utc).isoformat()}
    pending[str(message.from_user.id)] = provenance
    try:
        save_json(store_path("registrations"), pending)
    except OSError:
        return {}
    return provenance


async def api(method, path, payload=None):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request(method, settings.BACKEND_API_URL.rstrip("/") + "/onboarding" + path,
                json=payload, headers={"X-Service-Token": settings.BACKEND_SERVICE_TOKEN})
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning("Onboarding backend unavailable: %s", type(exc).__name__)
        return None


async def deliver(bot, item):
    # Verify durable receipt storage is readable/writable before a Telegram send.
    receipts = read_store("receipts")
    if str(item["id"]) in receipts:
        await replay_receipts()
        return
    save_json(store_path("receipts"), receipts)
    keyboard = None
    if item["step"] == "followup":
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="да", callback_data=f"onboard:yes:{item['enrollment_id']}"),
            InlineKeyboardButton(text="написать менеджеру", callback_data=f"onboard:manager:{item['enrollment_id']}")]])
    if item["step"] == "help":
        from app.services.conversation_store import ensure_client_record
        client = ensure_client_record(item["client_telegram_id"])
        if (item["telegram_id"] not in settings.operations_chat_ids or
                client.get("restricted_to_owner") and item["telegram_id"] != settings.ADMIN_CHAT_ID):
            await api("POST", f"/deliveries/{item['id']}/settle", {"lease_token": item["lease_token"],
                "state": "FAILED", "error_code": "RECIPIENT_REVOKED"})
            return
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="↩️ Ответить", callback_data=f"onboardreply:{item['enrollment_id']}")]])
    result = {"lease_token": item["lease_token"], "state": "UNKNOWN", "error_code": "AMBIGUOUS_SEND"}
    try:
        message = await bot.send_message(item["telegram_id"], item["text"], parse_mode=None,
            reply_markup=keyboard, request_timeout=20)
        result = {"lease_token": item["lease_token"], "state": "DELIVERED", "telegram_message_id": str(message.message_id),
            "delivered_at": getattr(message, "date", datetime.now(timezone.utc)).isoformat()}
        # Persist confirmation before any backend acknowledgement; never resend Telegram.
        receipts = read_store("receipts")
        receipts[str(item["id"])] = result
        save_json(store_path("receipts"), receipts)
    except (TelegramBadRequest, TelegramForbiddenError) as exc:
        result = {"lease_token": item["lease_token"], "state": "FAILED", "error_code": type(exc).__name__}
    except Exception as exc:
        logger.warning("Onboarding send outcome unknown: %s", type(exc).__name__)
    # Retry only the idempotent acknowledgement, never the Telegram send.
    for _ in range(2):
        if await api("POST", f"/deliveries/{item['id']}/settle", result) is not None:
            if result["state"] == "DELIVERED":
                receipts = read_store("receipts")
                receipts.pop(str(item["id"]), None)
                save_json(store_path("receipts"), receipts)
            break


async def replay_receipts():
    receipts = read_store("receipts")
    for delivery_id, result in list(receipts.items()):
        if await api("POST", f"/deliveries/{delivery_id}/settle", result) is not None:
            receipts.pop(delivery_id, None)
            save_json(store_path("receipts"), receipts)


async def retry_registrations():
    """Replay only original trusted registration payloads; no historical-user scans."""
    if not settings.ONBOARDING_REGISTRATION_HISTORY_VERIFIED:
        return
    from app.services.backend_client import sync_user_registration
    now = datetime.now(timezone.utc)
    attempted = 0
    for key in list(read_store("registrations")):
        if attempted >= 3:
            break
        pending = read_store("registrations")
        record = pending.get(key)
        if not record or not record.get("payload"):
            continue
        if record.get("next_retry_at") and datetime.fromisoformat(record["next_retry_at"]) > now:
            continue
        record["next_retry_at"] = (now + timedelta(seconds=30)).isoformat()
        save_json(store_path("registrations"), pending)
        payload = record["payload"]
        attempted += 1
        await sync_user_registration(
            telegram_id=payload["telegram_id"], username=payload.get("username"),
            first_name=payload.get("first_name"), last_name=payload.get("last_name"),
            language=payload.get("language"), invited_by_telegram_id=payload.get("invited_by_telegram_id"),
            invited_by_ref_code=payload.get("invited_by_ref_code"), referral_code=payload.get("referral_code"),
            registration_provenance=trusted_provenance(record))


async def run_bridge(bot):
    while True:
        await replay_receipts()
        await retry_registrations()
        items = await api("POST", "/claim") or []
        for item in items:
            await deliver(bot, item)
        await asyncio.sleep(1 if items else 15)
