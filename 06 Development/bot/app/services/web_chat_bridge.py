from __future__ import annotations

import asyncio
import html
import logging
from copy import deepcopy
from uuid import uuid4

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.core.config import settings
from app.services.backend_client import (
    get_web_conversation,
    get_web_outbox,
    mark_web_event_delivered,
    claim_web_event_delivery,
    journal_web_event_delivery,
)
from app.services.staff_routing import get_recipients_for_route


logger = logging.getLogger(__name__)
# Auxiliary live-worker retries only. Durable claim/journal state lives in the
# existing backend row; losing this memory must never grant another send.
_pending_receipt_journals: dict[int, dict] = {}


async def retry_event_settlement(event_id: int, attempt_id: str, receipt: dict) -> bool:
    confirmed = await mark_web_event_delivered(event_id, receipt.get("recipient_ids") or [],
        status=receipt.get("status"), error_code=receipt.get("error_code"),
        delivery_results=receipt.get("delivery_results") or {}, attempt_id=attempt_id)
    if not confirmed:
        logger.warning("Website event settlement unconfirmed; ACK-only recovery event=%s", event_id)
    return confirmed


async def persist_event_receipt(event_id: int, attempt_id: str, receipt: dict) -> None:
    if not await journal_web_event_delivery(event_id, attempt_id=attempt_id, receipt=receipt):
        logger.warning("Website event receipt unconfirmed; transport remains quarantined event=%s", event_id)
        return
    _pending_receipt_journals.pop(event_id, None)
    await retry_event_settlement(event_id, attempt_id, receipt)


async def retry_receipt_journals() -> None:
    for event_id, saved in list(_pending_receipt_journals.items())[:3]:
        # Rotate before awaiting: a failed or interrupted journal must not pin
        # the first batch forever. This retries receipts only, never transport.
        _pending_receipt_journals.pop(event_id)
        _pending_receipt_journals[event_id] = saved
        await persist_event_receipt(event_id, saved["attempt_id"], saved["receipt"])


async def finish_without_transport(event: dict, *, status: str = "delivered", error_code: str | None = None) -> None:
    if len(_pending_receipt_journals) >= 100:
        return
    event_id = int(event["id"])
    attempt_id = str(uuid4())
    if not await claim_web_event_delivery(event_id, attempt_id=attempt_id, primary_ids=[], observer_ids=[],
        source_payload=deepcopy(event.get("payload") or {}), message_body=None):
        return
    receipt = {"status": status, "recipient_ids": [], "error_code": error_code, "delivery_results": {}}
    _pending_receipt_journals[event_id] = {"attempt_id": attempt_id, "receipt": receipt}
    await persist_event_receipt(event_id, attempt_id, receipt)


def web_thread_keyboard(
    conversation_id: int,
    *,
    allow_client_reply: bool,
    allow_internal_note: bool = True,
) -> InlineKeyboardMarkup:
    first_row = []
    if allow_client_reply:
        first_row.append(
            InlineKeyboardButton(
                text="↩️ Ответить клиенту",
                callback_data=f"webreply:{conversation_id}",
            )
        )
    if allow_internal_note:
        first_row.append(
            InlineKeyboardButton(text="📝 Заметка", callback_data=f"webnote:{conversation_id}")
        )
    return InlineKeyboardMarkup(
        inline_keyboard=[
            *([first_row] if first_row else []),
            [
                InlineKeyboardButton(
                    text="📜 Диалог",
                    callback_data=f"webhistory:{conversation_id}",
                )
            ],
        ]
    )


def format_web_request(conversation: dict, *, message_id: int | None = None, route_context: dict | None = None) -> str:
    client = conversation.get("client") or {}
    context = route_context if route_context is not None else conversation.get("route_context") or {}
    messages = conversation.get("messages") or []
    last_message = next(
        (
            item
            for item in reversed(messages)
            if item.get("author_type") == "client" and (message_id is None or item.get("id") == message_id)
        ),
        {},
    )
    route = " → ".join(
        str(context.get(key))
        for key in ("country", "city", "section", "service")
        if context.get(key)
    ) or "Общий вопрос"
    identity = client.get("first_name") or "Гость сайта"
    if client.get("username"):
        identity += f" (@{client['username']})"
    elif client.get("contact"):
        identity += f" · {client['contact']}"

    return (
        "🌐 <b>Сообщение с сайта</b>\n\n"
        f"<b>Клиент:</b> {html.escape(str(identity))}\n"
        f"<b>Направление:</b> {html.escape(route)}\n\n"
        f"{html.escape(str(last_message.get('body') or ''))}"
    )


