import {
  defineCorpus,
  type SourceVerificationStatus,
  type TranslationReviewStatus,
  type TranslationUnit,
} from "./types";
import { botCorpus } from "./bot";

const PUBLIC_CATALOG_SOURCE = "06 Development/shared/src/catalog.ts";
const PUBLIC_MODEL_SOURCE = "06 Development/astro-site/src/lib/public-catalog.ts";
const PUBLIC_COMPONENT_SOURCE = "06 Development/astro-site/src/components";
const PUBLIC_VISUAL_SOURCE = "06 Development/astro-site/src/lib/route-visuals.ts";
const PUBLIC_SUPPORT_SOURCE = "06 Development/astro-site/src/client/support.js";
const VISA_SOURCE = "06 Development/bot/app/content/visas.json";
const HOUSING_SOURCE = "06 Development/bot/app/content/housing.json";

function unit(
  ru: string,
  en: string,
  source: string,
  options: {
    sourceVerification?: SourceVerificationStatus;
    review?: TranslationReviewStatus;
    protectedTokens?: readonly string[];
    note?: string;
  } = {},
): TranslationUnit {
  return {
    ru,
    en,
    source,
    sourceVerification: options.sourceVerification ?? "LOCAL_SOURCE_CAPTURED",
    review: options.review ?? "TRANSLATED",
    ...(options.protectedTokens ? { protectedTokens: options.protectedTokens } : {}),
    ...(options.note ? { note: options.note } : {}),
  };
}

function sensitiveUnit(
  ru: string,
  en: string,
  source: string,
  options: Omit<Parameters<typeof unit>[3], "review"> = {},
): TranslationUnit {
  return unit(ru, en, source, {
    ...options,
    review: "HUMAN_REVIEW_REQUIRED",
  });
}

function reusedBotUnit(
  key: keyof typeof botCorpus.entries,
  sourceVerification: SourceVerificationStatus = "LOCAL_SOURCE_CAPTURED",
): TranslationUnit {
  return {
    ...botCorpus.entries[key],
    sourceVerification,
  };
}

export const PUBLIC_ASTRO_ROUTES = [
  "/",
  "/privacy/",
  "/bali/",
  "/bali/visas/",
  "/bali/visas/e33g/",
  "/bali/visas/d12/",
  "/bali/visas/d1-d2/",
  "/bali/visas/c1/",
  "/bali/visas/voa/",
  "/bali/visas/other-visa/",
  "/bali/housing/",
  "/bali/housing/villa/",
  "/bali/housing/guesthouse/",
  "/bali/housing/buy-property/",
  "/bali/housing/inspect-property/",
  "/bali/housing/housing-videos/",
  "/bali/housing/housing-risks/",
  "/bali/exchange/",
  "/bali/exchange/usdt-idr/",
  "/bali/exchange/other-exchange/",
  "/bali/assistant/",
  "/thailand/",
  "/thailand/exchange/",
  "/thailand/visas/",
  "/thailand/property/",
  "/thailand/yachts/",
  "/russia/",
  "/russia/spb/",
  "/russia/spb/sup-spb/",
  "/russia/spb/boat-spb/",
  "/russia/spb/fire-spb/",
  "/russia/ural/",
  "/russia/ural/sup-ural/",
  "/russia/ural/rafting-ural/",
  "/russia/ural/fire-ural/",
  "/russia/ural/retreat-ural/",
  "/russia/caucasus/",
  "/nepal/",
  "/nepal/kailash/",
  "/nepal/everest/",
  "/nepal/annapurna/",
  "/nepal/transfer/",
  "/nepal/housing/",
  "/nepal/guide/",
] as const;

export type PublicAstroRoute = (typeof PUBLIC_ASTRO_ROUTES)[number];

export const PUBLIC_SENSITIVE_ROUTES = [
  "/privacy/",
  "/bali/visas/",
  "/bali/visas/e33g/",
  "/bali/visas/d12/",
  "/bali/visas/d1-d2/",
  "/bali/visas/c1/",
  "/bali/visas/voa/",
  "/bali/visas/other-visa/",
] as const satisfies readonly PublicAstroRoute[];

type RouteCoverage = {
  key: string;
  source: string;
  review: TranslationReviewStatus;
};

const translatedRoute = (key: string, source = PUBLIC_CATALOG_SOURCE): RouteCoverage => ({
  key,
  source,
  review: "TRANSLATED",
});

const sensitiveRoute = (key: string, source: string): RouteCoverage => ({
  key,
  source,
  review: "HUMAN_REVIEW_REQUIRED",
});

