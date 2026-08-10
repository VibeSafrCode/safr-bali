import { defineCorpus } from "./types";

const LOCAL = "LOCAL_SOURCE_CAPTURED" as const;
const TRANSLATED = "TRANSLATED" as const;

function entry(
  ru: string,
  en: string,
  source: string,
  protectedTokens?: readonly string[],
  note?: string,
) {
  return {
    ru,
    en,
    source,
    sourceVerification: LOCAL,
    review: TRANSLATED,
    ...(protectedTokens ? { protectedTokens } : {}),
    ...(note ? { note } : {}),
  };
}

const MINI = "06 Development/react-app/src/surfaces/MiniApp.tsx";
const ACCOUNT = "06 Development/react-app/src/surfaces/AccountApp.tsx";
const SHELL = "06 Development/react-app/src/components/AppShell.tsx";
const NAV = "06 Development/react-app/src/components/BottomNavigation.tsx";
const HOME = "06 Development/react-app/src/components/HomeView.tsx";
const CATALOG = "06 Development/react-app/src/components/CatalogView.tsx";
const GRIDS = "06 Development/react-app/src/components/CatalogGrids.tsx";
const CAROUSEL = "06 Development/react-app/src/components/CountryCarousel.tsx";
const COUNTRY_HEADER = "06 Development/react-app/src/components/CountryHeader.tsx";
const VISA_GRID = "06 Development/react-app/src/components/VisaGrid.tsx";
const MANAGER_CARD = "06 Development/react-app/src/components/ManagerContactCard.tsx";
const PROFILE_STATS = "06 Development/react-app/src/components/ProfileStats.tsx";
const SUPPORT = "06 Development/react-app/src/components/SupportPanel.tsx";
const CALCULATOR = "06 Development/react-app/src/components/CurrencyCalculator.tsx";
const ROUTE_SELECTOR = "06 Development/react-app/src/components/CurrencyRouteSelector.tsx";
const ASSET_WHEEL = "06 Development/react-app/src/components/ExchangeAssetWheel.tsx";
const THEMES = "06 Development/react-app/src/countryThemes.ts";
const API_CLIENT = "06 Development/react-app/src/api/client.ts";
const MINI_HTML = "06 Development/react-app/index.html";
const ACCOUNT_HTML = "06 Development/react-app/account/index.html";

export const MINI_APP_SOURCE_FILES = [
  MINI,
  ACCOUNT,
  SHELL,
  NAV,
  HOME,
  CATALOG,
  GRIDS,
  CAROUSEL,
  COUNTRY_HEADER,
  VISA_GRID,
  MANAGER_CARD,
  PROFILE_STATS,
  SUPPORT,
  CALCULATOR,
  ROUTE_SELECTOR,
  ASSET_WHEEL,
  THEMES,
  API_CLIENT,
  MINI_HTML,
  ACCOUNT_HTML,
] as const;

