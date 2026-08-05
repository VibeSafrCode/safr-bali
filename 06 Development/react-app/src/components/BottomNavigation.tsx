export type AppTab = "home" | "services" | "orders" | "profile" | "support";

const items: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: "home", label: "Главная", icon: "⌂" },
  { id: "services", label: "Услуги", icon: "◇" },
  { id: "orders", label: "Заявки", icon: "▤" },
  { id: "profile", label: "Профиль", icon: "○" },
  { id: "support", label: "Поддержка", icon: "✎" },
];

export function BottomNavigation({
  activeTab,
  onNavigate,
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Разделы Mini App">
      {items.map((item) => (
        <button
          className={activeTab === item.id ? "active" : ""}
          key={item.id}
          type="button"
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
