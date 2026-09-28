from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from app.core.config import settings
from app.services.onboarding import api
from app.services.backend_client import sync_runtime_event
from app.services.conversation_store import ensure_client_record, add_history_item, now_text
from app.handlers.contact import ContactHumanState, client_start_dialog_keyboard

router = Router()


class OnboardingReply(StatesGroup):
    waiting = State()


@router.callback_query(F.data.startswith("onboard:"))
async def help_callback(callback: CallbackQuery, state: FSMContext):
    _, action, raw_id = callback.data.split(":", 2)
    if action not in {"yes", "manager"} or not raw_id.isdigit():
        await callback.answer("Недоступное действие", show_alert=True)
        return
    record = ensure_client_record(callback.from_user.id)
    result = await api("POST", f"/{raw_id}/help", {"telegram_id": callback.from_user.id,
        "owner_only": bool(record.get("restricted_to_owner"))})
    if result is None:
        await callback.answer("Не удалось сохранить обращение. Попробуйте ещё раз.", show_alert=True)
        return
    await callback.answer("Запрос связи сохранён")
    if action == "manager":
        await state.set_state(ContactHumanState.waiting_for_client_message)
        await state.update_data(route_context=record.get("route_context") or {})
        await callback.message.answer("Напишите ваш вопрос менеджеру.", reply_markup=client_start_dialog_keyboard())


async def authorized(enrollment_id, actor_id):
    result = await api("GET", f"/{enrollment_id}/reply/{actor_id}")
    if not result:
        return None
    client_id = result["client_telegram_id"]
    if ensure_client_record(client_id).get("restricted_to_owner") and actor_id != settings.ADMIN_CHAT_ID:
        return None
    return client_id


@router.callback_query(F.data.startswith("onboardreply:"))
async def reply_callback(callback: CallbackQuery, state: FSMContext):
    raw_id = callback.data.split(":", 1)[1]
    if not raw_id.isdigit() or not await authorized(raw_id, callback.from_user.id):
        await callback.answer("Недостаточно прав для этого обращения", show_alert=True)
        return
    await state.set_state(OnboardingReply.waiting)
    await state.update_data(onboarding_enrollment_id=int(raw_id))
    await callback.answer()
    await callback.message.answer("Напишите ответ клиенту следующим сообщением. /cancel — отмена.")


@router.message(OnboardingReply.waiting)
async def reply_message(message: Message, state: FSMContext):
    if message.text == "/cancel":
        await state.clear()
        await message.answer("Отменено")
        return
    enrollment_id = (await state.get_data()).get("onboarding_enrollment_id")
    client_id = await authorized(enrollment_id, message.from_user.id)
    if not client_id:
        await state.clear()
        await message.answer("Доступ к обращению недоступен")
        return
    if not message.text:
        await message.answer("Отправьте текст ответа")
        return
    # Clear before external send: uncertain delivery must never auto-replay.
    await state.clear()
    try:
        await message.bot.send_message(client_id, message.text, parse_mode=None)
    except Exception:
        await message.answer("Не удалось подтвердить доставку. Проверьте диалог перед повторной отправкой.")
        return
    add_history_item(client_id, {"created_at": now_text(), "from_role": "staff", "from_id": message.from_user.id,
        "from_name": message.from_user.full_name, "text": message.text})
    await sync_runtime_event(client_telegram_id=client_id, actor_telegram_id=message.from_user.id,
        event_type="staff_reply", text=message.text, source_key=f"onboarding-reply:{message.chat.id}:{message.message_id}",
        payload={"onboarding_enrollment_id": enrollment_id})
    await message.answer("Ответ отправлен")
