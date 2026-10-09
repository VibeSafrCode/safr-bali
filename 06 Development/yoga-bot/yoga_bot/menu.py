from dataclasses import dataclass
from .config import start_payload


COPY = {
    "welcome": {"ru": "Yoga Ganster — часть SAFRWAY. Выберите язык и откройте нужную услугу на сайте.", "en": "Yoga Ganster is part of SAFRWAY. Choose your language and open a service on the website."},
    "services": {"ru": "Страницы услуг SAFRWAY. Актуальные условия и цены смотрите на сайте.", "en": "SAFRWAY service pages. See the website for current terms and prices."},
    "website": {"ru": "Открыть сайт", "en": "Open website"},
    "service_menu": {"ru": "Услуги", "en": "Services"},
    "manager": {"ru": "Связаться с командой SAFRWAY", "en": "Contact the SAFRWAY team"},
    "handoff": {"ru": "Кнопка откроет действующий бот SAFRWAY для обращения к команде. В Yoga-боте заявка не создаётся.", "en": "The button opens the existing SAFRWAY bot to contact the team. No request is created in the Yoga bot."},
    "help": {"ru": "Этот бот открывает страницы услуг. Не отправляйте сюда документы, паспортные данные и оплату. Для обращения используйте кнопку команды.", "en": "This bot opens service pages. Do not send documents, passport data or payments here. Use the team button to contact us."},
    "website_help": {"ru": "Этот бот открывает сайт. Не отправляйте сюда документы, паспортные данные и оплату. Контакты команды доступны на сайте.", "en": "This bot opens the website. Do not send documents, passport data or payments here. Team contacts are available on the website."},
    "referral": {"ru": "Реферальная привязка и начисления в Yoga-боте пока не подключены. Существующая связь с пригласившим не меняется.", "en": "Referral attribution and rewards are not connected in the Yoga bot yet. Existing inviter relationships are unchanged."},
    "invalid_start": {"ru": "Параметр ссылки не принят. Откройте меню без него.", "en": "The link parameter was not accepted. Open the menu without it."},
    "menu": {"ru": "Выберите действие в меню. Сообщение не передано менеджеру.", "en": "Choose an action from the menu. Your message was not forwarded to a manager."},
    "language": {"ru": "Выберите язык / Choose your language", "en": "Choose your language / Выберите язык"},
    "not_connected": {"ru": "Кабинет и заявки здесь ещё не подключены. Для работы с командой откройте SAFRWAY.", "en": "Accounts and requests are not connected here yet. Open SAFRWAY to contact the team."},
    "website_not_connected": {"ru": "Кабинет и начисления здесь пока недоступны. Контакты команды — на сайте.", "en": "Accounts and rewards are not available here yet. Team contacts are on the website."},
    "wait": {"ru": "Подождите немного и нажмите снова.", "en": "Please wait a moment and tap again."},
    "intake_welcome": {"ru": "Yoga Ganster — часть SAFRWAY. Напишите вопрос обычным текстом: обращение получат Михаил и команда SAFRWAY. Поддерживаются русский и английский.", "en": "Yoga Ganster is part of SAFRWAY. Send your question as text: Mikhail and the SAFRWAY team will receive it. Russian and English are supported."},
    "intake_help": {"ru": "Напишите вопрос обычным текстом (до 4000 символов). Голосовые сообщения, фото и документы пока не передаются. Ответ команды придёт сюда. Реферальные начисления и личный кабинет ещё не подключены.", "en": "Send your question as text (up to 4000 characters). Voice messages, photos and documents are not forwarded yet. The team's reply will arrive here. Referral rewards and accounts are not connected yet."},
    "intake_saved": {"ru": "✅ Обращение сохранено. Ответ команды придёт сюда, в Yoga-бот.", "en": "✅ Your inquiry was saved. The team's reply will arrive here in the Yoga bot."},
    "intake_prompt": {"ru": "Напишите вопрос обычным текстом. Он будет сохранён в общем диалоге SAFRWAY с пометкой Yoga Ganster.", "en": "Send your question as text. It will be saved in the shared SAFRWAY conversation marked Yoga Ganster."},
    "intake_not_connected": {"ru": "Личный кабинет и начисления пока не подключены. Для обращения к команде напишите вопрос здесь обычным текстом.", "en": "Accounts and rewards are not connected yet. To contact the team, send your question here as text."},
    "media_unsupported": {"ru": "Сообщение не передано. Голосовые, фото, видео и документы пока не поддерживаются. Напишите вопрос обычным текстом.", "en": "Your message was not forwarded. Voice messages, photos, videos and documents are not supported yet. Send your question as text."},
    "invalid_question": {"ru": "Сообщение не передано. Нужен непустой текст длиной до 4000 символов.", "en": "Your message was not forwarded. Send nonempty text up to 4000 characters."},
    "unknown_command": {"ru": "Команда не распознана. Для обращения напишите вопрос обычным текстом.", "en": "Unknown command. To contact the team, send your question as text."},
}


