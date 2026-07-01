from aiogram import Router
from aiogram.types import Message

from app.content.texts import get_text

router = Router()


@router.message(lambda message: message.text == "🏡 Найти виллу / жильё")
async def housing_handler(message: Message):
    await message.answer(get_text("housing"))


@router.message(lambda message: message.text == "🛂 Визы")
async def visa_handler(message: Message):
    await message.answer(get_text("visa"))


@router.message(lambda message: message.text == "💬 Консультация")
async def consultation_handler(message: Message):
    await message.answer(get_text("consultation"))


@router.message(lambda message: message.text == "🎁 Мои SAFR Points")
async def points_handler(message: Message):
    await message.answer(get_text("points"))


@router.message(lambda message: message.text == "🔗 Моя ссылка")
async def referral_link_handler(message: Message):
    await message.answer(get_text("referral_link"))
