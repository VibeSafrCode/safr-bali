from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from aiogram import F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, Message, ReplyKeyboardMarkup

from app.content.texts import get_text
from app.content.visas import get_visa_card
from app.content.housing import get_housing_card, get_housing_pages
from app.core.buttons import is_known_button_text
from app.core.config import settings
from app.keyboards.main_menu import main_menu_keyboard
from app.services.activity import track_activity
from app.services.exchange_rates import (
    CALCULATOR_CACHE_TTL_SECONDS,
    get_usdt_idr_rate,
)
from app.services.referrals import get_or_create_referral_code
from app.handlers.contact import (
    add_history_item,
    client_actions_keyboard,
    get_recipients_for_route,
    grant_visa_client_access,
    set_client_routing,
    set_dialog_active,
)
from app.services.routing import format_route_context, set_route_context

router = Router()
logger = logging.getLogger(__name__)

TECH_SUPPORT_WAITING_USERS: set[int] = set()
TECH_SUPPORT_PROMPT_MESSAGES: dict[int, int] = {}

SERVICE_WAITING_USERS: dict[int, dict] = {}
SERVICE_PROMPT_MESSAGES: dict[int, int] = {}
VISA_CONTEXT_USERS: dict[int, str] = {}
CURRENCY_CALCULATOR_RATES: dict[int, Decimal] = {}

def visa_staff_actions_keyboard(client_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="↩️ Ответить",
                    callback_data=f"reply:{client_id}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📚 Показать переписку",
                    callback_data=f"history:{client_id}",
                )
            ],
        ]
    )


VISA_BUTTON_TO_KEY = {
    "ITAS E33G — 1 год": "E33G",
    "E33G": "E33G",
    "D12 — 1/2 года": "D12",
    "D12": "D12",
    "D1/D2 — 1/2/5 лет": "D1/D2",
    "D1/D2": "D1/D2",
    "C1 — по ситуации": "C1",
    "C1": "C1",
    "VOA — короткий срок": "VOA",
    "eVOA — короткий срок": "VOA",
    "VOA": "VOA",
    "Другая виза": "Другая виза",
}


def personal_account_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🌍 Сменить направление"), KeyboardButton(text="🎁 Мой баланс SAFR Points")],
            [KeyboardButton(text="🔗 Моя ссылка"), KeyboardButton(text="🌐 Моя сеть")],
            [KeyboardButton(text="📦 Мои купленные услуги"), KeyboardButton(text="🛠 Тех. поддержка")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите раздел личного кабинета",
    )


def visa_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="ITAS E33G — 1 год"), KeyboardButton(text="D12 — 1/2 года")],
            [KeyboardButton(text="D1/D2 — 1/2/5 лет"), KeyboardButton(text="C1 — по ситуации")],
            [KeyboardButton(text="eVOA — короткий срок"), KeyboardButton(text="Другая виза")],
            [
                KeyboardButton(text="Задать вопрос по визе"),
                KeyboardButton(text="❓ А если нет всех документов?"),
            ],
            [
                KeyboardButton(text="✍️ Написать менеджеру"),
                KeyboardButton(text="📋 Выйти в меню"),
            ],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите тип визы",
    )


def housing_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Найти виллу"), KeyboardButton(text="Найти гест")],
            [KeyboardButton(text="Купить недвижимость"), KeyboardButton(text="Проверить объект")],
            [KeyboardButton(text="🎥 Видео про жильё"), KeyboardButton(text="⚠️ Риски аренды")],
            [
                KeyboardButton(text="Задать вопрос по жилью"),
                KeyboardButton(text="✍️ Написать менеджеру"),
            ],
            [KeyboardButton(text="📋 Выйти в меню")],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите задачу по жилью",
    )


def currency_exchange_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🧮 Калькулятор USDT → IDR наличные"),
                KeyboardButton(text="🔄 Другой обмен"),
            ],
            [
                KeyboardButton(text="✍️ Написать менеджеру"),
                KeyboardButton(text="📋 Выйти в меню"),
            ],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите тип обмена",
    )


