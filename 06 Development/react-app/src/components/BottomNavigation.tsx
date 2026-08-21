import { useI18n, type MiniAppTranslationKey } from "../i18n/runtime";

export type AppTab = "home" | "services" | "orders" | "visas" | "profile" | "support";

const items: Array<{ id: AppTab; label: MiniAppTranslationKey; icon: string }> = [
  { id: "home", label: "nav.home", icon: "⌂" },
  { id: "services", label: "nav.services", icon: "◇" },
  { id: "orders", label: "nav.orders", icon: "▤" },
  { id: "visas", label: "nav.visas", icon: "▣" },
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
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label={t("nav.aria")}>
      {items.map((item) => (
        <button
          className={activeTab === item.id ? "active" : ""}
          key={item.id}
          type="button"
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{t(item.label)}</small>
        </button>
      ))}
    </nav>
  );
}
