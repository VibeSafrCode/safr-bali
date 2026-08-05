import type { ReactNode } from "react";

import type { TelegramWebApp } from "../runtime/types";
import { BottomNavigation, type AppTab } from "./BottomNavigation";
import { TelegramSafeArea } from "./TelegramSafeArea";

export function AppShell({
  webApp,
  activeTab,
  userName,
  onNavigate,
  children,
}: {
  webApp: TelegramWebApp | null;
  activeTab: AppTab;
  userName: string;
  onNavigate: (tab: AppTab) => void;
  children: ReactNode;
}) {
  return (
    <TelegramSafeArea webApp={webApp}>
      <a className="skip-link" href="#app-content">
        К основному содержимому
      </a>
      <div className="app-shell">
        <header className="app-header">
          <button
            className="brand brand-button"
            type="button"
            aria-label="SAFRWAY — главная"
            onClick={() => onNavigate("home")}
          >
            <span className="brand-mark">S</span>
            <span>SAFRWAY</span>
          </button>
          <button
            className="user-chip"
            type="button"
            aria-label={`Открыть профиль: ${userName}`}
            onClick={() => onNavigate("profile")}
          >
            {userName}
          </button>
        </header>

        <main className="app-content" id="app-content">
          {children}
        </main>

        <BottomNavigation activeTab={activeTab} onNavigate={onNavigate} />
      </div>
    </TelegramSafeArea>
  );
}
