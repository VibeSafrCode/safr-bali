import type { ReactNode } from "react";

import type { TelegramWebApp } from "../runtime/types";
import type { LocaleCode } from "../i18n/locale";
import { useI18n } from "../i18n/runtime";
import { BottomNavigation, type AppTab } from "./BottomNavigation";
import { TelegramSafeArea } from "./TelegramSafeArea";

export function AppShell({
  webApp,
  activeTab,
  userName,
  locale,
  onLocaleChange,
  localeStatus,
  onLocaleRetry,
  onNavigate,
  children,
}: {
  webApp: TelegramWebApp | null;
  activeTab: AppTab;
  userName: string;
  locale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  localeStatus: "idle" | "loading" | "pending" | "success" | "error" | "offline";
  onLocaleRetry: () => void;
  onNavigate: (tab: AppTab) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const statusKey = {
    loading: "shell.language.loading",
    pending: "shell.language.pendingSync",
    success: "shell.language.success",
    error: "shell.language.errorRollback",
    offline: "shell.language.offline",
  } as const;
  return (
    <TelegramSafeArea webApp={webApp}>
      <a className="skip-link" href="#app-content">
        {t("shell.skipToContent")}
      </a>
      <div className="app-shell">
        <header className="app-header">
          <button
            className="brand brand-button"
            type="button"
            aria-label={t("shell.homeAria")}
            onClick={() => onNavigate("home")}
          >
            <span className="brand-mark">S</span>
            <span>SAFRWAY</span>
          </button>
          <div className="app-header-actions">
            <div className="locale-switch" role="group" aria-label={t("shell.languageAria")}>
              {(["ru", "en"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={locale === value}
                  onClick={() => onLocaleChange(value)}
                >
                  {value === "ru" ? "RU" : "EN"}
                </button>
              ))}
            </div>
            <button
              className="user-chip"
              type="button"
              aria-label={t("shell.profileAria", { userName })}
              onClick={() => onNavigate("profile")}
            >
              {userName}
            </button>
          </div>
        </header>

        {localeStatus !== "idle" && (
          <div
            className={`locale-sync-status ${localeStatus}`}
            role={localeStatus === "error" ? "alert" : "status"}
            aria-live={localeStatus === "error" ? "assertive" : "polite"}
          >
            <span>{t(statusKey[localeStatus])}</span>
            {localeStatus === "offline" && (
              <button type="button" onClick={onLocaleRetry}>
                {t("shell.language.retry")}
              </button>
            )}
          </div>
        )}

        <main className="app-content" id="app-content">
          {children}
        </main>

        <BottomNavigation activeTab={activeTab} onNavigate={onNavigate} />
      </div>
    </TelegramSafeArea>
  );
}
