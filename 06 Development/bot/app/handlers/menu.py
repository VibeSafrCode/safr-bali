from aiogram import Router
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.content.texts import get_text
from app.core.config import settings
from app.keyboards.main_menu import main_menu_keyboard

router = Router()

TECH_SUPPORT_WAITING_USERS: set[int] = set()
TECH_SUPPORT_PROMPT_MESSAGES: dict[int, int] = {}

SERVICE_WAITING_USERS: dict[int, dict] = {}
SERVICE_PROMPT_MESSAGES: dict[int, int] = {}


def personal_account_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📋 Обратно в меню")],
            [KeyboardButton(text="🎁 Мой баланс SAFR Points")],
            [KeyboardButton(text="🔗 Моя рефка")],
            [KeyboardButton(text="🌐 Моя сеть")],
            [KeyboardButton(text="📦 Мои купленные услуги")],
            [KeyboardButton(text="🛠 Тех. поддержка")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите раздел личного кабинета",
    )


def visa_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="E33G"), KeyboardButton(text="Инвест KITAS")],
            [KeyboardButton(text="Виза C1"), KeyboardButton(text="VOA")],
            [KeyboardButton(text="Другая виза"), KeyboardButton(text="Задать вопрос по визе")],
            [KeyboardButton(text="📋 Выйти в меню")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите тип визы",
    )


def housing_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Найти виллу"), KeyboardButton(text="Найти гест")],
            [KeyboardButton(text="Купить недвижимость"), KeyboardButton(text="Проверить объект")],
            [KeyboardButton(text="Задать вопрос по жилью")],
            [KeyboardButton(text="📋 Выйти в меню")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите задачу по жилью",
    )


async def delete_last_tech_prompt(message: Message) -> None:
    prompt_message_id = TECH_SUPPORT_PROMPT_MESSAGES.pop(message.from_user.id, None)

    if not prompt_message_id:
        return

    try:
        await message.bot.delete_message(
            chat_id=message.chat.id,
            message_id=prompt_message_id,
        )
    except Exception as error:
        print(f"Could not delete tech support prompt: {error}")


def clear_user_context(user_id: int) -> None:
    TECH_SUPPORT_WAITING_USERS.discard(user_id)
    SERVICE_WAITING_USERS.pop(user_id, None)
    TECH_SUPPORT_PROMPT_MESSAGES.pop(user_id, None)
    SERVICE_PROMPT_MESSAGES.pop(user_id, None)


async def delete_last_service_prompt(message: Message) -> None:
    prompt_message_id = SERVICE_PROMPT_MESSAGES.pop(message.from_user.id, None)

    if not prompt_message_id:
        return

    try:
        await message.bot.delete_message(
            chat_id=message.chat.id,
            message_id=prompt_message_id,
        )
    except Exception as error:
        print(f"Could not delete service prompt: {error}")


async def send_service_question_to_staff(message: Message, service_type: str, category: str) -> None:
    user = message.from_user
    username = f"@{user.username}" if user.username else "username не указан"

    if service_type == "visa":
        title = "🛂 ВОПРОС ПО ВИЗЕ"
    elif service_type == "housing":
        title = "🏡 ВОПРОС ПО ЖИЛЬЮ"
    else:
        title = "💬 ВОПРОС ПО УСЛУГЕ"

    admin_text = (
        f"{title}\n\n"
        f"Категория: {category}\n\n"
        f"Пользователь: {user.full_name}\n"
        f"Telegram ID: {user.id}\n"
        f"Username: {username}\n\n"
        "Сообщение:\n"
        f"{message.text}"
    )

    for staff_chat_id in settings.staff_chat_ids:
        await message.bot.send_message(
            chat_id=staff_chat_id,
            text=admin_text,
        )


@router.message(lambda message: message.text in ["🛂 Сделать визу", "🛂 Визы"])
async def visa_handler(message: Message):
    await message.answer(
        get_text("visa"),
        reply_markup=visa_keyboard(),
    )


@router.message(lambda message: message.text in ["🏡 Найти жильё", "🏡 Жильё", "🏡 Найти виллу / жильё"])
async def housing_handler(message: Message):
    await message.answer(
        get_text("housing"),
        reply_markup=housing_keyboard(),
    )


