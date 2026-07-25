from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
)

from app.core.config import settings
from app.core.buttons import is_known_button_text
from app.keyboards.main_menu import main_menu_keyboard
from app.services.json_storage import load_json, save_json
from app.services.routing import format_route_context, get_route_context
from app.services.backend_client import sync_runtime_event
from app.services.conversation_store import (
    add_comment,
    add_history_item,
    ensure_client_record,
    load_conversations,
    save_conversations,
    update_client_record,
)

router = Router()
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

MAIN_MENU_BUTTONS = {
    # Текущие кнопки из главного меню
    "✍️ Написать человеку",
    "🛂 Сделать визу",
    "🏡 Найти жильё",
    "💬 Заказать консультацию",
    "👤 Мой личный кабинет",

    # Старые / альтернативные варианты, чтобы не ловить баги после переименований
    "🏡 Найти виллу / жильё",
    "🏡 Жильё",
    "🛂 Визы",
    "💬 Консультация",

    # Остальные пользовательские кнопки
    "🎁 Мои SAFR Points",
    "🔗 Моя ссылка",
    "🌴 Заказать тревел-ассистента",
    "🚗 Трансфер",
    "🏍️ Байк",
    "🧾 Проверить документы",
    "🏠 Проверить объект",
}

DIALOG_CONTROL_BUTTONS = {
    "↩️ Ответить",
    "✅ Закончить диалог",
    "↩️ Вернуться в диалог",
    "🆕 Новый диалог",
    "📋 Показать меню",
    "🚨 Жалоба ГлавБоссу",
}


class ContactHumanState(StatesGroup):
    waiting_for_client_message = State()
    waiting_for_admin_reply = State()
    waiting_for_boss_complaint = State()


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def is_dialog_active(client_id: int) -> bool:
    record = ensure_client_record(client_id)
    return bool(record.get("active"))


def set_dialog_active(client_id: int, value: bool) -> None:
    record = ensure_client_record(client_id)
    record["active"] = value
    update_client_record(client_id, record)


def set_last_notice_message_id(client_id: int, message_id: Optional[int]) -> None:
    record = ensure_client_record(client_id)
    record["last_notice_message_id"] = message_id
    update_client_record(client_id, record)


async def delete_last_notice(bot: Bot, client_id: int) -> None:
    record = ensure_client_record(client_id)
    notice_message_id = record.get("last_notice_message_id")

    if not notice_message_id:
        return

    try:
        await bot.delete_message(chat_id=client_id, message_id=notice_message_id)
    except TelegramBadRequest:
        pass

    set_last_notice_message_id(client_id, None)


def set_restricted_to_owner(client_id: int, value: bool = True) -> None:
    record = ensure_client_record(client_id)
    record["restricted_to_owner"] = value
    update_client_record(client_id, record)


VISA_CLIENTS_FILE = DATA_DIR / "visa_clients.json"


def load_visa_clients() -> dict:
    return load_json(VISA_CLIENTS_FILE, {})


def save_visa_clients(data: dict) -> None:
    save_json(VISA_CLIENTS_FILE, data)


def grant_visa_client_access(client_id: int, reason: str = "manual") -> None:
    data = load_visa_clients()
    client_key = str(client_id)

    data[client_key] = {
        "client_id": client_id,
        "reason": reason,
        "updated_at": now_text(),
    }

    save_visa_clients(data)


def is_visa_client(client_id: int) -> bool:
    return str(client_id) in load_visa_clients()


def is_visa_admin_user(telegram_id: int) -> bool:
    return telegram_id in getattr(settings, "visa_admin_chat_ids", [])


def is_staff_user(telegram_id: int) -> bool:
    return telegram_id in getattr(settings, "all_staff_chat_ids", settings.staff_chat_ids)


def can_staff_access_client(telegram_id: int, client_id: int) -> bool:
    if is_owner(telegram_id):
        return True

    record = ensure_client_record(client_id)
    if record.get("restricted_to_owner"):
        return False
    assigned_staff_ids = record.get("assigned_staff_ids") or []
    return telegram_id in assigned_staff_ids


def is_owner(telegram_id: int) -> bool:
    return telegram_id == settings.ADMIN_CHAT_ID