export const PUBLIC_ROUTE_COVERAGE = {
  "/": translatedRoute("page.home.title", PUBLIC_MODEL_SOURCE),
  "/privacy/": sensitiveRoute("page.privacy.title", PUBLIC_MODEL_SOURCE),
  "/bali/": translatedRoute("catalog.destination.bali.name"),
  "/bali/visas/": sensitiveRoute("catalog.bali.visas.name", PUBLIC_CATALOG_SOURCE),
  "/bali/visas/e33g/": sensitiveRoute("catalog.bali.visas.e33g.name", VISA_SOURCE),
  "/bali/visas/d12/": sensitiveRoute("catalog.bali.visas.d12.name", VISA_SOURCE),
  "/bali/visas/d1-d2/": sensitiveRoute("catalog.bali.visas.d1-d2.name", VISA_SOURCE),
  "/bali/visas/c1/": sensitiveRoute("catalog.bali.visas.c1.name", VISA_SOURCE),
  "/bali/visas/voa/": sensitiveRoute("catalog.bali.visas.voa.name", VISA_SOURCE),
  "/bali/visas/other-visa/": sensitiveRoute("catalog.bali.visas.other-visa.name", VISA_SOURCE),
  "/bali/housing/": translatedRoute("catalog.bali.housing.name"),
  "/bali/housing/villa/": translatedRoute("catalog.bali.housing.villa.name", HOUSING_SOURCE),
  "/bali/housing/guesthouse/": translatedRoute("catalog.bali.housing.guesthouse.name"),
  "/bali/housing/buy-property/": translatedRoute("catalog.bali.housing.buy-property.name"),
  "/bali/housing/inspect-property/": translatedRoute("catalog.bali.housing.inspect-property.name"),
  "/bali/housing/housing-videos/": translatedRoute("catalog.bali.housing.housing-videos.name", HOUSING_SOURCE),
  "/bali/housing/housing-risks/": translatedRoute("catalog.bali.housing.housing-risks.name", HOUSING_SOURCE),
  "/bali/exchange/": translatedRoute("catalog.bali.exchange.name"),
  "/bali/exchange/usdt-idr/": translatedRoute("catalog.bali.exchange.usdt-idr.name"),
  "/bali/exchange/other-exchange/": translatedRoute("catalog.bali.exchange.other-exchange.name"),
  "/bali/assistant/": translatedRoute("catalog.bali.assistant.name"),
  "/thailand/": translatedRoute("catalog.destination.thailand.name"),
  "/thailand/exchange/": translatedRoute("catalog.thailand.exchange.name"),
  "/thailand/visas/": translatedRoute("catalog.thailand.visas.name"),
  "/thailand/property/": translatedRoute("catalog.thailand.property.name"),
  "/thailand/yachts/": translatedRoute("catalog.thailand.yachts.name"),
  "/russia/": translatedRoute("catalog.destination.russia.name"),
  "/russia/spb/": translatedRoute("catalog.russia.spb.name"),
  "/russia/spb/sup-spb/": translatedRoute("catalog.russia.spb.sup-spb.name"),
  "/russia/spb/boat-spb/": translatedRoute("catalog.russia.spb.boat-spb.name"),
  "/russia/spb/fire-spb/": translatedRoute("catalog.russia.spb.fire-spb.name"),
  "/russia/ural/": translatedRoute("catalog.russia.ural.name"),
  "/russia/ural/sup-ural/": translatedRoute("catalog.russia.ural.sup-ural.name"),
  "/russia/ural/rafting-ural/": translatedRoute("catalog.russia.ural.rafting-ural.name"),
  "/russia/ural/fire-ural/": translatedRoute("catalog.russia.ural.fire-ural.name"),
  "/russia/ural/retreat-ural/": translatedRoute("catalog.russia.ural.retreat-ural.name"),
  "/russia/caucasus/": translatedRoute("catalog.russia.caucasus.name"),
  "/nepal/": translatedRoute("catalog.destination.nepal.name"),
  "/nepal/kailash/": translatedRoute("catalog.nepal.kailash.name"),
  "/nepal/everest/": translatedRoute("catalog.nepal.everest.name"),
  "/nepal/annapurna/": translatedRoute("catalog.nepal.annapurna.name"),
  "/nepal/transfer/": translatedRoute("catalog.nepal.transfer.name"),
  "/nepal/housing/": translatedRoute("catalog.nepal.housing.name"),
  "/nepal/guide/": translatedRoute("catalog.nepal.guide.name"),
} as const satisfies Record<PublicAstroRoute, RouteCoverage>;

type SensitiveSourceEvidence = {
  verification: { status: "needs_review" | "verified" } | null;
  lastVerifiedAt: "2026-07-29T00:00:00.000Z" | null;
  productionCutoverAllowed: boolean | null;
  sourceIds: readonly string[];
};

