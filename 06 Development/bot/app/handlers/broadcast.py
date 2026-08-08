from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.core.config import settings
from app.handlers.admin_panel import admin_keyboard
from app.services.json_storage import load_json, save_json

router = Router()

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
USER_ACTIVITY_PATH = DATA_DIR / "user_activity.json"
BROADCAST_HISTORY_PATH = DATA_DIR / "broadcast_history.json"
logger = logging.getLogger(__name__)
ACTIVE_BROADCAST_KEYS: set[str] = set()


class BroadcastState(StatesGroup):
    waiting_for_message = State()
    waiting_for_confirmation = State()


def broadcast_confirm_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="✅ Отправить всем")],
            [KeyboardButton(text="❌ Отмена")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Подтвердите рассылку",
    )


def broadcast_after_send_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🗑 Удалить сообщение")],
            [KeyboardButton(text="📣 Рупор")],
            [KeyboardButton(text="📋 Выйти в меню")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие",
    )


def load_broadcast_history() -> list[dict]:
    data = load_json(BROADCAST_HISTORY_PATH, [])

    if not isinstance(data, list):
        return []

    return data


def save_broadcast_history(history: list[dict]) -> None:
    save_json(BROADCAST_HISTORY_PATH, history[-20:])


def save_broadcast_record(record: dict) -> None:
    history = load_broadcast_history()
    history.append(record)
    save_broadcast_history(history)


def get_last_deletable_broadcast() -> dict | None:
    history = load_broadcast_history()

    for record in reversed(history):
        if record.get("deleted_at"):
            continue

        sent_messages = record.get("sent_messages")
        if isinstance(sent_messages, list) and sent_messages:
            return record

    return None


def mark_broadcast_deleted(broadcast_id: str, deleted: int, failed: int) -> None:
    history = load_broadcast_history()

    for record in history:
        if record.get("broadcast_id") == broadcast_id:
            record["deleted_at"] = datetime.now(timezone.utc).isoformat()
            record["delete_result"] = {
                "deleted": deleted,
                "failed": failed,
            }
            break

    save_broadcast_history(history)


def load_broadcast_recipients() -> list[int]:
    data = load_json(USER_ACTIVITY_PATH, {})

    recipients: set[int] = set()

    if isinstance(data, dict):
        for key, value in data.items():
            candidate = None

            if isinstance(key, str) and key.isdigit():
                candidate = int(key)

            if isinstance(value, dict):
                user_id = value.get("user_id") or value.get("telegram_id") or value.get("id")
                if isinstance(user_id, int):
                    candidate = user_id
                elif isinstance(user_id, str) and user_id.isdigit():
                    candidate = int(user_id)

            if candidate and candidate > 0 and candidate != settings.ADMIN_CHAT_ID:
                recipients.add(candidate)

    return sorted(recipients)


def is_main_admin(message: Message) -> bool:
    return bool(message.from_user and message.from_user.id == settings.ADMIN_CHAT_ID)


@router.message(F.text == "📣 Рупор")
async def broadcast_start_handler(message: Message, state: FSMContext):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    recipients = load_broadcast_recipients()

    await state.set_state(BroadcastState.waiting_for_message)
    await state.update_data(recipients=recipients)

    await message.answer(
        "📣 Рупор\n\n"
        f"Сейчас в базе получателей: {len(recipients)}.\n\n"
        "Отправьте сообщение для рассылки.\n"
        "Можно отправить текст, фото, видео, голосовое, кружок или другой медиаформат.\n\n"
        "После этого я покажу предпросмотр и попрошу подтвердить отправку.",
        reply_markup=ReplyKeyboardMarkup(
            keyboard=[[KeyboardButton(text="❌ Отмена")]],
            resize_keyboard=True,
            input_field_placeholder="Отправьте сообщение для рассылки",
        ),
    )


@router.message(BroadcastState.waiting_for_message, F.text == "❌ Отмена")
async def broadcast_cancel_from_message_handler(message: Message, state: FSMContext):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    await state.clear()
    await message.answer(
        "❌ Рассылка отменена.",
        reply_markup=admin_keyboard(),
    )


@router.message(BroadcastState.waiting_for_message)
async def broadcast_message_received_handler(message: Message, state: FSMContext, bot: Bot):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    data = await state.get_data()
    recipients = data.get("recipients") or load_broadcast_recipients()

    await state.update_data(
        source_chat_id=message.chat.id,
        source_message_id=message.message_id,
        recipients=recipients,
    )
    await state.set_state(BroadcastState.waiting_for_confirmation)

    await message.answer("👀 Предпросмотр рассылки:")

    await bot.copy_message(
        chat_id=message.chat.id,
        from_chat_id=message.chat.id,
        message_id=message.message_id,
    )

    await message.answer(
        f"Отправить это сообщение всем пользователям?\n\n"
        f"Получателей: {len(recipients)}",
        reply_markup=broadcast_confirm_keyboard(),
    )


