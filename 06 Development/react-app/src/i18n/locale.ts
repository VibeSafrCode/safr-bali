import {resolveUiLocale,YOGA_UI_LOCALES} from '../../../shared/src/ui-locale-policy.mjs';

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
  try {
    const value = window.localStorage.getItem(key);
    return value === "ru" || value === "en" ? value : null;
  } catch {return null;}
}

export function readCachedLocale() {
  return storedLocale(LOCALE_STORAGE_KEY);
}

export function readPendingLocale() {
  return storedLocale(PENDING_LOCALE_STORAGE_KEY);
}

export function cacheLocale(locale: LocaleCode) {
  try {window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);} catch {}
  if(typeof document!=='undefined')document.documentElement.lang = locale;
}

export function queuePendingLocale(locale: LocaleCode) {
  try {window.localStorage.setItem(PENDING_LOCALE_STORAGE_KEY, locale);} catch {}
}

export function clearPendingLocale() {
  try {window.localStorage.removeItem(PENDING_LOCALE_STORAGE_KEY);} catch {}
}

export function initialLocale(input: {
  cached?: string | null;
  telegram?: string | null;
  browser?: readonly string[];
} = {}): LocaleCode {
  // UI bootstrap only. Keep contact normalizeLocale/RU default unchanged;
  // neither signed nor unsafe Telegram communication locale selects UI.
  return resolveUiLocale({allowed:YOGA_UI_LOCALES,saved:input.cached,browser:input.browser}).locale as LocaleCode;
}

export function authenticatedLocale(
  saved: string | null | undefined,
  pending: LocaleCode | null,
): LocaleCode {
  return pending ?? normalizeLocale(saved);
}
