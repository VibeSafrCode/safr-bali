import { YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import {AppIcon} from './AppIcon';
import { useI18n } from "../i18n/runtime";
import { requireClientUiBindings, type ClientUiBindings } from "../i18n/client-ui-bindings";
import type { ClientTab } from "./client-navigation";
import "./client-navigation.css";

export type AppTab = ClientTab;

const items: Array<{ id: AppTab; label: "nav.home" | "nav.services" | "nav.profile" | "nav.support" | "life"; icon: string }> = [
  { id: "home", label: "nav.home", icon: "⌂" },
  { id: "services", label: "nav.services", icon: "◇" },
  { id: "life", label: "life", icon: "✦" },
  { id: "profile", label: "nav.profile", icon: "○" },
  { id: "support", label: "nav.support", icon: "✎" },
];

export function BottomNavigation({
  activeTab,
  onNavigate,
  ui,
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  ui?: ClientUiBindings;
}) {
  const { t, locale } = useI18n();
  const clientUi = YOGA_MINI_APP || ui === undefined ? undefined : requireClientUiBindings(ui);
  const label = (key: (typeof items)[number]["label"]) => key === "life"
    ? (clientUi ? clientUi.text("inline:06 Development/react-app/src/components/BottomNavigation.tsx#eaedf211c154") : (locale === "ru" ? "Моя жизнь" : "My life"))
    : (clientUi ? clientUi.text(key) : t(key));
  return (
    <nav className="bottom-nav client-bottom-nav" aria-label={clientUi ? clientUi.text("nav.aria") : t("nav.aria")} lang={clientUi?.locale} dir={clientUi?.dir}>
      {items.map((item) => (
        <button
          className={`${activeTab === item.id ? "active" : ""}${item.id === "life" ? " life-nav" : ""}`}
          key={item.id}
          type="button"
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.id === "life" ? <span className="life-nav-orb"><AppIcon name="✦" /></span> : <AppIcon name={item.id==='profile'?'user':item.id==='support'?'◌':item.icon}/>}
          <small>{label(item.label)}</small>
        </button>
      ))}
    </nav>
  );
}