async def deliver_event(bot: Bot, event: dict) -> None:
    if event.get("status") == "settling":
        payload = event.get("payload") or {}
        attempt = payload.get("delivery_attempt")
        receipt = payload.get("pending_settlement_receipt")
        if isinstance(attempt, dict) and isinstance(attempt.get("attempt_id"), str) and isinstance(receipt, dict):
            await retry_event_settlement(int(event["id"]), attempt["attempt_id"], receipt)
        return
    if event.get("status", "pending") != "pending" or (event.get("payload") or {}).get("delivery_attempt") is not None:
        # Stale polls, competing workers and restarted unresolved claims cannot
        # obtain transport authority. There is deliberately no expiry/reclaim.
        return
    if len(_pending_receipt_journals) >= 100:
        return
    event_type = event.get("event_type")
    recipients: list[int]
    text: str
    keyboard = None
    message_body = None

    if event_type == "web_user_registered":
        payload = event.get("payload") or {}
        inviter = payload.get("invited_by_telegram_id")
        text = (
            "🆕 <b>Новая регистрация на сайте</b>\n\n"
            f"Пользователь: {html.escape(str(payload.get('first_name') or 'Без имени'))}\n"
            f"Telegram ID: <code>{payload.get('telegram_id')}</code>\n"
            f"Код: <code>{html.escape(str(payload.get('ref_code') or '—'))}</code>\n"
            f"Пригласил: <code>{inviter or settings.ADMIN_CHAT_ID}</code>"
        )
        recipients = [settings.ADMIN_CHAT_ID]
    elif event_type == "web_chat_message":
        conversation_id = int(event.get("aggregate_id") or 0)
        payload = event.get("payload") or {}
        message_id = payload.get("message_id")
        context = payload.get("route_context")
        if (type(message_id) is not int or message_id <= 0
                or payload.get("conversation_id") != conversation_id or not isinstance(context, dict)
                or payload.get("source") not in {"website", "mini_app", "telegram"}):
            await finish_without_transport(event, status="failed", error_code="client_source_snapshot_unavailable")
            return
        conversation = await get_web_conversation(conversation_id, message_id=message_id)
        if not conversation:
            return
        messages = [item for item in (conversation.get("messages") or []) if item.get("id") == message_id]
        if (conversation.get("id") != conversation_id or len(messages) != 1
                or messages[0].get("author_type") != "client" or messages[0].get("visibility") != "client"
                or messages[0].get("route_context") != context or messages[0].get("source") != payload["source"]):
            await finish_without_transport(event, status="failed", error_code="client_message_source_conflict")
            return
        message_body = messages[0].get("body")
        recipients = get_recipients_for_route(context)
        text = format_web_request(conversation, message_id=message_id, route_context=context)
        keyboard = web_thread_keyboard(
            conversation_id,
            allow_client_reply=bool(
                (conversation.get("client") or {}).get("telegram_id")
            ),
        )
    elif event_type == "web_staff_internal":
        conversation_id = int(event.get("aggregate_id") or 0)
        payload = event.get("payload") or {}
        message_id = int(payload.get("message_id") or 0)
        conversation = await get_web_conversation(conversation_id, message_id=message_id)
        if not conversation:
            return
        actor_id = int(payload.get("actor_telegram_id") or 0)
        note = next(
            (
                item
                for item in (conversation.get("messages") or [])
                if int(item.get("id") or 0) == message_id
            ),
            {},
        )
        if note.get("author_type") != "staff" or note.get("visibility") != "internal":
            await finish_without_transport(event, status="failed", error_code="internal_message_unavailable")
            return
        message_body = note.get("body")
        recipients = [
            recipient_id
            for recipient_id in (conversation.get("assigned_staff_ids") or [])
            if recipient_id != actor_id
        ]
        text = (
            "📝 <b>Внутренняя заметка по web-клиенту</b>\n\n"
            f"{html.escape(str(note.get('body') or ''))}"
        )
        keyboard = web_thread_keyboard(
            conversation_id,
            allow_client_reply=bool(
                (conversation.get("client") or {}).get("telegram_id")
            ),
        )
        if not recipients:
            await finish_without_transport(event)
            return
    elif event_type == "web_staff_client_message":
        conversation_id = int(event.get("aggregate_id") or 0)
        payload = event.get("payload") or {}
        message_id = int(payload.get("message_id") or 0)
        conversation = await get_web_conversation(conversation_id, message_id=message_id)
        if not conversation:
            return
        client = conversation.get("client") or {}
        recipient = int(client.get("telegram_id") or 0)
        message = next((item for item in (conversation.get("messages") or []) if int(item.get("id") or 0) == message_id), {})
        if (not recipient or not message or message.get("author_type") != "staff"
                or message.get("visibility") != "client"):
            await finish_without_transport(event, status="failed", error_code="client_telegram_unavailable")
            return
        message_body = message.get("body")
        locale = client.get("locale") if client.get("locale") in {"ru", "en"} else "ru"
        recipients = [recipient]
        text = ("💬 <b>Сообщение менеджера SAFRWAY</b>\n\n" if locale == "ru" else "💬 <b>Message from your SAFRWAY manager</b>\n\n") + html.escape(str(message.get("body") or ""))
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="↩️ Ответить" if locale == "ru" else "↩️ Reply", callback_data=f"clientwebreply:{conversation_id}")]])
    else:
        if not await mark_web_event_delivered(int(event["id"]), []):
            logger.warning("Website non-transport event ACK unconfirmed event=%s", event.get("id"))
        return

    delivered_to: list[int] = []
    # Notification recipients never acquire assignments. Only the explicit
    # correspondence grant enables controls for a client-message copy.
    original_recipients = list(dict.fromkeys(recipients))
    observers = settings.support_chat_ids if event_type in {
        "web_user_registered", "web_chat_message", "web_staff_client_message",
    } else []
    observers = [value for value in dict.fromkeys(observers) if value not in original_recipients]
    event_id = int(event["id"])
    attempt_id = str(uuid4())
    if not await claim_web_event_delivery(event_id, attempt_id=attempt_id, primary_ids=original_recipients,
        observer_ids=observers, source_payload=deepcopy(event.get("payload") or {}), message_body=message_body):
        return
    delivery_results = {}
    for recipient_id in dict.fromkeys([*original_recipients, *observers]):
        try:
            support_keyboard = None
            if event_type == "web_chat_message" and recipient_id in settings.support_reply_chat_ids:
                support_keyboard = web_thread_keyboard(
                    conversation_id, allow_client_reply=bool((conversation.get("client") or {}).get("telegram_id")),
                    allow_internal_note=False,
                )
            await bot.send_message(
                recipient_id,
                text if recipient_id in original_recipients else "📋 Копия для поддержки\n\n" + text,
                parse_mode="HTML",
                reply_markup=keyboard if recipient_id in original_recipients else support_keyboard,
            )
            delivery_results[str(recipient_id)] = "delivered"
            if recipient_id in original_recipients:
                delivered_to.append(recipient_id)
        except Exception as exc:
            delivery_results[str(recipient_id)] = "failed" if isinstance(exc, (TelegramBadRequest, TelegramForbiddenError)) else "unknown"
            logger.error("Website event delivery failed event=%s recipient=%s error=%s", event.get("id"), recipient_id, type(exc).__name__)
    if delivery_results and all(value == "delivered" for value in delivery_results.values()):
        receipt = {"status": "delivered", "recipient_ids": delivered_to, "error_code": None,
                   "delivery_results": delivery_results}
    elif delivery_results:
        # Partial success is not full delivery. Preserve per-recipient evidence;
        # unknown Telegram outcomes must never trigger blind automatic replay.
        receipt = {"status": "failed", "recipient_ids": delivered_to, "error_code": "telegram_delivery_incomplete",
                   "delivery_results": delivery_results}
    else:
        receipt = {"status": "delivered", "recipient_ids": [], "error_code": None, "delivery_results": {}}
    _pending_receipt_journals[event_id] = {"attempt_id": attempt_id, "receipt": deepcopy(receipt)}
    await persist_event_receipt(event_id, attempt_id, receipt)


async def run_web_chat_bridge(bot: Bot) -> None:
    while True:
        try:
            await retry_receipt_journals()
            for event in await get_web_outbox():
                await deliver_event(bot, event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Website bridge iteration failed")
        await asyncio.sleep(3)
