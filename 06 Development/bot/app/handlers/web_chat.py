from __future__ import annotations

import html

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.core.config import settings
from app.services.backend_client import (
    get_web_conversation,
    send_web_client_message,
    send_web_staff_message,
)


router = Router()


class WebStaffState(StatesGroup):
    waiting_for_text = State()


class WebClientState(StatesGroup):
    waiting_for_text = State()


def can_access(conversation: dict, telegram_id: int) -> bool:
    return (
        telegram_id == settings.ADMIN_CHAT_ID
        or telegram_id in (conversation.get("assigned_staff_ids") or [])
    )


async def load_allowed_conversation(
    conversation_id: int,
    telegram_id: int,
) -> dict | None:
    conversation = await get_web_conversation(conversation_id)
    if not conversation or not can_access(conversation, telegram_id):
        return None
    return conversation


@router.callback_query(
    F.data.startswith("webreply:") | F.data.startswith("webnote:")
)
async def prepare_web_reply(callback: CallbackQuery, state: FSMContext):
    action, raw_id = (callback.data or "").split(":", 1)
    conversation = await load_allowed_conversation(int(raw_id), callback.from_user.id)
    if not conversation:
        await callback.answer("Нет доступа к этому диалогу", show_alert=True)
        return
    visibility = "internal" if action == "webnote" else "client"
    await state.set_state(WebStaffState.waiting_for_text)
    await state.update_data(
        web_conversation_id=int(raw_id),
        web_visibility=visibility,
    )
    prompt = (
        "📝 Напишите внутреннюю заметку. Клиент её не увидит."
        if visibility == "internal"
        else "↩️ Напишите ответ клиенту. Он появится в диалоге на сайте."
    )
    await callback.message.answer(prompt)
    await callback.answer()


@router.message(WebStaffState.waiting_for_text)
async def save_web_reply(message: Message, state: FSMContext):
    data = await state.get_data()
    conversation_id = int(data.get("web_conversation_id") or 0)
    visibility = str(data.get("web_visibility") or "client")
    conversation = await load_allowed_conversation(
        conversation_id,
        message.from_user.id,
    )
    if not conversation:
        await state.clear()
        await message.answer("Диалог недоступен.")
        return
    if not message.text or not message.text.strip():
        await message.answer("Пришлите текстовое сообщение.")
        return
    saved = await send_web_staff_message(
        conversation_id,
        actor_telegram_id=message.from_user.id,
        body=message.text.strip(),
        visibility=visibility,
    )
    if saved:
        await state.clear()
        await message.answer(
            "✅ Заметка сохранена."
            if visibility == "internal"
            else "✅ Ответ отправлен в диалог на сайте."
        )
    else:
        await message.answer("Не удалось сохранить. Попробуйте ещё раз.")


@router.callback_query(F.data.startswith("webhistory:"))
async def show_web_history(callback: CallbackQuery):
    raw_id = (callback.data or "").split(":", 1)[1]
    conversation = await load_allowed_conversation(int(raw_id), callback.from_user.id)
    if not conversation:
        await callback.answer("Нет доступа к этому диалогу", show_alert=True)
        return
    lines = ["📜 <b>Диалог по клиенту</b>"]
    for item in (conversation.get("messages") or [])[-20:]:
        label = {
            "client": "Клиент",
            "staff": "Менеджер",
        }.get(item.get("author_type"), "Система")
        if item.get("visibility") == "internal":
            label = "📝 Внутренняя заметка"
        lines.append(f"\n<b>{label}:</b> {html.escape(str(item.get('body') or ''))}")
    await callback.message.answer("\n".join(lines), parse_mode="HTML")
    await callback.answer()


@router.callback_query(F.data.startswith("clientwebreply:"))
async def prepare_client_web_reply(callback: CallbackQuery, state: FSMContext):
    conversation_id = int((callback.data or "").split(":", 1)[1])
    conversation = await get_web_conversation(conversation_id)
    client = (conversation or {}).get("client") or {}
    if not conversation or int(client.get("telegram_id") or 0) != callback.from_user.id:
        await callback.answer("Диалог недоступен" if client.get("locale") != "en" else "Conversation unavailable", show_alert=True)
        return
    await state.set_state(WebClientState.waiting_for_text)
    await state.update_data(web_conversation_id=conversation_id)
    await callback.message.answer("Напишите ответ менеджеру." if client.get("locale") != "en" else "Write your reply to the manager.")
    await callback.answer()


@router.message(WebClientState.waiting_for_text)
async def save_client_web_reply(message: Message, state: FSMContext):
    data = await state.get_data()
    conversation_id = int(data.get("web_conversation_id") or 0)
    conversation = await get_web_conversation(conversation_id)
    client = (conversation or {}).get("client") or {}
    is_en = client.get("locale") == "en"
    if not conversation or int(client.get("telegram_id") or 0) != message.from_user.id:
        await state.clear()
        await message.answer("Conversation unavailable." if is_en else "Диалог недоступен.")
        return
    if not message.text or not message.text.strip():
        await message.answer("Please send a text message." if is_en else "Пришлите текстовое сообщение.")
        return
    saved = await send_web_client_message(conversation_id, actor_telegram_id=message.from_user.id, body=message.text.strip(), idempotency_key=f"telegram:{message.from_user.id}:{message.message_id}")
    if saved:
        await state.clear()
        await message.answer("✅ Reply sent to the manager." if is_en else "✅ Ответ отправлен менеджеру.")
    else:
        await message.answer("Could not send. Please try again." if is_en else "Не удалось отправить. Попробуйте ещё раз.")
