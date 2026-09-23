import {AppIcon} from './AppIcon';
import { useI18n, type MiniAppTranslationKey } from "../i18n/runtime";
import type { ClientTab } from "./client-navigation";
import "./client-navigation.css";

export type AppTab = ClientTab;

const items: Array<{ id: AppTab; label: MiniAppTranslationKey | "life"; icon: string }> = [
  { id: "home", label: "nav.home", icon: "⌂" },
  { id: "services", label: "nav.services", icon: "◇" },
  { id: "life", label: "life", icon: "✦" },
  { id: "profile", label: "nav.profile", icon: "○" },
  { id: "support", label: "nav.support", icon: "✎" },
];

export function BottomNavigation({
  activeTab,
  onNavigate,
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <nav className="bottom-nav client-bottom-nav" aria-label={t("nav.aria")}>
      {items.map((item) => (
        <button
          className={`${activeTab === item.id ? "active" : ""}${item.id === "life" ? " life-nav" : ""}`}
          key={item.id}
          type="button"
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.id === "life" ? <span className="life-nav-orb"><AppIcon name="✦" /></span> : <AppIcon name={item.id==='profile'?'user':item.id==='support'?'◌':item.icon}/>}
          <small>{item.label === "life" ? (locale === "ru" ? "Моя жизнь" : "My life") : t(item.label)}</small>
        </button>
      ))}
    </nav>
  );
}