def get_recipients_for_client(client_id: int) -> list[int]:
    record = ensure_client_record(client_id)

    if record.get("restricted_to_owner"):
        return [settings.ADMIN_CHAT_ID]

    assigned_staff_ids = record.get("assigned_staff_ids") or []
    return assigned_staff_ids or settings.staff_chat_ids


def get_recipients_for_route(route_context: dict | None) -> list[int]:
    route_context = route_context or {}

    if (
        route_context.get("country") == "Бали"
        and route_context.get("section") == "Визы"
    ):
        return settings.visa_staff_chat_ids

    if route_context.get("city") == "Санкт-Петербург":
        return settings.spb_staff_chat_ids

    if route_context.get("country") == "Таиланд":
        return settings.thailand_staff_chat_ids

    return settings.staff_chat_ids


def set_client_routing(
    client_id: int,
    route_context: dict | None,
    recipient_ids: list[int] | None = None,
) -> list[int]:
    recipients = list(
        dict.fromkeys(recipient_ids or get_recipients_for_route(route_context))
    )
    record = ensure_client_record(client_id)
    record["route_context"] = dict(route_context or {})
    record["assigned_staff_ids"] = recipients
    update_client_record(client_id, record)
    return recipients


def client_start_dialog_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="✅ Закончить диалог")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Напишите вопрос или завершите диалог",
    )


def client_dialog_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="↩️ Ответить"),
                KeyboardButton(text="✅ Закончить диалог"),
            ],
        ],
        resize_keyboard=True,
        input_field_placeholder="Напишите ответ или завершите диалог",
    )


def client_closed_dialog_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="↩️ Вернуться в диалог")],
            [KeyboardButton(text="🆕 Новый диалог")],
            [KeyboardButton(text="📋 Показать меню")],
            [KeyboardButton(text="🚨 Жалоба ГлавБоссу")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие",
    )


def client_actions_keyboard(client_id: int, include_restrict: bool = False, include_visa_transfer: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text="↩️ Ответить",
                callback_data=f"reply:{client_id}",
            )
        ],
        [
            InlineKeyboardButton(
                text="🚨 Передать старшему",
                callback_data=f"escalate:{client_id}",
            )
        ],
        [
            InlineKeyboardButton(
                text="📝 Внутренняя заметка",
                callback_data=f"comment:{client_id}",
            )
        ],
        [
            InlineKeyboardButton(
                text="💬 Чат команды",
                callback_data=f"staff_thread:{client_id}",
            )
        ],
        [
            InlineKeyboardButton(
                text="📚 Показать переписку",
                callback_data=f"history:{client_id}",
            )
        ],
    ]

    if include_visa_transfer:
        rows.append(
            [
                InlineKeyboardButton(
                    text="🛂 Передать на визы",
                    callback_data=f"visa_transfer:{client_id}",
                )
            ]
        )

    if include_restrict:
        rows.append(
            [
                InlineKeyboardButton(
                    text="🔒 Запретить общение",
                    callback_data=f"restrict:{client_id}",
                )
            ]
        )

    return InlineKeyboardMarkup(inline_keyboard=rows)


def staff_thread_keyboard(client_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✍️ Написать в чат",
                    callback_data=f"staff_thread_write:{client_id}",
                ),
                InlineKeyboardButton(
                    text="🔄 Обновить",
                    callback_data=f"staff_thread:{client_id}",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📚 Клиентская переписка",
                    callback_data=f"history:{client_id}",
                )
            ],
        ]
    )


async def notify_staff_thread_participants(
    bot: Bot,
    client_id: int,
    sender_id: int,
    sender_name: str,
    text: str,
    kind: str,
) -> int:
    title = "📝 Новая внутренняя заметка" if kind == "note" else "💬 Новое сообщение в чате команды"
    delivered = 0
    for recipient_id in get_recipients_for_client(client_id):
        if recipient_id == sender_id:
            continue
        try:
            await bot.send_message(
                chat_id=recipient_id,
                text=(
                    f"{title}\n\n"
                    f"Клиент: {client_id}\n"
                    f"От: {sender_name}\n\n"
                    f"{text}\n\n"
                    "Клиент это сообщение не видит."
                ),
                reply_markup=staff_thread_keyboard(client_id),
            )
            delivered += 1
        except Exception:
            logger.exception(
                "Could not notify staff %s about internal thread for client %s",
                recipient_id,
                client_id,
            )
    return delivered


