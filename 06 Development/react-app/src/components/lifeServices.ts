export type LifeLocale = "ru" | "en";
export type LifeKind = "housing" | "bike" | "insurance";
export type LifePublication = "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
export type LifeGroup = "current" | "future" | "history";
export type LifeService = {
  id: number;
  user_id: number;
  kind: LifeKind;
  title: string | null;
  description: string | null;
  link_url: string | null;
  start_date: string | null;
  end_date: string | null;
  price_amount: string | null;
  price_currency: "IDR" | "USD" | "USDT" | "RUB";
  price_unit: "period" | "month" | "day" | "policy";
  public_contact: string | null;
  publication_status: LifePublication;
  version: number;
  created_at: string;
  updated_at: string;
};
export type AdminLifeService = LifeService & { owner_details: string | null; internal_note: string | null };
export type LifeDraft = Omit<AdminLifeService, "id" | "user_id" | "version" | "created_at" | "updated_at" | "publication_status" | "title"> & { title: string };
export type LifeErrors = Partial<Record<keyof LifeDraft, string>>;

export const lifeCopy = {
  ru: {
    title: "Моя жизнь на Бали", intro: "Ваши услуги и ближайшие даты в одном месте.", all: "Всё", visa: "Мои визы", housing: "Моё жильё", bike: "Мои байки", insurance: "Моя страховка",
    current: "Текущие услуги и сроки", future: "Предстоящие", history: "История", empty: "Здесь пока нет опубликованных услуг.", emptyCategory: "В этой категории пока нет услуг.", manager: "Связаться с менеджером", loading: "Загружаем услуги…", refreshing: "Обновляем…", refresh: "Обновить", retry: "Повторить", error: "Не удалось загрузить услуги. Попробуйте ещё раз.", session: "Сессия истекла. Войдите в аккаунт ещё раз.", details: "Подробности", close: "К списку услуг", unknown: "Дата уточняется", dateZone: "Календарные даты по времени Бали", upcoming: "Начнётся позже", ended: "Завершено", currentLabel: "Текущий период", endOnly: "Срок по полису", today: "Дата окончания сегодня", housingToday: "Выезд сегодня", bikeToday: "Возврат сегодня", end: "Действует до (по полису)", housingEnd: "Выезд", bikeEnd: "Возврат", start: "Начало действия", housingStart: "Заезд", bikeStart: "Начало аренды", price: "Согласованная стоимость", period: "за весь период", month: "в месяц", day: "в сутки", policy: "за полис", contact: "Контакт для связи", link: "Открыть ссылку на услугу", visaOpen: "Открыть «Мои визы»", visaStatus: "Статус визы", noStart: "Дата начала не указана", back: "В профиль",
  },
  en: {
    title: "My life in Bali", intro: "Your services and upcoming dates in one place.", all: "All", visa: "My visas", housing: "My housing", bike: "My bikes", insurance: "My insurance",
    current: "Current services and dates", future: "Upcoming", history: "History", empty: "You have no published services yet.", emptyCategory: "There are no services in this category yet.", manager: "Contact a manager", loading: "Loading services…", refreshing: "Refreshing…", refresh: "Refresh", retry: "Retry", error: "Could not load services. Please try again.", session: "Your session expired. Please sign in again.", details: "Details", close: "Back to services", unknown: "Date to be confirmed", dateZone: "Calendar dates in Bali time", upcoming: "Starts later", ended: "Ended", currentLabel: "Current period", endOnly: "Policy end date", today: "End date is today", housingToday: "Check-out today", bikeToday: "Return today", end: "Valid until (as stated in policy)", housingEnd: "Check-out", bikeEnd: "Return", start: "Coverage start", housingStart: "Check-in", bikeStart: "Rental start", price: "Agreed price", period: "for the full period", month: "per month", day: "per day", policy: "per policy", contact: "Contact", link: "Open service link", visaOpen: "Open My visas", visaStatus: "Visa status", noStart: "Start date is not specified", back: "Back to profile",
  },
} as const;

export function baliToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function lifeGroup(item: Pick<LifeService, "start_date" | "end_date">, today: string): LifeGroup {
  if (item.end_date && item.end_date < today) return "history";
  if (item.start_date && item.start_date > today) return "future";
  return "current";
}

