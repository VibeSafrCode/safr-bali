export type LocaleCode = "ru" | "en";

export const DEFAULT_LOCALE: LocaleCode = "ru";
export const LOCALE_STORAGE_KEY = "safr.mini.locale";
export const PENDING_LOCALE_STORAGE_KEY = "safr.mini.pending-locale";

export function normalizeLocale(value: string | null | undefined): LocaleCode {
  const primary = (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-", 1)[0];
  return primary === "en" ? "en" : "ru";
}

function storedLocale(key: string): LocaleCode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  return value === "ru" || value === "en" ? value : null;
}

export function readCachedLocale() {
  return storedLocale(LOCALE_STORAGE_KEY);
}

export function readPendingLocale() {
  return storedLocale(PENDING_LOCALE_STORAGE_KEY);
}

export function cacheLocale(locale: LocaleCode) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function queuePendingLocale(locale: LocaleCode) {
  window.localStorage.setItem(PENDING_LOCALE_STORAGE_KEY, locale);
}

export function clearPendingLocale() {
  window.localStorage.removeItem(PENDING_LOCALE_STORAGE_KEY);
}

export function initialLocale(input: {
  cached?: string | null;
  telegram?: string | null;
  browser?: readonly string[];
} = {}): LocaleCode {
  const cached = input.cached;
  if (cached === "ru" || cached === "en") return cached;
  if (input.telegram) return normalizeLocale(input.telegram);
  for (const language of input.browser ?? []) {
    const normalized = normalizeLocale(language);
    if (normalized === "en" || language.toLowerCase().startsWith("ru")) {
      return normalized;
    }
  }
  return DEFAULT_LOCALE;
}

export function authenticatedLocale(
  saved: string | null | undefined,
  pending: LocaleCode | null,
): LocaleCode {
  return pending ?? normalizeLocale(saved);
}
