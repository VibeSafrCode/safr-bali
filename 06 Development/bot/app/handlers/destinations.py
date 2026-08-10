from __future__ import annotations

from aiogram import Router
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup

from app.handlers.menu import clear_user_context
from app.keyboards.main_menu import (
    MINI_APP_BUTTON_TEXT,
    main_menu_keyboard,
    mini_app_button,
    mini_app_launch_keyboard,
)
from app.services.activity import track_activity
from app.services.routing import set_route_context
from app.services.i18n import button_key, button_text, text


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
    "chelyabinsk": "ural",
    "ural": "ural",
    "caucasus": "caucasus",
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
    "🏄 SUP-тур — Урал": "SUP-туры на Урале",
    "🛶 Сплав — Урал": "Сплавы на Урале",
    "🔥 Посиделки у костра — Урал": "Посиделки у костра на Урале",
    "🧘 Организовать ретрит — Урал": "Организация ретрита на Урале",
    "🏔 Трекинг на Кайлас": "Трекинг на Кайлас",
    "🏔 Трекинг к Эвересту": "Трекинг к Эвересту",
    "⛰ Хребет Аннапурна": "Трекинг по хребту Аннапурна",
    "🚐 Трансфер — Непал": "Трансфер в Непале",
    "🏡 Жильё — Непал": "Жильё в Непале",
    "🧭 Гид — Непал": "Услуги гида в Непале",
}

SERVICE_ROUTE_CONTEXTS = {
    "💱 Обмен — Таиланд": {"country": "Таиланд", "section": "Обмен"},
    "🛂 Визы — Таиланд": {"country": "Таиланд", "section": "Визы"},
    "🏠 Недвижимость — Таиланд": {"country": "Таиланд", "section": "Недвижимость"},
    "⛵ Яхты — Таиланд": {"country": "Таиланд", "section": "Яхты"},
    "🏄 SUP-туры — Петербург": {"country": "Россия", "city": "Санкт-Петербург", "section": "Туры", "service": "SUP-туры"},
    "🚤 Прогулка на катере — Петербург": {"country": "Россия", "city": "Санкт-Петербург", "section": "Туры", "service": "Прогулка на катере"},
    "🔥 Посиделки у костра — Петербург": {"country": "Россия", "city": "Санкт-Петербург", "section": "Туры", "service": "Посиделки у костра"},
    "🏄 SUP-тур — Челябинск": {"country": "Россия", "city": "Челябинск", "section": "Туры", "service": "SUP-тур"},
    "🛶 Сплав — Челябинск": {"country": "Россия", "city": "Челябинск", "section": "Туры", "service": "Сплав"},
    "🔥 Посиделки у костра — Челябинск": {"country": "Россия", "city": "Челябинск", "section": "Туры", "service": "Посиделки у костра"},
    "🧘 Организовать ретрит — Челябинск": {"country": "Россия", "city": "Челябинск", "section": "Ретриты", "service": "Организовать ретрит"},
    "🏄 SUP-тур — Урал": {"country": "Россия", "region": "Урал", "section": "Туры", "service": "SUP-тур"},
    "🛶 Сплав — Урал": {"country": "Россия", "region": "Урал", "section": "Туры", "service": "Сплав"},
    "🔥 Посиделки у костра — Урал": {"country": "Россия", "region": "Урал", "section": "Туры", "service": "Посиделки у костра"},
    "🧘 Организовать ретрит — Урал": {"country": "Россия", "region": "Урал", "section": "Ретриты", "service": "Организовать ретрит"},
    "🏔 Трекинг на Кайлас": {"country": "Непал", "section": "Трекинг", "service": "Кайлас"},
    "🏔 Трекинг к Эвересту": {"country": "Непал", "section": "Трекинг", "service": "Эверест"},
    "⛰ Хребет Аннапурна": {"country": "Непал", "section": "Трекинг", "service": "Хребет Аннапурна"},
    "🚐 Трансфер — Непал": {"country": "Непал", "section": "Трансфер"},
    "🏡 Жильё — Непал": {"country": "Непал", "section": "Жильё"},
    "🧭 Гид — Непал": {"country": "Непал", "section": "Гид"},
}