def get_message_summary(message: Message) -> str:
    if message.text:
        return message.text

    if message.voice:
        return "🎙 Голосовое сообщение"

    if message.photo:
        return "🖼 Фото"

    if message.document:
        return "📎 Документ"

    return "Сообщение без текста"


def format_client_card(message: Message, route_context: dict | None = None) -> str:
    user = message.from_user

    username = f"@{user.username}" if user and user.username else "без username"
    full_name = user.full_name if user else "Неизвестный пользователь"
    telegram_id = user.id if user else "unknown"

    return (
        "📩 Новое сообщение клиента\n\n"
        f"👤 Имя: {full_name}\n"
        f"🔗 Username: {username}\n"
        f"🆔 Telegram ID: {telegram_id}\n\n"
        f"{format_route_context(route_context)}\n\n"
        f"💬 Сообщение:\n{get_message_summary(message)}"
    )


def format_history(client_id: int) -> str:
    record = ensure_client_record(client_id)

    messages = record.get("messages", [])[-15:]
    comments = record.get("comments", [])[-10:]
    restricted = record.get("restricted_to_owner", False)
    active = record.get("active", False)

    lines = [
        f"📚 Переписка с клиентом {client_id}",
        "",
        f"🟢 Диалог активен: {'да' if active else 'нет'}",
        f"🔒 Только главный админ: {'да' if restricted else 'нет'}",
        "",
        "Сообщения:",
    ]

    if not messages:
        lines.append("Пока сообщений нет.")
    else:
        for item in messages:
            lines.append(
                f"[{item.get('created_at')}] "
                f"{item.get('from_role')}: {item.get('text')}"
            )

    lines.append("")
    lines.append("Комментарии админов:")

    if not comments:
        lines.append("Пока комментариев нет.")
    else:
        for item in comments:
            lines.append(
                f"[{item.get('created_at')}] "
                f"{item.get('admin_name')}: {item.get('text')}"
            )

    text = "\n".join(lines)

    if len(text) > 3500:
        text = text[-3500:]

    return text


async def notify_staff_about_client_message(
    message: Message,
    bot: Bot,
    route_context: dict | None = None,
):
    if should_ignore_as_client_message(message.text):
        return False

    user = message.from_user

    if not user:
        return

    client_id = user.id
    if route_context:
        recipients = set_client_routing(client_id, route_context)
    else:
        record = ensure_client_record(client_id)
        current_route_context = get_route_context(client_id)
        saved_route_context = record.get("route_context") or {}
        route_context = current_route_context or saved_route_context
        saved_recipients = (
            record.get("assigned_staff_ids")
            if route_context == saved_route_context
            else None
        )
        recipients = set_client_routing(
            client_id,
            route_context,
            saved_recipients,
        )

    add_history_item(
        client_id,
        {
            "created_at": now_text(),
            "from_role": "client",
            "from_id": client_id,
            "from_name": user.full_name,
            "text": get_message_summary(message),
        },
    )
    await sync_runtime_event(
        client_telegram_id=client_id,
        actor_telegram_id=client_id,
        event_type="client_message",
        text=get_message_summary(message),
        payload={"route_context": route_context or {}},
    )

    set_dialog_active(client_id, True)

    admin_text = format_client_card(message, route_context)

    for staff_chat_id in recipients:
        await bot.send_message(
            chat_id=staff_chat_id,
            text=admin_text,
            reply_markup=client_actions_keyboard(
                client_id=client_id,
                include_restrict=is_owner(staff_chat_id),
                include_visa_transfer=False,
            ),
        )

        if message.voice:
            await bot.forward_message(
                chat_id=staff_chat_id,
                from_chat_id=message.chat.id,
                message_id=message.message_id,
            )


@router.message(
    lambda message: message.text in {"✍️ Написать человеку", "✍️ Написать менеджеру"}
)
async def contact_human_start(message: Message, state: FSMContext):
    route_context = get_route_context(message.from_user.id)
    await state.set_state(ContactHumanState.waiting_for_client_message)
    await state.update_data(route_context=route_context)

    await message.answer(
        "✍️ Напишите ваш вопрос менеджеру одним сообщением.\n\n"
        f"{format_route_context(route_context)}\n\n"
        "Например:\n"
        "— нужна вилла на месяц, бюджет до 2500$\n"
        "— хочу оформить визу\n"
        "— нужна консультация по переезду\n\n"
        "Я передам сообщение человеку.\n\n"
        "Чтобы выйти из режима диалога, нажмите ✅ Закончить диалог.",
        reply_markup=client_start_dialog_keyboard(),
    )