def text(key, locale):
    return COPY[key][locale]


@dataclass(frozen=True)
class Button:
    label: str
    url: str | None = None
    callback: str | None = None


@dataclass(frozen=True)
class Reply:
    text: str
    buttons: tuple[tuple[Button, ...], ...]


def locale_for(code):
    return "ru" if isinstance(code, str) and code.lower().split("-")[0] == "ru" else "en"


class Menus:
    def __init__(self, settings, services):
        self.settings, self.services = settings, services

    def home(self, locale, message="welcome"):
        if self.settings.mode == "shared_intake":
            message = {"welcome": "intake_welcome", "help": "intake_help", "handoff": "intake_prompt", "not_connected": "intake_not_connected"}.get(message, message)
        if self.settings.mode == "welcome_links":
            message = {"help": "website_help", "not_connected": "website_not_connected"}.get(message, message)
        path = "/" if locale == "ru" else "/en/"
        rows = [(Button(text("website", locale), url=self.settings.origin + path),)]
        if self.settings.mode in {"service_links", "shared_intake"}:
            rows.append((Button(text("service_menu", locale), callback="services:0"),))
            rows.append((Button(text("manager", locale), callback="contact"),) if self.settings.mode == "shared_intake" else
                        (Button(text("manager", locale), url="https://t.me/" + self.settings.manager_username),))
        rows.append((Button("Русский", callback="lang:ru"), Button("English", callback="lang:en")))
        return Reply(text(message, locale), tuple(rows))

    def start(self, locale, payload):
        try:
            payload = start_payload(payload)
        except ValueError:
            return self.home(locale, "invalid_start")
        # This menu never assigns attribution. The runtime may separately
        # resolve an approved svc_ content ID as question context only.
        if payload and payload.startswith(("ref_", "r_")):
            return self.home(locale, "referral")
        return self.home(locale)

    def page(self, locale, number):
        if self.settings.mode not in {"service_links", "shared_intake"} or type(number) is not int or number < 0:
            return self.home(locale)
        start = number * 8
        if start >= len(self.services):
            return self.home(locale)
        rows = [(Button(s.label(locale), url=self.settings.origin + s.route(locale)),) for s in self.services[start:start + 8]]
        navigation = []
        if number:
            navigation.append(Button("← Назад" if locale == "ru" else "← Back", callback="services:" + str(number - 1)))
        if start + 8 < len(self.services):
            navigation.append(Button("Далее →" if locale == "ru" else "Next →", callback="services:" + str(number + 1)))
        if navigation:
            rows.append(tuple(navigation))
        rows.append((Button("Меню" if locale == "ru" else "Menu", callback="home"),))
        page = "Страница" if locale == "ru" else "Page"
        return Reply(text("services", locale) + "\n\n" + page + " " + str(number + 1) + "/" + str((len(self.services) + 7) // 8), tuple(rows))
