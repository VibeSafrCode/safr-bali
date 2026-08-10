from aiogram import Router
from aiogram.types import CallbackQuery, Message

from app.content.texts import get_text
from app.keyboards.main_menu import main_menu_keyboard
from app.services.i18n import text

router = Router()


@router.callback_query()
async def stale_callback_handler(callback: CallbackQuery):
    await callback.answer(
        text("error.staleButton"),
        show_alert=True,
    )
    if callback.message:
        await callback.message.answer(
            get_text("fallback"),
            reply_markup=main_menu_keyboard(),
        )


@router.message()
async def fallback_handler(message: Message):
    await message.answer(
        get_text("fallback"),
        reply_markup=main_menu_keyboard(),
    )
