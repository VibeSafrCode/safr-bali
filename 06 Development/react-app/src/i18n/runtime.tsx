import { createContext, useContext, type ReactNode } from "react";

import snapshot from "../../../shared/content/generated/i18n/mini-app.v1.json";
import { ApiError } from "../api/client";
import type { LocaleCode } from "./locale";

type RuntimeEntry = {
  ru: string;
  en: string;
  review: "TRANSLATED" | "HUMAN_REVIEW_REQUIRED";
};

export type MiniAppTranslationKey = keyof typeof snapshot.entries;
type Variables = Record<string, string | number>;

function interpolate(value: string, variables: Variables = {}) {
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, key) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : token,
  );
}

export function translate(
  locale: LocaleCode,
  key: MiniAppTranslationKey,
  variables?: Variables,
) {
  const entry = snapshot.entries[key] as RuntimeEntry;
  return interpolate(entry[locale], variables);
}

type I18nValue = {
  locale: LocaleCode;
  t: (key: MiniAppTranslationKey, variables?: Variables) => string;
};

const I18nContext = createContext<I18nValue>({
  locale: "ru",
  t: (key, variables) => translate("ru", key, variables),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: LocaleCode;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider
      value={{ locale, t: (key, variables) => translate(locale, key, variables) }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function localizedApiError(
  locale: LocaleCode,
  error: unknown,
) {
  let key: MiniAppTranslationKey = "api.error.unknown";
  if (error instanceof ApiError) {
    if (error.kind === "authentication") key = "api.error.authentication";
    else if (error.kind === "configuration") key = "api.error.configuration";
    else if (error.kind === "invalid_response") key = "api.error.invalidResponse";
    else key = "api.error.data";
  }
  return translate(locale, key);
}