def parse_usdt_amount(text: str | None) -> Decimal | None:
    if not text:
        return None
    normalized = text.strip().replace(" ", "").replace(",", ".")
    try:
        amount = Decimal(normalized)
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount <= 0 or amount > Decimal("1000000000"):
        return None
    return amount


def format_idr(value: Decimal) -> str:
    rounded = value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"Rp {int(rounded):,}".replace(",", ".")


def format_usdt(value: Decimal) -> str:
    return format(value.normalize(), "f")


def calculate_cash_exchange(amount: Decimal, market_rate: Decimal) -> tuple[Decimal, Decimal]:
    cash_rate = (market_rate * Decimal("0.94")).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )
    cash_amount = amount * cash_rate
    return cash_rate, cash_amount


def housing_pages_keyboard(page_index: int, page_count: int) -> InlineKeyboardMarkup:
    if page_index == 0:
        navigation_row = [
            InlineKeyboardButton(
                text=f"1/{page_count}",
                callback_data="housing_page:noop",
            ),
            InlineKeyboardButton(
                text="Далее ➡️",
                callback_data="housing_page:1",
            ),
        ]
    elif page_index == page_count - 1:
        navigation_row = [
            InlineKeyboardButton(
                text="⬅️ Назад",
                callback_data=f"housing_page:{page_index - 1}",
            ),
            InlineKeyboardButton(
                text=f"{page_count}/{page_count}",
                callback_data="housing_page:noop",
            ),
        ]
    else:
        navigation_row = [
            InlineKeyboardButton(
                text="⬅️ Назад",
                callback_data=f"housing_page:{page_index - 1}",
            ),
            InlineKeyboardButton(
                text="Далее ➡️",
                callback_data=f"housing_page:{page_index + 1}",
            ),
        ]

    rows = [navigation_row]
    if 0 < page_index < page_count - 1:
        rows.append(
            [
                InlineKeyboardButton(
                    text=f"{page_index + 1}/{page_count}",
                    callback_data="housing_page:noop",
                )
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                text="🏡 К разделу жилья",
                callback_data="housing_page:menu",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


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
    VISA_CONTEXT_USERS.pop(user_id, None)
    CURRENCY_CALCULATOR_RATES.pop(user_id, None)


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

    section_names = {
        "visa": "Визы",
        "housing": "Жильё",
        "consultation": "Консультация",
        "currency_exchange": "Обмен валюты",
    }
    route_context = {
        "country": "Бали",
        "section": section_names.get(service_type, "Услуги"),
        "service": category,
    }

    admin_text = (
        f"{title}\n\n"
        f"{format_route_context(route_context)}\n\n"
        f"Пользователь: {user.full_name}\n"
        f"Telegram ID: {user.id}\n"
        f"Username: {username}\n\n"
        "Сообщение:\n"
        f"{message.text}"
    )

    if service_type == "visa":
        # Даём визовому агенту доступ к этому клиенту.
        # Это нужно, чтобы он мог нажать ↩️ Ответить и 📚 Показать переписку.
        try:
            grant_visa_client_access(user.id, reason="visa_section")
        except Exception:
            logger.exception("Could not grant visa access to client_id=%s", user.id)

    recipient_chat_ids = get_recipients_for_route(route_context)
    set_client_routing(user.id, route_context, recipient_chat_ids)
    set_dialog_active(user.id, True)
    add_history_item(
        user.id,
        {
            "created_at": message.date.isoformat() if message.date else "",
            "from_role": "client",
            "from_id": user.id,
            "from_name": user.full_name,
            "text": message.text,
        },
    )

    for staff_chat_id in recipient_chat_ids:
        await message.bot.send_message(
            chat_id=staff_chat_id,
            text=admin_text,
            reply_markup=client_actions_keyboard(
                client_id=user.id,
                include_restrict=staff_chat_id == settings.ADMIN_CHAT_ID,
                include_visa_transfer=False,
            ),
        )


@router.message(lambda message: message.text == "💱 Обмен валюты")
async def currency_exchange_handler(message: Message):
    clear_user_context(message.from_user.id)
    set_dialog_active(message.from_user.id, False)
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Обмен валюты",
    )
    await track_activity(message, "currency_exchange_opened", "Обмен валюты")
    await message.answer(
        "💱 Обмен валюты на Бали\n\n"
        "Мы можем помочь с обменом USDT на наличные IDR, а также с другими "
        "направлениями обмена.\n\n"
        "Актуальный курс, доступную сумму и условия уточняйте в боте или у менеджера.",
        reply_markup=currency_exchange_keyboard(),
    )


@router.message(
    lambda message: message.text == "🧮 Калькулятор USDT → IDR наличные"
)
async def currency_calculator_start_handler(message: Message):
    SERVICE_WAITING_USERS.pop(message.from_user.id, None)
    set_dialog_active(message.from_user.id, False)
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Обмен валюты",
        service="USDT → IDR наличные",
    )
    rate = await get_usdt_idr_rate(
        max_age_seconds=CALCULATOR_CACHE_TTL_SECONDS,
    )
    if rate is None:
        await message.answer(
            "⚠️ Сейчас не удалось получить курс Indodax. Попробуйте ещё раз позже "
            "или напишите менеджеру.",
            reply_markup=currency_exchange_keyboard(),
        )
        return

    CURRENCY_CALCULATOR_RATES[message.from_user.id] = rate
    await message.answer(
        "🧮 Калькулятор USDT → IDR наличные\n\n"
        "Напишите, сколько у вас USDT.\n\n"
        "Например: 100 или 250,5\n\n"
        "Расчёт выполняется по актуальному курсу USDT/IDR Indodax минус 6%. "
        "Курс обновляется по запросу не чаще одного раза в сутки.",
        reply_markup=currency_exchange_keyboard(),
    )


