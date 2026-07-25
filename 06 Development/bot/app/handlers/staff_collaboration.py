from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.handlers.contact import (
    can_staff_access_client,
    is_staff_user,
    notify_staff_thread_participants,
    staff_thread_keyboard,
)
from app.services.backend_client import sync_runtime_event
from app.services.conversation_store import (
    add_comment,
    add_staff_thread_message,
    format_staff_thread,
    now_text,
)


router = Router()


class StaffCollaborationState(StatesGroup):
    waiting_for_note = State()
    waiting_for_thread_message = State()


@router.callback_query(F.data.startswith("comment:"))
async def comment_button_handler(callback: CallbackQuery, state: FSMContext):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return
    client_id = int(callback.data.split(":")[1])
    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer("У вас нет доступа к этому клиенту.", show_alert=True)
        return
    await state.set_state(StaffCollaborationState.waiting_for_note)
    await state.update_data(client_id=client_id)
    await callback.message.answer(
        f"📝 Напишите внутреннюю заметку по клиенту {client_id}.\n\n"
        "Клиент её не увидит."
    )
    await callback.answer()


@router.message(StaffCollaborationState.waiting_for_note)
async def note_message_handler(message: Message, state: FSMContext, bot: Bot):
    if not message.from_user or not is_staff_user(message.from_user.id):
        await message.answer("⛔️ Эта функция доступна только админам и менеджерам.")
        return
    state_data = await state.get_data()
    client_id = state_data.get("client_id")
    if not client_id or not can_staff_access_client(message.from_user.id, int(client_id)):
        await message.answer("⛔️ Клиент не найден или у вас нет доступа.")
        await state.clear()
        return
    if not message.text:
        await message.answer("⚠️ Внутренняя заметка должна быть текстом.")
        return

    item = {
        "created_at": now_text(),
        "admin_id": message.from_user.id,
        "admin_name": message.from_user.full_name,
        "staff_id": message.from_user.id,
        "staff_name": message.from_user.full_name,
        "kind": "note",
        "text": message.text,
    }
    add_comment(int(client_id), item)
    add_staff_thread_message(int(client_id), item)
    await sync_runtime_event(
        client_telegram_id=int(client_id),
        actor_telegram_id=message.from_user.id,
        event_type="staff_note",
        text=message.text,
    )
    delivered = await notify_staff_thread_participants(
        bot=bot,
        client_id=int(client_id),
        sender_id=message.from_user.id,
        sender_name=message.from_user.full_name,
        text=message.text,
        kind="note",
    )
    await message.answer(
        f"✅ Заметка сохранена. Уведомлено коллег: {delivered}.",
        reply_markup=staff_thread_keyboard(int(client_id)),
    )
    await state.clear()


@router.callback_query(F.data.startswith("staff_thread:"))
async def staff_thread_handler(callback: CallbackQuery):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return
    client_id = int(callback.data.split(":")[1])
    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer("У вас нет доступа к этому клиенту.", show_alert=True)
        return
    await callback.message.answer(
        format_staff_thread(client_id),
        reply_markup=staff_thread_keyboard(client_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("staff_thread_write:"))
async def staff_thread_write_handler(callback: CallbackQuery, state: FSMContext):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return
    client_id = int(callback.data.split(":")[1])
    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer("У вас нет доступа к этому клиенту.", show_alert=True)
        return
    await state.set_state(StaffCollaborationState.waiting_for_thread_message)
    await state.update_data(client_id=client_id)
    await callback.message.answer(
        f"💬 Напишите сообщение коллегам по клиенту {client_id}.\n\n"
        "Клиент его не увидит."
    )
    await callback.answer()


@router.message(StaffCollaborationState.waiting_for_thread_message)
async def staff_thread_message_handler(message: Message, state: FSMContext, bot: Bot):
    if not message.from_user or not is_staff_user(message.from_user.id):
        await message.answer("⛔️ Эта функция доступна только админам и менеджерам.")
        return
    state_data = await state.get_data()
    client_id = state_data.get("client_id")
    if not client_id or not can_staff_access_client(message.from_user.id, int(client_id)):
        await message.answer("⛔️ Клиент не найден или у вас нет доступа.")
        await state.clear()
        return
    if not message.text:
        await message.answer("⚠️ Внутренний чат сейчас принимает текстовые сообщения.")
        return

    add_staff_thread_message(
        int(client_id),
        {
            "created_at": now_text(),
            "staff_id": message.from_user.id,
            "staff_name": message.from_user.full_name,
            "kind": "message",
            "text": message.text,
        },
    )
    await sync_runtime_event(
        client_telegram_id=int(client_id),
        actor_telegram_id=message.from_user.id,
        event_type="staff_thread_message",
        text=message.text,
    )
    delivered = await notify_staff_thread_participants(
        bot=bot,
        client_id=int(client_id),
        sender_id=message.from_user.id,
        sender_name=message.from_user.full_name,
        text=message.text,
        kind="message",
    )
    await message.answer(
        f"✅ Сообщение добавлено во внутренний чат. Уведомлено коллег: {delivered}.",
        reply_markup=staff_thread_keyboard(int(client_id)),
    )
    await state.clear()
