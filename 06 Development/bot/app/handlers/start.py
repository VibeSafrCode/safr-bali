from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from app.keyboards.main_menu import main_menu_keyboard

router = Router()


@router.message(CommandStart())
async def start_handler(message: Message):
    text = (
        "Привет! Я помогу разобраться с Бали без хаоса.\n\n"
        "Здесь можно:\n"
        "— найти виллу или жильё\n"
        "— разобраться с визой\n"
        "— получить консультацию\n"
        "— написать человеку напрямую\n\n"
        "Выберите, что вам нужно:"
    )

    await message.answer(text, reply_markup=main_menu_keyboard())