@router.message(lambda message: message.text == "🔄 Другой обмен")
async def other_currency_exchange_handler(message: Message):
    CURRENCY_CALCULATOR_RATES.pop(message.from_user.id, None)
    set_dialog_active(message.from_user.id, False)
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Обмен валюты",
        service="Другой обмен",
    )
    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "currency_exchange",
        "category": "Другой обмен",
    }
    sent_message = await message.answer(
        "🔄 Напишите менеджеру, что хотите обменять.\n\n"
        "Укажите валюту, сумму и что хотите получить — например, RUB → IDR "
        "или наличные IDR → USDT.",
        reply_markup=currency_exchange_keyboard(),
    )
    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(
    lambda message: (
        message.from_user
        and message.from_user.id in CURRENCY_CALCULATOR_RATES
    )
)
async def currency_calculator_amount_handler(message: Message):
    if is_known_button_text(message.text):
        CURRENCY_CALCULATOR_RATES.pop(message.from_user.id, None)
        raise SkipHandler

    amount = parse_usdt_amount(message.text)
    if amount is None:
        await message.answer(
            "Введите положительное число — например: 100 или 250,5.",
            reply_markup=currency_exchange_keyboard(),
        )
        return

    market_rate = CURRENCY_CALCULATOR_RATES.pop(message.from_user.id)
    cash_rate, cash_amount = calculate_cash_exchange(amount, market_rate)
    await track_activity(
        message,
        "currency_exchange_calculated",
        "USDT → IDR наличные",
        notify_admin=False,
    )
    await message.answer(
        "💵 Предварительный расчёт\n\n"
        f"Сумма: {format_usdt(amount)} USDT\n"
        f"Курс Indodax: 1 USDT = {format_idr(market_rate)}\n"
        f"Курс к выдаче −6%: 1 USDT = {format_idr(cash_rate)}\n\n"
        f"К выдаче наличными: {format_idr(cash_amount)}\n\n"
        "Итоговый курс и наличие нужной суммы подтвердит менеджер перед обменом.",
        reply_markup=currency_exchange_keyboard(),
    )


