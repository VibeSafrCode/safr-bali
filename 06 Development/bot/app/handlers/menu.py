from aiogram import Router
from aiogram.types import Message

router = Router()


@router.message(lambda message: message.text == "🏡 Найти виллу / жильё")
async def housing_handler(message: Message):
    text = (
        "🏡 Поиск виллы / жилья на Бали\n\n"
        "Я помогу подобрать жильё под ваш срок, бюджет и район.\n\n"
        "Чтобы передать запрос человеку, нажмите:\n"
        "✍️ Написать человеку\n\n"
        "И коротко напишите:\n"
        "— даты\n"
        "— бюджет\n"
        "— район\n"
        "— сколько человек\n"
        "— вилла / апартаменты / комната"
    )

    await message.answer(text)


@router.message(lambda message: message.text == "🛂 Визы")
async def visa_handler(message: Message):
    text = (
        "🛂 Визы на Бали / в Индонезию\n\n"
        "Можно обратиться по вопросам:\n"
        "— оформление визы\n"
        "— продление визы\n"
        "— выбор подходящего типа визы\n"
        "— консультация по ситуации\n\n"
        "Чтобы передать вопрос человеку, нажмите:\n"
        "✍️ Написать человеку"
    )

    await message.answer(text)


@router.message(lambda message: message.text == "💬 Консультация")
async def consultation_handler(message: Message):
    text = (
        "💬 Консультация\n\n"
        "Можно разобрать вашу ситуацию по визе, жилью, прилёту, переезду или жизни на Бали.\n\n"
        "Нажмите ✍️ Написать человеку и опишите вопрос."
    )

    await message.answer(text)


@router.message(lambda message: message.text == "🎁 Мои SAFR Points")
async def points_handler(message: Message):
    text = (
        "🎁 SAFR Points\n\n"
        "Скоро здесь будет ваш баланс и история начислений.\n"
        "Мы уже подключили это в backend, осталось связать с ботом."
    )

    await message.answer(text)


@router.message(lambda message: message.text == "🔗 Моя ссылка")
async def referral_link_handler(message: Message):
    text = (
        "🔗 Реферальная ссылка\n\n"
        "Скоро здесь будет ваша персональная ссылка для приглашений.\n"
        "За рекомендации можно будет получать SAFR Points."
    )

    await message.answer(text)
