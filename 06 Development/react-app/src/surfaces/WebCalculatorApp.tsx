import { useEffect, useRef, useState } from "react";
import {ClientApplicationLifecycle} from '../components/ClientApplicationLifecycle';

import { appApiClient, ApiError } from "../api/client";
import type { AuthStatus } from "../api/types";
import { useAppearance } from "../components/AppearanceControls";
import { ClientAppearanceControls } from "../components/ClientAppearanceControls";
import { CurrencyCalculator } from "../components/CurrencyCalculator";
import { I18nProvider } from "../i18n/runtime";
import { browserLoginUrl } from "../runtime/browser";
import { clientPublicCalculator, clientPublicHome, serverContactLocale } from "../i18n/client-ui-bindings";
import {useClientUiController} from '../i18n/use-client-ui-controller';
import {clientUiPrincipal} from '../i18n/client-ui-surface';

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

export function WebCalculatorClientEntry(){
  return <><WebCalculatorApp/><ClientApplicationLifecycle/></>;
}

export function WebCalculatorApp() {
  const api = appApiClient();
  const { theme, setTheme } = useAppearance();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [state, setState] = useState<State>("loading");
  const loadVersion = useRef(0);
  const client=useClientUiController('web',true,{onLogout:clearPrincipal,onAuthorityLost:clearPrincipal});
  const controller=client.controller!,ui=client.ui!,preference=client.preference!;

  function clearPrincipal(){loadVersion.current++;setAuth(null);setState('guest');}

  async function loadSession(signal?: AbortSignal) {
    const version = ++loadVersion.current;
    const token=controller.beginLoad();
    setState("loading");
    setAuth(null);
    try {
      const result = await api.request<AuthStatus>("/api/web/auth/me", { signal });
      if (signal?.aborted || version !== loadVersion.current||!controller.current(token)) return;
      if(!controller.bind(token,clientUiPrincipal('web',result),result.locale))return;
      setAuth(result);
      setState(result.authenticated ? "ready" : "guest");
    } catch (error) {
      if (signal?.aborted || version !== loadVersion.current||!controller.current(token)) return;
      if (error instanceof ApiError && error.kind === "authentication") {
        controller.bind(token,null,"ru");setAuth(null);setState("guest");
      } else setState("error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => {
      controller.abort(); loadVersion.current++;
    };
  }, [client.controller]);

  async function changeLocale(next: unknown) {
    await controller.choose(next);
  }

  const t = {
    site: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.site"),
    account: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.account"),
    accountShort: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.accountShort"),
    eyebrow: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.eyebrow"),
    guestTitle: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.guestTitle"),
    guestDetail: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.guestDetail"),
    login: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.login"),
    errorTitle: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.errorTitle"),
    retry: ui.text("source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy.retry"),
  };
  const website = "https://safrway.online" + clientPublicCalculator(ui.locale);

  return (
    <I18nProvider locale={serverContactLocale(auth?.locale)}>
      <div className="web-calculator-shell">
        <header className="web-calculator-header">
          <a className="brand" href={website}>
            <span className="brand-mark">S</span>
            <span>SAFRWAY</span>
          </a>
          <div className="web-calculator-tools">
            <ClientAppearanceControls
              ui={ui}
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
        {preference.status === "saving" && <p role="status">{ui.text("shell.language.pendingSync")}</p>}
        {preference.status === "saved" && <p role="status">{ui.text("shell.language.success")}</p>}
        {["conflict", "unknown", "unavailable", "rejected"].includes(preference.status) && (
          <div>
            <p role="alert">{ui.text("api.error.data")}</p>
            {preference.enabled && <button className="button secondary" type="button" data-ui-preference-retry
              onClick={() => void controller.retry()}>{ui.text("shell.language.retry")}</button>}
          </div>
        )}

        {state === "ready" && auth?.csrf_token ? (
          <main className="web-calculator-content">
            <nav className="web-calculator-nav" aria-label={t.site}>
              <a href={website}>← {t.site}</a>
              <a href="/account/">{t.account} →</a>
            </nav>
            <CurrencyCalculator
              ui={ui}
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
                href={browserLoginUrl(undefined, clientPublicHome(ui.locale))}
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