@router.message(lambda message: message.text in ["🛂 Сделать визу", "🛂 Визы"])
async def visa_handler(message: Message):
    set_route_context(message.from_user.id, country="Бали", section="Визы")
    await track_activity(message, "menu_click", "Сделать визу")
    await message.answer(
        get_text("visa"),
        reply_markup=visa_keyboard(),
    )


@router.message(lambda message: message.text in ["🏡 Найти жильё", "🏡 Жильё", "🏡 Найти виллу / жильё"])
async def housing_handler(message: Message):
    set_route_context(message.from_user.id, country="Бали", section="Жильё")
    await track_activity(message, "menu_click", "Найти жильё")

    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "housing",
        "category": "Общий вопрос по жилью",
    }

    sent_message = await message.answer(
        get_text("housing") + "\n\n"
        "Можете сразу написать следующим сообщением, что именно ищете: "
        "срок, район, бюджет, количество спален и даты заезда.",
        reply_markup=housing_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(lambda message: message.text in VISA_BUTTON_TO_KEY)
async def visa_category_handler(message: Message):
    visa_key = VISA_BUTTON_TO_KEY[message.text]
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Визы",
        service=visa_key,
    )

    await track_activity(message, "visa_card_opened", f"Виза: {visa_key}")

    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "visa",
        "category": visa_key,
    }
    VISA_CONTEXT_USERS[message.from_user.id] = visa_key

    usdt_idr_rate = await get_usdt_idr_rate()

    sent_message = await message.answer(
        get_visa_card(visa_key, usdt_idr_rate),
        reply_markup=visa_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(lambda message: message.text == "Задать вопрос по визе")
async def visa_question_handler(message: Message):
    set_route_context(message.from_user.id, country="Бали", section="Визы")
    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "visa",
        "category": "Общий вопрос по визе",
    }

    sent_message = await message.answer(
        "🛂 Опишите ваш вопрос по визе следующим сообщением.\n\n"
        "Например:\n"
        "— какая виза нужна\n"
        "— на какой срок\n"
        "— где вы сейчас находитесь\n"
        "— есть ли действующая виза\n\n"
        "Ваше сообщение уйдёт визовому админу и главному админу с пометкой «Вопрос по визе».",
        reply_markup=visa_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.message(
    lambda message: message.text in {"Найти виллу", "🏡 Поиск жилья на Бали"}
)
async def housing_service_info_handler(message: Message):
    set_dialog_active(message.from_user.id, False)
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Жильё",
        service="Индивидуальный поиск виллы",
    )
    await track_activity(
        message,
        "housing_info_opened",
        "Индивидуальный поиск виллы на Бали",
    )

    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "housing",
        "category": "Индивидуальный поиск виллы на Бали",
    }

    pages = get_housing_pages("search_housing")
    sent_message = await message.answer(
        pages[0],
        reply_markup=housing_pages_keyboard(0, len(pages)),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


@router.callback_query(F.data.startswith("housing_page:"))
async def housing_page_handler(callback: CallbackQuery):
    action = callback.data.split(":", 1)[1]

    if action == "noop":
        await callback.answer()
        return

    if action == "menu":
        await callback.message.answer(
            "🏡 Раздел жилья:",
            reply_markup=housing_keyboard(),
        )
        await callback.answer()
        return

    pages = get_housing_pages("search_housing")
    page_index = int(action)
    if not 0 <= page_index < len(pages):
        await callback.answer("Страница не найдена", show_alert=True)
        return

    await callback.message.edit_text(
        pages[page_index],
        reply_markup=housing_pages_keyboard(page_index, len(pages)),
    )
    await callback.answer()


@router.message(lambda message: message.text == "🎥 Видео про жильё")
async def housing_videos_handler(message: Message):
    await track_activity(message, "housing_videos_opened", "Видео про жильё")

    await message.answer(
        get_housing_card("videos"),
        reply_markup=housing_keyboard(),
    )


@router.message(lambda message: message.text == "⚠️ Риски аренды")
async def housing_risks_handler(message: Message):
    await track_activity(message, "housing_risks_opened", "Риски аренды")

    await message.answer(
        get_housing_card("risks"),
        reply_markup=housing_keyboard(),
    )


@router.message(lambda message: message.text in ["Найти гест", "Купить недвижимость", "Проверить объект", "Задать вопрос по жилью"])
async def housing_category_handler(message: Message):
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Жильё",
        service=message.text,
    )
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