export function lifeStatus(item: Pick<LifeService, "kind" | "start_date" | "end_date">, today: string, locale: LifeLocale) {
  const t = lifeCopy[locale];
  if (item.end_date === today) return item.kind === "housing" ? t.housingToday : item.kind === "bike" ? t.bikeToday : t.today;
  const group = lifeGroup(item, today);
  if (group === "history") return t.ended;
  if (group === "future") return t.upcoming;
  return item.kind === "insurance" && !item.start_date ? t.endOnly : t.currentLabel;
}

export function lifeDateLabel(kind: LifeKind, boundary: "start" | "end", locale: LifeLocale) {
  const t = lifeCopy[locale];
  if (kind === "housing") return boundary === "start" ? t.housingStart : t.housingEnd;
  if (kind === "bike") return boundary === "start" ? t.bikeStart : t.bikeEnd;
  return boundary === "start" ? t.start : t.end;
}

export function formatLifeDate(value: string | null, locale: LifeLocale): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return lifeCopy[locale].unknown;
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.valueOf())) return lifeCopy[locale].unknown;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }).format(date);
}

export function safeLifeUrl(value: string | null): string | null {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Keep the stored decimal exact: no currency conversion or binary float rounding.
export function formatLifePrice(item: Pick<LifeService, "price_amount" | "price_currency" | "price_unit">, locale: LifeLocale): string | null {
  if (item.price_amount === null || !/^\d+(?:\.\d+)?$/.test(item.price_amount)) return null;
  const [whole, fraction] = item.price_amount.split(".");
  const integer = new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-GB").format(BigInt(whole));
  const decimal = fraction ? `${locale === "ru" ? "," : "."}${fraction}` : "";
  const currency = item.price_currency === "IDR" ? "Rp" : item.price_currency;
  return `${currency} ${integer}${decimal} ${lifeCopy[locale][item.price_unit]}`;
}

export function emptyLifeDraft(kind: LifeKind = "housing"): LifeDraft {
  return { kind, title: "", description: "", link_url: "", start_date: "", end_date: "", price_amount: "", price_currency: kind === "insurance" ? "USD" : "IDR", price_unit: kind === "insurance" ? "policy" : "period", public_contact: "", owner_details: "", internal_note: "" };
}

export function lifeDraftFromRecord(item: AdminLifeService): LifeDraft {
  return { kind: item.kind, title: item.title ?? "", description: item.description ?? "", link_url: item.link_url ?? "", start_date: item.start_date ?? "", end_date: item.end_date ?? "", price_amount: item.price_amount ?? "", price_currency: item.price_currency, price_unit: item.price_unit, public_contact: item.public_contact ?? "", owner_details: item.owner_details ?? "", internal_note: item.internal_note ?? "" };
}

export function validateLifeDraft(draft: LifeDraft, publication: LifePublication, locale: LifeLocale): LifeErrors {
  const errors: LifeErrors = {};
  const required = locale === "ru" ? "Заполните поле для публикации." : "Required to publish.";
  if (publication === "PUBLISHED") {
    if (!draft.title.trim()) errors.title = required;
    if (!draft.end_date) errors.end_date = required;
    if (draft.kind !== "insurance" && !draft.start_date) errors.start_date = required;
  }
  if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) errors.end_date = locale === "ru" ? "Дата окончания не может быть раньше начала." : "End date cannot be earlier than the start.";
  if (draft.link_url && !safeLifeUrl(draft.link_url.trim())) errors.link_url = locale === "ru" ? "Введите полную ссылку http:// или https:// без логина и пароля." : "Enter a full http:// or https:// URL without credentials.";
  if (draft.price_amount && !/^\d{1,14}(?:\.\d{1,2})?$/.test(draft.price_amount.trim())) errors.price_amount = locale === "ru" ? "Введите неотрицательную сумму: до 14 цифр и 2 знаков после точки." : "Enter a non-negative amount: up to 14 digits and 2 decimal places.";
  return errors;
}

export function lifeWriteFields(draft: LifeDraft, publication_status: LifePublication) {
  return { ...draft, title: draft.title.trim(), description: draft.description?.trim() || null, link_url: draft.link_url?.trim() || null, start_date: draft.start_date || null, end_date: draft.end_date || null, price_amount: draft.price_amount?.trim() || null, public_contact: draft.public_contact?.trim() || null, owner_details: draft.owner_details?.trim() || null, internal_note: draft.internal_note?.trim() || null, publication_status };
}
