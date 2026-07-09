import asyncio
import json
from pathlib import Path

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.core.config import settings
from app.handlers.admin_panel import admin_keyboard

router = Router()

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
USER_ACTIVITY_PATH = DATA_DIR / "user_activity.json"


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


def load_broadcast_recipients() -> list[int]:
    if not USER_ACTIVITY_PATH.exists():
        return []

    try:
        data = json.loads(USER_ACTIVITY_PATH.read_text())
    except json.JSONDecodeError:
        return []

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

    await message.answer(
        f"📣 Начинаю рассылку.\n\n"
        f"Получателей: {len(recipients)}"
    )

    sent = 0
    failed = 0

    for chat_id in recipients:
        try:
            await bot.copy_message(
                chat_id=chat_id,
                from_chat_id=source_chat_id,
                message_id=source_message_id,
            )
            sent += 1
        except Exception:
            failed += 1

        await asyncio.sleep(0.05)

    await state.clear()

    await message.answer(
        "✅ Рассылка завершена.\n\n"
        f"Отправлено: {sent}\n"
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
