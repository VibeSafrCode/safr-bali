import { defineCorpus, type TranslationUnit } from "./types";

const translated = (
  ru: string,
  en: string,
  source: string,
  protectedTokens: readonly string[] = [],
  note?: string,
): TranslationUnit => ({
  ru,
  en,
  source,
  sourceVerification: "LOCAL_SOURCE_CAPTURED",
  review: "TRANSLATED",
  protectedTokens,
  ...(note ? { note } : {}),
});

const sensitive = (
  ru: string,
  en: string,
  source: string,
  protectedTokens: readonly string[] = [],
  note?: string,
): TranslationUnit => ({
  ru,
  en,
  source,
  sourceVerification: "LOCAL_SOURCE_CAPTURED",
  review: "HUMAN_REVIEW_REQUIRED",
  protectedTokens,
  note: note ?? "Sensitive visa copy: Founder/CPO review is required before release.",
});

const BUTTONS_SOURCE = "06 Development/bot/app/core/buttons.py#STATIC_BUTTON_TEXTS";
const TEXTS_SOURCE = "06 Development/bot/app/content/texts.json";
const HOUSING_SOURCE = "06 Development/bot/app/content/housing.json";
const VISAS_SOURCE = "06 Development/bot/app/content/visas.json";

export const BOT_SOURCE_FILES = [
  "06 Development/bot/app/content/texts.json",
  "06 Development/bot/app/content/housing.json",
  "06 Development/bot/app/content/visas.json",
  "06 Development/bot/app/content/housing.py",
  "06 Development/bot/app/content/visas.py",
  "06 Development/bot/app/core/buttons.py",
  "06 Development/bot/app/handlers/contact.py",
  "06 Development/bot/app/handlers/destinations.py",
  "06 Development/bot/app/handlers/fallback.py",
  "06 Development/bot/app/handlers/admin_reply.py",
  "06 Development/bot/app/handlers/menu.py",
  "06 Development/bot/app/handlers/start.py",
  "06 Development/bot/app/keyboards/main_menu.py",
  "06 Development/bot/app/services/account.py",
  "06 Development/bot/app/services/referrals.py",
  "06 Development/backend/app/models/order.py",
  "06 Development/backend/app/services/admin_orders.py",
  "06 Development/backend/app/api/payments.py",
  "06 Development/shared/src/guides/all-indonesia.ts",
] as const;

// Protocol and persisted identifiers are deliberately outside the translation map.
export const BOT_PROTECTED_PROTOCOL_TOKENS = [
  "reply:",
  "escalate:",
  "comment:",
  "staff_thread:",
  "staff_thread_write:",
  "history:",
  "visa_transfer:",
  "restrict:",
  "housing_page:",
  "housing_page:noop",
  "housing_page:menu",
  "webreply:",
  "webnote:",
  "webhistory:",
  "bali",
  "thailand",
  "russia",
  "spb",
  "spb_tours",
  "chelyabinsk",
  "ural",
  "caucasus",
  "nepal",
  "ref_",
  "?screen=services%2Fbali%2Fexchange%2Fusdt-idr",
  "ContactHumanState.waiting_for_client_message",
  "ContactHumanState.waiting_for_admin_reply",
  "ContactHumanState.waiting_for_boss_complaint",
  "BroadcastState.waiting_for_message",
  "BroadcastState.waiting_for_confirmation",
  "StaffCollaborationState.waiting_for_note",
  "StaffCollaborationState.waiting_for_thread_message",
  "WebStaffState.waiting_for_text",
  "client_message",
  "staff_reply",
  "currency_exchange_opened",
  "currency_calculator_mini_app_opened",
  "menu_click",
  "visa_card_opened",
  "housing_info_opened",
  "housing_videos_opened",
  "housing_risks_opened",
  "service_question_sent",
  "destination_opened",
  "coming_soon_service_opened",
  "visa",
  "housing",
  "consultation",
  "currency_exchange",
  "route_context",
  "country",
  "city",
  "region",
  "section",
  "service",
  "new",
  "completed",
  "cancelled",
  "pending",
  "paid",
  "refunded",
  "refund_required",
  "E33G",
  "D12",
  "D1/D2",
  "C1",
  "VOA",
  "IDR",
  "USDT",
  "RUB",
] as const;

