from aiogram import Router
from aiogram.types import Message

from app.content.texts import get_text
from app.keyboards.main_menu import main_menu_keyboard

router = Router()


@router.message()
async def fallback_handler(message: Message):
    await message.answer(
        get_text("fallback"),
        reply_markup=main_menu_keyboard(),
    )
