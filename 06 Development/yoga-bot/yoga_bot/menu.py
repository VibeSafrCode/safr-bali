from dataclasses import dataclass
from .config import RuntimeConfigError, YOGA_PREVIEW_SITE_BASE, start_payload


COPY = {
    "welcome": {"ru": "Выберите язык и нужную услугу.", "en": "Choose your language and service."},
    "services": {"ru": "Страницы услуг. Актуальные условия и цены смотрите на сайте.", "en": "Service pages. See the website for current terms and prices."},
    "website": {"ru": "Открыть сайт", "en": "Open website"},
    "service_menu": {"ru": "Услуги", "en": "Services"},
    "manager": {"ru": "Связаться с менеджером", "en": "Contact manager"},
    "account": {"ru": "Мой личный кабинет", "en": "My account"},
    "mini_app": {"ru": "Открыть Mini App", "en": "Open Mini App"},
    "account_unavailable": {"ru": "Аккаунт недоступен. Обратитесь к команде поддержки.", "en": "This account is unavailable. Please contact support."},
    "handoff": {"ru": "Кнопка откроет бот команды для обращения.", "en": "The button opens the team's bot."},
    "help": {"ru": "Этот бот открывает страницы услуг. Не отправляйте сюда документы, паспортные данные и оплату. Для обращения используйте кнопку команды.", "en": "This bot opens service pages. Do not send documents, passport data or payments here. Use the team button to contact us."},
    "website_help": {"ru": "Этот бот открывает сайт. Не отправляйте сюда документы, паспортные данные и оплату. Контакты команды доступны на сайте.", "en": "This bot opens the website. Do not send documents, passport data or payments here. Team contacts are available on the website."},
    "referral": {"ru": "Реферальная связь учитывается в общей системе. Прежний пригласивший сохраняется.", "en": "Referrals are recorded in the shared system. Existing inviter relationships are preserved."},
    "invalid_start": {"ru": "Параметр ссылки не принят. Откройте меню без него.", "en": "The link parameter was not accepted. Open the menu without it."},
    "menu": {"ru": "Выберите действие в меню. Сообщение не передано менеджеру.", "en": "Choose an action from the menu. Your message was not forwarded to a manager."},
    "language": {"ru": "Выберите язык / Choose your language", "en": "Choose your language / Выберите язык"},
    "not_connected": {"ru": "Кабинет и заявки здесь ещё не подключены. Используйте кнопку связи с командой.", "en": "Accounts and requests are not connected here yet. Use the team contact button."},
    "website_not_connected": {"ru": "Кабинет и начисления здесь пока недоступны. Контакты команды — на сайте.", "en": "Accounts and rewards are not available here yet. Team contacts are on the website."},
    "wait": {"ru": "Подождите немного и нажмите снова.", "en": "Please wait a moment and tap again."},
    "intake_welcome": {"ru": "Напишите вопрос нашей команде. Ответ придёт в этот чат. Поддерживаются русский и английский.", "en": "Send your question to our team. The reply will arrive in this chat. Russian and English are supported."},
    "intake_help": {"ru": "Напишите вопрос обычным текстом (до 4000 символов). Голосовые сообщения, фото и документы пока не передаются. Ответ команды придёт в этот чат.", "en": "Send your question as text (up to 4000 characters). Voice messages, photos and documents are not forwarded yet. The team's reply will arrive in this chat."},
    "intake_saved": {"ru": "✅ Обращение сохранено. Ответ команды придёт в этот чат.", "en": "✅ Your inquiry was saved. The team's reply will arrive in this chat."},
    "intake_prompt": {"ru": "Напишите вопрос обычным текстом. Ответ команды придёт в этот чат.", "en": "Send your question as text. The team's reply will arrive in this chat."},
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
    web_app_url: str | None = None


@dataclass(frozen=True)
class Reply:
    text: str
    buttons: tuple[tuple[Button, ...], ...]


def locale_for(code):
    return "ru" if isinstance(code, str) and code.lower().split("-")[0] == "ru" else "en"


class Menus:
    def __init__(self, settings, services):
        self.settings, self.services = settings, services

    @property
    def public_origin(self):
        return "https://safrway.online" if self.settings.mode == "shared_intake" else self.settings.origin

    def _service_url(self, service, locale):
        route = service.route(locale)
        # The website deliberately omits exchange. Validate its exact identity,
        # but expose the existing Yoga Mini App (or manager topic), not Main.
        if self.public_origin == YOGA_PREVIEW_SITE_BASE and service.content_id == "exchange":
            expected = "/bali/exchange/" if locale == "ru" else "/en/bali/exchange/"
            if route != expected:
                raise RuntimeConfigError("exchange_route_drift")
        return self.public_origin + route

    def _service_button(self, service, locale, label=None):
        from .presentation import display_copy
        url = self._service_url(service, locale)
        label = display_copy(label or service.label(locale), neutral=self.settings.mode == "shared_intake")
        if self.public_origin == YOGA_PREVIEW_SITE_BASE and service.content_id == "exchange":
            if self.settings.mini_app_url:
                return Button(label, web_app_url=self.settings.mini_app_url + "#/services/bali/exchange/usdt-idr")
            return Button(label, callback="topic:exchange")
        return Button(label, url=url)

    def home(self, locale, message="welcome"):
        if self.settings.mode == "shared_intake":
            message = {"welcome": "intake_welcome", "help": "intake_help", "handoff": "intake_prompt", "not_connected": "intake_not_connected"}.get(message, message)
        if self.settings.mode == "welcome_links":
            message = {"help": "website_help", "not_connected": "website_not_connected"}.get(message, message)
        path = "/" if locale == "ru" else "/en/"
        rows = [(Button(text("website", locale), url=self.settings.origin + path),)]
        if self.settings.mode == "shared_intake":
            rows = [()]
        if self.settings.mode in {"service_links", "shared_intake"}:
            rows[0] += (Button(text("service_menu", locale), callback="categories"),)
            manager = (Button(text("manager", locale), callback="contact") if self.settings.mode == "shared_intake" else
                       Button(text("manager", locale), url="https://t.me/" + self.settings.manager_username))
            rows.append((Button(text("account", locale), callback="account"), manager))
        language = Button("Язык / Language", callback="language")
        if self.settings.mini_app_url and self.settings.mode != "shared_intake":
            rows.append((Button(text("mini_app", locale), web_app_url=self.settings.mini_app_url), language))
        else:
            rows.append((language,))
        if self.settings.mode == "shared_intake" and getattr(self.settings, 'team_whatsapp_url', None):
            rows.append((Button("WhatsApp команды" if locale == "ru" else "Team WhatsApp",
                                url=self.settings.team_whatsapp_url),))
        if self.settings.mode == "shared_intake" and self.settings.account_enabled and message in {"intake_help", "intake_welcome"}:
            body = ("Выберите услугу или напишите вопрос нашей команде. Ответ придёт в этот чат."
                    if locale == "ru" else "Choose a service or send your question to our team. The reply will arrive in this chat.")
        else:
            body = text(message, locale)
        return Reply(body, tuple(rows))

    def language(self, locale, initial=False):
        rows = ((Button("Русский", callback="lang:ru"), Button("English", callback="lang:en")),)
        return Reply(text("language", locale), rows) if initial else self.child(locale, text("language", locale), rows)

    def child(self, locale, body, rows=(), back="home"):
        return Reply(body, ((Button("← Назад" if locale == "ru" else "← Back", callback=back),),)
                     + tuple(rows) + ((Button("Меню" if locale == "ru" else "Menu", callback="home"),),))

    def contact(self, locale):
        return self.child(locale, text("intake_prompt" if self.settings.mode == "shared_intake" else "handoff", locale))

    def categories(self, locale):
        if self.settings.mode not in {"service_links", "shared_intake"}:
            return self.home(locale)
        definitions = (
            ("visas_bali", "Визы на Бали", "Bali visas", None),
            (None, "Визы в Таиланд", "Thailand visas", "/thailand/visas/"),
            ("assistant", "Travel assistant", "Travel assistant", None),
            ("housing", "Недвижимость", "Property", None),
            ("bikes", "Байки", "Bikes", None),
            ("insurance", "Страховка", "Insurance", None),
            ("guides", "Гайды", "Guides", None),
            ("exchange", "Обмен", "Exchange", None),
        )
        services = {s.content_id: s for s in self.services}
        buttons = []
        for cid, ru, en, legacy_route in definitions:
            label = ru if locale == "ru" else en
            if cid == "visas_bali":
                buttons.append(Button(label, callback="visas:bali"))
            elif legacy_route == "/thailand/visas/":
                buttons.append(Button(label, callback="visas:thailand"))
            elif cid in services:
                buttons.append(self._service_button(services[cid], locale, label))
            else:
                # Missing publication is not a fabricated page. Use the existing
                # Registry topic for the manager, without granting identity/ACL.
                buttons.append(Button(label, callback="topic:" + cid))
        return self.child(locale, "Выберите услугу." if locale == "ru" else "Choose a service.", tuple(tuple(buttons[i:i+2]) for i in range(0, len(buttons), 2)))

    def start(self, locale, payload):
        try:
            payload = start_payload(payload)
        except ValueError:
            selector = self.language(locale, initial=True)
            return Reply(text("invalid_start", locale) + "\n\n" + selector.text, selector.buttons)
        # This menu never assigns attribution. The runtime may separately
        # resolve an approved svc_ content ID as question context only.
        return self.language(locale, initial=True)

    def page(self, locale, number):
        if self.settings.mode not in {"service_links", "shared_intake"} or type(number) is not int or number < 0:
            return self.home(locale)
        start = number * 8
        if start >= len(self.services):
            return self.home(locale)
        buttons = [self._service_button(s, locale) for s in self.services[start:start + 8]]
        rows = [tuple(buttons[i:i+2]) for i in range(0, len(buttons), 2)]
        navigation = []
        if number:
            navigation.append(Button("← Назад" if locale == "ru" else "← Back", callback="services:" + str(number - 1)))
        if start + 8 < len(self.services):
            navigation.append(Button("Далее →" if locale == "ru" else "Next →", callback="services:" + str(number + 1)))
        if navigation:
            rows.insert(0, tuple(navigation))
        rows.append((Button("Меню" if locale == "ru" else "Menu", callback="home"),))
        page = "Страница" if locale == "ru" else "Page"
        return Reply(text("services", locale) + "\n\n" + page + " " + str(number + 1) + "/" + str((len(self.services) + 7) // 8), tuple(rows))
