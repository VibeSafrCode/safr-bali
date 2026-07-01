from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from app.content.texts import get_text
from app.keyboards.main_menu import main_menu_keyboard

router = Router()


@router.message(CommandStart())
async def start_handler(message: Message):
    await message.answer(
        get_text("start"),
        reply_markup=main_menu_keyboard(),
    )