@router.message(ContactHumanState.waiting_for_client_message)
async def contact_human_message(message: Message, state: FSMContext, bot: Bot):
    if message.text == "✅ Закончить диалог":
        user = message.from_user

        if user:
            set_dialog_active(user.id, False)

        await state.clear()

        await message.answer(
            "✅ Диалог завершён.\n\n"
            "Что хотите сделать дальше?",
            reply_markup=client_closed_dialog_keyboard(),
        )
        return

    if should_ignore_as_client_message(message.text):
        await state.clear()
        raise SkipHandler

    state_data = await state.get_data()
    delivered = await notify_staff_about_client_message(
        message,
        bot,
        state_data.get("route_context"),
    )

    if delivered is False:
        await state.clear()
        return

    notice = await message.answer(
        "✅ Сообщение передано человеку.",
        reply_markup=client_dialog_keyboard(),
    )

    if message.from_user:
        set_last_notice_message_id(message.from_user.id, notice.message_id)

    await state.clear()


@router.message(lambda message: message.text == "↩️ Ответить")
async def client_reply_button_handler(message: Message, state: FSMContext):
    if message.from_user and is_staff_user(message.from_user.id):
        return

    await state.set_state(ContactHumanState.waiting_for_client_message)

    await message.answer(
        "Напишите ваш ответ следующим сообщением.\n\n"
        "Я передам его человеку."
    )


@router.message(lambda message: message.text == "↩️ Вернуться в диалог")
async def return_to_dialog_handler(message: Message, state: FSMContext):
    user = message.from_user

    if not user:
        return

    set_dialog_active(user.id, True)
    await state.set_state(ContactHumanState.waiting_for_client_message)

    await message.answer(
        "↩️ Вы вернулись в диалог.\n\n"
        "Напишите сообщение, и я передам его человеку.",
        reply_markup=client_dialog_keyboard(),
    )


@router.message(lambda message: message.text == "🆕 Новый диалог")
async def new_dialog_handler(message: Message, state: FSMContext):
    user = message.from_user

    if user:
        set_dialog_active(user.id, True)

    await state.set_state(ContactHumanState.waiting_for_client_message)

    await message.answer(
        "🆕 Новый диалог открыт.\n\n"
        "Напишите ваш вопрос одним сообщением.",
        reply_markup=client_dialog_keyboard(),
    )


@router.message(lambda message: message.text == "📋 Показать меню")
async def show_menu_handler(message: Message, state: FSMContext):
    await state.clear()

    await message.answer(
        "Главное меню:",
        reply_markup=main_menu_keyboard(),
    )


@router.message(lambda message: message.text == "🚨 Жалоба ГлавБоссу")
async def boss_complaint_start(message: Message, state: FSMContext):
    await state.set_state(ContactHumanState.waiting_for_boss_complaint)

    await message.answer(
        "🚨 Напишите жалобу одним сообщением.\n\n"
        "Она уйдёт напрямую главному админу."
    )


@router.message(ContactHumanState.waiting_for_boss_complaint)
async def boss_complaint_message(message: Message, state: FSMContext, bot: Bot):
    user = message.from_user

    if not user:
        return

    await bot.send_message(
        chat_id=settings.ADMIN_CHAT_ID,
        text=(
            "🚨 ЖАЛОБА ГЛАВБОССУ\n\n"
            f"👤 Клиент: {user.full_name}\n"
            f"🆔 Telegram ID: {user.id}\n\n"
            f"💬 Жалоба:\n{message.text}"
        ),
    )

    add_comment(
        user.id,
        {
            "created_at": now_text(),
            "admin_id": user.id,
            "admin_name": user.full_name,
            "text": f"Жалоба ГлавБоссу: {message.text}",
        },
    )

    await message.answer(
        "✅ Жалоба передана главному админу.",
        reply_markup=client_closed_dialog_keyboard(),
    )

    await state.clear()