@router.message(lambda message: message.text in ["E33G", "Инвест KITAS", "Виза C1", "VOA", "Другая виза", "Задать вопрос по визе"])
async def visa_category_handler(message: Message):
    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "visa",
        "category": message.text,
    }

    sent_message = await message.answer(
        "🛂 Опишите ваш вопрос по визе следующим сообщением.\n\n"
        "Например:\n"
        "— какая виза нужна\n"
        "— на какой срок\n"
        "— где вы сейчас находитесь\n"
        "— есть ли действующая виза\n\n"
        "Ваше сообщение уйдёт админам с пометкой «Вопрос по визе».",
        reply_markup=visa_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(lambda message: message.text in ["Найти виллу", "Найти гест", "Купить недвижимость", "Проверить объект", "Задать вопрос по жилью"])
async def housing_category_handler(message: Message):
    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "housing",
        "category": message.text,
    }

    sent_message = await message.answer(
        "🏡 Опишите ваш вопрос по жилью следующим сообщением.\n\n"
        "Напишите, пожалуйста:\n"
        "— даты или срок\n"
        "— бюджет\n"
        "— район\n"
        "— сколько человек\n"
        "— что важно по объекту\n\n"
        "Ваше сообщение уйдёт админам с пометкой «Вопрос по жилью».",
        reply_markup=housing_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(lambda message: message.from_user and message.from_user.id in SERVICE_WAITING_USERS)
async def service_question_message_handler(message: Message):
    service_context = SERVICE_WAITING_USERS.pop(message.from_user.id)

    await delete_last_service_prompt(message)

    await send_service_question_to_staff(
        message=message,
        service_type=service_context["service_type"],
        category=service_context["category"],
    )

    await message.answer(
        "✅ Вопрос передан команде.\n\n"
        "Мы посмотрим задачу и вернёмся с ответом.",
        reply_markup=main_menu_keyboard(),
    )


@router.message(lambda message: message.text in ["💬 Заказать консультацию", "💬 Консультация"])
async def consultation_handler(message: Message):
    await message.answer(get_text("consultation"))


@router.message(lambda message: message.text in ["🌴 Заказать тревел-ассистента", "🌴 Мой тревел-ассистент"])
async def travel_assistant_handler(message: Message):
    await message.answer(get_text("travel_assistant"))


@router.message(lambda message: message.text == "👤 Мой личный кабинет")
async def personal_account_handler(message: Message):
    await message.answer(
        get_text("personal_account"),
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text in ["📋 Обратно в меню", "📋 Выйти в меню"])
async def back_to_menu_handler(message: Message):
    TECH_SUPPORT_WAITING_USERS.discard(message.from_user.id)
    SERVICE_WAITING_USERS.pop(message.from_user.id, None)

    await delete_last_tech_prompt(message)
    await delete_last_service_prompt(message)

    await message.answer(
        "Главное меню:",
        reply_markup=main_menu_keyboard(),
    )


@router.message(lambda message: message.text in ["🎁 Мой баланс SAFR Points", "🎁 Мои SAFR Points"])
async def points_handler(message: Message):
    await message.answer(
        get_text("points"),
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text in ["🔗 Моя рефка", "🔗 Моя ссылка"])
async def my_referral_handler(message: Message):
    bot_info = await message.bot.get_me()
    username = bot_info.username

    referral_link = f"https://t.me/{username}?start=ref_{message.from_user.id}"

    text = (
        "🔗 Ваша реферальная ссылка\n\n"
        f"{referral_link}\n\n"
        "Зачем она нужна:\n"
        "— вы отправляете ссылку человеку, которому может быть полезен SAFR Bali\n"
        "— человек запускает бота по вашей ссылке\n"
        "— он закрепляется в вашей сети\n"
        "— после целевого действия вы сможете получать SAFR Points\n\n"
        "SAFR Points можно будет использовать на услуги проекта: "
        "консультации, визовые услуги, тревел-ассистента, подбор жилья и другие бонусы.\n\n"
        "Важно: реферальная привязка закрепляется один раз. "
        "Повторно перепривязать человека к другой сети нельзя."
    )

    await message.answer(
        text,
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text == "🌐 Моя сеть")
async def my_network_handler(message: Message):
    await message.answer(
        get_text("my_network"),
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text == "📦 Мои купленные услуги")
async def my_purchased_services_handler(message: Message):
    await message.answer(
        get_text("my_purchased_services"),
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text == "🛠 Тех. поддержка")
async def tech_support_handler(message: Message):
    TECH_SUPPORT_WAITING_USERS.add(message.from_user.id)

    sent_message = await message.answer(
        get_text("tech_support"),
        reply_markup=personal_account_keyboard(),
    )

    TECH_SUPPORT_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(lambda message: message.from_user and message.from_user.id in TECH_SUPPORT_WAITING_USERS)
async def tech_support_message_handler(message: Message):
    TECH_SUPPORT_WAITING_USERS.discard(message.from_user.id)
    await delete_last_tech_prompt(message)

    user = message.from_user
    username = f"@{user.username}" if user.username else "username не указан"

    admin_text = (
        "🚨 ТЕХНИЧЕСКИЙ ВОПРОС\n\n"
        f"Пользователь: {user.full_name}\n"
        f"Telegram ID: {user.id}\n"
        f"Username: {username}\n\n"
        "Сообщение:\n"
        f"{message.text}"
    )

    await message.bot.send_message(
        chat_id=settings.ADMIN_CHAT_ID,
        text=admin_text,
    )

    await message.answer(
        "✅ Технический вопрос отправлен Админу Никите.",
        reply_markup=personal_account_keyboard(),
    )
