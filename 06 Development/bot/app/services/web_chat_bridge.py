from __future__ import annotations

import asyncio
import html
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.core.config import settings
from app.services.backend_client import (
    get_web_conversation,
    get_web_outbox,
    mark_web_event_delivered,
)
from app.services.staff_routing import get_recipients_for_route


logger = logging.getLogger(__name__)


def web_thread_keyboard(
    conversation_id: int,
    *,
    allow_client_reply: bool,
) -> InlineKeyboardMarkup:
    first_row = []
    if allow_client_reply:
        first_row.append(
            InlineKeyboardButton(
                text="↩️ Ответить клиенту",
                callback_data=f"webreply:{conversation_id}",
            )
        )
    first_row.append(
        InlineKeyboardButton(
            text="📝 Заметка",
            callback_data=f"webnote:{conversation_id}",
        )
    )
    return InlineKeyboardMarkup(
        inline_keyboard=[
            first_row,
            [
                InlineKeyboardButton(
                    text="📜 Диалог",
                    callback_data=f"webhistory:{conversation_id}",
                )
            ],
        ]
    )


def format_web_request(conversation: dict) -> str:
    client = conversation.get("client") or {}
    context = conversation.get("route_context") or {}
    messages = conversation.get("messages") or []
    last_message = next(
        (
            item
            for item in reversed(messages)
            if item.get("author_type") == "client"
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
    event_type = event.get("event_type")
    recipients: list[int]
    text: str
    keyboard = None

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
        conversation = await get_web_conversation(conversation_id)
        if not conversation:
            return
        recipients = get_recipients_for_route(conversation.get("route_context"))
        text = format_web_request(conversation)
        keyboard = web_thread_keyboard(
            conversation_id,
            allow_client_reply=bool(
                (conversation.get("client") or {}).get("telegram_id")
            ),
        )
    elif event_type == "web_staff_internal":
        conversation_id = int(event.get("aggregate_id") or 0)
        conversation = await get_web_conversation(conversation_id)
        if not conversation:
            return
        payload = event.get("payload") or {}
        actor_id = int(payload.get("actor_telegram_id") or 0)
        message_id = int(payload.get("message_id") or 0)
        note = next(
            (
                item
                for item in (conversation.get("messages") or [])
                if int(item.get("id") or 0) == message_id
            ),
            {},
        )
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
            await mark_web_event_delivered(int(event["id"]), [])
            return
    elif event_type == "web_staff_client_message":
        conversation_id = int(event.get("aggregate_id") or 0)
        conversation = await get_web_conversation(conversation_id)
        if not conversation:
            return
        client = conversation.get("client") or {}
        recipient = int(client.get("telegram_id") or 0)
        payload = event.get("payload") or {}
        message_id = int(payload.get("message_id") or 0)
        message = next((item for item in (conversation.get("messages") or []) if int(item.get("id") or 0) == message_id), {})
        if not recipient or not message:
            await mark_web_event_delivered(int(event["id"]), [], status="failed", error_code="client_telegram_unavailable")
            return
        locale = client.get("locale") if client.get("locale") in {"ru", "en"} else "ru"
        recipients = [recipient]
        text = ("💬 <b>Сообщение менеджера SAFRWAY</b>\n\n" if locale == "ru" else "💬 <b>Message from your SAFRWAY manager</b>\n\n") + html.escape(str(message.get("body") or ""))
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="↩️ Ответить" if locale == "ru" else "↩️ Reply", callback_data=f"clientwebreply:{conversation_id}")]])
    else:
        await mark_web_event_delivered(int(event["id"]), [])
        return

    delivered_to: list[int] = []
    # Observers receive copies, never assignments or reply/history controls.
    original_recipients = list(dict.fromkeys(recipients))
    observers = settings.support_chat_ids if event_type in {
        "web_user_registered", "web_chat_message", "web_staff_client_message",
    } else []
    delivery_results = {}
    for recipient_id in dict.fromkeys([*original_recipients, *observers]):
        try:
            await bot.send_message(
                recipient_id,
                text if recipient_id in original_recipients else "📋 Копия для поддержки\n\n" + text,
                parse_mode="HTML",
                reply_markup=keyboard if recipient_id in original_recipients else None,
            )
            delivery_results[str(recipient_id)] = "delivered"
            if recipient_id in original_recipients:
                delivered_to.append(recipient_id)
        except Exception as exc:
            delivery_results[str(recipient_id)] = "failed" if isinstance(exc, (TelegramBadRequest, TelegramForbiddenError)) else "unknown"
            logger.error("Website event delivery failed event=%s recipient=%s error=%s", event.get("id"), recipient_id, type(exc).__name__)
    if delivery_results and all(value == "delivered" for value in delivery_results.values()):
        if observers:
            await mark_web_event_delivered(int(event["id"]), delivered_to, delivery_results=delivery_results)
        else:
            await mark_web_event_delivered(int(event["id"]), delivered_to)
    elif delivery_results:
        # Partial success is not full delivery. Preserve per-recipient evidence;
        # unknown Telegram outcomes must never trigger blind automatic replay.
        await mark_web_event_delivered(int(event["id"]), delivered_to, status="failed",
                                       error_code="telegram_delivery_incomplete", delivery_results=delivery_results)
    elif not recipients:
        await mark_web_event_delivered(int(event["id"]), delivered_to)


async def run_web_chat_bridge(bot: Bot) -> None:
    while True:
        try:
            for event in await get_web_outbox():
                await deliver_event(bot, event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Website bridge iteration failed")
        await asyncio.sleep(3)
