from aiogram import Router
from aiogram.filters import Command
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.core.config import settings
from app.services.activity import (
    get_recent_activity_summary,
    is_activity_watch_enabled,
    set_activity_watch_enabled,
)

router = Router()


def admin_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📊 Заявки")],
            [KeyboardButton(text="🛂 Визовые вопросы")],
            [KeyboardButton(text="🏡 Вопросы по жилью")],
            [KeyboardButton(text="🌐 Реферальная сеть")],
            [KeyboardButton(text="👀 Наблюдение за ботом")],
            [KeyboardButton(text="📣 Рупор")],
            [KeyboardButton(text="📜 Последние действия")],
            [KeyboardButton(text="⚙️ Настройки")],
            [KeyboardButton(text="📋 Выйти в меню")],
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
