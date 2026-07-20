from __future__ import annotations

from aiogram import Router
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.handlers.menu import clear_user_context
from app.keyboards.main_menu import main_menu_keyboard
from app.services.activity import track_activity


router = Router()

DESTINATION_BUTTONS = {
    "🌴 Бали": "bali",
    "🇹🇭 Таиланд": "thailand",
    "🇷🇺 Россия": "russia",
    "🇳🇵 Непал": "nepal",
}

START_DESTINATIONS = {
    "bali": "bali",
    "thailand": "thailand",
    "russia": "russia",
    "spb": "spb",
    "spb_tours": "spb",
    "chelyabinsk": "chelyabinsk",
    "nepal": "nepal",
}

COMING_SOON_SERVICES = {
    "💱 Обмен — Таиланд": "Обмен в Таиланде",
    "🛂 Визы — Таиланд": "Визы в Таиланде",
    "🏠 Недвижимость — Таиланд": "Недвижимость в Таиланде",
    "⛵ Яхты — Таиланд": "Яхты в Таиланде",
    "🏄 SUP-туры — Петербург": "SUP-туры в Петербурге",
    "🚤 Прогулка на катере — Петербург": "Прогулки на катере в Петербурге",
    "🔥 Посиделки у костра — Петербург": "Посиделки у костра в Петербурге",
    "🏄 SUP-тур — Челябинск": "SUP-туры в Челябинске",
    "🛶 Сплав — Челябинск": "Сплавы в Челябинске",
    "🔥 Посиделки у костра — Челябинск": "Посиделки у костра в Челябинске",
    "🧘 Организовать ретрит — Челябинск": "Организация ретрита в Челябинске",
    "🏔 Трекинг на Кайлас": "Трекинг на Кайлас",
    "🏔 Трекинг к Эвересту": "Трекинг к Эвересту",
    "⛰ Хребет Аннапурна": "Трекинг по хребту Аннапурна",
    "🚐 Трансфер — Непал": "Трансфер в Непале",
    "🏡 Жильё — Непал": "Жильё в Непале",
    "🧭 Гид — Непал": "Услуги гида в Непале",
}


def _keyboard(rows: list[list[str]], placeholder: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=button) for button in row]
            for row in rows
        ],
        resize_keyboard=True,
        input_field_placeholder=placeholder,
    )


def destinations_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🌴 Бали", "🇹🇭 Таиланд"],
            ["🇷🇺 Россия", "🇳🇵 Непал"],
        ],
        "Выберите направление",
    )


def thailand_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["💱 Обмен — Таиланд", "🛂 Визы — Таиланд"],
            ["🏠 Недвижимость — Таиланд", "⛵ Яхты — Таиланд"],
            ["👤 Мой личный кабинет"],
            ["🌍 Сменить направление"],
        ],
        "Выберите услугу в Таиланде",
    )


def russia_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🌉 Санкт-Петербург"],
            ["🏔 Челябинск"],
            ["👤 Мой личный кабинет"],
            ["🌍 Сменить направление"],
        ],
        "Выберите город",
    )


def spb_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏄 SUP-туры — Петербург"],
            ["🚤 Прогулка на катере — Петербург"],
            ["🔥 Посиделки у костра — Петербург"],
            ["↩️ Назад к городам России"],
            ["🌍 Сменить направление"],
        ],
        "Выберите услугу в Петербурге",
    )


def chelyabinsk_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏄 SUP-тур — Челябинск", "🛶 Сплав — Челябинск"],
            ["🔥 Посиделки у костра — Челябинск"],
            ["🧘 Организовать ретрит — Челябинск"],
            ["↩️ Назад к городам России"],
            ["🌍 Сменить направление"],
        ],
        "Выберите услугу в Челябинске",
    )


def nepal_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏔 Трекинг на Кайлас", "🏔 Трекинг к Эвересту"],
            ["⛰ Хребет Аннапурна"],
            ["🚐 Трансфер — Непал", "🏡 Жильё — Непал"],
            ["🧭 Гид — Непал"],
            ["👤 Мой личный кабинет"],
            ["🌍 Сменить направление"],
        ],
        "Выберите услугу в Непале",
    )


async def show_destinations(message: Message) -> None:
    clear_user_context(message.from_user.id)
    await message.answer(
        "🌍 Выберите направление, которое вас интересует:",
        reply_markup=destinations_keyboard(),
    )


async def show_destination(message: Message, destination: str) -> bool:
    clear_user_context(message.from_user.id)

    screens = {
        "bali": (
            "🌴 Бали\n\nВыберите нужную услугу:",
            main_menu_keyboard(),
        ),
        "thailand": (
            "🇹🇭 Таиланд\n\nВыберите интересующий раздел:",
            thailand_keyboard(),
        ),
        "russia": (
            "🇷🇺 Россия\n\nВыберите город:",
            russia_keyboard(),
        ),
        "spb": (
            "🌉 Санкт-Петербург\n\nВыберите интересующий формат отдыха:",
            spb_keyboard(),
        ),
        "chelyabinsk": (
            "🏔 Челябинск\n\nВыберите интересующий формат отдыха:",
            chelyabinsk_keyboard(),
        ),
        "nepal": (
            "🇳🇵 Непал\n\nВыберите интересующую услугу:",
            nepal_keyboard(),
        ),
    }

    screen = screens.get(destination)
    if not screen:
        return False

    text, reply_markup = screen
    await message.answer(text, reply_markup=reply_markup)
    await track_activity(
        message,
        "destination_opened",
        destination,
        notify_admin=False,
    )
    return True


async def show_start_destination(message: Message, start_parameter: str | None) -> bool:
    if not start_parameter:
        return False
    destination = START_DESTINATIONS.get(start_parameter.strip().lower())
    return await show_destination(message, destination) if destination else False


@router.message(lambda message: message.text == "🌍 Сменить направление")
async def change_destination_handler(message: Message):
    await show_destinations(message)


@router.message(lambda message: message.text in DESTINATION_BUTTONS)
async def destination_handler(message: Message):
    await show_destination(message, DESTINATION_BUTTONS[message.text])


@router.message(lambda message: message.text == "🌉 Санкт-Петербург")
async def spb_handler(message: Message):
    await show_destination(message, "spb")


@router.message(lambda message: message.text == "🏔 Челябинск")
async def chelyabinsk_handler(message: Message):
    await show_destination(message, "chelyabinsk")


@router.message(lambda message: message.text == "↩️ Назад к городам России")
async def back_to_russia_handler(message: Message):
    await show_destination(message, "russia")


@router.message(lambda message: message.text in COMING_SOON_SERVICES)
async def coming_soon_handler(message: Message):
    clear_user_context(message.from_user.id)
    service_name = COMING_SOON_SERVICES[message.text]
    await track_activity(
        message,
        "coming_soon_service_opened",
        service_name,
        notify_admin=False,
    )
    await message.answer(
        f"🚧 {service_name}\n\n"
        "Скоро здесь появятся услуги. Мы уже готовим информацию и возможность оставить заявку."
    )