@router.message(BroadcastState.waiting_for_confirmation, F.text == "❌ Отмена")
async def broadcast_cancel_from_confirmation_handler(message: Message, state: FSMContext):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    await state.clear()
    await message.answer(
        "❌ Рассылка отменена.",
        reply_markup=admin_keyboard(),
    )


@router.message(BroadcastState.waiting_for_confirmation, F.text == "✅ Отправить всем")
async def broadcast_send_handler(message: Message, state: FSMContext, bot: Bot):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    data = await state.get_data()
    recipients = data.get("recipients") or []
    source_chat_id = data.get("source_chat_id")
    source_message_id = data.get("source_message_id")

    if not recipients or not source_chat_id or not source_message_id:
        await state.clear()
        await message.answer(
            "⚠️ Не нашёл сообщение или список получателей. Рассылка не отправлена.",
            reply_markup=admin_keyboard(),
        )
        return

    broadcast_key = f"{source_chat_id}:{source_message_id}"
    already_sent = any(
        str(record.get("source_chat_id")) == str(source_chat_id)
        and str(record.get("source_message_id")) == str(source_message_id)
        for record in load_broadcast_history()
    )
    if broadcast_key in ACTIVE_BROADCAST_KEYS or already_sent:
        await message.answer(
            "ℹ️ Эта рассылка уже отправляется или была отправлена.",
            reply_markup=admin_keyboard(),
        )
        return
    ACTIVE_BROADCAST_KEYS.add(broadcast_key)

    await message.answer(
        f"📣 Начинаю рассылку.\n\n"
        f"Получателей: {len(recipients)}"
    )

    sent = 0
    failed = 0
    sent_messages: list[dict] = []

    for chat_id in recipients:
        try:
            copied_message = await bot.copy_message(
                chat_id=chat_id,
                from_chat_id=source_chat_id,
                message_id=source_message_id,
            )
            sent += 1
            sent_messages.append(
                {
                    "chat_id": chat_id,
                    "message_id": copied_message.message_id,
                }
            )
        except Exception:
            logger.warning("Broadcast delivery failed for chat_id=%s", chat_id)
            failed += 1

        await asyncio.sleep(0.05)

    broadcast_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    save_broadcast_record(
        {
            "broadcast_id": broadcast_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_chat_id": source_chat_id,
            "source_message_id": source_message_id,
            "sent": sent,
            "failed": failed,
            "sent_messages": sent_messages,
        }
    )
    ACTIVE_BROADCAST_KEYS.discard(broadcast_key)

    await state.clear()

    await message.answer(
        "✅ Рассылка завершена.\n\n"
        f"Отправлено: {sent}\n"
        f"Ошибок: {failed}\n\n"
        "Если нужно убрать это сообщение у пользователей, нажмите "
        "🗑 Удалить сообщение.",
        reply_markup=broadcast_after_send_keyboard(),
    )


@router.message(F.text == "🗑 Удалить сообщение")
async def broadcast_delete_last_handler(message: Message, bot: Bot):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    record = get_last_deletable_broadcast()

    if not record:
        await message.answer(
            "⚠️ Не нашёл последнюю рассылку для удаления.",
            reply_markup=admin_keyboard(),
        )
        return

    sent_messages = record.get("sent_messages") or []

    await message.answer(
        "🗑 Начинаю удаление последней рассылки.\n\n"
        f"Сообщений к удалению: {len(sent_messages)}"
    )

    deleted = 0
    failed = 0

    for item in sent_messages:
        chat_id = item.get("chat_id")
        message_id = item.get("message_id")

        if not chat_id or not message_id:
            failed += 1
            continue

        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
            deleted += 1
        except Exception:
            logger.warning("Broadcast deletion failed for chat_id=%s", chat_id)
            failed += 1

        await asyncio.sleep(0.05)

    mark_broadcast_deleted(
        broadcast_id=record.get("broadcast_id"),
        deleted=deleted,
        failed=failed,
    )

    await message.answer(
        "✅ Удаление завершено.\n\n"
        f"Удалено: {deleted}\n"
        f"Ошибок: {failed}",
        reply_markup=admin_keyboard(),
    )


@router.message(BroadcastState.waiting_for_confirmation)
async def broadcast_confirmation_unknown_handler(message: Message):
    if not is_main_admin(message):
        await message.answer("⛔️ Доступ запрещён.")
        return

    await message.answer(
        "Подтвердите действие кнопкой:\n\n"
        "✅ Отправить всем\n"
        "или\n"
        "❌ Отмена",
        reply_markup=broadcast_confirm_keyboard(),
    )
