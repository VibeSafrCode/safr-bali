import { useEffect, useState } from "react";

import { appApiClient, ApiError } from "../api/client";
import type { AuthStatus } from "../api/types";
import { AppearanceControls, useAppearance } from "../components/AppearanceControls";
import { CurrencyCalculator } from "../components/CurrencyCalculator";
import { I18nProvider } from "../i18n/runtime";
import { browserLoginUrl } from "../runtime/browser";

type State = "loading" | "guest" | "ready" | "error";

const copy = {
  ru: {
    site: "Вернуться на сайт",
    account: "Личный кабинет",
    accountShort: "Кабинет",
    eyebrow: "SAFRWAY · защищённый расчёт",
    guestTitle: "Войдите, чтобы открыть калькулятор",
    guestDetail: "После входа SAFRWAY запомнит сессию и вернёт вас на главную страницу сайта. Оттуда доступны услуги, визы и калькулятор.",
    login: "Войти через Telegram",
    errorTitle: "Калькулятор временно недоступен",
    retry: "Попробовать ещё раз",
  },
  en: {
    site: "Back to website",
    account: "My account",
    accountShort: "Account",
    eyebrow: "SAFRWAY · protected calculation",
    guestTitle: "Sign in to open the calculator",
    guestDetail: "After sign-in, SAFRWAY will remember the session and return you to the website Home. Services, visas and the calculator remain available there.",
    login: "Sign in with Telegram",
    errorTitle: "The calculator is temporarily unavailable",
    retry: "Try again",
  },
} as const;

export function WebCalculatorApp() {
  const api = appApiClient();
  const { theme, setTheme } = useAppearance();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [state, setState] = useState<State>("loading");
  const [locale, setLocale] = useState<"ru" | "en">(() =>
    document.documentElement.lang === "en" ? "en" : "ru",
  );

  async function loadSession(signal?: AbortSignal) {
    setState("loading");
    try {
      const result = await api.request<AuthStatus>("/api/web/auth/me", { signal });
      if (signal?.aborted) return;
      setAuth(result);
      const resolvedLocale = result.locale === "en" ? "en" : "ru";
      setLocale(resolvedLocale);
      document.documentElement.lang = resolvedLocale;
      setState(result.authenticated ? "ready" : "guest");
    } catch (error) {
      if (signal?.aborted) return;
      setState(error instanceof ApiError && error.kind === "authentication" ? "guest" : "error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, []);

  async function changeLocale(next: "ru" | "en") {
    if (!auth?.authenticated || !auth.csrf_token || next === locale) return;
    const previous = locale;
    setLocale(next);
    document.documentElement.lang = next;
    try {
      await api.request("/api/web/locale", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": auth.csrf_token,
        },
        body: JSON.stringify({ locale: next }),
      });
      setAuth({ ...auth, locale: next });
    } catch {
      setLocale(previous);
      document.documentElement.lang = previous;
    }
  }

  const t = copy[locale];
  const website = locale === "en"
    ? "https://safrway.online/en/bali/exchange/usdt-idr/"
    : "https://safrway.online/bali/exchange/usdt-idr/";

  return (
    <I18nProvider locale={locale}>
      <div className="web-calculator-shell">
        <header className="web-calculator-header">
          <a className="brand" href={website}>
            <span className="brand-mark">S</span>
            <span>SAFRWAY</span>
          </a>
          <div className="web-calculator-tools">
            <AppearanceControls
              locale={locale}
              onLocaleChange={(next) => void changeLocale(next)}
              theme={theme}
              onThemeChange={setTheme}
            />
            <a className="button secondary web-account-link" href="/account/" aria-label={t.account}>
              <span className="web-account-full">{t.account}</span>
              <span className="web-account-short" aria-hidden="true">{t.accountShort}</span>
            </a>
          </div>
        </header>

        {state === "ready" && auth?.csrf_token ? (
          <main className="web-calculator-content">
            <nav className="web-calculator-nav" aria-label={t.site}>
              <a href={website}>← {t.site}</a>
              <a href="/account/">{t.account} →</a>
            </nav>
            <CurrencyCalculator
              apiPrefix="/api/web"
              csrfToken={auth.csrf_token}
              navigate={() => window.location.assign(website)}
              onManager={() => window.location.assign("https://t.me/safr_bali_bot")}
            />
          </main>
        ) : (
          <main className="web-calculator-status">
            <span className="eyebrow">{t.eyebrow}</span>
            <h1>{state === "error" ? t.errorTitle : t.guestTitle}</h1>
            <p>{t.guestDetail}</p>
            {state === "guest" && (
              <a
                className="button primary"
                href={browserLoginUrl(undefined, locale === "en" ? "/en/" : "/")}
              >{t.login}</a>
            )}
            {state === "error" && (
              <button className="button primary" type="button" onClick={() => void loadSession()}>{t.retry}</button>
            )}
          </main>
        )}
      </div>
    </I18nProvider>
  );
}