@router.message(lambda message: message.text == "❓ А если нет всех документов?")
async def visa_missing_documents_handler(message: Message):
    selected_visa = VISA_CONTEXT_USERS.get(message.from_user.id, "не выбрана")
    set_route_context(
        message.from_user.id,
        country="Бали",
        section="Визы",
        service=f"Нет документов / {selected_visa}",
    )

    SERVICE_WAITING_USERS[message.from_user.id] = {
        "service_type": "visa",
        "category": f"Нет всех документов / {selected_visa}",
    }

    sent_message = await message.answer(
        "❓ Если у вас нет всех документов — это не всегда проблема.\n\n"
        "Мы поможем разобраться, какие документы обязательны именно в вашей ситуации, "
        "что можно подготовить, а где есть альтернативные варианты.\n\n"
        "По некоторым требованиям мы можем подсказать решение или помочь с оформлением.\n\n"
        "Напишите следующим сообщением, каких документов у вас нет или в чём сомнение. "
        "Менеджер по визам посмотрит ситуацию и подскажет, как лучше действовать.",
        reply_markup=visa_keyboard(),
    )

    SERVICE_PROMPT_MESSAGES[message.from_user.id] = sent_message.message_id


def is_service_menu_button(text: str | None) -> bool:
    return is_known_button_text(text)


@router.message(lambda message: message.from_user and message.from_user.id in SERVICE_WAITING_USERS)
async def service_question_message_handler(message: Message):
    if is_service_menu_button(message.text):
        SERVICE_WAITING_USERS.pop(message.from_user.id, None)

        await delete_last_service_prompt(message)
        raise SkipHandler

    service_context = SERVICE_WAITING_USERS.pop(message.from_user.id)

    await delete_last_service_prompt(message)

    await track_activity(
        message,
        "service_question_sent",
        f"{service_context['service_type']} / {service_context['category']}",
        notify_admin=False,
    )

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
    # Старые Telegram-клавиатуры могут оставаться у пользователя после релиза.
    # Перенаправляем устаревшую кнопку в новый раздел вместо старой консультации.
    await currency_exchange_handler(message)


@router.message(lambda message: message.text in ["🌴 Заказать тревел-ассистента", "🌴 Мой тревел-ассистент"])
async def travel_assistant_handler(message: Message):
    await message.answer(get_text("travel_assistant"))


@router.message(lambda message: message.text == "👤 Мой личный кабинет")
async def personal_account_handler(message: Message):
    await track_activity(message, "menu_click", "Мой личный кабинет")
    await message.answer(
        get_text("global_personal_account"),
        reply_markup=personal_account_keyboard(),
    )


@router.message(lambda message: message.text in ["📋 Обратно в меню", "📋 Выйти в меню"])
async def back_to_menu_handler(message: Message):
    TECH_SUPPORT_WAITING_USERS.discard(message.from_user.id)
    SERVICE_WAITING_USERS.pop(message.from_user.id, None)
    VISA_CONTEXT_USERS.pop(message.from_user.id, None)

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

    referral_code = get_or_create_referral_code(message.from_user.id)
    referral_link = f"https://t.me/{username}?start={referral_code}"

    text = (
        "🔗 Ваша персональная ссылка\n\n"
        f"{referral_link}\n\n"
        "Зачем она нужна:\n"
        "— вы отправляете ссылку человеку, которому могут быть полезны услуги SAFR\n"
        "— человек запускает бота по вашей ссылке\n"
        "— он закрепляется в вашей сети\n"
        "— после подтверждённой покупки услуги в любом направлении "
        "вы сможете получать SAFR Points\n\n"
        "Привязка действует на весь бот: Бали, Таиланд, Россия, Непал "
        "и будущие направления.\n\n"
        "Важно: связь с пригласившим закрепляется один раз. "
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