export const PUBLIC_SENSITIVE_SOURCE_EVIDENCE = {
  "/privacy/": {
    verification: null,
    lastVerifiedAt: null,
    productionCutoverAllowed: null,
    sourceIds: [],
  },
  "/bali/visas/": {
    verification: { status: "needs_review" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: false,
    sourceIds: [
      "imigrasi-e33g",
      "imigrasi-d12",
      "imigrasi-d1",
      "imigrasi-d2",
      "imigrasi-c1",
      "imigrasi-b1",
      "imigrasi-visa-catalog",
      "safrway-visa-pricing",
    ],
  },
  "/bali/visas/e33g/": {
    verification: { status: "needs_review" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: false,
    sourceIds: [
      "imigrasi-e33g",
      "imigrasi-e31b",
      "imigrasi-e31e",
      "imigrasi-e31h",
      "safrway-visa-pricing",
    ],
  },
  "/bali/visas/d12/": {
    verification: { status: "verified" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: true,
    sourceIds: ["imigrasi-d12", "safrway-visa-pricing"],
  },
  "/bali/visas/d1-d2/": {
    verification: { status: "verified" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: true,
    sourceIds: ["imigrasi-d1", "imigrasi-d2", "safrway-visa-pricing"],
  },
  "/bali/visas/c1/": {
    verification: { status: "verified" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: true,
    sourceIds: ["imigrasi-c1", "safrway-visa-pricing"],
  },
  "/bali/visas/voa/": {
    verification: { status: "verified" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: true,
    sourceIds: ["imigrasi-b1", "imigrasi-voa-countries", "safrway-visa-pricing"],
  },
  "/bali/visas/other-visa/": {
    verification: { status: "verified" },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
    productionCutoverAllowed: true,
    sourceIds: ["imigrasi-visa-catalog"],
  },
} as const satisfies Record<(typeof PUBLIC_SENSITIVE_ROUTES)[number], SensitiveSourceEvidence>;

const entries = {
  "ui.brand.tagline": unit(
    "Ваш человек в другой стране",
    "Your person in another country",
    `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`,
  ),
  "ui.brand.homeAria": unit(
    "SAFRWAY — главная",
    "SAFRWAY — home",
    `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.a11y.skipToContent": unit(
    "Перейти к содержанию",
    "Skip to content",
    `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`,
  ),
  "ui.a11y.primaryNavigation": unit(
    "Основная навигация",
    "Primary navigation",
    `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`,
  ),
  "ui.a11y.footerNavigation": unit(
    "Навигация в подвале",
    "Footer navigation",
    `${PUBLIC_COMPONENT_SOURCE}/SiteFooter.astro`,
  ),
  "ui.a11y.breadcrumbs": unit(
    "Хлебные крошки",
    "Breadcrumbs",
    `${PUBLIC_COMPONENT_SOURCE}/Breadcrumbs.astro`,
  ),
  "ui.nav.directions": unit("Направления", "Destinations", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.nav.bali": unit("Бали", "Bali", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.nav.visas": unit("Визы", "Visas", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.nav.support": unit("Поддержка", "Support", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.nav.home": unit("Главная", "Home", `${PUBLIC_COMPONENT_SOURCE}/SiteFooter.astro`),
  "ui.nav.privacy": unit("Конфиденциальность", "Privacy", `${PUBLIC_COMPONENT_SOURCE}/SiteFooter.astro`),
  "ui.language.aria": unit("Language / Язык", "Language", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.theme.aria": unit("Тема", "Theme", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.theme.light": unit("Светлая тема", "Light theme", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.theme.dark": unit("Тёмная тема", "Dark theme", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.language.promptTitle": unit(
    "Доступна английская версия.",
    "English version is available.",
    `${PUBLIC_COMPONENT_SOURCE}/LanguageSuggestion.astro`,
  ),
  "ui.language.promptBody": unit(
    "Переключить язык? Текущая страница останется открытой.",
    "Switch now? Your current page will stay open.",
    `${PUBLIC_COMPONENT_SOURCE}/LanguageSuggestion.astro`,
  ),
  "ui.language.switchEnglish": unit(
    "Switch to English",
    "Switch to English",
    `${PUBLIC_COMPONENT_SOURCE}/LanguageSuggestion.astro`,
  ),
  "ui.language.continueRussian": unit(
    "Продолжить на русском",
    "Continue in Russian",
    `${PUBLIC_COMPONENT_SOURCE}/LanguageSuggestion.astro`,
  ),
  "ui.account.title": unit("Личный кабинет", "Account", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.account.signIn": unit("Войти", "Sign in", `${PUBLIC_COMPONENT_SOURCE}/SiteHeader.astro`),
  "ui.account.protectedZone": unit("Защищённая зона", "Secure area", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.account.summary": unit(
    "Заявки, профиль и поддержка",
    "Requests, profile and support",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
  ),
  "ui.footer.tagline": unit(
    "Путешествия и жизнь без лишнего хаоса.",
    "Travel and life without unnecessary hassle.",
    `${PUBLIC_COMPONENT_SOURCE}/SiteFooter.astro`,
  ),
  "ui.common.available": unit("Доступно", "Available", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.common.soon": unit("Скоро", "Coming soon", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.common.details": unit("Подробнее", "Learn more", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.common.openDirections": unit(
    "Открыть направления",
    "Explore destinations",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
  ),
  "ui.common.openPage": unit("Открыть страницу →", "Open page →", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`),
  "ui.common.askStatus": unit("Узнать статус →", "Check availability →", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`),
  "ui.common.catalogAria": unit("Каталог: {title}", "Catalog: {title}", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    protectedTokens: ["{title}"],
  }),
  "ui.common.relatedAria": unit("Связанные страницы", "Related pages", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`),
  "ui.common.sectionHelpAria": unit("Помощь по разделу", "Help for this section", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`),
  "ui.common.relatedTitle": unit(
    "Посмотреть другие варианты",
    "Explore other options",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
  ),
  "ui.home.title": unit("Куда вы направляетесь?", "Where are you headed?", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.home.searchLabel": unit("Найти направление", "Find a destination", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.home.searchPlaceholder": unit(
    "Начните вводить страну",
    "Start typing a country",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
  ),
  "ui.home.destinationsAria": unit(
    "Направления SAFRWAY",
    "SAFRWAY destinations",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.home.showServicesAria": unit(
    "Показать услуги: {destination}",
    "Show services: {destination}",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
    { protectedTokens: ["{destination}"] },
  ),
  "ui.home.notFound": unit(
    "Направление не найдено. Проверьте первые буквы названия.",
    "Destination not found. Check the first letters of the name.",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
  ),
  "ui.home.servicesEyebrow": unit("Услуги направления", "Destination services", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.home.help.bali": unit("Чем помочь на Бали?", "How can we help in Bali?", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.home.help.thailand": unit("Чем помочь в Таиланде?", "How can we help in Thailand?", "06 Development/astro-site/src/client/home.js"),
  "ui.home.help.russia": unit("Чем помочь в России?", "How can we help in Russia?", "06 Development/astro-site/src/client/home.js"),
  "ui.home.help.nepal": unit("Чем помочь в Непале?", "How can we help in Nepal?", "06 Development/astro-site/src/client/home.js"),
  "ui.home.help.fallback": unit(
    "Чем помочь в выбранной стране?",
    "How can we help in the selected country?",
    "06 Development/astro-site/src/client/home.js",
  ),
  "ui.home.allServices": unit(
    "Все услуги: {destination}",
    "All services: {destination}",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
    { protectedTokens: ["{destination}"] },
  ),
  "ui.home.youtube.eyebrow": unit(
    "Видео SAFRWAY",
    "SAFRWAY videos",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.home.youtube.title": unit(
    "Полезное перед поездкой",
    "Useful before your trip",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
  ),
  "ui.home.youtube.placeholder": unit(
    "Здесь появятся выбранные ролики SAFRWAY и партнёров. Пока без внешней загрузки и отслеживания.",
    "Selected SAFRWAY and partner videos will appear here. No external loading or tracking yet.",
    `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.manager.eyebrow": unit("Связь с командой", "Contact the team", `${PUBLIC_COMPONENT_SOURCE}/ManagerCta.astro`),
  "ui.manager.title": unit(
    "Нужна помощь по {context}?",
    "Need help with {context}?",
    `${PUBLIC_COMPONENT_SOURCE}/ManagerCta.astro`,
    { protectedTokens: ["{context}"] },
  ),
  "ui.manager.description": unit(
    "Откройте диалог, чтобы отправить сообщение прямо с сайта или самостоятельно перейти в Telegram.",
    "Open the form to send a message from the website, or continue in Telegram.",
    `${PUBLIC_COMPONENT_SOURCE}/ManagerCta.astro`,
    { protectedTokens: ["Telegram"] },
  ),
  "ui.manager.button": unit("Написать менеджеру", "Message a manager", `${PUBLIC_COMPONENT_SOURCE}/ManagerCta.astro`),
  "ui.manager.context.default": unit("этой странице", "this page", `${PUBLIC_COMPONENT_SOURCE}/ManagerCta.astro`),
  "ui.manager.context.trip": unit("поездке или переезду", "your trip or relocation", `${PUBLIC_COMPONENT_SOURCE}/HomeExperience.astro`),
  "ui.manager.context.visaSelection": sensitiveUnit(
    "подбору визы",
    "choosing a visa",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
    { sourceVerification: "needs_review" },
  ),
  "ui.support.closeAria": unit("Закрыть форму", "Close form", `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`),
  "ui.support.description": unit(
    "Оставьте сообщение прямо на сайте или продолжите разговор с менеджером в Telegram.",
    "Leave a message on the website or continue the conversation with a manager in Telegram.",
    `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`,
    { protectedTokens: ["Telegram"] },
  ),
  "ui.support.name": unit("Как к вам обращаться", "Your name", `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`),
  "ui.support.contact": unit(
    "Telegram, телефон или email",
    "Telegram, phone or email",
    `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`,
    { protectedTokens: ["Telegram"] },
  ),
  "ui.support.message": unit("Сообщение", "Message", `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`),
  "ui.support.submit": unit("Отправить сообщение", "Send message", `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`),
  "ui.support.telegram": unit(
    "Перейти в Telegram",
    "Continue in Telegram",
    `${PUBLIC_COMPONENT_SOURCE}/SupportLauncher.astro`,
    { protectedTokens: ["Telegram"] },
  ),
  "ui.support.sending": unit("Отправляем…", "Sending…", PUBLIC_SUPPORT_SOURCE),
  "ui.support.sent": unit(
    "Сообщение отправлено. Менеджер ответит по указанному контакту.",
    "Message sent. A manager will reply using the contact details you provided.",
    PUBLIC_SUPPORT_SOURCE,
  ),
  "ui.support.failed": unit(
    "Не удалось отправить сообщение. Попробуйте ещё раз или откройте Telegram.",
    "The message could not be sent. Try again or open Telegram.",
    PUBLIC_SUPPORT_SOURCE,
    { protectedTokens: ["Telegram"] },
  ),
  "ui.exchange.title": unit("Калькулятор обмена", "Exchange calculator", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`),
  "ui.exchange.lead": unit(
    "Расчёт доступен после входа в защищённую зону SAFRWAY.",
    "The calculation is available after you sign in to the secure SAFRWAY area.",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.exchange.authTitle": unit(
    "Продолжите после авторизации",
    "Continue after signing in",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
  ),
  "ui.exchange.authDescription": unit(
    "Войдите, чтобы открыть актуальные направления и предварительный расчёт.",
    "Sign in to view the available routes and a preliminary calculation.",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
  ),
  "ui.visa.heroBack": sensitiveUnit("Бали", "Bali", `${PUBLIC_COMPONENT_SOURCE}/VisaCatalogHero.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.heroEyebrow": sensitiveUnit("Бали · визы", "Bali · visas", `${PUBLIC_COMPONENT_SOURCE}/VisaCatalogHero.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.heroTitle": sensitiveUnit("Визы на Бали", "Visas for Bali", `${PUBLIC_COMPONENT_SOURCE}/VisaCatalogHero.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.journeyTitle": sensitiveUnit("Путь к визе", "Your visa journey", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step1.title": sensitiveUnit("Выберите визу", "Choose a visa", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step1.copy": sensitiveUnit("Сравните цель поездки и срок.", "Compare the purpose and duration of your trip.", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step2.title": sensitiveUnit("Проверьте детали", "Review the details", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step2.copy": sensitiveUnit("Откройте страницу подходящего варианта.", "Open the page for the option that may fit.", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step3.title": sensitiveUnit("Напишите менеджеру", "Message a manager", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.step3.copy": sensitiveUnit("Уточните документы в защищённом диалоге.", "Confirm the required documents in a secure conversation.", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.helpTitle": sensitiveUnit("Команда на связи", "The team is here to help", `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`, {
    sourceVerification: "needs_review",
  }),
  "ui.visa.helpCopy": sensitiveUnit(
    "Вопрос можно отправить через форму поддержки SAFRWAY.",
    "You can send a question through the SAFRWAY support form.",
    `${PUBLIC_COMPONENT_SOURCE}/PublicPage.astro`,
    { sourceVerification: "needs_review", protectedTokens: ["SAFRWAY"] },
  ),
  "ui.error404.metaTitle": unit("Страница не найдена", "Page not found", "06 Development/astro-site/src/pages/404.astro"),
  "ui.error404.metaDescription": unit(
    "Запрошенная страница SAFRWAY не найдена. Вернитесь к каталогу направлений или на главную страницу.",
    "The requested SAFRWAY page was not found. Return to the destination catalog or the home page.",
    "06 Development/astro-site/src/pages/404.astro",
    { protectedTokens: ["SAFRWAY"] },
  ),
  "ui.error404.eyebrow": unit("Ошибка 404", "Error 404", "06 Development/astro-site/src/pages/404.astro", {
    protectedTokens: ["404"],
  }),
  "ui.error404.title": unit("Такой страницы нет", "This page does not exist", "06 Development/astro-site/src/pages/404.astro"),
  "ui.error404.copy": unit(
    "Адрес мог измениться или в нём есть ошибка. Откройте каталог и выберите нужное направление.",
    "The address may have changed or may contain an error. Open the catalog and choose a destination.",
    "06 Development/astro-site/src/pages/404.astro",
  ),
  "ui.error404.toDirections": unit("К направлениям", "To destinations", "06 Development/astro-site/src/pages/404.astro"),
  "ui.error404.toHome": unit("На главную", "To home", "06 Development/astro-site/src/pages/404.astro"),

  "template.seo.moreDetails": unit(
    "Узнайте детали услуги и доступные варианты сопровождения SAFRWAY.",
    "Learn about the service and the available SAFRWAY support options.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "template.direction.title": unit("Услуги: {destination}", "Services: {destination}", PUBLIC_MODEL_SOURCE, {
    protectedTokens: ["{destination}"],
  }),
  "template.direction.descriptionContext": unit(
    "Каталог направления «{destination}» от SAFRWAY",
    "SAFRWAY catalog for {destination}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{destination}", "SAFRWAY"] },
  ),
  "template.direction.managerContext": unit(
    "услугам направления «{destination}»",
    "services in {destination}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{destination}"] },
  ),
  "template.service.title": unit(
    "{service} — {destination}",
    "{service} — {destination}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{service}", "{destination}"] },
  ),
  "template.service.descriptionContext": unit(
    "Раздел «{service}» направления «{destination}»",
    "{service} section for {destination}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{service}", "{destination}"] },
  ),
  "template.service.eyebrow": unit(
    "{destination} · {service}",
    "{destination} · {service}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{destination}", "{service}"] },
  ),
  "template.service.soonBody": unit(
    "{summary}\n\nУслуга находится в подготовке. Оставьте обращение, чтобы уточнить текущую доступность и получить ответ менеджера.",
    "{summary}\n\nThis service is being prepared. Send a request to check its current availability and receive a reply from a manager.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{summary}"] },
  ),
  "template.service.managerContext": unit(
    "услуге «{service}»",
    "the {service} service",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{service}"] },
  ),
  "template.item.title": unit(
    "{item} — {service}, {destination}",
    "{item} — {service}, {destination}",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{item}", "{service}", "{destination}"] },
  ),
  "template.item.descriptionContext": unit(
    "Услуга «{item}» в разделе «{service}»",
    "{item} service in the {service} section",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{item}", "{service}"] },
  ),
  "template.item.soonBody": unit(
    "{summary}\n\nУслуга находится в подготовке. Напишите менеджеру, чтобы узнать актуальную доступность.",
    "{summary}\n\nThis service is being prepared. Message a manager to check current availability.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{summary}"] },
  ),
  "template.item.managerContext": unit(
    "услуге «{item}»",
    "the {item} service",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["{item}"] },
  ),

  "page.home.title": unit(
    "Путешествия и жизнь без лишнего хаоса",
    "Travel and life without unnecessary hassle",
    PUBLIC_MODEL_SOURCE,
  ),
  "page.home.description": unit(
    "Визы, жильё, трансферы, туры и проверенные люди на месте: выберите направление и откройте подробную страницу нужной услуги SAFRWAY.",
    "Visas, accommodation, transfers, tours and trusted local people: choose a destination and open the detailed SAFRWAY service page you need.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "page.home.eyebrow": unit("Ваш человек в другой стране", "Your person in another country", PUBLIC_MODEL_SOURCE),
  "page.home.lead": unit(
    "Выберите страну и услугу — детали, поддержка и понятный путь к менеджеру уже внутри SAFRWAY.",
    "Choose a country and a service — details, support and a clear path to a manager are already available in SAFRWAY.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "page.home.body": unit(
    "Выберите страну, затем нужную услугу. У каждого направления есть собственная страница, каталог и понятный путь к менеджеру.",
    "Choose a country, then the service you need. Each destination has its own page, catalog and a clear path to a manager.",
    PUBLIC_MODEL_SOURCE,
  ),
  "page.home.managerContext": unit("поездке или переезду", "your trip or relocation", PUBLIC_MODEL_SOURCE),

  "page.privacy.title": sensitiveUnit(
    "Политика конфиденциальности SAFRWAY",
    "SAFRWAY Privacy Policy",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "page.privacy.description": sensitiveUnit(
    "Как SAFRWAY обрабатывает данные сайта, Telegram Mini App и личного кабинета, а также как связаться с командой по вопросам конфиденциальности.",
    "How SAFRWAY processes data from the website, Telegram Mini App and Account, and how to contact the team about privacy.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY", "Telegram Mini App"] },
  ),
  "page.privacy.eyebrow": sensitiveUnit("Правовая информация", "Legal information", PUBLIC_MODEL_SOURCE),
  "page.privacy.lead": sensitiveUnit(
    "Как SAFRWAY использует данные для авторизации, поддержки и ведения заявок.",
    "How SAFRWAY uses data for authentication, support and request management.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY"] },
  ),
  "page.privacy.body": sensitiveUnit(
    "SAFRWAY обрабатывает только данные, необходимые для авторизации, ответа на обращение, ведения заявки, реферального учёта и SAFR Points.\n\nСессионные данные хранятся на сервере и не передаются через URL. Telegram initData проверяется backend. Внутренние заметки менеджеров не показываются клиенту.\n\nДля запроса доступа, исправления или удаления данных напишите менеджеру и укажите контакт, по которому можно подтвердить вашу личность.",
    "SAFRWAY processes only the data needed for authentication, responding to an inquiry, managing a request, referral tracking and SAFR Points.\n\nSession data is stored on the server and is not passed through the URL. Telegram initData is verified by the backend. Internal manager notes are not shown to the client.\n\nTo request access to, correction of or deletion of data, message a manager and provide contact details that can be used to verify your identity.",
    PUBLIC_MODEL_SOURCE,
    { protectedTokens: ["SAFRWAY", "SAFR Points", "URL", "Telegram initData", "backend"] },
  ),
  "page.privacy.managerContext": sensitiveUnit("персональным данным", "personal data", PUBLIC_MODEL_SOURCE),

  "visual.label.destination": unit("Направление", "Destination", PUBLIC_VISUAL_SOURCE),
  "visual.bali.alt": unit("Храм Пура Улун Дану Братан у озера на Бали", "Pura Ulun Danu Bratan temple by a lake in Bali", PUBLIC_VISUAL_SOURCE),
  "visual.thailand.alt": unit("Традиционная лодка у известняковых островов Таиланда", "A traditional boat by Thailand's limestone islands", PUBLIC_VISUAL_SOURCE),
  "visual.russia.alt": unit("Московский Кремль и набережная Москвы-реки на рассвете", "The Moscow Kremlin and Moskva River embankment at sunrise", PUBLIC_VISUAL_SOURCE),
  "visual.nepal.alt": unit("Буддийская ступа на фоне Гималаев в Непале", "A Buddhist stupa against the Himalayas in Nepal", PUBLIC_VISUAL_SOURCE),
  "visual.russia.spb.alt": unit("Петропавловская крепость и набережная Невы на рассвете", "The Peter and Paul Fortress and Neva embankment at sunrise", PUBLIC_VISUAL_SOURCE),
  "visual.russia.spb.label": unit("Город · Россия", "City · Russia", PUBLIC_VISUAL_SOURCE),
  "visual.russia.ural.alt": unit("Лесистые Уральские хребты и река утром", "Forested Ural ridges and a river in the morning", PUBLIC_VISUAL_SOURCE),
  "visual.russia.ural.label": unit("Регион · Россия", "Region · Russia", PUBLIC_VISUAL_SOURCE),
  "visual.russia.caucasus.alt": unit("Высокогорная долина Кавказа с рекой", "A high-mountain Caucasus valley with a river", PUBLIC_VISUAL_SOURCE),
  "visual.russia.caucasus.label": unit("Регион · Россия", "Region · Russia", PUBLIC_VISUAL_SOURCE),
  "visual.bali.villa.alt": unit("Вилла на Бали с небольшим бассейном и тропическим садом", "A Bali villa with a small pool and tropical garden", PUBLIC_VISUAL_SOURCE),
  "visual.bali.villa.label": unit("Бали · жильё", "Bali · accommodation", PUBLIC_VISUAL_SOURCE),
  "visual.russia.spb.boat.alt": unit("Небольшой катер на Неве утром в Санкт-Петербурге", "A small boat on the Neva in Saint Petersburg in the morning", PUBLIC_VISUAL_SOURCE),
  "visual.russia.spb.boat.label": unit("Санкт-Петербург · прогулки", "Saint Petersburg · outings", PUBLIC_VISUAL_SOURCE),

  "catalog.destination.bali.name": unit("Бали", "Bali", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.bali.description": unit(
    "Визы, жильё, обмен валюты и помощь на месте.",
    "Visas, accommodation, currency exchange and local assistance.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.destination.thailand.name": unit("Таиланд", "Thailand", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.thailand.eyebrow": unit("Скоро больше услуг", "More services coming soon", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.thailand.description": unit(
    "Обмен, визовые вопросы, недвижимость и яхты — собираем команду проверенных специалистов.",
    "Exchange, visa matters, property and yachts — we are assembling a team of trusted specialists.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.destination.russia.name": unit("Россия", "Russia", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.russia.eyebrow": unit("Петербург · Урал · Кавказ", "Saint Petersburg · Urals · Caucasus", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.russia.description": unit(
    "SUP-туры, прогулки на катере, сплавы, ретриты и живые маршруты с локальными гидами.",
    "SUP tours, boat trips, rafting, retreats and authentic routes with local guides.",
    PUBLIC_CATALOG_SOURCE,
    { protectedTokens: ["SUP"] },
  ),
  "catalog.destination.nepal.name": unit("Непал", "Nepal", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.nepal.eyebrow": unit("Трекинг и экспедиции", "Trekking and expeditions", PUBLIC_CATALOG_SOURCE),
  "catalog.destination.nepal.description": unit(
    "Кайлас, Эверест и Аннапурна: гиды, трансферы и жильё для серьёзного путешествия.",
    "Kailash, Everest and Annapurna: guides, transfers and accommodation for a serious journey.",
    PUBLIC_CATALOG_SOURCE,
  ),

  "catalog.bali.visas.name": sensitiveUnit("Сделать визу", "Get a visa", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "needs_review",
  }),
  "catalog.bali.visas.summary": sensitiveUnit(
    "Визы и ITAS в Индонезию: от короткой поездки до длительного проживания.",
    "Visas and ITAS for Indonesia: from a short trip to long-term residence.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "needs_review", protectedTokens: ["ITAS"] },
  ),
  "catalog.bali.visas.body": sensitiveUnit(
    "Выберите подходящий сценарий: ITAS E33G для удалённых работников, многократные D1/D2 и D12, однократную C1 или eVOA для короткой поездки.",
    "Choose the scenario that fits: ITAS E33G for remote workers, multiple-entry D1/D2 and D12, single-entry C1, or eVOA for a short trip.",
    "06 Development/astro-site/scripts/export-preview-snapshot.mjs",
    {
      sourceVerification: "needs_review",
      protectedTokens: ["ITAS E33G", "D1/D2", "D12", "C1", "eVOA"],
      note: "Official-source verification remains needs_review; English requires Founder/CPO review.",
    },
  ),
  "catalog.bali.visas.e33g.name": sensitiveUnit("ITAS E33G", "ITAS E33G", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "needs_review",
    protectedTokens: ["ITAS E33G"],
  }),
  "catalog.bali.visas.e33g.summary": sensitiveUnit(
    "Для удалённых работников, сроком на 1 год.",
    "For remote workers, valid for 1 year.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "needs_review", protectedTokens: ["1"] },
  ),
  "catalog.bali.visas.e33g.note": sensitiveUnit(
    "От 12 млн IDR под ключ, включая государственные сборы.",
    "From 12 million IDR all-inclusive, including government fees.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "needs_review", protectedTokens: ["12", "IDR"] },
  ),
  "catalog.bali.visas.e33g.content": reusedBotUnit("visa.e33g.body", "needs_review"),
  "catalog.bali.visas.d12.name": sensitiveUnit("D12", "D12", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "verified",
    protectedTokens: ["D12"],
  }),
  "catalog.bali.visas.d12.summary": sensitiveUnit(
    "Многократная виза на 1 или 2 года.",
    "A multiple-entry visa for 1 or 2 years.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["1", "2"] },
  ),
  "catalog.bali.visas.d12.note": sensitiveUnit(
    "От 7,5 млн IDR под ключ, включая государственные сборы.",
    "From 7.5 million IDR all-inclusive, including government fees.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["IDR"] },
  ),
  "catalog.bali.visas.d12.content": reusedBotUnit("visa.d12.body", "verified"),
  "catalog.bali.visas.d1-d2.name": sensitiveUnit("D1 / D2", "D1 / D2", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "verified",
    protectedTokens: ["D1", "D2"],
  }),
  "catalog.bali.visas.d1-d2.summary": sensitiveUnit(
    "Туристические и деловые мультивизы.",
    "Multiple-entry tourist and business visas.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified" },
  ),
  "catalog.bali.visas.d1-d2.note": sensitiveUnit(
    "1 год — от 5,5 млн IDR, 2 года — от 9 млн IDR, под ключ.",
    "1 year — from 5.5 million IDR; 2 years — from 9 million IDR, all-inclusive.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["1", "2", "IDR"] },
  ),
  "catalog.bali.visas.d1-d2.content": reusedBotUnit("visa.d1d2.body", "verified"),
  "catalog.bali.visas.c1.name": sensitiveUnit("C1", "C1", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "verified",
    protectedTokens: ["C1"],
  }),
  "catalog.bali.visas.c1.summary": sensitiveUnit(
    "Однократная гостевая виза до 60 дней с возможностью продления.",
    "A single-entry visitor visa for up to 60 days, with an extension option.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["60"] },
  ),
  "catalog.bali.visas.c1.note": sensitiveUnit(
    "2,5 млн IDR под ключ.",
    "2.5 million IDR all-inclusive.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["IDR"] },
  ),
  "catalog.bali.visas.c1.content": reusedBotUnit("visa.c1.body", "verified"),
  "catalog.bali.visas.voa.name": sensitiveUnit("eVOA", "eVOA", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "verified",
    protectedTokens: ["eVOA"],
  }),
  "catalog.bali.visas.voa.summary": sensitiveUnit(
    "Краткосрочная виза по прибытии.",
    "A short-stay visa on arrival.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified" },
  ),
  "catalog.bali.visas.voa.note": sensitiveUnit(
    "800 тыс. IDR / $50 под ключ, включая государственный сбор.",
    "800,000 IDR / $50 all-inclusive, including the government fee.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified", protectedTokens: ["IDR", "$50"] },
  ),
  "catalog.bali.visas.voa.content": reusedBotUnit("visa.voa.body", "verified"),
  "catalog.bali.visas.other-visa.name": sensitiveUnit("Другая виза", "Other visa", PUBLIC_CATALOG_SOURCE, {
    sourceVerification: "verified",
  }),
  "catalog.bali.visas.other-visa.summary": sensitiveUnit(
    "Разберём нестандартную ситуацию и подберём подходящий тип визы.",
    "We will review an unusual situation and identify a suitable visa type.",
    PUBLIC_CATALOG_SOURCE,
    { sourceVerification: "verified" },
  ),
  "catalog.bali.visas.other-visa.content": reusedBotUnit("visa.other.body", "verified"),

  "catalog.bali.housing.name": unit("Найти жильё", "Find accommodation", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.summary": unit(
    "Поиск, проверка и честный видеообзор жилья на Бали.",
    "Search, inspection and an honest video review of accommodation in Bali.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.note": unit("Индивидуальный поиск виллы — от $150.", "Personal villa search — from $150.", PUBLIC_CATALOG_SOURCE, {
    protectedTokens: ["$150"],
  }),
  "catalog.bali.housing.villa.name": unit("Найти виллу", "Find a villa", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.villa.summary": unit(
    "Подбор, проверка на месте и переговоры с владельцем.",
    "Selection, an on-site inspection and negotiations with the owner.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.villa.note": unit("Индивидуальный поиск — от $150.", "Personal search — from $150.", PUBLIC_CATALOG_SOURCE, {
    protectedTokens: ["$150"],
  }),
  "catalog.bali.housing.villa.content": reusedBotUnit("housing.search.body"),
  "catalog.bali.housing.guesthouse.name": unit("Найти гест", "Find a guesthouse", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.guesthouse.summary": unit(
    "Подберём гестхаус под срок, район и бюджет.",
    "We will find a guesthouse that fits your dates, area and budget.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.buy-property.name": unit("Купить недвижимость", "Buy property", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.buy-property.summary": unit(
    "Поможем с поиском и первичной проверкой объекта.",
    "We will help with the search and an initial property check.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.inspect-property.name": unit("Проверить объект", "Inspect a property", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.inspect-property.summary": unit(
    "Личный осмотр, видео и честный комментарий о состоянии.",
    "An in-person inspection, video and an honest assessment of its condition.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.housing-videos.name": unit("Видео про жильё", "Accommodation videos", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.housing-videos.summary": unit(
    "Подборка реальных разборов вилл и рисков аренды.",
    "A selection of real villa reviews and rental-risk explainers.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.housing-videos.content": reusedBotUnit("housing.videos.body"),
  "catalog.bali.housing.housing-risks.name": unit("Риски аренды", "Rental risks", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.housing.housing-risks.summary": unit(
    "На что обратить внимание при самостоятельном поиске.",
    "What to look out for when searching on your own.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.housing.housing-risks.content": reusedBotUnit("housing.risks.body"),

  "catalog.bali.exchange.name": unit("Обмен валюты", "Currency exchange", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.exchange.summary": unit(
    "Предварительный расчёт по доступным направлениям.",
    "A preliminary calculation for the available exchange routes.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.exchange.usdt-idr.name": unit("Калькулятор обмена", "Exchange calculator", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.exchange.usdt-idr.summary": unit(
    "Предварительный расчёт по доступным направлениям.",
    "A preliminary calculation for the available exchange routes.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.exchange.usdt-idr.note": unit(
    "Итоговую сумму подтверждает менеджер перед обменом.",
    "A manager confirms the final amount before the exchange.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.exchange.usdt-idr.content": unit(
    "Выберите, что отдаёте и получаете. Можно указать имеющуюся сумму или желаемый результат — калькулятор самостоятельно выполнит предварительный расчёт.",
    "Choose what you give and receive. Enter either the amount you have or the result you want, and the calculator will produce a preliminary calculation.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.exchange.other-exchange.name": unit("Другой обмен", "Another exchange", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.exchange.other-exchange.summary": unit(
    "Рубли, доллары и другие варианты — по запросу менеджеру.",
    "Roubles, dollars and other options are available on request from a manager.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.exchange.other-exchange.content": unit(
    "Если вам нужно обменять рубли, доллары или другую валюту, опишите направление и сумму. Менеджер уточнит доступность и финальный курс.",
    "If you need to exchange roubles, dollars or another currency, describe the direction and amount. A manager will confirm availability and the final rate.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.assistant.name": unit("Тревел-ассистент", "Travel assistant", PUBLIC_CATALOG_SOURCE),
  "catalog.bali.assistant.summary": unit(
    "Персональное сопровождение: прилёт, трансфер, связь, байк и бытовые задачи.",
    "Personal assistance with arrival, transfers, connectivity, a scooter and everyday tasks.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.bali.assistant.content": unit(
    "Тревел-ассистент — персональное сопровождение по Бали: подготовка к поездке, прилёт, трансфер, жильё, визовые вопросы, связь, байк, обмен и помощь с нестандартными ситуациями.",
    "A travel assistant provides personal support in Bali: trip preparation, arrival, transfers, accommodation, visa matters, connectivity, a scooter, exchange and help with unusual situations.",
    PUBLIC_CATALOG_SOURCE,
  ),

  "catalog.thailand.exchange.name": unit("Обмен", "Exchange", PUBLIC_CATALOG_SOURCE),
  "catalog.thailand.exchange.summary": unit("Обмен валюты в Таиланде.", "Currency exchange in Thailand.", PUBLIC_CATALOG_SOURCE),
  "catalog.thailand.visas.name": unit("Визы", "Visas", PUBLIC_CATALOG_SOURCE),
  "catalog.thailand.visas.summary": unit(
    "Помощь с визовыми вопросами в Таиланде.",
    "Help with visa matters in Thailand.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.thailand.property.name": unit("Недвижимость", "Property", PUBLIC_CATALOG_SOURCE),
  "catalog.thailand.property.summary": unit(
    "Аренда, покупка и проверка недвижимости.",
    "Property rental, purchase and inspection.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.thailand.yachts.name": unit("Яхты", "Yachts", PUBLIC_CATALOG_SOURCE),
  "catalog.thailand.yachts.summary": unit("Прогулки и аренда яхт.", "Yacht trips and rentals.", PUBLIC_CATALOG_SOURCE),

  "catalog.russia.spb.name": unit("Санкт-Петербург", "Saint Petersburg", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.spb.summary": unit(
    "Вода, город и камерные путешествия рядом с Петербургом.",
    "Water, the city and small-group journeys around Saint Petersburg.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.spb.sup-spb.name": unit("SUP-туры", "SUP tours", PUBLIC_CATALOG_SOURCE, {
    protectedTokens: ["SUP"],
  }),
  "catalog.russia.spb.sup-spb.summary": unit(
    "Маршруты на SUP-досках с локальным гидом.",
    "SUP-board routes with a local guide.",
    PUBLIC_CATALOG_SOURCE,
    { protectedTokens: ["SUP"] },
  ),
  "catalog.russia.spb.boat-spb.name": unit("Прогулка на катере", "Boat trip", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.spb.boat-spb.summary": unit(
    "Водные прогулки по Петербургу и окрестностям.",
    "Boat trips around Saint Petersburg and its surroundings.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.spb.fire-spb.name": unit("Посиделки у костра", "Gathering by the fire", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.spb.fire-spb.summary": unit(
    "Тёплая встреча на природе с организацией на месте.",
    "A warm outdoor gathering with local arrangements.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.ural.name": unit("Урал", "Urals", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.ural.summary": unit(
    "Активные маршруты и ретриты на Южном Урале.",
    "Active routes and retreats in the Southern Urals.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.ural.sup-ural.name": unit("SUP-тур", "SUP tour", PUBLIC_CATALOG_SOURCE, {
    protectedTokens: ["SUP"],
  }),
  "catalog.russia.ural.sup-ural.summary": unit(
    "Прогулки по уральским озёрам.",
    "Trips across lakes in the Urals.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.ural.rafting-ural.name": unit("Сплав", "Rafting", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.ural.rafting-ural.summary": unit(
    "Маршруты по рекам с организацией и сопровождением.",
    "Organised and guided river routes.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.ural.fire-ural.name": unit("Посиделки у костра", "Gathering by the fire", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.ural.fire-ural.summary": unit(
    "Выезд на природу и камерная встреча.",
    "An outdoor trip and a small-group gathering.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.ural.retreat-ural.name": unit("Организовать ретрит", "Organise a retreat", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.ural.retreat-ural.summary": unit(
    "Подготовка программы, площадки и бытовой части ретрита.",
    "Preparation of the programme, venue and practical arrangements for a retreat.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.russia.caucasus.name": unit("Кавказ", "Caucasus", PUBLIC_CATALOG_SOURCE),
  "catalog.russia.caucasus.summary": unit(
    "Маршруты и услуги на Кавказе находятся в подготовке.",
    "Routes and services in the Caucasus are being prepared.",
    PUBLIC_CATALOG_SOURCE,
  ),

  "catalog.nepal.kailash.name": unit("Трекинг на Кайлас", "Kailash trek", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.kailash.summary": unit(
    "Подготовка и сопровождение маршрута к Кайласу.",
    "Preparation and guidance for a route to Kailash.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.nepal.everest.name": unit("Трекинг к Эвересту", "Everest trek", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.everest.summary": unit("Маршруты в регионе Эвереста.", "Routes in the Everest region.", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.annapurna.name": unit("Хребет Аннапурна", "Annapurna range", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.annapurna.summary": unit(
    "Трекинг по одному из главных маршрутов Непала.",
    "Trekking along one of Nepal's main routes.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.nepal.transfer.name": unit("Трансфер", "Transfer", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.transfer.summary": unit(
    "Трансферы между аэропортом, городами и точками маршрута.",
    "Transfers between the airport, cities and route points.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.nepal.housing.name": unit("Жильё", "Accommodation", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.housing.summary": unit(
    "Подбор жилья до и после трекинга.",
    "Accommodation selection before and after the trek.",
    PUBLIC_CATALOG_SOURCE,
  ),
  "catalog.nepal.guide.name": unit("Гид", "Guide", PUBLIC_CATALOG_SOURCE),
  "catalog.nepal.guide.summary": unit(
    "Локальное сопровождение и помощь по маршруту.",
    "Local guidance and assistance along the route.",
    PUBLIC_CATALOG_SOURCE,
  ),
} as const satisfies Record<string, TranslationUnit>;

export const publicCorpus = defineCorpus({
  domain: "public",
  capturedAt: "2026-08-10",
  entries,
});

export type PublicTranslationKey = keyof typeof publicCorpus.entries;