export const botCorpus = defineCorpus({
  domain: "bot",
  capturedAt: "2026-08-10",
  entries: {
    // Client-visible button corpus: 65 canonical actions plus 20 retained aliases.
    "button.nav.backToMenu": translated("📋 Обратно в меню", "📋 Back to menu", BUTTONS_SOURCE),
    "button.nav.exitToMenu": translated("📋 Выйти в меню", "📋 Exit to menu", BUTTONS_SOURCE),
    "button.nav.showMenu": translated("📋 Показать меню", "📋 Show menu", BUTTONS_SOURCE),
    "button.contact.writeHuman": translated("✍️ Написать человеку", "✍️ Message a person", BUTTONS_SOURCE),
    "button.contact.writeManager": translated("✍️ Написать менеджеру", "✍️ Message a manager", BUTTONS_SOURCE),
    "button.visa.make": sensitive("🛂 Сделать визу", "🛂 Apply for a visa", BUTTONS_SOURCE),
    "button.visa.open": sensitive("🛂 Визы", "🛂 Visas", BUTTONS_SOURCE),
    "button.visa.mine": translated("🛂 Мои визы", "🛂 My visas", BUTTONS_SOURCE),
    "button.housing.find": translated("🏡 Найти жильё", "🏡 Find housing", BUTTONS_SOURCE),
    "button.housing.findVillaLegacy": translated("🏡 Найти виллу / жильё", "🏡 Find a villa / housing", BUTTONS_SOURCE),
    "button.housing.open": translated("🏡 Жильё", "🏡 Housing", BUTTONS_SOURCE),
    "button.consultation.orderLegacy": translated("💬 Заказать консультацию", "💬 Book a consultation", BUTTONS_SOURCE),
    "button.consultation.openLegacy": translated("💬 Консультация", "💬 Consultation", BUTTONS_SOURCE),
    "button.exchange.open": translated("💱 Обмен валюты", "💱 Currency exchange", BUTTONS_SOURCE),
    "button.exchange.calculator": translated("🧮 Открыть калькулятор", "🧮 Open calculator", BUTTONS_SOURCE),
    "button.exchange.calculatorUsdtIdrLegacy": translated(
      "🧮 Калькулятор USDT → IDR наличные",
      "🧮 USDT → cash IDR calculator",
      BUTTONS_SOURCE,
      ["USDT", "IDR"],
    ),
    "button.exchange.other": translated("🔄 Другой обмен", "🔄 Another exchange", BUTTONS_SOURCE),
    "button.account.open": translated("👤 Мой личный кабинет", "👤 My account", BUTTONS_SOURCE),
    "button.guide.open": translated("📚 Гайды", "📚 Guides", BUTTONS_SOURCE),
    "button.guide.read": translated("Открыть гайд", "Open guide", BUTTONS_SOURCE),
    "button.guide.download": translated("Скачать PDF", "Download PDF", BUTTONS_SOURCE, ["PDF"]),
    "button.app.open": translated("🚀 Открыть SAFR App", "🚀 Open SAFR App", BUTTONS_SOURCE, ["SAFR App"]),
    "button.app.menu": translated("🚀 Меню App", "🚀 App menu", BUTTONS_SOURCE),
    "button.points.mineLegacy": translated("🎁 Мои SAFR Points", "🎁 My SAFR Points", BUTTONS_SOURCE, ["SAFR Points"]),
    "button.points.balance": translated(
      "🎁 Мой баланс SAFR Points",
      "🎁 My SAFR Points balance",
      BUTTONS_SOURCE,
      ["SAFR Points"],
    ),
    "button.referral.link": translated("🔗 Моя ссылка", "🔗 My link", BUTTONS_SOURCE),
    "button.referral.linkLegacy": translated("🔗 Моя рефка", "🔗 My referral link", BUTTONS_SOURCE),
    "button.destination.bali": translated("🌴 Бали", "🌴 Bali", BUTTONS_SOURCE),
    "button.destination.thailand": translated("🇹🇭 Таиланд", "🇹🇭 Thailand", BUTTONS_SOURCE),
    "button.destination.russia": translated("🇷🇺 Россия", "🇷🇺 Russia", BUTTONS_SOURCE),
    "button.destination.nepal": translated("🇳🇵 Непал", "🇳🇵 Nepal", BUTTONS_SOURCE),
    "button.destination.change": translated("🌍 Сменить направление", "🌍 Change destination", BUTTONS_SOURCE),
    "button.destination.spb": translated("🌉 Санкт-Петербург", "🌉 Saint Petersburg", BUTTONS_SOURCE),
    "button.destination.chelyabinskLegacy": translated("🏔 Челябинск", "🏔 Chelyabinsk", BUTTONS_SOURCE),
    "button.destination.ural": translated("⛰ Урал", "⛰ Urals", BUTTONS_SOURCE),
    "button.destination.caucasus": translated("🏔 Кавказ", "🏔 Caucasus", BUTTONS_SOURCE),
    "button.destination.backToRussianCitiesLegacy": translated(
      "↩️ Назад к городам России",
      "↩️ Back to Russian cities",
      BUTTONS_SOURCE,
    ),
    "button.destination.backToRussia": translated("↩️ Назад к России", "↩️ Back to Russia", BUTTONS_SOURCE),
    "button.thailand.exchange": translated("💱 Обмен — Таиланд", "💱 Exchange — Thailand", BUTTONS_SOURCE),
    "button.thailand.visas": sensitive("🛂 Визы — Таиланд", "🛂 Visas — Thailand", BUTTONS_SOURCE),
    "button.thailand.realEstate": translated(
      "🏠 Недвижимость — Таиланд",
      "🏠 Real estate — Thailand",
      BUTTONS_SOURCE,
    ),
    "button.thailand.yachts": translated("⛵ Яхты — Таиланд", "⛵ Yachts — Thailand", BUTTONS_SOURCE),
    "button.russia.spbSup": translated("🏄 SUP-туры — Петербург", "🏄 SUP tours — Saint Petersburg", BUTTONS_SOURCE, ["SUP"]),
    "button.russia.spbBoat": translated(
      "🚤 Прогулка на катере — Петербург",
      "🚤 Boat trip — Saint Petersburg",
      BUTTONS_SOURCE,
    ),
    "button.russia.spbCampfire": translated(
      "🔥 Посиделки у костра — Петербург",
      "🔥 Campfire gathering — Saint Petersburg",
      BUTTONS_SOURCE,
    ),
    "button.russia.chelyabinskSupLegacy": translated(
      "🏄 SUP-тур — Челябинск",
      "🏄 SUP tour — Chelyabinsk",
      BUTTONS_SOURCE,
      ["SUP"],
    ),
    "button.russia.chelyabinskRaftingLegacy": translated(
      "🛶 Сплав — Челябинск",
      "🛶 Rafting — Chelyabinsk",
      BUTTONS_SOURCE,
    ),
    "button.russia.chelyabinskCampfireLegacy": translated(
      "🔥 Посиделки у костра — Челябинск",
      "🔥 Campfire gathering — Chelyabinsk",
      BUTTONS_SOURCE,
    ),
    "button.russia.chelyabinskRetreatLegacy": translated(
      "🧘 Организовать ретрит — Челябинск",
      "🧘 Organize a retreat — Chelyabinsk",
      BUTTONS_SOURCE,
    ),
    "button.russia.uralSup": translated("🏄 SUP-тур — Урал", "🏄 SUP tour — Urals", BUTTONS_SOURCE, ["SUP"]),
    "button.russia.uralRafting": translated("🛶 Сплав — Урал", "🛶 Rafting — Urals", BUTTONS_SOURCE),
    "button.russia.uralCampfire": translated(
      "🔥 Посиделки у костра — Урал",
      "🔥 Campfire gathering — Urals",
      BUTTONS_SOURCE,
    ),
    "button.russia.uralRetreat": translated(
      "🧘 Организовать ретрит — Урал",
      "🧘 Organize a retreat — Urals",
      BUTTONS_SOURCE,
    ),
    "button.nepal.kailash": translated("🏔 Трекинг на Кайлас", "🏔 Kailash trek", BUTTONS_SOURCE),
    "button.nepal.everest": translated("🏔 Трекинг к Эвересту", "🏔 Everest trek", BUTTONS_SOURCE),
    "button.nepal.annapurna": translated("⛰ Хребет Аннапурна", "⛰ Annapurna Circuit", BUTTONS_SOURCE),
    "button.nepal.transfer": translated("🚐 Трансфер — Непал", "🚐 Transfer — Nepal", BUTTONS_SOURCE),
    "button.nepal.housing": translated("🏡 Жильё — Непал", "🏡 Housing — Nepal", BUTTONS_SOURCE),
    "button.nepal.guide": translated("🧭 Гид — Непал", "🧭 Guide — Nepal", BUTTONS_SOURCE),
    "button.account.network": translated("🌐 Моя сеть", "🌐 My network", BUTTONS_SOURCE),
    "button.account.orders": translated("📦 Мои купленные услуги", "📦 My purchased services", BUTTONS_SOURCE),
    "button.account.support": translated("🛠 Тех. поддержка", "🛠 Tech support", BUTTONS_SOURCE),
    "button.visa.e33gYearLegacy": sensitive("ITAS E33G — 1 год", "ITAS E33G — 1 year", BUTTONS_SOURCE, ["ITAS E33G"]),
    "button.visa.e33gCode": sensitive("E33G", "E33G", BUTTONS_SOURCE, ["E33G"]),
    "button.visa.d12YearsLegacy": sensitive(
      "D12 — 1/2 года",
      "D12 — 1 or 2 years",
      BUTTONS_SOURCE,
      ["D12", "1", "2"],
    ),
    "button.visa.d12Code": sensitive("D12", "D12", BUTTONS_SOURCE, ["D12"]),
    "button.visa.d1d2YearsLegacy": sensitive(
      "D1/D2 — 1/2/5 лет",
      "D1/D2 — 1, 2, or 5 years",
      BUTTONS_SOURCE,
      ["D1/D2", "1", "2", "5"],
    ),
    "button.visa.d1d2Code": sensitive("D1/D2", "D1/D2", BUTTONS_SOURCE, ["D1/D2"]),
    "button.visa.c1SituationLegacy": sensitive("C1 — по ситуации", "C1 — case-dependent", BUTTONS_SOURCE, ["C1"]),
    "button.visa.c1Code": sensitive("C1", "C1", BUTTONS_SOURCE, ["C1"]),
    "button.visa.voaShortLegacy": sensitive("VOA — короткий срок", "VOA — short stay", BUTTONS_SOURCE, ["VOA"]),
    "button.visa.evoaShortLegacy": sensitive("eVOA — короткий срок", "eVOA — short stay", BUTTONS_SOURCE, ["eVOA"]),
    "button.visa.voaCode": sensitive("VOA", "VOA", BUTTONS_SOURCE, ["VOA"]),
    "button.visa.other": sensitive("Другая виза", "Other visa", BUTTONS_SOURCE),
    "button.visa.ask": sensitive("Задать вопрос по визе", "Ask a visa question", BUTTONS_SOURCE),
    "button.visa.missingDocuments": sensitive(
      "❓ А если нет всех документов?",
      "❓ What if I do not have all the documents?",
      BUTTONS_SOURCE,
    ),
    "button.housing.villa": translated("Найти виллу", "Find a villa", BUTTONS_SOURCE),
    "button.housing.guesthouse": translated("Найти гест", "Find a guesthouse", BUTTONS_SOURCE),
    "button.housing.buy": translated("Купить недвижимость", "Buy real estate", BUTTONS_SOURCE),
    "button.housing.inspect": translated("Проверить объект", "Inspect a property", BUTTONS_SOURCE),
    "button.housing.videos": translated("🎥 Видео про жильё", "🎥 Housing videos", BUTTONS_SOURCE),
    "button.housing.risks": translated("⚠️ Риски аренды", "⚠️ Rental risks", BUTTONS_SOURCE),
    "button.housing.ask": translated("Задать вопрос по жилью", "Ask a housing question", BUTTONS_SOURCE),
    "button.housing.searchBaliLegacy": translated("🏡 Поиск жилья на Бали", "🏡 Housing search in Bali", BUTTONS_SOURCE),
    "button.dialog.reply": translated("↩️ Ответить", "↩️ Reply", BUTTONS_SOURCE),
    "button.dialog.finish": translated("✅ Закончить диалог", "✅ End conversation", BUTTONS_SOURCE),
    "button.dialog.return": translated("↩️ Вернуться в диалог", "↩️ Return to conversation", BUTTONS_SOURCE),
    "button.dialog.new": translated("🆕 Новый диалог", "🆕 New conversation", BUTTONS_SOURCE),
    "button.dialog.complain": translated("🚨 Жалоба ГлавБоссу", "🚨 Complaint to Head Boss", BUTTONS_SOURCE),
    "button.travelAssistant.mineLegacy": translated(
      "🌴 Мой тревел-ассистент",
      "🌴 My travel assistant",
      "06 Development/bot/app/handlers/menu.py#travel_assistant_handler",
    ),
    "button.service.transferLegacy": translated(
      "🚗 Трансфер",
      "🚗 Transfer",
      "06 Development/bot/app/handlers/contact.py#MAIN_MENU_BUTTONS",
    ),
    "button.service.bikeLegacy": translated(
      "🏍️ Байк",
      "🏍️ Bike",
      "06 Development/bot/app/handlers/contact.py#MAIN_MENU_BUTTONS",
    ),
    "button.service.checkDocumentsLegacy": translated(
      "🧾 Проверить документы",
      "🧾 Check documents",
      "06 Development/bot/app/handlers/contact.py#MAIN_MENU_BUTTONS",
    ),
    "button.service.inspectPropertyLegacy": translated(
      "🏠 Проверить объект",
      "🏠 Inspect a property",
      "06 Development/bot/app/handlers/contact.py#MAIN_MENU_BUTTONS",
    ),

    // Existing flat bot copy. All 15 source keys are retained, including unused legacy keys.
    "text.globalStart": translated(
      `Привет! Это SAFR 🌍

Мы создаём единую систему путешествий, локальных услуг и помощи в разных странах и городах.

Сейчас доступны направления: Бали, Таиланд, Россия и Непал. Новые услуги будут появляться постепенно.

Выберите направление, которое вас интересует:`,
      `Hello! This is SAFR 🌍

We are building a unified system for travel, local services, and assistance across different countries and cities.

The available destinations are currently Bali, Thailand, Russia, and Nepal. New services will be added gradually.

Choose the destination you are interested in:`,
      `${TEXTS_SOURCE}#global_start`,
      ["SAFR"],
    ),
    "text.globalPersonalAccount": translated(
      `👤 Мой личный кабинет

Это ваш общий персональный раздел SAFR для всех направлений.

Здесь будут отображаться ваши SAFR Points, персональная ссылка, сеть приглашённых людей, купленные и активные услуги.

Пригласивший закрепляется один раз на весь бот, а подтверждённые покупки могут приносить бонусы независимо от страны или города.`,
      `👤 My account

This is your shared SAFR account area for all destinations.

It will show your SAFR Points, personal link, invited network, and purchased and active services.

Your inviter is assigned once for the entire bot, and confirmed purchases may earn rewards regardless of country or city.`,
      `${TEXTS_SOURCE}#global_personal_account`,
      ["SAFR", "SAFR Points"],
    ),
    "text.baliStartLegacy": translated(
      `Привет! Это SAFR Bali 🌴

Мы помогаем с Бали и Индонезией с 2022 года.

За это время помогли сотням клиентов: делали визы, открывали компании, находили виллы, байки, туры и решали бытовые вопросы на острове.

Нас не просто так называют «МФЦ Бали» — только работаем быстрее, человечнее и сильно внимательнее к деталям.

Мы ведём YouTube-канал, где рассказываем про жизнь, переезд и возможности на Бали:
https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A

Через бота можно найти жильё, сделать визу, заказать консультацию, подключить тревел-ассистента или написать человеку напрямую.

А если вам нужна нестандартная услуга — нажмите «✍️ Написать человеку».
Мы попробуем создать решение специально под вас.

Полицейский эскорт от аэропорта до виллы мы уже однажды организовывали 😉

Выберите, с чего начнём:`,
      `Hello! This is SAFR Bali 🌴

We have been helping people with Bali and Indonesia since 2022.

During that time, we have helped hundreds of clients: arranging visas, opening companies, finding villas, bikes, and tours, and solving everyday matters on the island.

People call us the “Bali one-stop service centre” for a reason — except that we work faster, more personally, and with much greater attention to detail.

We run a YouTube channel about life, relocation, and opportunities in Bali:
https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A

Through the bot, you can find housing, arrange a visa, book a consultation, get a travel assistant, or message a person directly.

If you need an unusual service, tap “✍️ Message a person”.
We will try to create a solution specifically for you.

We have even arranged a police escort from the airport to a villa once 😉

Choose where to begin:`,
      `${TEXTS_SOURCE}#start`,
      ["SAFR Bali", "2022", "https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A"],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),
    "text.housingIntro": translated(
      `🏡 Найти жильё

Выберите, что вам нужно: вилла, гест, покупка недвижимости или проверка объекта.

После выбора бот попросит вас коротко описать задачу и передаст вопрос команде.`,
      `🏡 Find housing

Choose what you need: a villa, a guesthouse, a property purchase, or a property inspection.

After you choose, the bot will ask you to describe the task briefly and will pass your question to the team.`,
      `${TEXTS_SOURCE}#housing`,
    ),
    "text.visaIntro": sensitive(
      `🛂 Сделать визу

Выберите тип визы или задачу ниже.

Если не знаете, какой вариант подходит — нажмите «Другая виза», и мы разберём вашу ситуацию вручную.`,
      `🛂 Apply for a visa

Choose a visa type or task below.

If you are unsure which option fits, tap “Other visa” and we will review your situation manually.`,
      `${TEXTS_SOURCE}#visa`,
    ),
    "text.consultationLegacy": translated(
      `💬 Заказать консультацию

Можно разобрать вашу ситуацию по визе, жилью, прилёту, переезду или жизни на Бали.

Нажмите ✍️ Написать человеку и коротко опишите вопрос.`,
      `💬 Book a consultation

We can review your situation concerning visas, housing, arrival, relocation, or life in Bali.

Tap ✍️ Message a person and briefly describe your question.`,
      `${TEXTS_SOURCE}#consultation`,
      [],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),
    "text.pointsLegacy": translated(
      `🎁 Мой баланс SAFR Points

Сейчас баланс готовится к подключению к backend.

Что такое SAFR Points:
— это внутренние бонусные баллы SAFR Bali
— их можно будет получать за рекомендации и активность
— они будут отображаться в личном кабинете

На что можно будет тратить SAFR Points:
— консультации
— визовые услуги
— тревел-ассистента
— подбор жилья
— другие бонусы проекта

Начисления по рефералам будут происходить после подтверждения целевого действия.`,
      `🎁 My SAFR Points balance

The balance is currently being prepared for connection to the backend.

What SAFR Points are:
— internal SAFR Bali reward points
— they will be available for referrals and activity
— they will appear in your account

What SAFR Points will be usable for:
— consultations
— visa services
— a travel assistant
— housing search
— other project rewards

Referral rewards will be credited after the target action is confirmed.`,
      `${TEXTS_SOURCE}#points`,
      ["SAFR Points", "SAFR Bali"],
    ),
    "text.referralLinkLegacy": translated(
      `🔗 Реферальная ссылка

Скоро здесь будет ваша персональная ссылка для приглашений.
За рекомендации можно будет получать SAFR Points.`,
      `🔗 Referral link

Your personal invitation link will appear here soon.
You will be able to earn SAFR Points for referrals.`,
      `${TEXTS_SOURCE}#referral_link`,
      ["SAFR Points"],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),
    "text.fallback": translated(
      `Извините, я не понял, что вы хотите.

Если вы хотите задать вопрос человеку — нажмите кнопку «✍️ Написать человеку».

Если нет — выберите нужную команду в меню. В любом случае я с радостью помогу!`,
      `Sorry, I did not understand what you need.

If you want to ask a person a question, tap “✍️ Message a person”.

Otherwise, choose the relevant command from the menu. I will be happy to help either way!`,
      `${TEXTS_SOURCE}#fallback`,
    ),
    "text.travelAssistant": translated(
      `🌴 Заказать тревел-ассистента

Тревел-ассистент — это персональное сопровождение по Бали: от подготовки к поездке до решения бытовых вопросов на месте.

Что может входить:
— помощь с прилётом и трансфером
— подбор жилья
— визовые вопросы
— байк / авто / связь / обмен
— рекомендации по районам
— помощь с нестандартными ситуациями

Чтобы обсудить формат сопровождения, нажмите:
✍️ Написать человеку`,
      `🌴 Book a travel assistant

A travel assistant provides personal support for Bali, from preparing for your trip to handling everyday matters after arrival.

This may include:
— arrival and transfer assistance
— housing search
— visa questions
— bike / car / connectivity / exchange
— area recommendations
— help with unusual situations

To discuss the support format, tap:
✍️ Message a person`,
      `${TEXTS_SOURCE}#travel_assistant`,
    ),
    "text.personalAccountLegacy": translated(
      `👤 Мой личный кабинет

Здесь будет ваш персональный раздел SAFR Bali.

В личном кабинете вы сможете смотреть:
🎁 ваши SAFR Points и баланс
🔗 вашу реферальную ссылку
🌐 вашу сеть приглашённых людей
📦 купленные и активные услуги

SAFR Points можно будет использовать на услуги проекта: консультации, визы, тревел-ассистента, подбор жилья и другие бонусы.

Если возникла проблема с реферальной привязкой или услугами — нажмите «🛠 Тех. поддержка».`,
      `👤 My account

This will be your personal SAFR Bali area.

In your account, you will be able to view:
🎁 your SAFR Points and balance
🔗 your referral link
🌐 your invited network
📦 purchased and active services

SAFR Points will be usable for project services: consultations, visas, a travel assistant, housing search, and other rewards.

If there is a problem with referral attribution or services, tap “🛠 Tech support”.`,
      `${TEXTS_SOURCE}#personal_account`,
      ["SAFR Bali", "SAFR Points"],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),
    "text.myReferralLegacy": translated(
      `🔗 Моя рефка

Скоро здесь будет ваша персональная реферальная ссылка.

Через неё можно будет приглашать людей и получать SAFR Points за рекомендации.`,
      `🔗 My referral link

Your personal referral link will appear here soon.

You will be able to invite people through it and earn SAFR Points for referrals.`,
      `${TEXTS_SOURCE}#my_referral`,
      ["SAFR Points"],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),
    "text.myPurchasedServicesLegacy": translated(
      `📦 Мои купленные услуги

Скоро здесь будут отображаться ваши активные купленные услуги:
— визы
— консультации
— тревел-ассистент
— подбор жилья

Пока этот раздел готовится к подключению к backend.`,
      `📦 My purchased services

Your active purchased services will appear here soon:
— visas
— consultations
— a travel assistant
— housing search

For now, this section is being prepared for connection to the backend.`,
      `${TEXTS_SOURCE}#my_purchased_services`,
    ),
    "text.techSupport": translated(
      `🛠 Тех. поддержка

Напишите технический вопрос следующим сообщением.

Это сообщение уйдёт только Админу Никите, а не обычному менеджеру.

Сюда лучше писать, если:
— не засчиталась реферальная ссылка
— не отображается купленная услуга
— ошибка в балансе или SAFR Points
— нужно проверить привязку к сети
— что-то работает неправильно`,
      `🛠 Tech support

Send your technical question in the next message.

It will go only to Admin Nikita, not to a regular manager.

This section is best for cases where:
— a referral link was not credited
— a purchased service is not displayed
— there is an error in the balance or SAFR Points
— network attribution needs to be checked
— something is not working correctly`,
      `${TEXTS_SOURCE}#tech_support`,
      ["SAFR Points"],
    ),
    "text.myNetworkLegacy": translated(
      `🌐 Моя сеть

Скоро здесь будет видно, сколько людей пришло по вашей рекомендации и на каком уровне они находятся.

Планируемая структура:
1 уровень — люди, которых пригласили лично вы
2 уровень — люди, которых пригласили ваши рефералы
3 уровень и дальше — глубокая сеть, если она будет включена в правилах проекта

Пока раздел готовится к подключению к backend.`,
      `🌐 My network

Soon, this section will show how many people joined through your recommendation and which level they are on.

Planned structure:
Level 1 — people you invited personally
Level 2 — people invited by your referrals
Level 3 and beyond — a deeper network, if enabled by the project rules

For now, this section is being prepared for connection to the backend.`,
      `${TEXTS_SOURCE}#my_network`,
      ["1", "2", "3"],
      "Legacy source key is currently unreferenced by handlers; retained for parity.",
    ),

    // Housing source content. URLs and quoted prices remain byte-for-byte tokens.
    "housing.search.title": translated(
      "Поиск жилья на Бали",
      "Housing search in Bali",
      `${HOUSING_SOURCE}#search_housing.title`,
      [],
      "Source title is not rendered by the current bot, but remains part of the source record.",
    ),
    "housing.search.body": translated(
      `🏡 ИНДИВИДУАЛЬНЫЙ ПОИСК ВИЛЛЫ НА БАЛИ

Красивые фотографии ещё не гарантируют, что вилла соответствует своей цене и так же выглядит в реальности.

Объявления могут показывать посуточную цену вместо долгосрочной, а широкоугольная съёмка и идеальное освещение скрывают влажность, шум, изношенную мебель и другие важные детали.

Мы берём поиск на себя: от выбора района до личной проверки виллы и переговоров с владельцем.

1️⃣ ЗНАКОМСТВО И КОНСУЛЬТАЦИЯ

Обсуждаем ваши планы, бюджет, сроки и требования. Если район ещё не выбран — объясняем особенности локаций Бали и помогаем найти подходящее место.

Учитываем:
— количество спален;
— бюджет и срок аренды;
— близость к океану, школам, кафе и коворкингам;
— бассейн, парковку и закрытую территорию;
— тишину, инфраструктуру и состояние виллы;
— детей, животных и другие личные условия.

2️⃣ ПОДБОР ВАРИАНТОВ

Ищем по открытым и закрытым источникам, связываемся с владельцами, управляющими и локальными контактами.

Вы получаете подходящие варианты с понятными комментариями по цене, району и состоянию. Мы не продвигаем объекты, которые кому-то нужно срочно сдать, — ищем жильё именно под ваш запрос.

3️⃣ ПРОВЕРКА ВИЛЛЫ НА МЕСТЕ

Лично осматриваем:
— спальни, санузлы, кухню и общие зоны;
— мебель, технику и кондиционеры;
— влажность, плесень и следы протечек;
— бассейн, территорию, дорогу и парковку;
— шум от строек, дорог и соседей;
— соответствие фотографий реальности.

4️⃣ ЧЕСТНЫЙ ВИДЕООБЗОР

Вы получаете объективный видеообзор: преимущества, недостатки и реальное состояние объекта. Даже находясь в другой стране, вы сможете принять решение так, будто сами были на просмотре.

5️⃣ ПЕРЕГОВОРЫ С ВЛАДЕЛЬЦЕМ

Обсуждаем цену, депозит, скидку за длительный срок, дату заселения, коммунальные платежи, уборку, обслуживание бассейна и устранение недостатков.

Если перед заселением нужен ремонт или замена техники — передаём владельцу список работ и контролируем выполнение.

6️⃣ ПРЯМЫЕ КОНТАКТЫ

После выбора виллы вы получаете прямые контакты владельца или управляющего — без скрытых наценок с нашей стороны. Мы остаёмся на связи и помогаем с организационными вопросами.

🛎 ДОПОЛНИТЕЛЬНЫЙ КОНСЬЕРЖ-СЕРВИС

К вашему приезду можем организовать трансфер, SIM-карту, обмен или доставку наличных, аренду и доставку байка, обучение вождению, экскурсии и другие бытовые вопросы.

✨ РЕЗУЛЬТАТ

Вы не тратите недели на объявления, переписки, торг и проверки. Мы находим варианты, смотрим их на месте и помогаем договориться о лучших условиях.

📩 Чтобы начать поиск, напишите менеджеру:
— даты и срок проживания;
— количество гостей;
— желаемый район;
— количество спален;
— ориентировочный бюджет.`,
      `🏡 PERSONAL VILLA SEARCH IN BALI

Beautiful photographs do not guarantee that a villa is worth its price or looks the same in real life.

Listings may show a nightly price instead of a long-term rate, while wide-angle photography and ideal lighting can hide dampness, noise, worn furniture, and other important details.

We handle the search for you, from choosing an area to inspecting the villa in person and negotiating with the owner.

1️⃣ INTRODUCTION AND CONSULTATION

We discuss your plans, budget, timeframe, and requirements. If you have not chosen an area yet, we explain the characteristics of Bali locations and help you find a suitable place.

We take into account:
— the number of bedrooms;
— the budget and rental period;
— proximity to the ocean, schools, cafés, and coworking spaces;
— a pool, parking, and a gated property;
— quiet surroundings, infrastructure, and the villa's condition;
— children, pets, and other personal requirements.

2️⃣ SHORTLISTING OPTIONS

We search open and private sources and contact owners, property managers, and local contacts.

You receive suitable options with clear comments on price, area, and condition. We do not promote properties that someone urgently needs to rent out; we search specifically for your requirements.

3️⃣ ON-SITE VILLA INSPECTION

We personally inspect:
— bedrooms, bathrooms, the kitchen, and common areas;
— furniture, appliances, and air conditioners;
— dampness, mould, and signs of leaks;
— the pool, grounds, access road, and parking;
— noise from construction, roads, and neighbours;
— whether the property matches the photographs.

4️⃣ HONEST VIDEO REVIEW

You receive an objective video review covering the property's advantages, drawbacks, and actual condition. Even from another country, you can make a decision as if you had attended the viewing yourself.

5️⃣ NEGOTIATIONS WITH THE OWNER

We discuss the price, deposit, long-stay discount, move-in date, utilities, cleaning, pool maintenance, and correction of defects.

If repairs or appliance replacement are needed before move-in, we give the owner a work list and monitor completion.

6️⃣ DIRECT CONTACTS

After choosing a villa, you receive the owner's or manager's direct contact details, with no hidden markup from us. We remain available and help with organizational matters.

🛎 OPTIONAL CONCIERGE SERVICE

Before your arrival, we can arrange a transfer, SIM card, exchange or cash delivery, bike rental and delivery, driving lessons, excursions, and other everyday matters.

✨ RESULT

You do not spend weeks on listings, messages, bargaining, and checks. We find options, inspect them in person, and help negotiate the best terms.

📩 To start the search, send the manager:
— your dates and length of stay;
— the number of guests;
— preferred area;
— number of bedrooms;
— approximate budget.`,
      `${HOUSING_SOURCE}#search_housing.text`,
      ["SIM"],
    ),
    "housing.videos.title": translated(
      "Видео про поиск жилья",
      "Housing-search videos",
      `${HOUSING_SOURCE}#videos.title`,
      [],
      "Source title is not rendered by the current bot, but remains part of the source record.",
    ),
    "housing.videos.body": translated(
      `🎥 Полезные видео про поиск жилья на Бали

Описание нашей услуги — 1:
https://youtu.be/OmlTDy12UQ4

Описание нашей услуги — 2:
https://youtu.be/tIc53sL41VE

Как обманывают в чатах по аренде:
https://youtu.be/keMTgU0CZbE

Как выглядит наш обзор и одна из вилл в Убуде:
https://youtu.be/GuUyNiJUu_c

Обзор виллы в Семиньяке:
https://youtu.be/m0-6q5yw_zk

Дорого не значит хорошо:
https://youtu.be/4Kr4-PfJ4-g

На что вы можете нарваться на Airbnb:
https://youtu.be/Liw3S6XyvEc`,
      `🎥 Useful videos about finding housing in Bali

Description of our service — 1:
https://youtu.be/OmlTDy12UQ4

Description of our service — 2:
https://youtu.be/tIc53sL41VE

How people are deceived in rental chats:
https://youtu.be/keMTgU0CZbE

What our review and one of the villas in Ubud look like:
https://youtu.be/GuUyNiJUu_c

Villa review in Seminyak:
https://youtu.be/m0-6q5yw_zk

Expensive does not always mean good:
https://youtu.be/4Kr4-PfJ4-g

What you may encounter on Airbnb:
https://youtu.be/Liw3S6XyvEc`,
      `${HOUSING_SOURCE}#videos.text`,
      [
        "https://youtu.be/OmlTDy12UQ4",
        "https://youtu.be/tIc53sL41VE",
        "https://youtu.be/keMTgU0CZbE",
        "https://youtu.be/GuUyNiJUu_c",
        "https://youtu.be/m0-6q5yw_zk",
        "https://youtu.be/4Kr4-PfJ4-g",
        "https://youtu.be/Liw3S6XyvEc",
        "Airbnb",
      ],
    ),
    "housing.risks.title": translated(
      "Риски аренды жилья на Бали",
      "Housing-rental risks in Bali",
      `${HOUSING_SOURCE}#risks.title`,
      [],
      "Source title is not rendered by the current bot, but remains part of the source record.",
    ),
    "housing.risks.body": translated(
      `⚠️ На что можно нарваться при самостоятельном поиске жилья

— цена может быть указана за сутки, а не за месяц
— фото могут быть сделаны на широкоугольную камеру
— объект может выглядеть лучше на фото, чем в реальности
— свежие фото могут не отражать текущее состояние виллы
— в чатах могут быть фейки, посредники или завышенные цены
— район может не подойти под ваш образ жизни
— дорого не всегда значит хорошо
— некоторые дефекты становятся заметны только при личном просмотре

Полезные видео:

Как обманывают в чатах по аренде:
https://youtu.be/keMTgU0CZbE

Дорого не значит хорошо:
https://youtu.be/4Kr4-PfJ4-g

На что вы можете нарваться на Airbnb:
https://youtu.be/Liw3S6XyvEc

Если хотите, мы можем взять поиск и проверку жилья на себя. Цена услуги: договорная.`,
      `⚠️ What you may encounter when searching for housing on your own

— the listed price may be per day rather than per month
— photographs may have been taken with a wide-angle lens
— a property may look better in photographs than in real life
— recent photographs may not reflect the villa's current condition
— chats may contain fake listings, intermediaries, or inflated prices
— the area may not fit your lifestyle
— expensive does not always mean good
— some defects become visible only during an in-person inspection

Useful videos:

How people are deceived in rental chats:
https://youtu.be/keMTgU0CZbE

Expensive does not always mean good:
https://youtu.be/4Kr4-PfJ4-g

What you may encounter on Airbnb:
https://youtu.be/Liw3S6XyvEc

If you wish, we can handle the housing search and inspection for you. The service price is agreed individually.`,
      `${HOUSING_SOURCE}#risks.text`,
      [
        "https://youtu.be/keMTgU0CZbE",
        "https://youtu.be/4Kr4-PfJ4-g",
        "https://youtu.be/Liw3S6XyvEc",
        "Airbnb",
      ],
    ),
    "housing.pageIndicator": translated(
      "📄 Страница {page} из {pageCount}",
      "📄 Page {page} of {pageCount}",
      "06 Development/bot/app/content/housing.py#get_housing_pages",
      ["{page}", "{pageCount}"],
      "Use structured page arrays; the current Russian heading-marker split is not locale-safe.",
    ),

    // Visa records are complete source captures. Every English unit is gated for human review.
    "visa.e33g.title": sensitive(
      "ITAS E33G ДЛЯ УДАЛЁННЫХ РАБОТНИКОВ НА 1 ГОД ОФШОР",
      "ITAS E33G FOR REMOTE WORKERS — 1 YEAR, OFFSHORE",
      `${VISAS_SOURCE}#E33G.title`,
      ["ITAS E33G", "1"],
    ),
    "visa.e33g.menuPriceLabel": sensitive("E33G", "E33G", `${VISAS_SOURCE}#E33G.menu_prices[0].label`, ["E33G"]),
    "visa.e33g.menuPricePrefix": sensitive("от ", "from ", `${VISAS_SOURCE}#E33G.menu_price_prefix`),
    "visa.e33g.price.standard": sensitive(
      "Стандарт — 7–10 рабочих дней",
      "Standard — 7–10 business days",
      `${VISAS_SOURCE}#E33G.prices[0].label`,
      ["7–10"],
    ),
    "visa.e33g.price.express": sensitive(
      "Экспресс — 5 рабочих дней",
      "Express — 5 business days",
      `${VISAS_SOURCE}#E33G.prices[1].label`,
      ["5"],
    ),
    "visa.e33g.body": sensitive(
      `🧑‍💻 ITAS E33G для удалённых работников на 1 год офшор

E33G — Golden Visa для проживания в Индонезии и удалённой работы на компанию, зарегистрированную за пределами Индонезии.

Срок пребывания:
— жить в Индонезии можно до 1 года
— в течение срока действия ITAS и разрешения на повторный въезд можно выезжать и возвращаться в Индонезию
— продление доступно онлайн при выполнении актуальных требований иммиграции

Семейное оформление:
— семья не добавляется к заявлению E33G автоматически
— для супруга или супруги отдельно проверяем возможность подачи по семейной категории E31B
— категории E31E для детей и E31H для родителей сейчас прямо не применяются для присоединения к держателю Golden Visa как Family Dependant
— перед оплатой обязательно подтверждаем подходящий семейный маршрут по актуальным правилам иммиграции

Для подачи:
☑️ Копия паспорта со сроком действия не менее 6 месяцев на момент прилёта
☑️ Фото как на документы
☑️ Адрес проживания в Индонезии
☑️ Банковская выписка за последние 3 месяца с минимум $2000 на счету
☑️ Резюме и план поездки
☑️ Оплата, желательно в IDR или USDT

Специальные требования E33G:
☑️ Трудовой договор с неиндонезийской компанией
☑️ Подтверждение дохода от $60.000 в год

Если у вас пока нет готового договора или корректно оформленного подтверждения дохода — напишите нам. Мы проверим вашу ситуацию, поможем подготовить правильные документы, подтверждающие реальные обстоятельства, либо предложим другой законный тип визы. Обязательные требования E33G не обходятся, а фиктивные документы не используются.

✈️ После выдачи визы есть 90 дней, чтобы влететь в Индонезию. День въезда — первый день действия ITAS.`,
      `🧑‍💻 ITAS E33G for remote workers — 1 year, offshore

E33G is a Golden Visa for living in Indonesia and working remotely for a company registered outside Indonesia.

Period of stay:
— you may live in Indonesia for up to 1 year
— while the ITAS and re-entry permit remain valid, you may leave and return to Indonesia
— an online extension is available if the current immigration requirements are met

Family applications:
— family members are not added to an E33G application automatically
— for a spouse, we separately check whether an application under family category E31B is possible
— categories E31E for children and E31H for parents currently do not expressly apply to joining a Golden Visa holder as a Family Dependant
— before payment, we always confirm the suitable family route under the current immigration rules

Documents required:
☑️ Copy of a passport valid for at least 6 months on the date of arrival
☑️ Passport-style photograph
☑️ Address of residence in Indonesia
☑️ Bank statement for the last 3 months showing at least $2000 in the account
☑️ CV and travel plan
☑️ Payment, preferably in IDR or USDT

Special E33G requirements:
☑️ Employment contract with a non-Indonesian company
☑️ Proof of annual income of at least $60.000

If you do not yet have a completed contract or properly prepared proof of income, message us. We will review your situation, help prepare correct documents that reflect the real circumstances, or suggest another lawful visa type. Mandatory E33G requirements are not bypassed, and false documents are not used.

✈️ After the visa is issued, you have 90 days to enter Indonesia. The day of entry is the first day of the ITAS validity period.`,
      `${VISAS_SOURCE}#E33G.text`,
      [
        "ITAS E33G",
        "E33G",
        "Golden Visa",
        "Family Dependant",
        "E31B",
        "E31E",
        "E31H",
        "6",
        "3",
        "$2000",
        "IDR",
        "USDT",
        "$60.000",
        "90",
      ],
      "Sensitive visa body. Keep the structured prices separate at runtime; the current Russian marker-based price stripping is not locale-safe.",
    ),

    "visa.d12.title": sensitive(
      "ВИЗА D12 НА 1 ИЛИ 2 ГОДА",
      "D12 VISA FOR 1 OR 2 YEARS",
      `${VISAS_SOURCE}#D12.title`,
      ["D12", "1", "2"],
    ),
    "visa.d12.menuPriceLabel": sensitive("D12", "D12", `${VISAS_SOURCE}#D12.menu_prices[0].label`, ["D12"]),
    "visa.d12.menuPricePrefix": sensitive("от ", "from ", `${VISAS_SOURCE}#D12.menu_price_prefix`),
    "visa.d12.price.oneYearStandard": sensitive(
      "1 год, стандарт — 7–10 рабочих дней",
      "1 year, standard — 7–10 business days",
      `${VISAS_SOURCE}#D12.prices[0].label`,
      ["1", "7–10"],
    ),
    "visa.d12.price.oneYearExpress": sensitive(
      "1 год, экспресс — 3 рабочих дня",
      "1 year, express — 3 business days",
      `${VISAS_SOURCE}#D12.prices[1].label`,
      ["1", "3"],
    ),
    "visa.d12.price.twoYearStandard": sensitive(
      "2 года, стандарт — 7–10 рабочих дней",
      "2 years, standard — 7–10 business days",
      `${VISAS_SOURCE}#D12.prices[2].label`,
      ["2", "7–10"],
    ),
    "visa.d12.price.twoYearExpress": sensitive(
      "2 года, экспресс — 3 рабочих дня",
      "2 years, express — 3 business days",
      `${VISAS_SOURCE}#D12.prices[3].label`,
      ["2", "3"],
    ),
    "visa.d12.body": sensitive(
      `🛂 Виза D12 на 1 или 2 года

D12 — многократная виза для предынвестиционной деятельности: изучения рынка и объектов, переговоров и проверки возможности будущих инвестиций. Она не разрешает получать оплату за работу, продажу товаров или услуг в Индонезии.

Срок пребывания:
— виза действует 1 или 2 года на выбор
— за один въезд можно находиться в Индонезии до 180 дней
— по текущей официальной карточке разрешено запросить одно продление
— вместо продления можно выехать и снова въехать на новый период в пределах срока действия визы
— в течение срока действия визы можно выезжать и возвращаться многократно

Для подачи:
☑️ Копия паспорта со сроком действия не менее 6 месяцев на момент прилёта
☑️ Сэлфи как на документы
☑️ Адрес проживания в Индонезии
☑️ Банковская выписка за 3 месяца с минимум $5000 на счету
☑️ Резюме и план поездки
☑️ Письмо, приглашение или деловая переписка, объясняющие цель предынвестиционной поездки
☑️ Оплата

📌 Срок визы считается с даты выпуска, а 180-дневный период пребывания — с даты каждого въезда.`,
      `🛂 D12 visa for 1 or 2 years

D12 is a multiple-entry visa for pre-investment activities: conducting market and site studies, holding negotiations, and assessing potential future investments. It does not permit receiving payment for work or selling goods or services in Indonesia.

Period of stay:
— the visa is valid for either 1 or 2 years
— each entry permits a stay in Indonesia of up to 180 days
— the current official visa information permits one extension request
— instead of extending, you may leave and re-enter for a new period within the visa validity term
— you may leave and return multiple times while the visa remains valid

Documents required:
☑️ Copy of a passport valid for at least 6 months on the date of arrival
☑️ Passport-style selfie
☑️ Address of residence in Indonesia
☑️ Bank statement for 3 months showing at least $5000 in the account
☑️ CV and travel plan
☑️ Letter, invitation, or business correspondence explaining the purpose of the pre-investment trip
☑️ Payment

📌 The visa validity term starts on the issue date, while each 180-day stay starts on the date of entry.`,
      `${VISAS_SOURCE}#D12.text`,
      [
        "D12",
        "1",
        "2",
        "180",
        "6",
        "$5000",
      ],
      "Sensitive visa body. Keep the structured prices separate at runtime; the current Russian marker-based price stripping is not locale-safe.",
    ),

    "visa.d1d2.title": sensitive("МУЛЬТИВИЗЫ D1/D2", "D1/D2 MULTIPLE-ENTRY VISAS", `${VISAS_SOURCE}#D1/D2.title`, ["D1/D2"]),
    "visa.d1d2.menuPriceLabel": sensitive("D1/D2", "D1/D2", `${VISAS_SOURCE}#D1/D2.menu_prices[0].label`, ["D1/D2"]),
    "visa.d1d2.menuPricePrefix": sensitive("от ", "from ", `${VISAS_SOURCE}#D1/D2.menu_price_prefix`),
    "visa.d1d2.price.d1OneStandard": sensitive("D1, 1 год, стандарт", "D1, 1 year, standard", `${VISAS_SOURCE}#D1/D2.prices[0].label`, ["D1", "1"]),
    "visa.d1d2.price.d1OneExpress": sensitive("D1, 1 год, экспресс", "D1, 1 year, express", `${VISAS_SOURCE}#D1/D2.prices[1].label`, ["D1", "1"]),
    "visa.d1d2.price.d2OneStandard": sensitive("D2, 1 год, стандарт", "D2, 1 year, standard", `${VISAS_SOURCE}#D1/D2.prices[2].label`, ["D2", "1"]),
    "visa.d1d2.price.d2OneExpress": sensitive("D2, 1 год, экспресс", "D2, 1 year, express", `${VISAS_SOURCE}#D1/D2.prices[3].label`, ["D2", "1"]),
    "visa.d1d2.price.d1TwoStandard": sensitive("D1, 2 года, стандарт", "D1, 2 years, standard", `${VISAS_SOURCE}#D1/D2.prices[4].label`, ["D1", "2"]),
    "visa.d1d2.price.d1TwoExpress": sensitive("D1, 2 года, экспресс", "D1, 2 years, express", `${VISAS_SOURCE}#D1/D2.prices[5].label`, ["D1", "2"]),
    "visa.d1d2.price.d2TwoStandard": sensitive("D2, 2 года, стандарт", "D2, 2 years, standard", `${VISAS_SOURCE}#D1/D2.prices[6].label`, ["D2", "2"]),
    "visa.d1d2.price.d2TwoExpress": sensitive("D2, 2 года, экспресс", "D2, 2 years, express", `${VISAS_SOURCE}#D1/D2.prices[7].label`, ["D2", "2"]),
    "visa.d1d2.price.d1FiveStandard": sensitive("D1, 5 лет, стандарт", "D1, 5 years, standard", `${VISAS_SOURCE}#D1/D2.prices[8].label`, ["D1", "5"]),
    "visa.d1d2.price.d1FiveExpress": sensitive("D1, 5 лет, экспресс", "D1, 5 years, express", `${VISAS_SOURCE}#D1/D2.prices[9].label`, ["D1", "5"]),
    "visa.d1d2.price.d2FiveStandard": sensitive("D2, 5 лет, стандарт", "D2, 5 years, standard", `${VISAS_SOURCE}#D1/D2.prices[10].label`, ["D2", "5"]),
    "visa.d1d2.price.d2FiveExpress": sensitive("D2, 5 лет, экспресс", "D2, 5 years, express", `${VISAS_SOURCE}#D1/D2.prices[11].label`, ["D2", "5"]),
    "visa.d1d2.body": sensitive(
      `🛂 Мультивизы D1/D2

D1 — многократная гостевая виза для туризма, посещения семьи, участия во встречах и транзита.
D2 — многократная гостевая виза для деловых встреч, переговоров, подписания договоров, закупки и проверки товаров.

Обе визы не разрешают получать оплату за работу, продавать товары или услуги в Индонезии. D2 также не разрешает постоянно контролировать производственную или торговую деятельность.

Срок пребывания:
— виза может быть на 1, 2 или 5 лет
— за один въезд можно находиться до 60 дней
— пребывание можно продлевать до общего срока не более 180 дней за одно посещение
— после этого нужно покинуть Индонезию
— в течение срока действия визы можно выезжать и возвращаться многократно
— D1/D2 нельзя конвертировать в ограниченный вид на жительство

Для подачи:
☑️ Паспорт со сроком действия не менее 6 месяцев
☑️ Актуальная цветная фотография
☑️ Адрес проживания в Индонезии
☑️ Банковская выписка за последние 3 месяца с минимум $2000 на счету
☑️ Резюме и план поездки
☑️ Письмо, приглашение или деловая переписка, объясняющие цель поездки
☑️ Оплата, желательно в IDR или USDT

📌 Срок действия D1/D2 считается с даты выпуска и указан в готовой eVisa. Срок каждого пребывания отсчитывается с даты въезда.`,
      `🛂 D1/D2 multiple-entry visas

D1 is a multiple-entry visitor visa for tourism, visiting family, attending meetings, and transit.
D2 is a multiple-entry visitor visa for business meetings, negotiations, signing agreements, purchasing goods, and inspecting goods.

Neither visa permits receiving payment for work or selling goods or services in Indonesia. D2 also does not permit continuously supervising production or commercial activities.

Period of stay:
— the visa may be issued for 1, 2, or 5 years
— each entry permits a stay of up to 60 days
— the stay may be extended to a total of no more than 180 days per visit
— after that, you must leave Indonesia
— you may leave and return multiple times while the visa remains valid
— D1/D2 cannot be converted into a limited stay permit

Documents required:
☑️ Passport valid for at least 6 months
☑️ Current colour photograph
☑️ Address of residence in Indonesia
☑️ Bank statement for the last 3 months showing at least $2000 in the account
☑️ CV and travel plan
☑️ Letter, invitation, or business correspondence explaining the purpose of the trip
☑️ Payment, preferably in IDR or USDT

📌 The D1/D2 validity term starts on the issue date and is stated on the issued eVisa. Each period of stay starts on the date of entry.`,
      `${VISAS_SOURCE}#D1/D2.text`,
      [
        "D1",
        "D2",
        "D1/D2",
        "1",
        "2",
        "5",
        "60",
        "180",
        "6",
        "3",
        "$2000",
        "USDT",
        "eVisa",
      ],
      "Sensitive visa body. Keep the structured prices separate at runtime; the current Russian marker-based price stripping is not locale-safe.",
    ),

    "visa.c1.title": sensitive("ВИЗА C1", "C1 VISA", `${VISAS_SOURCE}#C1.title`, ["C1"]),
    "visa.c1.price": sensitive("C1", "C1", `${VISAS_SOURCE}#C1.prices[0].label`, ["C1"]),
    "visa.c1.body": sensitive(
      `🛂 Виза C1

C1 — однократная гостевая виза для туризма, личного развития, круизных поездок, участия во встречах и выставках, деловых переговоров и осмотра объектов. Она не разрешает получать оплату за работу, продавать товары или услуги в Индонезии и выступать в качестве спикера.

Срок пребывания:
— один въезд
— до 60 дней с даты въезда
— пребывание можно продлевать до общего срока не более 180 дней
— при выполнении актуальных условий разрешение может быть конвертировано в ограниченный вид на жительство
— после выпуска визу нужно использовать в течение 90 дней

Для подачи:
☑️ Паспорт со сроком действия не менее 6 месяцев
☑️ Актуальная цветная фотография
☑️ Банковская выписка за последние 3 месяца с минимум $2000 на счету
☑️ Адрес проживания и данные поездки

Обычно гарант или спонсор не требуется. Для лиц без гражданства, владельцев проездного документа вместо национального паспорта и граждан отдельных стран действуют особые правила. Перед оплатой мы проверим, подходит ли C1 под вашу цель и гражданство.`,
      `🛂 C1 visa

C1 is a single-entry visitor visa for tourism, personal development, cruise travel, attending meetings and exhibitions, business negotiations, and conducting site visits. It does not permit receiving payment for work, selling goods or services in Indonesia, or acting as a speaker.

Period of stay:
— one entry
— up to 60 days from the date of entry
— the stay may be extended to a total of no more than 180 days
— if the current conditions are met, the permit may be converted into a limited stay permit
— after issue, the visa must be used within 90 days

Documents required:
☑️ Passport valid for at least 6 months
☑️ Current colour photograph
☑️ Bank statement for the last 3 months showing at least $2000 in the account
☑️ Address of residence and trip details

A guarantor or sponsor is usually not required. Special rules apply to stateless persons, holders of a travel document instead of a national passport, and citizens of certain countries. Before payment, we will check whether C1 is suitable for your purpose and nationality.`,
      `${VISAS_SOURCE}#C1.text`,
      ["C1", "60", "180", "90", "6", "3", "$2000"],
    ),

    "visa.voa.title": sensitive("VOA", "VOA", `${VISAS_SOURCE}#VOA.title`, ["VOA"]),
    "visa.voa.price": sensitive("eVOA", "eVOA", `${VISAS_SOURCE}#VOA.prices[0].label`, ["eVOA"]),
    "visa.voa.priceNote": sensitive(
      "В цене eVOA уже учтён официальный PNBP 500.000 IDR.",
      "The eVOA price already includes the official PNBP fee of 500.000 IDR.",
      `${VISAS_SOURCE}#VOA.price_note`,
      ["eVOA", "PNBP", "500.000 IDR"],
    ),
    "visa.voa.body": sensitive(
      `🛂 eVOA / B1 для короткой поездки

eVOA — электронная туристическая виза по прибытии для граждан стран из официального списка. Она подходит для туризма, посещения друзей и семьи, участия во встречах и транзита, но не разрешает получать оплату за работу, товары или услуги в Индонезии.

Срок пребывания:
— один въезд
— до 30 дней с даты въезда
— можно продлить один раз ещё на 30 дней, максимум до 60 дней
— после выпуска eVOA нужно использовать в течение 90 дней

Для оформления:
☑️ Паспорт со сроком действия не менее 6 месяцев
☑️ Фото
☑️ Данные поездки и адрес проживания
☑️ Обратный билет или билет в третью страну

Перед оплатой проверим, доступна ли eVOA для вашего гражданства и подходит ли она под цель поездки.`,
      `🛂 eVOA / B1 for a short trip

eVOA is an electronic tourist visa on arrival for citizens of countries on the official list. It is suitable for tourism, visiting friends and family, attending meetings, and transit, but it does not permit receiving payment for work, goods, or services in Indonesia.

Period of stay:
— one entry
— up to 30 days from the date of entry
— it may be extended once for another 30 days, up to a maximum of 60 days
— after issue, the eVOA must be used within 90 days

Documents required:
☑️ Passport valid for at least 6 months
☑️ Photograph
☑️ Trip details and address of residence
☑️ Return ticket or onward ticket to a third country

Before payment, we will check whether eVOA is available for your nationality and suitable for the purpose of your trip.`,
      `${VISAS_SOURCE}#VOA.text`,
      ["eVOA", "B1", "30", "60", "90", "6"],
    ),

    "visa.other.title": sensitive("Другая виза", "Other visa", `${VISAS_SOURCE}#Другая виза.title`),
    "visa.other.body": sensitive(
      `🛂 Другая виза

Срок пребывания:
— зависит от конкретного типа визы
— подбирается индивидуально под вашу ситуацию, гражданство, цели поездки и срок пребывания

Если вы не знаете, какой тип визы подходит, или у вас нестандартная ситуация — напишите вопрос.

Мы разберём вашу задачу вручную и предложим подходящий вариант.`,
      `🛂 Other visa

Period of stay:
— depends on the specific visa type
— is selected individually for your situation, nationality, purpose of travel, and intended stay

If you are unsure which visa type fits or your situation is unusual, send us a question.

We will review your case manually and suggest a suitable option.`,
      `${VISAS_SOURCE}#Другая виза.text`,
    ),

    "visa.price.heading": sensitive(
      "💰 Стоимость под ключ:",
      "💰 All-inclusive price:",
      "06 Development/bot/app/content/visas.py#_price_block",
    ),
    "visa.price.feesIncluded": sensitive(
      "Государственные иммиграционные сборы и сервис SAFR включены.",
      "Government immigration fees and the SAFR service are included.",
      "06 Development/bot/app/content/visas.py#_price_block",
      ["SAFR"],
    ),
    "visa.price.noExtra": sensitive(
      "Дополнительных иммиграционных и сервисных платежей сверху нет.",
      "There are no additional immigration or service charges on top.",
      "06 Development/bot/app/content/visas.py#_price_block",
    ),
    "visa.price.line": sensitive(
      "▪️ {label}: {idr}{usdSuffix}",
      "▪️ {label}: {idr}{usdSuffix}",
      "06 Development/bot/app/content/visas.py#_price_block",
      ["{label}", "{idr}", "{usdSuffix}"],
    ),
    "visa.disclaimer.conditionsMayChange": sensitive(
      "❗️Сроки, условия и требования могут меняться из-за работы иммиграционной системы, новых постановлений, праздников и технических сбоев.",
      "❗️Timelines, conditions, and requirements may change due to immigration-system operation, new regulations, holidays, and technical failures.",
      "06 Development/bot/app/content/visas.py#get_visa_card",
    ),
    "visa.disclaimer.verifyBeforePayment": sensitive(
      "Перед оплатой мы дополнительно проверим актуальные условия по вашей ситуации.",
      "Before payment, we will additionally verify the current conditions for your situation.",
      "06 Development/bot/app/content/visas.py#get_visa_card",
    ),
    "visa.disclaimer.writeNext": sensitive(
      "Чтобы оставить заявку или задать вопрос по этой визе — напишите следующим сообщением.",
      "To submit a request or ask a question about this visa, send your next message.",
      "06 Development/bot/app/content/visas.py#get_visa_card",
    ),
    "visa.menuLabelTemplate": sensitive(
      "{baseLabel} — {menuPricePrefix}{visiblePrices}",
      "{baseLabel} — {menuPricePrefix}{visiblePrices}",
      "06 Development/bot/app/content/visas.py#get_visa_menu_labels",
      ["{baseLabel}", "{menuPricePrefix}", "{visiblePrices}"],
    ),

    // Main menu, destinations, and country/service navigation.
    "keyboard.main.placeholder": translated(
      "Выберите, что вам нужно",
      "Choose what you need",
      "06 Development/bot/app/keyboards/main_menu.py#main_menu_keyboard",
    ),
    "keyboard.destination.placeholder": translated(
      "Выберите направление",
      "Choose a destination",
      "06 Development/bot/app/handlers/destinations.py#destinations_keyboard",
    ),
    "keyboard.thailand.placeholder": translated(
      "Выберите услугу в Таиланде",
      "Choose a service in Thailand",
      "06 Development/bot/app/handlers/destinations.py#thailand_keyboard",
    ),
    "keyboard.russia.placeholder": translated(
      "Выберите город или регион",
      "Choose a city or region",
      "06 Development/bot/app/handlers/destinations.py#russia_keyboard",
    ),
    "keyboard.spb.placeholder": translated(
      "Выберите услугу в Петербурге",
      "Choose a service in Saint Petersburg",
      "06 Development/bot/app/handlers/destinations.py#spb_keyboard",
    ),
    "keyboard.ural.placeholder": translated(
      "Выберите услугу на Урале",
      "Choose a service in the Urals",
      "06 Development/bot/app/handlers/destinations.py#ural_keyboard",
    ),
    "keyboard.caucasus.placeholder": translated(
      "Услуги Кавказа скоро появятся",
      "Caucasus services are coming soon",
      "06 Development/bot/app/handlers/destinations.py#caucasus_keyboard",
    ),
    "keyboard.nepal.placeholder": translated(
      "Выберите услугу в Непале",
      "Choose a service in Nepal",
      "06 Development/bot/app/handlers/destinations.py#nepal_keyboard",
    ),
    "destination.choose": translated(
      "🌍 Выберите направление, которое вас интересует:",
      "🌍 Choose the destination you are interested in:",
      "06 Development/bot/app/handlers/destinations.py#show_destinations",
    ),
    "destination.screen.bali": translated(
      "🌴 Бали\n\nВыберите нужную услугу:",
      "🌴 Bali\n\nChoose the service you need:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.bali",
    ),
    "guide.allIndonesia.message": sensitive(
      "📚 All Indonesia\n\nПошаговый гайд по самостоятельному заполнению электронной декларации для въезда в Индонезию. Скачайте PDF заранее и сохраните его на телефон — так инструкция останется под рукой даже при нестабильном интернете.\n\nГосударственная форма бесплатна. Если нужна помощь с заполнением и проверкой данных, SAFRWAY может подготовить декларацию по актуальной опубликованной цене. Перед отправкой обязательно проверьте все персональные сведения.",
      "📚 All Indonesia\n\nA step-by-step guide to completing Indonesia's electronic arrival declaration yourself. Download the PDF before the trip and save it to your phone so the instructions remain available if the connection is unstable.\n\nThe government form is free. If you need help completing and checking the information, SAFRWAY can prepare the declaration at the current published price. Always verify all personal details before submission.",
      "06 Development/shared/src/guides/all-indonesia.ts",
      ["All Indonesia", "PDF", "SAFRWAY"],
    ),
    "destination.screen.thailand": translated(
      "🇹🇭 Таиланд\n\nВыберите интересующий раздел:",
      "🇹🇭 Thailand\n\nChoose a section:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.thailand",
    ),
    "destination.screen.russia": translated(
      "🇷🇺 Россия\n\nВыберите город или регион:",
      "🇷🇺 Russia\n\nChoose a city or region:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.russia",
    ),
    "destination.screen.spb": translated(
      "🌉 Санкт-Петербург\n\nВыберите интересующий формат отдыха:",
      "🌉 Saint Petersburg\n\nChoose the type of activity you are interested in:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.spb",
    ),
    "destination.screen.ural": translated(
      "⛰ Урал\n\nВыберите интересующий формат отдыха:",
      "⛰ Urals\n\nChoose the type of activity you are interested in:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.ural",
    ),
    "destination.screen.caucasus": translated(
      "🏔 Кавказ\n\nИнформацию об услугах скоро добавим. Уже сейчас вы можете написать менеджеру и получить консультацию.",
      "🏔 Caucasus\n\nService information will be added soon. You can already message a manager and get a consultation.",
      "06 Development/bot/app/handlers/destinations.py#show_destination.caucasus",
    ),
    "destination.screen.nepal": translated(
      "🇳🇵 Непал\n\nВыберите интересующую услугу:",
      "🇳🇵 Nepal\n\nChoose a service:",
      "06 Development/bot/app/handlers/destinations.py#show_destination.nepal",
    ),
    "app.unavailable": translated(
      "⚠️ SAFR App сейчас недоступен. Попробуйте немного позже.",
      "⚠️ SAFR App is currently unavailable. Please try again a little later.",
      "06 Development/bot/app/handlers/destinations.py#mini_app_menu_handler",
      ["SAFR App"],
    ),
    "app.openPrompt": translated(
      "🚀 Откройте SAFR App кнопкой ниже.\n\nTelegram безопасно подтвердит ваш профиль без отдельной регистрации.",
      "🚀 Open SAFR App using the button below.\n\nTelegram will securely verify your profile without a separate registration.",
      "06 Development/bot/app/handlers/destinations.py#mini_app_menu_handler",
      ["SAFR App", "Telegram"],
    ),
    "destination.comingSoon.guide": translated(
      "Информацию скоро добавим, но вы уже можете получить консультацию от нашего гида по всем услугам.",
      "Information will be added soon, but you can already get advice from our guide about all services.",
      "06 Development/bot/app/handlers/destinations.py#coming_soon_handler",
    ),
    "destination.comingSoon.manager": translated(
      "Информацию скоро добавим, но вы уже можете написать менеджеру и получить консультацию.",
      "Information will be added soon, but you can already message a manager and get a consultation.",
      "06 Development/bot/app/handlers/destinations.py#coming_soon_handler",
    ),
    "destination.comingSoon.message": translated(
      "🚧 {serviceName}\n\n{consultationText}\n\nНажмите «✍️ Написать менеджеру», чтобы задать вопрос.",
      "🚧 {serviceName}\n\n{consultationText}\n\nTap “✍️ Message a manager” to ask a question.",
      "06 Development/bot/app/handlers/destinations.py#coming_soon_handler",
      ["{serviceName}", "{consultationText}"],
    ),
    "destination.service.thailandExchange": translated("Обмен в Таиланде", "Exchange in Thailand", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.thailandVisas": sensitive("Визы в Таиланде", "Visas in Thailand", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.thailandRealEstate": translated("Недвижимость в Таиланде", "Real estate in Thailand", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.thailandYachts": translated("Яхты в Таиланде", "Yachts in Thailand", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.spbSup": translated("SUP-туры в Петербурге", "SUP tours in Saint Petersburg", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES", ["SUP"]),
    "destination.service.spbBoat": translated("Прогулки на катере в Петербурге", "Boat trips in Saint Petersburg", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.spbCampfire": translated("Посиделки у костра в Петербурге", "Campfire gatherings in Saint Petersburg", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.chelyabinskSup": translated("SUP-туры в Челябинске", "SUP tours in Chelyabinsk", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES", ["SUP"]),
    "destination.service.chelyabinskRafting": translated("Сплавы в Челябинске", "Rafting in Chelyabinsk", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.chelyabinskCampfire": translated("Посиделки у костра в Челябинске", "Campfire gatherings in Chelyabinsk", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.chelyabinskRetreat": translated("Организация ретрита в Челябинске", "Retreat organization in Chelyabinsk", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.uralSup": translated("SUP-туры на Урале", "SUP tours in the Urals", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES", ["SUP"]),
    "destination.service.uralRafting": translated("Сплавы на Урале", "Rafting in the Urals", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.uralCampfire": translated("Посиделки у костра на Урале", "Campfire gatherings in the Urals", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.uralRetreat": translated("Организация ретрита на Урале", "Retreat organization in the Urals", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.kailash": translated("Трекинг на Кайлас", "Kailash trek", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.everest": translated("Трекинг к Эвересту", "Everest trek", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.annapurna": translated("Трекинг по хребту Аннапурна", "Annapurna Circuit trek", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.nepalTransfer": translated("Трансфер в Непале", "Transfer in Nepal", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.nepalHousing": translated("Жильё в Непале", "Housing in Nepal", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),
    "destination.service.nepalGuide": translated("Услуги гида в Непале", "Guide services in Nepal", "06 Development/bot/app/handlers/destinations.py#COMING_SOON_SERVICES"),

    // Client menu, calculator, service-request, account, and support states.
    "keyboard.account.placeholder": translated("Выберите раздел личного кабинета", "Choose an account section", "06 Development/bot/app/handlers/menu.py#personal_account_keyboard"),
    "keyboard.visa.placeholder": sensitive("Выберите тип визы", "Choose a visa type", "06 Development/bot/app/handlers/menu.py#visa_keyboard"),
    "keyboard.housing.placeholder": translated("Выберите задачу по жилью", "Choose a housing task", "06 Development/bot/app/handlers/menu.py#housing_keyboard"),
    "keyboard.exchange.placeholder": translated("Выберите тип обмена", "Choose an exchange type", "06 Development/bot/app/handlers/menu.py#currency_exchange_keyboard"),
    "housing.pagination.next": translated("Далее ➡️", "Next ➡️", "06 Development/bot/app/handlers/menu.py#housing_pages_keyboard"),
    "housing.pagination.back": translated("⬅️ Назад", "⬅️ Back", "06 Development/bot/app/handlers/menu.py#housing_pages_keyboard"),
    "housing.pagination.section": translated("🏡 К разделу жилья", "🏡 Housing section", "06 Development/bot/app/handlers/menu.py#housing_pages_keyboard"),
    "housing.pagination.counter": translated("{page}/{pageCount}", "{page}/{pageCount}", "06 Development/bot/app/handlers/menu.py#housing_pages_keyboard", ["{page}", "{pageCount}"]),
    "housing.pagination.notFound": translated("Страница не найдена", "Page not found", "06 Development/bot/app/handlers/menu.py#housing_page_handler"),
    "housing.section": translated("🏡 Раздел жилья:", "🏡 Housing section:", "06 Development/bot/app/handlers/menu.py#housing_page_handler"),
    "exchange.intro": translated(
      "💱 Обмен валюты на Бали\n\nМы можем помочь с обменом USDT на наличные IDR, а также с другими направлениями обмена.\n\nАктуальный курс, доступную сумму и условия уточняйте в боте или у менеджера.",
      "💱 Currency exchange in Bali\n\nWe can help exchange USDT for cash IDR and with other exchange routes.\n\nCheck the current rate, available amount, and terms in the bot or with a manager.",
      "06 Development/bot/app/handlers/menu.py#currency_exchange_handler",
      ["USDT", "IDR"],
    ),
    "exchange.calculator.unavailable": translated(
      "⚠️ Калькулятор Mini App сейчас недоступен. Напишите менеджеру для ручного расчёта.",
      "⚠️ The Mini App calculator is currently unavailable. Message a manager for a manual calculation.",
      "06 Development/bot/app/handlers/menu.py#currency_calculator_start_handler",
      ["Mini App"],
    ),
    "exchange.calculator.intro": translated(
      `🧮 Калькулятор обмена полностью работает в Mini App.

Там можно выбрать, что вы отдаёте и получаете, а также указать либо имеющуюся сумму, либо желаемый результат.

Сейчас автоматически рассчитываются:
• USDT → наличные IDR;
• USDT → безналичные IDR;
• наличные IDR → безналичные RUB.`,
      `🧮 The exchange calculator is fully available in the Mini App.

There you can choose what you give and receive and enter either the amount you have or the result you want.

The following routes are currently calculated automatically:
• USDT → cash IDR;
• USDT → bank-transfer IDR;
• cash IDR → bank-transfer RUB.`,
      "06 Development/bot/app/handlers/menu.py#currency_calculator_start_handler",
      ["Mini App", "USDT", "IDR", "RUB"],
    ),
    "exchange.calculator.cta": translated("🧮 Рассчитать в Mini App", "🧮 Calculate in Mini App", "06 Development/bot/app/handlers/menu.py#currency_calculator_start_handler", ["Mini App"]),
    "exchange.other.prompt": translated(
      "🔄 Напишите менеджеру, что хотите обменять.\n\nУкажите валюту, сумму и что хотите получить — например, RUB → IDR или наличные IDR → USDT.",
      "🔄 Tell the manager what you want to exchange.\n\nSpecify the currency, amount, and what you want to receive — for example, RUB → IDR or cash IDR → USDT.",
      "06 Development/bot/app/handlers/menu.py#other_currency_exchange_handler",
      ["RUB", "IDR", "USDT"],
    ),
    "housing.request.details": translated(
      "Можете сразу написать следующим сообщением, что именно ищете: срок, район, бюджет, количество спален и даты заезда.",
      "In your next message, you can immediately describe what you need: duration, area, budget, number of bedrooms, and move-in dates.",
      "06 Development/bot/app/handlers/menu.py#housing_handler",
    ),
    "visa.question.prompt": sensitive(
      `🛂 Опишите ваш вопрос по визе следующим сообщением.

Например:
— какая виза нужна
— на какой срок
— где вы сейчас находитесь
— есть ли действующая виза

Ваше сообщение уйдёт визовому админу и главному админу с пометкой «Вопрос по визе».`,
      `🛂 Describe your visa question in the next message.

For example:
— which visa you need
— for how long
— where you are now
— whether you have a valid visa

Your message will go to the visa administrator and the main administrator, marked “Visa question”.`,
      "06 Development/bot/app/handlers/menu.py#visa_question_handler",
    ),
    "housing.question.prompt": translated(
      `🏡 Опишите ваш вопрос по жилью следующим сообщением.

Напишите, пожалуйста:
— даты или срок
— бюджет
— район
— сколько человек
— что важно по объекту

Ваше сообщение уйдёт админам с пометкой «Вопрос по жилью».`,
      `🏡 Describe your housing question in the next message.

Please include:
— dates or duration
— budget
— area
— number of people
— what matters to you about the property

Your message will go to the administrators, marked “Housing question”.`,
      "06 Development/bot/app/handlers/menu.py#housing_category_handler",
    ),
    "visa.missingDocuments.prompt": sensitive(
      `❓ Если у вас нет всех документов — это не всегда проблема.

Мы поможем разобраться, какие документы обязательны именно в вашей ситуации, что можно подготовить, а где есть альтернативные варианты.

По некоторым требованиям мы можем подсказать решение или помочь с оформлением.

Напишите следующим сообщением, каких документов у вас нет или в чём сомнение. Менеджер по визам посмотрит ситуацию и подскажет, как лучше действовать.`,
      `❓ Not having every document is not always a problem.

We will help determine which documents are mandatory in your situation, what can be prepared, and where alternative options may exist.

For some requirements, we may be able to suggest a solution or help with preparation.

In your next message, say which documents you do not have or what you are unsure about. A visa manager will review the situation and suggest the best way forward.`,
      "06 Development/bot/app/handlers/menu.py#visa_missing_documents_handler",
    ),
    "service.question.sent": translated(
      "✅ Вопрос передан команде.\n\nМы посмотрим задачу и вернёмся с ответом.",
      "✅ Your question has been sent to the team.\n\nWe will review it and get back to you.",
      "06 Development/bot/app/handlers/menu.py#service_question_message_handler",
    ),
    "menu.mainLabel": translated("Главное меню:", "Main menu:", "06 Development/bot/app/handlers/menu.py#back_to_menu_handler"),
    "referral.personalLink": translated(
      `🔗 Ваша персональная ссылка

{referralLink}

Зачем она нужна:
— вы отправляете ссылку человеку, которому могут быть полезны услуги SAFR
— человек запускает бота по вашей ссылке
— он закрепляется в вашей сети
— после подтверждённой покупки услуги в любом направлении вы сможете получать SAFR Points

Привязка действует на весь бот: Бали, Таиланд, Россия, Непал и будущие направления.

Важно: связь с пригласившим закрепляется один раз. Повторно перепривязать человека к другой сети нельзя.`,
      `🔗 Your personal link

{referralLink}

What it is for:
— you send the link to someone who may benefit from SAFR services
— the person starts the bot through your link
— they are assigned to your network
— after a confirmed service purchase in any destination, you may receive SAFR Points

The attribution applies across the entire bot: Bali, Thailand, Russia, Nepal, and future destinations.

Important: the inviter relationship is assigned once. A person cannot later be reassigned to another network.`,
      "06 Development/bot/app/handlers/menu.py#my_referral_handler",
      ["{referralLink}", "SAFR", "SAFR Points"],
    ),
    "support.sent": translated(
      "✅ Технический вопрос отправлен Админу Никите.",
      "✅ Your technical question has been sent to Admin Nikita.",
      "06 Development/bot/app/handlers/menu.py#tech_support_message_handler",
    ),

    // Client conversation FSM, replies, and notifications. User/manager text stays in placeholders.
    "keyboard.dialog.startPlaceholder": translated(
      "Напишите вопрос или завершите диалог",
      "Write a question or end the conversation",
      "06 Development/bot/app/handlers/contact.py#client_start_dialog_keyboard",
    ),
    "keyboard.dialog.replyPlaceholder": translated(
      "Напишите ответ или завершите диалог",
      "Write a reply or end the conversation",
      "06 Development/bot/app/handlers/contact.py#client_dialog_keyboard",
    ),
    "keyboard.dialog.closedPlaceholder": translated(
      "Выберите действие",
      "Choose an action",
      "06 Development/bot/app/handlers/contact.py#client_closed_dialog_keyboard",
    ),
    "dialog.startPrompt": translated(
      `✍️ Напишите ваш вопрос менеджеру одним сообщением.

{route_context}

Например:
— нужна вилла на месяц, бюджет до 2500$
— хочу оформить визу
— нужна консультация по переезду

Я передам сообщение человеку.

Чтобы выйти из режима диалога, нажмите ✅ Закончить диалог.`,
      `✍️ Send your question to the manager in one message.

{route_context}

For example:
— I need a villa for one month, with a budget of up to 2500$
— I want to arrange a visa
— I need a relocation consultation

I will pass the message to a person.

To leave conversation mode, tap ✅ End conversation.`,
      "06 Development/bot/app/handlers/contact.py#contact_human_start",
      ["{route_context}", "2500$"],
    ),
    "dialog.finished": translated(
      "✅ Диалог завершён.\n\nЧто хотите сделать дальше?",
      "✅ The conversation has ended.\n\nWhat would you like to do next?",
      "06 Development/bot/app/handlers/contact.py#contact_human_message|close_dialog_handler",
    ),
    "dialog.messageDelivered": translated(
      "✅ Сообщение передано человеку.",
      "✅ Your message has been passed to a person.",
      "06 Development/bot/app/handlers/contact.py#contact_human_message|active_dialog_message_handler",
    ),
    "dialog.replyPrompt": translated(
      "Напишите ваш ответ следующим сообщением.\n\nЯ передам его человеку.",
      "Write your reply in the next message.\n\nI will pass it to a person.",
      "06 Development/bot/app/handlers/contact.py#client_reply_button_handler",
    ),
    "dialog.returned": translated(
      "↩️ Вы вернулись в диалог.\n\nНапишите сообщение, и я передам его человеку.",
      "↩️ You have returned to the conversation.\n\nWrite a message and I will pass it to a person.",
      "06 Development/bot/app/handlers/contact.py#return_to_dialog_handler",
    ),
    "dialog.new": translated(
      "🆕 Новый диалог открыт.\n\nНапишите ваш вопрос одним сообщением.",
      "🆕 A new conversation is open.\n\nSend your question in one message.",
      "06 Development/bot/app/handlers/contact.py#new_dialog_handler",
    ),
    "dialog.complaintPrompt": translated(
      "🚨 Напишите жалобу одним сообщением.\n\nОна уйдёт напрямую главному админу.",
      "🚨 Write your complaint in one message.\n\nIt will go directly to the main administrator.",
      "06 Development/bot/app/handlers/contact.py#boss_complaint_start",
    ),
    "dialog.complaintDelivered": translated(
      "✅ Жалоба передана главному админу.",
      "✅ Your complaint has been sent to the main administrator.",
      "06 Development/bot/app/handlers/contact.py#boss_complaint_message",
    ),
    "dialog.staffVoiceReply": translated(
      "💬 Голосовой ответ от команды SAFR:",
      "💬 Voice reply from the SAFR team:",
      "06 Development/bot/app/handlers/contact.py#admin_reply_message",
      ["SAFR"],
    ),
    "dialog.staffTextReply": translated(
      "💬 Ответ от команды SAFR:\n\n{manager_message}",
      "💬 Reply from the SAFR team:\n\n{manager_message}",
      "06 Development/bot/app/handlers/contact.py#admin_reply_message",
      ["SAFR", "{manager_message}"],
      "Manager free text in {manager_message} must never be translated.",
    ),
    "dialog.staffCommandReplyLegacy": translated(
      "💬 Ответ от команды SAFR Bali:\n\n{manager_message}",
      "💬 Reply from the SAFR Bali team:\n\n{manager_message}",
      "06 Development/bot/app/handlers/admin_reply.py#reply_to_client_handler",
      ["SAFR Bali", "{manager_message}"],
      "Manager free text in {manager_message} must never be translated.",
    ),

    // Referral registration states and the referrer-facing notification.
    "referral.registration.self": translated(
      "⚠️ Нельзя зарегистрироваться по собственной реферальной ссылке.",
      "⚠️ You cannot register through your own referral link.",
      "06 Development/bot/app/handlers/start.py#attach_referral_if_needed",
    ),
    "referral.registration.alreadySame": translated(
      "✅ Вы уже подключены к этой реферальной сети.",
      "✅ You are already connected to this referral network.",
      "06 Development/bot/app/handlers/start.py#attach_referral_if_needed",
    ),
    "referral.registration.alreadyOther": translated(
      "⚠️ Вы уже закреплены в другой реферальной сети.\n\nЕсли это ошибка — напишите в техподдержку.",
      "⚠️ You are already assigned to another referral network.\n\nIf this is an error, contact tech support.",
      "06 Development/bot/app/handlers/start.py#attach_referral_if_needed",
    ),
    "referral.registration.connected": translated(
      "✅ Вы подключены к реферальной сети.",
      "✅ You are connected to the referral network.",
      "06 Development/bot/app/handlers/start.py#attach_referral_if_needed",
    ),
    "referral.notification.newReferral": translated(
      `🎉 К вашей сети подключился новый реферал!

Имя: {full_name}
Telegram ID: {telegram_id}
Username: {username}

Бонусы будут начислены после целевого действия пользователя.`,
      `🎉 A new referral has joined your network!

Name: {full_name}
Telegram ID: {telegram_id}
Username: {username}

Rewards will be credited after the user's target action.`,
      "06 Development/bot/app/handlers/start.py#notify_referrer",
      ["{full_name}", "{telegram_id}", "{username}", "Telegram ID", "Username"],
      "Profile placeholders are user data and must never be translated.",
    ),
    "error.staleButton": translated(
      "Эта кнопка устарела. Откройте актуальное меню.",
      "This button is outdated. Open the current menu.",
      "06 Development/bot/app/handlers/fallback.py#stale_callback_handler",
    ),

    // Account, orders, Points, and client network rendering.
    "account.points.summary": translated(
      `🎁 Мой баланс SAFR Points

Баланс: {balance} SAFR Points
Приглашено напрямую: {referralCount}

Начисления появляются после подтверждения целевого действия или покупки.`,
      `🎁 My SAFR Points balance

Balance: {balance} SAFR Points
Invited directly: {referralCount}

Rewards appear after a target action or purchase is confirmed.`,
      "06 Development/bot/app/services/account.py#get_points_summary",
      ["SAFR Points", "{balance}", "{referralCount}"],
    ),
    "account.orders.empty": translated(
      "📦 Мои купленные услуги\n\nПодтверждённых заказов пока нет.",
      "📦 My purchased services\n\nThere are no confirmed orders yet.",
      "06 Development/bot/app/services/account.py#get_orders_summary",
    ),
    "account.orders.heading": translated(
      "📦 Мои купленные услуги",
      "📦 My purchased services",
      "06 Development/bot/app/services/account.py#get_orders_summary",
    ),
    "account.orders.row": translated(
      "№{orderId} — {service}\nСтатус: {status} / оплата: {paymentStatus}{amount}",
      "No. {orderId} — {service}\nStatus: {status} / payment: {paymentStatus}{amount}",
      "06 Development/bot/app/services/account.py#get_orders_summary",
      ["{orderId}", "{service}", "{status}", "{paymentStatus}", "{amount}"],
      "Service names and raw data values must not be machine-translated; map known status IDs through the keys below.",
    ),
    "account.orders.usdAmount": translated(
      " / ${amountUsd}",
      " / ${amountUsd}",
      "06 Development/bot/app/services/account.py#get_orders_summary",
      ["{amountUsd}"],
      "The literal $ currency marker and amount placeholder are preserved; the underlying currency ID remains USD.",
    ),
    "order.status.new": translated("Новый", "New", "06 Development/backend/app/models/order.py#Order.status", [], "Display label for the exact backend status ID new."),
    "order.status.completed": translated("Завершён", "Completed", "06 Development/backend/app/services/admin_orders.py#transition_order", [], "Display label for the exact backend status ID completed."),
    "order.status.cancelled": translated("Отменён", "Cancelled", "06 Development/backend/app/services/admin_orders.py#transition_order", [], "Display label for the exact backend status ID cancelled."),
    "order.payment.pending": translated("Ожидает оплаты", "Pending", "06 Development/backend/app/models/order.py#Order.payment_status", [], "Display label for the exact backend payment-status ID pending."),
    "order.payment.paid": translated("Оплачен", "Paid", "06 Development/backend/app/services/admin_orders.py#transition_order", [], "Display label for the exact backend payment-status ID paid."),
    "order.payment.cancelled": translated("Отменён", "Cancelled", "06 Development/backend/app/api/payments.py#ALLOWED_PAYMENT_STATUSES", [], "Display label for the exact backend payment-status ID cancelled."),
    "order.payment.refunded": translated("Возвращён", "Refunded", "06 Development/backend/app/api/payments.py#ALLOWED_PAYMENT_STATUSES", [], "Display label for the exact backend payment-status ID refunded."),
    "order.payment.refundRequired": translated("Требуется возврат", "Refund required", "06 Development/backend/app/services/admin_orders.py#transition_order", [], "Display label for the exact backend payment-status ID refund_required."),
    "referral.profile.unknownId": translated("неизвестен", "unknown", "06 Development/bot/app/services/referrals.py#format_profile"),
    "referral.profile.missingName": translated("Имя не указано", "Name not provided", "06 Development/bot/app/services/referrals.py#format_profile"),
    "referral.profile.missingUsername": translated("username не указан", "username not provided", "06 Development/bot/app/services/referrals.py#format_profile", ["username"]),
    "referral.profile.format": translated(
      "{full_name} / {username} / ID {telegram_id}",
      "{full_name} / {username} / ID {telegram_id}",
      "06 Development/bot/app/services/referrals.py#format_profile",
      ["{full_name}", "{username}", "{telegram_id}", "ID"],
      "All placeholders are user data and must never be translated.",
    ),
    "referral.network.truncated": translated(
      "… список сокращён",
      "… list shortened",
      "06 Development/bot/app/services/referrals.py#_telegram_safe",
    ),
    "referral.network.heading": translated("🌐 Моя сеть", "🌐 My network", "06 Development/bot/app/services/referrals.py#format_network_summary"),
    "referral.network.directCount": translated(
      "Приглашено напрямую: {count}",
      "Invited directly: {count}",
      "06 Development/bot/app/services/referrals.py#format_network_summary",
      ["{count}"],
    ),
    "referral.network.empty": translated(
      "Пока никто не зарегистрировался по вашей ссылке.\nОтправьте персональную ссылку человеку — после первого запуска он появится здесь.",
      "No one has registered through your link yet.\nSend your personal link to someone; after their first launch, they will appear here.",
      "06 Development/bot/app/services/referrals.py#format_network_summary",
    ),
    "referral.network.recentHeading": translated(
      "Последние приглашённые:",
      "Recently invited:",
      "06 Development/bot/app/services/referrals.py#format_network_summary",
    ),
    "referral.network.row": translated(
      "— {profile}\n  Дата: {createdAt}",
      "— {profile}\n  Date: {createdAt}",
      "06 Development/bot/app/services/referrals.py#format_network_summary",
      ["{profile}", "{createdAt}"],
      "The profile and stored date are source data and must never be translated or reformatted implicitly.",
    ),
    "referral.network.dateMissing": translated(
      "не зафиксирована",
      "not recorded",
      "06 Development/bot/app/services/referrals.py#format_network_summary",
    ),
    "language.prompt": translated(
      "Выберите язык интерфейса.\n\nТекущий язык: {language}",
      "Choose your interface language.\n\nCurrent language: {language}",
      "06 Development/bot/app/handlers/language.py#show_language",
      ["{language}"],
    ),
    "language.option.ru": translated(
      "🇷🇺 Русский",
      "🇷🇺 Русский",
      "06 Development/bot/app/handlers/language.py#language_keyboard",
    ),
    "language.option.en": translated(
      "🇬🇧 English",
      "🇬🇧 English",
      "06 Development/bot/app/handlers/language.py#language_keyboard",
    ),
    "language.saving": translated(
      "Сохраняем язык…",
      "Saving language…",
      "06 Development/bot/app/handlers/language.py#set_language",
    ),
    "language.saved": translated(
      "Язык сохранён: {language}.",
      "Language saved: {language}.",
      "06 Development/bot/app/handlers/language.py#set_language",
      ["{language}"],
    ),
    "language.pendingSync": translated(
      "Mini App применит настройку при следующем подключении.",
      "The Mini App will apply this preference when it reconnects.",
      "06 Development/bot/app/handlers/language.py#set_language",
      ["Mini App"],
    ),
    "language.failed": translated(
      "Не удалось сохранить язык. Текущий язык не изменён.",
      "Language could not be saved. Your current language was not changed.",
      "06 Development/bot/app/handlers/language.py#set_language",
    ),
  },
});

export type BotTranslationKey = keyof typeof botCorpus.entries;

export const BOT_SENSITIVE_REVIEW_KEYS = (
  Object.keys(botCorpus.entries) as BotTranslationKey[]
).filter(
  (key) => botCorpus.entries[key].review === "HUMAN_REVIEW_REQUIRED",
);