@router.message(lambda message: message.text == "✅ Закончить диалог")
async def close_dialog_handler(message: Message, state: FSMContext, bot: Bot):
    user = message.from_user

    if not user:
        return

    client_id = user.id
    record = ensure_client_record(client_id)
    had_messages = len(record.get("messages", [])) > 0

    set_dialog_active(client_id, False)
    await state.clear()

    await message.answer(
        "✅ Диалог завершён.\n\n"
        "Что хотите сделать дальше?",
        reply_markup=client_closed_dialog_keyboard(),
    )

    if had_messages:
        add_comment(
            client_id,
            {
                "created_at": now_text(),
                "admin_id": client_id,
                "admin_name": user.full_name,
                "text": "Клиент завершил диалог",
            },
        )

        for staff_chat_id in get_recipients_for_client(client_id):
            await bot.send_message(
                chat_id=staff_chat_id,
                text=(
                    "✅ Клиент завершил диалог\n\n"
                    f"👤 Клиент: {user.full_name}\n"
                    f"🆔 Telegram ID: {client_id}"
                ),
            )


def should_ignore_as_client_message(text: str | None) -> bool:
    """Не отправляем менеджерам тексты, которые являются кнопками меню."""
    return is_known_button_text(text)


def is_menu_or_control_button(text: str | None) -> bool:
    return is_known_button_text(text)


@router.message(
    lambda message: (
        message.text
        and message.from_user
        and not message.text.startswith("/")
        and not is_staff_user(message.from_user.id)
        and not is_menu_or_control_button(message.text)
        and not should_ignore_as_client_message(message.text)
        and is_dialog_active(message.from_user.id)
    )
)
async def active_dialog_message_handler(message: Message, bot: Bot):
    delivered = await notify_staff_about_client_message(message, bot)

    if delivered is False:
        return

    notice = await message.answer(
        "✅ Сообщение передано человеку.",
        reply_markup=client_dialog_keyboard(),
    )

    if message.from_user:
        set_last_notice_message_id(message.from_user.id, notice.message_id)


@router.callback_query(F.data.startswith("reply:"))
async def reply_button_handler(callback: CallbackQuery, state: FSMContext):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return

    client_id = int(callback.data.split(":")[1])

    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer(
            "У вас нет доступа к этому клиенту.",
            show_alert=True,
        )
        return

    await state.set_state(ContactHumanState.waiting_for_admin_reply)
    await state.update_data(client_id=client_id)

    await callback.message.answer(
        f"↩️ Напишите ответ клиенту {client_id} следующим сообщением."
    )
    await callback.answer()


@router.message(ContactHumanState.waiting_for_admin_reply)
async def admin_reply_message(message: Message, state: FSMContext, bot: Bot):
    if not message.from_user or not is_staff_user(message.from_user.id):
        await message.answer("⛔️ Эта функция доступна только админам и менеджерам.")
        return

    data = await state.get_data()
    client_id = data.get("client_id")

    if not client_id:
        await message.answer("Не найден клиент для ответа. Нажмите кнопку «Ответить» ещё раз.")
        await state.clear()
        return

    if not can_staff_access_client(message.from_user.id, int(client_id)):
        await message.answer("⛔️ У вас нет доступа к этому клиенту.")
        await state.clear()
        return

    await delete_last_notice(bot, client_id)

    if message.voice:
        await bot.send_message(
            chat_id=client_id,
            text="💬 Голосовой ответ от команды SAFR:",
            reply_markup=client_dialog_keyboard(),
        )
        await bot.copy_message(
            chat_id=client_id,
            from_chat_id=message.chat.id,
            message_id=message.message_id,
        )
        reply_text_for_history = "[voice message]"
    elif message.text:
        await bot.send_message(
            chat_id=client_id,
            text=(
                "💬 Ответ от команды SAFR:\n\n"
                f"{message.text}"
            ),
            reply_markup=client_dialog_keyboard(),
        )
        reply_text_for_history = message.text
    else:
        await message.answer(
            "⚠️ Сейчас клиенту можно отправить текст или голосовое сообщение."
        )
        return

    add_history_item(
        client_id,
        {
            "created_at": now_text(),
            "from_role": "staff",
            "from_id": message.from_user.id,
            "from_name": message.from_user.full_name,
            "text": reply_text_for_history,
        },
    )
    await sync_runtime_event(
        client_telegram_id=int(client_id),
        actor_telegram_id=message.from_user.id,
        event_type="staff_reply",
        text=reply_text_for_history,
    )

    set_dialog_active(client_id, True)

    await message.answer(f"✅ Ответ отправлен клиенту {client_id}.")
    await state.clear()