COMING_SOON_TRANSLATION_KEYS = {
    "button.thailand.exchange": "destination.service.thailandExchange",
    "button.thailand.visas": "destination.service.thailandVisas",
    "button.thailand.realEstate": "destination.service.thailandRealEstate",
    "button.thailand.yachts": "destination.service.thailandYachts",
    "button.russia.spbSup": "destination.service.spbSup",
    "button.russia.spbBoat": "destination.service.spbBoat",
    "button.russia.spbCampfire": "destination.service.spbCampfire",
    "button.russia.chelyabinskSupLegacy": "destination.service.chelyabinskSup",
    "button.russia.chelyabinskRaftingLegacy": "destination.service.chelyabinskRafting",
    "button.russia.chelyabinskCampfireLegacy": "destination.service.chelyabinskCampfire",
    "button.russia.chelyabinskRetreatLegacy": "destination.service.chelyabinskRetreat",
    "button.russia.uralSup": "destination.service.uralSup",
    "button.russia.uralRafting": "destination.service.uralRafting",
    "button.russia.uralCampfire": "destination.service.uralCampfire",
    "button.russia.uralRetreat": "destination.service.uralRetreat",
    "button.nepal.kailash": "destination.service.kailash",
    "button.nepal.everest": "destination.service.everest",
    "button.nepal.annapurna": "destination.service.annapurna",
    "button.nepal.transfer": "destination.service.nepalTransfer",
    "button.nepal.housing": "destination.service.nepalHousing",
    "button.nepal.guide": "destination.service.nepalGuide",
}


def _keyboard(rows: list[list[str]], placeholder_key: str) -> ReplyKeyboardMarkup:
    localized_rows = [
        [button_text(key) if (key := button_key(button)) else button for button in row]
        for row in rows
    ]
    app_button = mini_app_button()
    if app_button is None:
        return ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text=button) for button in row]
                for row in localized_rows
            ],
            resize_keyboard=True,
            input_field_placeholder=text(placeholder_key),
        )

    prepared_rows: list[list[KeyboardButton]] = []
    has_change_destination = False
    for row in localized_rows:
        prepared_row = []
        for button in row:
            if button_key(button) == "button.destination.change":
                has_change_destination = True
                continue
            prepared_row.append(KeyboardButton(text=button))
        if prepared_row:
            prepared_rows.append(prepared_row)

    if has_change_destination:
        navigation_row = [KeyboardButton(text=button_text("button.destination.change"))]
        navigation_row.append(app_button)
        prepared_rows.append(navigation_row)
    else:
        prepared_rows.append([app_button])

    return ReplyKeyboardMarkup(
        keyboard=prepared_rows,
        resize_keyboard=True,
        input_field_placeholder=text(placeholder_key),
    )


def destinations_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🌴 Бали", "🇹🇭 Таиланд"],
            ["🇷🇺 Россия", "🇳🇵 Непал"],
        ],
        "keyboard.destination.placeholder",
    )


def thailand_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["💱 Обмен — Таиланд", "🛂 Визы — Таиланд"],
            ["🏠 Недвижимость — Таиланд", "⛵ Яхты — Таиланд"],
            ["✍️ Написать менеджеру", "👤 Мой личный кабинет"],
            ["🌍 Сменить направление"],
        ],
        "keyboard.thailand.placeholder",
    )


def russia_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🌉 Санкт-Петербург", "⛰ Урал"],
            ["🏔 Кавказ", "✍️ Написать менеджеру"],
            ["👤 Мой личный кабинет", "🌍 Сменить направление"],
        ],
        "keyboard.russia.placeholder",
    )


def spb_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏄 SUP-туры — Петербург", "🚤 Прогулка на катере — Петербург"],
            ["🔥 Посиделки у костра — Петербург", "✍️ Написать менеджеру"],
            ["↩️ Назад к городам России", "🌍 Сменить направление"],
        ],
        "keyboard.spb.placeholder",
    )


def ural_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏄 SUP-тур — Урал", "🛶 Сплав — Урал"],
            ["🔥 Посиделки у костра — Урал", "🧘 Организовать ретрит — Урал"],
            ["✍️ Написать менеджеру", "↩️ Назад к России"],
            ["🌍 Сменить направление"],
        ],
        "keyboard.ural.placeholder",
    )


def chelyabinsk_keyboard() -> ReplyKeyboardMarkup:
    """Legacy alias for old imports and Telegram keyboards."""
    return ural_keyboard()


def caucasus_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["✍️ Написать менеджеру", "↩️ Назад к России"],
            ["🌍 Сменить направление"],
        ],
        "keyboard.caucasus.placeholder",
    )


def nepal_keyboard() -> ReplyKeyboardMarkup:
    return _keyboard(
        [
            ["🏔 Трекинг на Кайлас", "🏔 Трекинг к Эвересту"],
            ["⛰ Хребет Аннапурна", "🧭 Гид — Непал"],
            ["🚐 Трансфер — Непал", "🏡 Жильё — Непал"],
            ["✍️ Написать менеджеру", "👤 Мой личный кабинет"],
            ["🌍 Сменить направление"],
        ],
        "keyboard.nepal.placeholder",
    )