export const miniAppCorpus = defineCorpus({
  domain: "mini-app-client",
  capturedAt: "2026-08-10",
  entries: {
    "meta.mini.title": entry(
      "SAFRWAY · Mini App",
      "SAFRWAY · Mini App",
      MINI_HTML,
      ["SAFRWAY", "Mini App"],
    ),
    "meta.mini.description": entry(
      "Telegram Mini App SAFRWAY: услуги, заявки и профиль.",
      "SAFRWAY Telegram Mini App: services, requests, and profile.",
      MINI_HTML,
      ["SAFRWAY", "Telegram", "Mini App"],
    ),
    "meta.account.title": entry(
      "SAFRWAY · Личный кабинет",
      "SAFRWAY · Account",
      ACCOUNT_HTML,
      ["SAFRWAY"],
    ),
    "meta.account.description": entry(
      "Личный кабинет SAFRWAY.",
      "SAFRWAY account.",
      ACCOUNT_HTML,
      ["SAFRWAY"],
    ),

    "shell.skipToContent": entry(
      "К основному содержимому",
      "Skip to main content",
      SHELL,
    ),
    "shell.homeAria": entry(
      "SAFRWAY — главная",
      "SAFRWAY — home",
      SHELL,
      ["SAFRWAY"],
    ),
    "shell.profileAria": entry(
      "Открыть профиль: {userName}",
      "Open profile: {userName}",
      SHELL,
      ["{userName}"],
    ),
    "shell.languageAria": entry(
      "Language / Язык",
      "Language",
      SHELL,
    ),
    "shell.language.loading": entry(
      "Меняем язык…",
      "Changing language…",
      SHELL,
    ),
    "shell.language.pendingSync": entry(
      "Язык изменён. Синхронизируем настройку…",
      "Language changed. Syncing your preference…",
      SHELL,
    ),
    "shell.language.success": entry(
      "Язык успешно изменён.",
      "Language changed successfully.",
      SHELL,
    ),
    "shell.language.errorRollback": entry(
      "Не удалось изменить язык. Вернули предыдущий язык.",
      "Could not change the language. The previous language was restored.",
      SHELL,
    ),
    "shell.language.offline": entry(
      "Нет соединения. Язык изменён на этом устройстве; синхронизацию можно повторить.",
      "You are offline. The language changed on this device; synchronization can be retried.",
      SHELL,
    ),
    "shell.language.retry": entry(
      "Повторить синхронизацию",
      "Retry synchronization",
      SHELL,
    ),
    "nav.aria": entry("Разделы Mini App", "Mini App sections", NAV, ["Mini App"]),
    "nav.home": entry("Главная", "Home", NAV),
    "nav.services": entry("Услуги", "Services", NAV),
    "nav.orders": entry("Заявки", "Requests", NAV),
    "nav.profile": entry("Профиль", "Profile", NAV),
    "nav.support": entry("Поддержка", "Support", NAV),

    "mini.loading.title": entry("Загружаем SAFRWAY…", "Loading SAFRWAY…", MINI, ["SAFRWAY"]),
    "mini.loading.detail": entry(
      "Проверяем защищённую сессию.",
      "Checking the secure session.",
      MINI,
    ),
    "mini.outside.title": entry(
      "Не удалось подтвердить запуск",
      "Could not verify the launch",
      MINI,
    ),
    "mini.outside.detail": entry(
      "Закройте это окно и снова нажмите «Меню App» в клавиатуре бота.",
      "Close this window and tap “App Menu” on the bot keyboard again.",
      MINI,
    ),
    "mini.outside.backToBot": entry("Вернуться в бот", "Return to the bot", MINI),
    "mini.error.title": entry(
      "Не удалось открыть приложение",
      "Could not open the app",
      MINI,
    ),
    "mini.action.retry": entry("Повторить", "Try again", MINI),
    "mini.user.traveler": entry("Путешественник", "Traveler", MINI),

    "order.status.new": entry("Новая", "New", MINI),
    "order.status.contacted": entry("Связались", "Contacted", MINI),
    "order.status.waitingPayment": entry("Ожидает оплаты", "Awaiting payment", MINI),
    "order.status.paid": entry("Оплачена", "Paid", MINI),
    "order.status.inProgress": entry("В работе", "In progress", MINI),
    "order.status.completed": entry("Завершена", "Completed", MINI),
    "order.status.cancelled": entry("Отменена", "Cancelled", MINI),
    "orders.eyebrow": entry("Личный кабинет", "Account", MINI),
    "orders.title": entry("Мои заявки", "My requests", MINI),
    "orders.description": entry(
      "Следите за статусом услуг и ответами команды.",
      "Track service statuses and team replies.",
      MINI,
    ),
    "orders.number": entry("Заявка №{id}", "Request #{id}", MINI, ["{id}"]),
    "orders.empty.title": entry("Заявок пока нет", "No requests yet", MINI),
    "orders.empty.detail": entry(
      "Выберите услугу, затем напишите менеджеру.",
      "Choose a service, then message a manager.",
      MINI,
    ),
    "orders.openCatalog": entry("Открыть каталог", "Open catalog", MINI),

    "profile.eyebrow": entry("Профиль", "Profile", MINI),
    "profile.description": entry(
      "Ваши данные, SAFR Points, приглашения и заявки.",
      "Your details, SAFR Points, invitations, and requests.",
      MINI,
      ["SAFR Points"],
    ),
    "profile.username": entry("Имя пользователя", "Username", MINI),
    "profile.notSpecified": entry("Не указано", "Not provided", MINI),
    "profile.referralLink": entry("Реферальная ссылка", "Referral link", MINI),
    "profile.linkUnavailable": entry(
      "Ссылка пока недоступна",
      "The link is not available yet",
      MINI,
    ),
    "profile.copyLink": entry("Скопировать ссылку", "Copy link", MINI),
    "profile.copied": entry("Скопировано", "Copied", MINI),
    "profile.statsAria": entry("Статистика профиля", "Profile statistics", PROFILE_STATS),
    "profile.stats.points": entry("SAFR Points", "SAFR Points", PROFILE_STATS, ["SAFR Points"]),
    "profile.stats.network": entry("Моя сеть", "My network", PROFILE_STATS),
    "profile.stats.orders": entry("Заявки", "Requests", PROFILE_STATS),

    "account.tab.overview": entry("Обзор", "Overview", ACCOUNT),
    "account.tab.points": entry("Points", "Points", ACCOUNT, ["Points"]),
    "account.tab.referrals": entry("Моя сеть", "My network", ACCOUNT),
    "account.tab.orders": entry("Заявки", "Requests", ACCOUNT),
    "account.tab.profile": entry("Профиль", "Profile", ACCOUNT),
    "account.tab.support": entry("Поддержка", "Support", ACCOUNT),
    "account.loading.title": entry(
      "Загружаем личный кабинет…",
      "Loading your account…",
      ACCOUNT,
    ),
    "account.loading.detail": entry(
      "Проверяем защищённую сессию.",
      "Checking the secure session.",
      ACCOUNT,
    ),
    "account.guest.loginTitle": entry("Войдите через Telegram", "Sign in with Telegram", ACCOUNT, ["Telegram"]),
    "account.guest.preparingTitle": entry(
      "Вход через Telegram готовится",
      "Telegram sign-in is being prepared",
      ACCOUNT,
      ["Telegram"],
    ),
    "account.guest.loginDetail": entry(
      "Отдельный пароль не нужен. Telegram подтверждает личность, а login не меняет вашу реферальную связь.",
      "No separate password is required. Telegram verifies your identity, and signing in does not change your referral relationship.",
      ACCOUNT,
      ["Telegram"],
    ),
    "account.guest.preparingDetail": entry(
      "Кабинет уже размещён, но защищённый вход появится после регистрации production callback в Telegram.",
      "The account is already available, but secure sign-in will appear after the production callback is registered with Telegram.",
      ACCOUNT,
      ["Telegram"],
    ),
    "account.guest.loginAction": entry("Войти через Telegram", "Sign in with Telegram", ACCOUNT, ["Telegram"]),
    "account.returnToSite": entry("Вернуться на сайт", "Return to the website", ACCOUNT),
    "account.error.title": entry(
      "Кабинет временно недоступен",
      "The account is temporarily unavailable",
      ACCOUNT,
    ),
    "account.action.retry": entry("Повторить", "Try again", ACCOUNT),
    "account.user.fallback": entry("Пользователь", "User", ACCOUNT),
    "account.logout": entry("Выйти", "Sign out", ACCOUNT),
    "account.sidebar.eyebrow": entry("Личный кабинет", "Account", ACCOUNT),
    "account.sidebar.aria": entry(
      "Разделы личного кабинета",
      "Account sections",
      ACCOUNT,
    ),
    "account.sidebar.openCatalog": entry(
      "Открыть каталог услуг →",
      "Open the service catalog →",
      ACCOUNT,
    ),
    "account.overview.eyebrow": entry("Обзор", "Overview", ACCOUNT),
    "account.overview.greeting": entry(
      "Здравствуйте, {firstName}",
      "Hello, {firstName}",
      ACCOUNT,
      ["{firstName}"],
    ),
    "account.overview.traveler": entry("путешественник", "traveler", ACCOUNT),
    "account.overview.description": entry(
      "Здесь собраны данные из общей базы SAFRWAY.",
      "This page shows data from the shared SAFRWAY database.",
      ACCOUNT,
      ["SAFRWAY"],
    ),
    "account.metric.points": entry("SAFR Points", "SAFR Points", ACCOUNT, ["SAFR Points"]),
    "account.metric.network": entry("Моя сеть", "My network", ACCOUNT),
    "account.metric.orders": entry("Заявки", "Requests", ACCOUNT),
    "account.quick.points.title": entry("Баланс Points", "Points balance", ACCOUNT, ["Points"]),
    "account.quick.points.detail": entry(
      "Посмотреть текущий баланс",
      "View your current balance",
      ACCOUNT,
    ),
    "account.quick.orders.title": entry("Мои заявки", "My requests", ACCOUNT),
    "account.quick.orders.detail": entry(
      "Проверить статусы услуг",
      "Check service statuses",
      ACCOUNT,
    ),
    "account.quick.support.title": entry("Поддержка", "Support", ACCOUNT),
    "account.quick.support.detail": entry(
      "Открыть диалог с менеджером",
      "Open a conversation with a manager",
      ACCOUNT,
    ),
    "account.points.eyebrow": entry("SAFR Points", "SAFR Points", ACCOUNT, ["SAFR Points"]),
    "account.points.heading": entry("{balance} Points", "{balance} Points", ACCOUNT, ["{balance}", "Points"]),
    "account.points.description": entry(
      "Баланс рассчитывает только backend. Frontend не начисляет, не списывает и не пересчитывает Points.",
      "Only the backend calculates the balance. The frontend does not award, deduct, or recalculate Points.",
      ACCOUNT,
      ["Points"],
    ),
    "account.points.useTitle": entry("Как использовать Points", "How to use Points", ACCOUNT, ["Points"]),
    "account.points.useDetail": entry(
      "Возможность оплаты зависит от конкретной услуги. Итоговые условия подтверждает менеджер до оформления.",
      "Whether Points can be used for payment depends on the service. A manager confirms the final terms before processing.",
      ACCOUNT,
    ),
    "account.referrals.eyebrow": entry("Моя сеть", "My network", ACCOUNT),
    "account.referrals.heading": entry(
      "{count} приглашённых",
      "Invited: {count}",
      ACCOUNT,
      ["{count}"],
    ),
    "account.referrals.description": entry(
      "Реферальная связь назначается backend один раз и не меняется при повторном входе.",
      "The backend assigns the referral relationship once, and it does not change when you sign in again.",
      ACCOUNT,
    ),
    "account.referrals.personalLink": entry("Персональная ссылка", "Personal link", ACCOUNT),
    "account.referrals.linkUnavailable": entry(
      "Ссылка пока недоступна",
      "The link is not available yet",
      ACCOUNT,
    ),
    "account.referrals.copy": entry("Скопировать", "Copy", ACCOUNT),
    "account.referrals.copied": entry("Скопировано", "Copied", ACCOUNT),
    "account.orders.eyebrow": entry("Заявки", "Requests", ACCOUNT),
    "account.orders.title": entry("Мои услуги", "My services", ACCOUNT),
    "account.orders.description": entry(
      "Список читается напрямую из backend.",
      "The list is read directly from the backend.",
      ACCOUNT,
    ),
    "account.orders.number": entry("Заявка №{id}", "Request #{id}", ACCOUNT, ["{id}"]),
    "account.orders.empty.title": entry("Заявок пока нет", "No requests yet", ACCOUNT),
    "account.orders.empty.detail": entry(
      "Откройте каталог и выберите нужное направление.",
      "Open the catalog and choose the destination you need.",
      ACCOUNT,
    ),
    "account.orders.openCatalog": entry("Перейти в каталог", "Go to catalog", ACCOUNT),
    "account.profile.eyebrow": entry("Профиль", "Profile", ACCOUNT),
    "account.profile.description": entry(
      "Один профиль используется сайтом, Mini App и ботом.",
      "The website, Mini App, and bot use one shared profile.",
      ACCOUNT,
      ["Mini App"],
    ),
    "account.profile.usernameMissing": entry(
      "Username не указан",
      "Username not provided",
      ACCOUNT,
      ["Username"],
    ),
    "account.profile.telegram": entry("Telegram", "Telegram", ACCOUNT, ["Telegram"]),
    "account.profile.telegramId": entry("Telegram ID", "Telegram ID", ACCOUNT, ["Telegram ID"]),
    "account.status.eyebrow": entry("Единый аккаунт", "Unified account", ACCOUNT),

    "home.heading": entry("Куда вы направляетесь?", "Where are you going?", HOME),
    "home.searchAria": entry(
      "Найти страну по первым буквам",
      "Find a country by its first letters",
      HOME,
    ),
    "home.searchPlaceholder": entry("Найти страну", "Find a country", HOME),
    "home.empty.title": entry("Направление не найдено", "Destination not found", HOME),
    "home.empty.detail": entry(
      "Проверьте первые буквы названия страны.",
      "Check the first letters of the country name.",
      HOME,
    ),
    "home.services.eyebrow": entry("Услуги направления", "Destination services", HOME),
    "home.services.heading": entry(
      "Чем помочь {location}?",
      "How can we help {location}?",
      HOME,
      ["{location}"],
    ),
    "home.openDestinationAria": entry(
      "Открыть раздел: {destination}",
      "Open destination: {destination}",
      HOME,
      ["{destination}"],
    ),
    "home.allServices": entry("Все услуги", "All services", HOME),
    "home.sideRailAria": entry("Помощь и профиль", "Help and profile", HOME),
    "home.openProfile": entry("Открыть профиль", "Open profile", HOME),

    "catalog.eyebrow": entry("Каталог", "Catalog", CATALOG),
    "catalog.allDestinations": entry("Все направления", "All destinations", CATALOG),
    "catalog.description": entry(
      "Каждое направление открывается отдельным экраном внутри Mini App.",
      "Each destination opens on a separate screen inside the Mini App.",
      CATALOG,
      ["Mini App"],
    ),
    "catalog.backAllDestinations": entry("Все направления", "All destinations", CATALOG),
    "catalog.helpHeading": entry("Чем помочь?", "How can we help?", CATALOG),
    "catalog.noServices.title": entry("Активных услуг пока нет", "No active services yet", CATALOG),
    "catalog.noServices.detail": entry(
      "Направление скрыто из общего выбора до появления доступных услуг.",
      "The destination is hidden from the general selection until services become available.",
      CATALOG,
    ),
    "catalog.visaHelpAria": entry("Помощь с визой", "Visa assistance", CATALOG),
    "catalog.visaStart.eyebrow": entry("Как начать", "How to start", CATALOG),
    "catalog.visaStart.title": entry("Выберите подходящую визу", "Choose a suitable visa", CATALOG),
    "catalog.visaStart.detail": entry(
      "Проверьте детали и передайте вопрос менеджеру в защищённом диалоге.",
      "Review the details and send your question to a manager in the secure conversation.",
      CATALOG,
    ),
    "catalog.askQuestion": entry("Задать вопрос", "Ask a question", CATALOG),
    "catalog.soon": entry("Скоро", "Coming soon", `${CATALOG}; ${GRIDS}`),
    "catalog.preparing.title": entry(
      "Услуга готовится к запуску",
      "This service is being prepared for launch",
      CATALOG,
    ),
    "catalog.preparing.detail": entry(
      "Менеджер уже может помочь с подготовкой и ответить на вопросы.",
      "A manager can already help you prepare and answer questions.",
      CATALOG,
    ),
    "catalog.sectionPreparing.title": entry("Раздел готовится", "This section is being prepared", CATALOG),
    "catalog.sectionPreparing.detail": entry(
      "Менеджер уже может помочь по этому направлению.",
      "A manager can already help with this destination.",
      CATALOG,
    ),
    "catalog.writeManager": entry("Написать менеджеру", "Message a manager", CATALOG),
    "catalog.countriesAria": entry("Страны SAFRWAY", "SAFRWAY countries", GRIDS, ["SAFRWAY"]),
    "catalog.servicesAria": entry(
      "Услуги: {destination}",
      "Services: {destination}",
      GRIDS,
      ["{destination}"],
    ),
    "catalog.destinationsAria": entry("Доступные направления", "Available destinations", CAROUSEL),
    "catalog.showServicesAria": entry(
      "Показать услуги: {destination}",
      "Show services: {destination}",
      CAROUSEL,
      ["{destination}"],
    ),
    "catalog.available": entry("Доступно", "Available", CAROUSEL),
    "catalog.detailsAria": entry(
      "Подробнее: {destination}",
      "More details: {destination}",
      CAROUSEL,
      ["{destination}"],
    ),
    "catalog.details": entry("Подробнее", "More details", `${CAROUSEL}; ${VISA_GRID}`),
    "catalog.back": entry("Назад", "Back", COUNTRY_HEADER),
    "catalog.destinationLabel": entry("Направление", "Destination", COUNTRY_HEADER),
    "catalog.visasAria": entry("Доступные визы", "Available visas", VISA_GRID),

    "managerCard.title": entry("Менеджер SAFRWAY", "SAFRWAY manager", MANAGER_CARD, ["SAFRWAY"]),
    "managerCard.description": entry(
      "Поможет с услугами {location} через защищённый Telegram/CRM-диалог.",
      "Can help with services {location} through a secure Telegram/CRM conversation.",
      MANAGER_CARD,
      ["{location}", "Telegram", "CRM"],
    ),
    "managerCard.contact": entry("Связаться", "Contact", MANAGER_CARD),

    "support.eyebrow": entry("Поддержка", "Support", SUPPORT),
    "support.title": entry("Диалог с менеджером", "Conversation with a manager", SUPPORT),
    "support.description": entry(
      "Сообщения остаются внутри SAFRWAY и передаются менеджерам через backend. Внутренние заметки команды здесь не показываются.",
      "Messages remain within SAFRWAY and are sent to managers through the backend. Internal team notes are not shown here.",
      SUPPORT,
      ["SAFRWAY"],
    ),
    "support.loading": entry("Загружаем диалог…", "Loading the conversation…", SUPPORT),
    "support.author.client": entry("Вы", "You", SUPPORT),
    "support.author.manager": entry("Менеджер", "Manager", SUPPORT),
    "support.empty.title": entry("Начните новый диалог", "Start a new conversation", SUPPORT),
    "support.empty.detail": entry(
      "Опишите направление, услугу и ваш вопрос.",
      "Describe the destination, service, and your question.",
      SUPPORT,
    ),
    "support.messageLabel": entry("Ваше сообщение", "Your message", SUPPORT),
    "support.messagePlaceholder": entry(
      "Например: нужна консультация по визе D12",
      "For example: I need advice about a D12 visa",
      SUPPORT,
      ["D12"],
    ),
    "support.sending": entry("Отправляем…", "Sending…", SUPPORT),
    "support.send": entry("Отправить менеджеру", "Send to a manager", SUPPORT),
    "support.openTelegram": entry("Перейти в Telegram", "Open Telegram", SUPPORT, ["Telegram"]),

    "calculator.context": entry("Обмен валюты", "Currency exchange", CALCULATOR),
    "calculator.backToBali": entry("Услуги Бали", "Bali services", CALCULATOR),
    "calculator.loadingOptions": entry(
      "Загружаем доступные направления…",
      "Loading available routes…",
      CALCULATOR,
    ),
    "calculator.loadingAria": entry("Загрузка", "Loading", CALCULATOR),
    "calculator.unavailable.title": entry(
      "Калькулятор временно недоступен",
      "The calculator is temporarily unavailable",
      CALCULATOR,
    ),
    "calculator.unavailable.noRoutes": entry(
      "Нет доступных направлений для автоматического расчёта.",
      "No routes are available for automatic calculation.",
      CALCULATOR,
    ),
    "calculator.writeManager": entry("Написать менеджеру", "Message a manager", CALCULATOR),
    "calculator.title": entry("Обмен валюты", "Currency exchange", CALCULATOR),
    "calculator.description": entry(
      "Предварительный расчёт по доступным направлениям.",
      "A preliminary calculation for available routes.",
      CALCULATOR,
    ),
    "calculator.routeAria": entry("Маршрут обмена", "Exchange route", ROUTE_SELECTOR),
    "calculator.give": entry("Отдаёте", "You give", ROUTE_SELECTOR),
    "calculator.receive": entry("Получаете", "You receive", ROUTE_SELECTOR),
    "calculator.swapAria": entry(
      "Поменять направление обмена",
      "Reverse the exchange route",
      ROUTE_SELECTOR,
    ),
    "calculator.reverseUnavailableAria": entry(
      "Обратное направление недоступно",
      "The reverse route is unavailable",
      ROUTE_SELECTOR,
    ),
    "calculator.mode.legend": entry("Режим расчёта", "Calculation mode", CALCULATOR),
    "calculator.mode.give": entry("Сколько отдаю", "Amount I give", CALCULATOR),
    "calculator.mode.receive": entry("Сколько хочу получить", "Amount I want to receive", CALCULATOR),
    "calculator.amount.label": entry("Сумма", "Amount", CALCULATOR),
    "calculator.amount.giveAria": entry("Сколько отдаёте", "Amount you give", CALCULATOR),
    "calculator.amount.receiveAria": entry(
      "Сколько хотите получить",
      "Amount you want to receive",
      CALCULATOR,
    ),
    "calculator.amount.givePlaceholder": entry("Например, 100", "For example, 100", CALCULATOR),
    "calculator.amount.receivePlaceholder": entry(
      "Например, 200 000",
      "For example, 200,000",
      CALCULATOR,
    ),
    "calculator.liveHint": entry(
      "Расчёт обновится автоматически.",
      "The calculation updates automatically.",
      CALCULATOR,
    ),
    "calculator.idle.title": entry("Введите сумму", "Enter an amount", CALCULATOR),
    "calculator.idle.detail": entry(
      "Предварительный результат появится автоматически.",
      "A preliminary result will appear automatically.",
      CALCULATOR,
    ),
    "calculator.updating": entry(
      "Обновляем предварительный расчёт…",
      "Updating the preliminary calculation…",
      CALCULATOR,
    ),
    "calculator.error.title": entry(
      "Не удалось обновить расчёт",
      "Could not update the calculation",
      CALCULATOR,
    ),
    "calculator.quote.preliminary": entry(
      "Предварительный расчёт",
      "Preliminary calculation",
      CALCULATOR,
    ),
    "calculator.quote.updating": entry("Обновляем расчёт…", "Updating calculation…", CALCULATOR),
    "calculator.quote.give": entry("Вы отдаёте", "You give", CALCULATOR),
    "calculator.quote.receive": entry("Вы получаете", "You receive", CALCULATOR),
    "calculator.quote.validityAria": entry(
      "Срок действия расчёта",
      "Calculation validity period",
      CALCULATOR,
    ),
    "calculator.quote.updated": entry(
      "Обновлено {time}",
      "Updated at {time}",
      CALCULATOR,
      ["{time}"],
    ),
    "calculator.quote.expires": entry(
      "Действует до {time}",
      "Valid until {time}",
      CALCULATOR,
      ["{time}"],
    ),
    "calculator.quote.operatorConfirms": entry(
      "Подтверждает оператор",
      "Operator confirmation required",
      CALCULATOR,
    ),
    "calculator.quote.defaultWarning": entry(
      "Финальную сумму и способ проведения сделки подтверждает оператор.",
      "The operator confirms the final amount and transaction method.",
      CALCULATOR,
    ),
    "calculator.whitebird.detail": entry(
      "Для снижения риска банковских ограничений можно самостоятельно зарегистрироваться на легальной криптоплатформе WHITEBIRD и провести операцию через собственный верифицированный аккаунт.",
      "To reduce the risk of banking restrictions, you can register independently on the legal WHITEBIRD crypto platform and complete the transaction through your own verified account.",
      CALCULATOR,
      ["WHITEBIRD"],
    ),
    "calculator.whitebird.action": entry(
      "Зарегистрироваться в WHITEBIRD",
      "Register with WHITEBIRD",
      CALCULATOR,
      ["WHITEBIRD"],
    ),
    "calculator.request.sending": entry("Отправляем…", "Sending…", CALCULATOR),
    "calculator.request.sent": entry("Заявка отправлена", "Request sent", CALCULATOR),
    "calculator.request.submit": entry("Оставить заявку", "Submit a request", CALCULATOR),
    "calculator.request.success": entry(
      "Заявка принята. Оператор свяжется с вами для подтверждения.",
      "Your request has been accepted. An operator will contact you to confirm it.",
      CALCULATOR,
    ),
    "calculator.manager.title": entry("Нужна помощь менеджера?", "Need help from a manager?", CALCULATOR),
    "calculator.manager.detail": entry(
      "Поможем выбрать маршрут и подтвердим итоговые условия.",
      "We will help you choose a route and confirm the final terms.",
      CALCULATOR,
    ),
    "calculator.manager.contact": entry("Связаться", "Contact", CALCULATOR),
    "calculator.asset.select": entry("Выберите валюту", "Select a currency", ASSET_WHEEL),
    "calculator.asset.sheetEyebrow": entry("Обмен валюты", "Currency exchange", ASSET_WHEEL),
    "calculator.asset.closeAria": entry("Закрыть выбор", "Close selection", ASSET_WHEEL),
    "calculator.asset.done": entry("Готово", "Done", ASSET_WHEEL),
    "calculator.asset.usdt": entry("USDT", "USDT", ASSET_WHEEL, ["USDT"]),
    "calculator.asset.idrCash": entry("Рупии наличные", "Cash IDR", ASSET_WHEEL),
    "calculator.asset.idrBank": entry("Рупии безналичные", "Bank-transfer IDR", ASSET_WHEEL),
    "calculator.asset.rubBank": entry("Рубли безналичные", "Bank-transfer RUB", ASSET_WHEEL),

    "theme.bali.locative": entry("на Бали", "in Bali", THEMES),
    "theme.bali.heroAlt": entry(
      "Храм Пура Улун Дану Братан у озера на Бали",
      "Pura Ulun Danu Bratan temple by a lake in Bali",
      THEMES,
    ),
    "theme.thailand.locative": entry("в Таиланде", "in Thailand", THEMES),
    "theme.thailand.heroAlt": entry(
      "Традиционная лодка у известняковых островов Таиланда",
      "Traditional boat by Thailand's limestone islands",
      THEMES,
    ),
    "theme.russia.locative": entry("в России", "in Russia", THEMES),
    "theme.russia.heroAlt": entry(
      "Московский Кремль и набережная Москвы-реки на рассвете",
      "The Moscow Kremlin and the Moskva River embankment at sunrise",
      THEMES,
    ),
    "theme.nepal.locative": entry("в Непале", "in Nepal", THEMES),
    "theme.nepal.heroAlt": entry(
      "Буддийская ступа на фоне Гималаев в Непале",
      "Buddhist stupa against the Himalayas in Nepal",
      THEMES,
    ),
    "theme.location.city": entry("Город", "City", THEMES),
    "theme.location.region": entry("Регион", "Region", THEMES),
    "theme.spb.name": entry("Санкт-Петербург", "Saint Petersburg", THEMES),
    "theme.spb.heroAlt": entry(
      "Петропавловская крепость и набережная Невы на рассвете",
      "The Peter and Paul Fortress and the Neva embankment at sunrise",
      THEMES,
    ),
    "theme.ural.name": entry("Урал", "Ural", THEMES),
    "theme.ural.heroAlt": entry(
      "Лесистые Уральские хребты и река утром",
      "Forested Ural ridges and a river in the morning",
      THEMES,
    ),
    "theme.caucasus.name": entry("Кавказ", "Caucasus", THEMES),
    "theme.caucasus.heroAlt": entry(
      "Высокогорная долина Кавказа с рекой",
      "High-altitude Caucasus valley with a river",
      THEMES,
    ),
    "theme.baliVilla.heroAlt": entry(
      "Вилла на Бали с небольшим бассейном и тропическим садом",
      "Bali villa with a small pool and tropical garden",
      THEMES,
    ),
    "theme.spbBoat.heroAlt": entry(
      "Небольшой катер на Неве утром в Санкт-Петербурге",
      "Small boat on the Neva in Saint Petersburg in the morning",
      THEMES,
    ),

    "api.error.unknown": entry(
      "Не удалось связаться с SAFRWAY. Проверьте соединение и попробуйте снова.",
      "Could not connect to SAFRWAY. Check your connection and try again.",
      API_CLIENT,
      ["SAFRWAY"],
    ),
    "api.error.authentication": entry(
      "Сессия истекла. Выполните вход ещё раз.",
      "Your session has expired. Sign in again.",
      API_CLIENT,
    ),
    "api.error.configuration": entry(
      "Приложение настроено неверно. Сообщите менеджеру.",
      "The app is configured incorrectly. Tell a manager.",
      API_CLIENT,
    ),
    "api.error.invalidResponse": entry(
      "Сервер вернул неожиданный ответ. Попробуйте позже.",
      "The server returned an unexpected response. Try again later.",
      API_CLIENT,
    ),
    "api.error.data": entry(
      "Не удалось получить данные. Проверьте соединение и попробуйте снова.",
      "Could not retrieve data. Check your connection and try again.",
      API_CLIENT,
    ),
  },
});

export type MiniAppTranslationKey = keyof typeof miniAppCorpus.entries;
