from aiogram import Router
from aiogram.types import Message

from app.keyboards.main_menu import main_menu_keyboard

router = Router()


@router.message()
async def fallback_handler(message: Message):
    await message.answer(
        "Извините, я не понял, что вы хотите.\n\n"
        "Если вы хотите задать вопрос человеку — нажмите кнопку "
        "«✍️ Написать человеку».\n\n"
        "Если нет — выберите нужную команду в меню. "
        "В любом случае я с радостью помогу!",
        reply_markup=main_menu_keyboard(),
    )
