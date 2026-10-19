import {
  clientRuntimeDirection, clientRuntimeText, isClientRuntimeLocale,
  type ClientRuntimeKey, type ClientRuntimeLocale, type ClientRuntimeVariables,
} from "./client-runtime";

export type ClientUiLocale10 = ClientRuntimeLocale;
export type ServerContactLocaleRUEN = "ru" | "en";
export type ClientUiBindings = Readonly<{
  role: "client";
  locale: ClientUiLocale10;
  dir: "ltr" | "rtl";
  text: (key: ClientRuntimeKey, variables?: ClientRuntimeVariables) => string;
}>;
import {registerClientUiBinding} from "./client-ui-provenance";
export {requireClientUiBindings} from "./client-ui-provenance";

export function requireClientUiLocale(value: unknown): ClientUiLocale10 {
  if (!isClientRuntimeLocale(value)) throw new Error("CLIENT_UI_UNKNOWN_LOCALE");
  return value;
}
export function serverContactLocale(value: unknown): ServerContactLocaleRUEN {
  // The existing server field is optional, with a deliberate RU bootstrap
  // default. Unknown/foreign values are errors, not Russian fallbacks.
  if (value === undefined) return "ru";
  if (value !== "ru" && value !== "en") throw new Error("CLIENT_UI_CONTACT_LOCALE_BOUNDARY");
  return value;
}
export function createClientUiBindings(value: unknown): ClientUiBindings {
  const locale = requireClientUiLocale(value);
  const binding: ClientUiBindings = Object.freeze({
    role: "client", locale, dir: clientRuntimeDirection(locale),
    text: (key: ClientRuntimeKey, variables?: ClientRuntimeVariables) =>
      clientRuntimeText(locale, key, variables),
  });
  registerClientUiBinding(binding);
  return binding;
}


// Exact existing public selector autonyms, not new translations. Fixed source
// pins/replay tests bind these to public-selector-policy.mjs LANGUAGE_OPTIONS.
export const CLIENT_UI_LANGUAGE_OPTIONS = Object.freeze([
  {code: "ru", short: "RU", label: "Русский"},
  {code: "en", short: "EN", label: "English"},
  {code: "zh-Hans", short: "中文", label: "简体中文"},
  {code: "ko", short: "KO", label: "한국어"},
  {code: "fr", short: "FR", label: "Français"},
  {code: "de", short: "DE", label: "Deutsch"},
  {code: "ja", short: "JA", label: "日本語"},
  {code: "hi", short: "HI", label: "हिन्दी"},
  {code: "es", short: "ES", label: "Español"},
  {code: "ar", short: "AR", label: "العربية"},
].map(option => Object.freeze(option)));

const prefixes: Readonly<Record<ClientUiLocale10, string>> = Object.freeze({
  ru: "", en: "/en", "zh-Hans": "/zh-cn", ko: "/ko", fr: "/fr",
  de: "/de", ja: "/ja", hi: "/hi", es: "/es", ar: "/ar",
});
export function clientPublicHome(locale: unknown): string {
  return prefixes[requireClientUiLocale(locale)] + "/";
}
export function clientPublicCalculator(locale: unknown): string {
  return prefixes[requireClientUiLocale(locale)] + "/bali/exchange/usdt-idr/";
}