@router.callback_query(F.data.startswith("history:"))
async def history_button_handler(callback: CallbackQuery):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return

    client_id = int(callback.data.split(":")[1])

    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer(
            "У вас нет доступа к истории этого клиента.",
            show_alert=True,
        )
        return

    await callback.message.answer(
        format_history(client_id),
        reply_markup=client_actions_keyboard(
            client_id=client_id,
            include_restrict=is_owner(callback.from_user.id),
            include_visa_transfer=False,
        ),
    )

    await callback.answer()


@router.callback_query(F.data.startswith("escalate:"))
async def escalate_button_handler(callback: CallbackQuery, bot: Bot):
    if not callback.from_user or not is_staff_user(callback.from_user.id):
        await callback.answer("Недостаточно прав", show_alert=True)
        return

    client_id = int(callback.data.split(":")[1])

    if not can_staff_access_client(callback.from_user.id, client_id):
        await callback.answer("У вас нет доступа к этому клиенту.", show_alert=True)
        return
    staff_name = callback.from_user.full_name

    await bot.send_message(
        chat_id=settings.ADMIN_CHAT_ID,
        text=(
            "🚨 Менеджер просит подключиться к диалогу\n\n"
            f"👤 Менеджер: {staff_name}\n"
            f"🆔 Клиент ID: {client_id}\n\n"
            "Нажмите «Показать переписку» в сообщении клиента."
        ),
    )

    add_comment(
        client_id,
        {
            "created_at": now_text(),
            "admin_id": callback.from_user.id,
            "admin_name": staff_name,
            "text": "Передано старшему админу",
        },
    )

    await callback.answer("Передано старшему админу", show_alert=True)


@router.callback_query(F.data.startswith("visa_transfer:"))
async def visa_transfer_button_handler(callback: CallbackQuery, bot: Bot):
    if not callback.from_user or not is_owner(callback.from_user.id):
        await callback.answer(
            "Только главный админ может передавать обращения визовому агенту.",
            show_alert=True,
        )
        return

    client_id = int(callback.data.split(":")[1])
    route_context = ensure_client_record(client_id).get("route_context") or {}

    if not (
        route_context.get("country") == "Бали"
        and route_context.get("section") == "Визы"
    ):
        await callback.answer(
            "Визовому админу можно передать только вопрос из раздела «Бали → Визы».",
            show_alert=True,
        )
        return

    visa_admin_ids = getattr(settings, "visa_admin_chat_ids", []) or []

    if not visa_admin_ids:
        await callback.answer(
            "Визовые агенты сейчас не настроены или временно отключены.",
            show_alert=True,
        )
        return

    grant_visa_client_access(client_id, reason="manual_transfer")

    add_comment(
        client_id,
        {
            "created_at": now_text(),
            "admin_id": callback.from_user.id,
            "admin_name": callback.from_user.full_name,
            "text": "Передано визовому агенту",
        },
    )

    sent_count = 0

    for visa_admin_id in set(visa_admin_ids):
        await bot.send_message(
            chat_id=visa_admin_id,
            text=(
                "🛂 Вам передали визовое обращение\n\n"
                f"🆔 Клиент ID: {client_id}\n\n"
                "Используйте кнопки ниже, чтобы ответить клиенту или посмотреть переписку."
            ),
            reply_markup=client_actions_keyboard(
                client_id=client_id,
                include_restrict=False,
                include_visa_transfer=False,
            ),
        )
        sent_count += 1

    await callback.message.answer(
        f"✅ Клиент {client_id} передан визовому агенту. Получателей: {sent_count}."
    )
    await callback.answer("Передано на визы", show_alert=True)


@router.callback_query(F.data.startswith("restrict:"))
async def restrict_button_handler(callback: CallbackQuery):
    if not callback.from_user or not is_owner(callback.from_user.id):
        await callback.answer(
            "Только главный админ может запрещать общение.",
            show_alert=True,
        )
        return

    client_id = int(callback.data.split(":")[1])

    set_restricted_to_owner(client_id, True)

    await callback.message.answer(
        f"🔒 Общение по клиенту {client_id} ограничено.\n\n"
        "Теперь новые сообщения клиента будут приходить только главному админу."
    )
    await callback.answer("Ограничение включено", show_alert=True)