async def show_destinations(message: Message) -> None:
    clear_user_context(message.from_user.id)
    await message.answer(
        text("destination.choose"),
        reply_markup=destinations_keyboard(),
    )


async def show_destination(message: Message, destination: str) -> bool:
    clear_user_context(message.from_user.id)

    screens = {
        "bali": (
            text("destination.screen.bali"),
            main_menu_keyboard(),
        ),
        "thailand": (
            text("destination.screen.thailand"),
            thailand_keyboard(),
        ),
        "russia": (
            text("destination.screen.russia"),
            russia_keyboard(),
        ),
        "spb": (
            text("destination.screen.spb"),
            spb_keyboard(),
        ),
        "ural": (
            text("destination.screen.ural"),
            ural_keyboard(),
        ),
        "caucasus": (
            text("destination.screen.caucasus"),
            caucasus_keyboard(),
        ),
        "nepal": (
            text("destination.screen.nepal"),
            nepal_keyboard(),
        ),
    }

    screen = screens.get(destination)
    if not screen:
        return False

    screen_text, reply_markup = screen
    route_contexts = {
        "bali": {"country": "Бали"},
        "thailand": {"country": "Таиланд"},
        "russia": {"country": "Россия"},
        "spb": {"country": "Россия", "city": "Санкт-Петербург", "section": "Туры"},
        "ural": {"country": "Россия", "region": "Урал", "section": "Туры"},
        "caucasus": {"country": "Россия", "region": "Кавказ"},
        "nepal": {"country": "Непал"},
    }
    set_route_context(message.from_user.id, **route_contexts[destination])
    await message.answer(screen_text, reply_markup=reply_markup)
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


@router.message(
    lambda message: button_key(message.text) in {"button.app.menu", "button.app.open"}
)
async def mini_app_menu_handler(message: Message):
    launch_keyboard = mini_app_launch_keyboard()
    if launch_keyboard is None:
        await message.answer(
            text("app.unavailable")
        )
        return
    await message.answer(
        text("app.openPrompt"),
        reply_markup=launch_keyboard,
    )


@router.message(lambda message: button_key(message.text) == "button.destination.change")
async def change_destination_handler(message: Message):
    await show_destinations(message)


@router.message(lambda message: button_key(message.text) in {
    "button.destination.bali",
    "button.destination.thailand",
    "button.destination.russia",
    "button.destination.nepal",
})
async def destination_handler(message: Message):
    destinations = {
        "button.destination.bali": "bali",
        "button.destination.thailand": "thailand",
        "button.destination.russia": "russia",
        "button.destination.nepal": "nepal",
    }
    await show_destination(message, destinations[button_key(message.text)])


@router.message(lambda message: button_key(message.text) == "button.destination.spb")
async def spb_handler(message: Message):
    await show_destination(message, "spb")


@router.message(lambda message: button_key(message.text) in {"button.destination.ural", "button.destination.chelyabinskLegacy"})
async def ural_handler(message: Message):
    await show_destination(message, "ural")


@router.message(lambda message: button_key(message.text) == "button.destination.caucasus")
async def caucasus_handler(message: Message):
    await show_destination(message, "caucasus")


@router.message(
    lambda message: button_key(message.text) in {"button.destination.backToRussia", "button.destination.backToRussianCitiesLegacy"}
)
async def back_to_russia_handler(message: Message):
    await show_destination(message, "russia")


@router.message(lambda message: button_key(message.text) in COMING_SOON_TRANSLATION_KEYS)
async def coming_soon_handler(message: Message):
    clear_user_context(message.from_user.id)
    action_key = button_key(message.text)
    canonical_button = button_text(action_key, locale="ru")
    service_name = text(COMING_SOON_TRANSLATION_KEYS[action_key])
    route_context = SERVICE_ROUTE_CONTEXTS[canonical_button]
    set_route_context(message.from_user.id, **route_context)
    await track_activity(
        message,
        "coming_soon_service_opened",
        service_name,
        notify_admin=False,
    )
    is_spb = route_context.get("city") == "Санкт-Петербург"
    consultation_text = (
        text("destination.comingSoon.guide")
        if is_spb
        else text("destination.comingSoon.manager")
    )
    if is_spb:
        reply_markup = spb_keyboard()
    elif route_context.get("region") == "Урал" or route_context.get("city") == "Челябинск":
        reply_markup = ural_keyboard()
    elif route_context.get("country") == "Таиланд":
        reply_markup = thailand_keyboard()
    else:
        reply_markup = nepal_keyboard()

    await message.answer(
        text(
            "destination.comingSoon.message",
            variables={
                "serviceName": service_name,
                "consultationText": consultation_text,
            },
        ),
        reply_markup=reply_markup,
    )
