from __future__ import annotations

from aiogram import Router
from aiogram.filters import Command
from urllib.parse import urlsplit, urlunsplit

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
)

from app.core.config import settings
from app.services.activity import (
    get_recent_activity_summary,
    is_activity_watch_enabled,
    set_activity_watch_enabled,
)
from app.services.referrals import (
    format_admin_referral_summary,
    format_recent_registrations,
)

router = Router()


def admin_web_url(path: str) -> str | None:
    raw = settings.MINI_APP_URL.strip()
    if not raw:
        return None
    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def admin_link_keyboard(path: str, label: str) -> InlineKeyboardMarkup | None:
    url = admin_web_url(path)
    if not url:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=label, url=url)]]
    )


async def show_admin_destination(
    message: Message,
    *,
    allowed_ids: list[int],
    title: str,
    detail: str,
    path: str,
) -> None:
    if not message.from_user or message.from_user.id not in allowed_ids:
        await message.answer("⛔️ Доступ запрещён.")
        return
    keyboard = admin_link_keyboard(path, "Открыть защищённый кабинет")
    fallback = "\n\nWeb admin пока не настроен; обратитесь к главному администратору." if keyboard is None else ""
    await message.answer(
        f"{title}\n\n{detail}{fallback}",
        reply_markup=keyboard or admin_keyboard(),
    )


def admin_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="📊 Заявки"),
                KeyboardButton(text="📣 Рупор"),
            ],
            [
                KeyboardButton(text="🛂 Визовые вопросы"),
                KeyboardButton(text="🏡 Вопросы по жилью"),
            ],
            [
                KeyboardButton(text="🌐 Реферальная сеть"),
                KeyboardButton(text="👀 Наблюдение за ботом"),
            ],
            [
                KeyboardButton(text="👥 Новые пользователи"),
                KeyboardButton(text="📜 Последние действия"),
            ],
            [
                KeyboardButton(text="⚙️ Настройки"),
                KeyboardButton(text="📋 Выйти в меню"),
            ],
        ],
        resize_keyboard=True,
        input_field_placeholder="Админский кабинет",
    )


@router.message(Command("admin"))
async def admin_panel_handler(message: Message):
    if message.from_user.id != settings.ADMIN_CHAT_ID:
        await message.answer(
            "⛔️ Доступ запрещён.\n\n"
            "Админский кабинет доступен только главному админу."
        )
        return

    await message.answer(
        "👑 Админский кабинет SAFR Bali\n\n"
        "Вы вошли как главный админ.\n\n"
        "Сейчас это заготовка будущего кабинета. "
        "Позже здесь будут заявки, пользователи, визовые обращения, жильё, "
        "реферальная сеть, SAFR Points и настройки менеджеров.",
        reply_markup=admin_keyboard(),
    )



@router.message(lambda message: message.text == "👀 Наблюдение за ботом")
async def activity_watch_handler(message: Message):
    if message.from_user.id != settings.ADMIN_CHAT_ID:
        await message.answer("⛔️ Доступ запрещён.")
        return

    current_status = is_activity_watch_enabled()
    new_status = not current_status
    set_activity_watch_enabled(new_status)

    status_text = "включено" if new_status else "выключено"

    await message.answer(
        f"👀 Наблюдение за действиями пользователей: {status_text}.\n\n"
        "Когда наблюдение включено, главный админ получает уведомления, "
        "если пользователь зашёл в бота или нажимает важные кнопки.",
        reply_markup=admin_keyboard(),
    )


@router.message(lambda message: message.text == "📜 Последние действия")
async def recent_activity_handler(message: Message):
    if message.from_user.id != settings.ADMIN_CHAT_ID:
        await message.answer("⛔️ Доступ запрещён.")
        return

    await message.answer(
        get_recent_activity_summary(),
        reply_markup=admin_keyboard(),
    )


@router.message(lambda message: message.text == "🌐 Реферальная сеть")
async def referral_network_handler(message: Message):
    if message.from_user.id != settings.ADMIN_CHAT_ID:
        await message.answer("⛔️ Доступ запрещён.")
        return
    await message.answer(
        format_admin_referral_summary(),
        reply_markup=admin_keyboard(),
    )


@router.message(lambda message: message.text == "👥 Новые пользователи")
async def recent_users_handler(message: Message):
    if message.from_user.id != settings.ADMIN_CHAT_ID:
        await message.answer("⛔️ Доступ запрещён.")
        return
    await message.answer(
        format_recent_registrations(),
        reply_markup=admin_keyboard(),
    )


@router.message(lambda message: message.text == "📊 Заявки")
async def orders_admin_handler(message: Message):
    await show_admin_destination(
        message,
        allowed_ids=[settings.ADMIN_CHAT_ID],
        title="📊 Заявки",
        detail="Заказы, подтверждение оплаты и ручные завершение/отмена доступны в защищённом кабинете.",
        path="/admin/orders/",
    )


@router.message(lambda message: message.text == "🛂 Визовые вопросы")
async def visa_admin_handler(message: Message):
    await show_admin_destination(
        message,
        allowed_ids=[settings.ADMIN_CHAT_ID],
        title="🛂 Визовые вопросы",
        detail="Открывается существующая очередь обращений с визовым контекстом.",
        path="/admin/queues/visa/",
    )


@router.message(lambda message: message.text == "🏡 Вопросы по жилью")
async def housing_admin_handler(message: Message):
    await show_admin_destination(
        message,
        allowed_ids=[settings.ADMIN_CHAT_ID],
        title="🏡 Вопросы по жилью",
        detail="Открывается существующая очередь обращений с контекстом жилья.",
        path="/admin/queues/housing/",
    )


@router.message(lambda message: message.text == "⚙️ Настройки")
async def settings_admin_handler(message: Message):
    await show_admin_destination(
        message,
        allowed_ids=[settings.ADMIN_CHAT_ID],
        title="⚙️ Настройки",
        detail="Только подтверждённые versioned exchange settings; секреты здесь не показываются.",
        path="/admin/settings/",
    )
