import {useState, type ReactNode} from "react";

import {AppIcon} from './AppIcon';
import type { TelegramWebApp } from "../runtime/types";
import type { LocaleCode } from "../i18n/locale";
import { useI18n } from "../i18n/runtime";
import { BottomNavigation, type AppTab } from "./BottomNavigation";
import { TelegramSafeArea } from "./TelegramSafeArea";
import { AppearanceControls, useAppearance } from "./AppearanceControls";

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
  const [menu,setMenu]=useState(false);
  const { theme, setTheme } = useAppearance();
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

            <span>SAFRWAY</span>
          </button>
          <button className="menu-toggle" aria-label={locale==='en'?'Menu':'Меню'} aria-expanded={menu} onClick={()=>setMenu(!menu)}><span/><span/><span/></button>
          <nav className={`app-main-menu ${menu?'is-open':''}`} aria-label={locale==='en'?'Main menu':'Главное меню'}>{(['home','services','support'] as AppTab[]).map((id,i)=><button key={id} aria-current={activeTab===id?'page':undefined} onClick={()=>{onNavigate(id);setMenu(false);}}>{(locale==='en'?['Destinations','Services','Help']:['Направления','Сервисы','Помощь'])[i]}</button>)}<button onClick={()=>{onNavigate('home');setMenu(false);setTimeout(()=>document.querySelector('.travel-videos')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}),100);}}>{locale==='en'?'Video':'Видео'}</button></nav>
          <div className="app-header-actions">
            <AppearanceControls locale={locale} onLocaleChange={onLocaleChange} theme={theme} onThemeChange={setTheme} />
            <button
              className="user-chip"
              type="button"
              aria-label={t("shell.profileAria", { userName })}
              onClick={() => onNavigate("profile")}
            >
              <AppIcon name="user"/>
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
