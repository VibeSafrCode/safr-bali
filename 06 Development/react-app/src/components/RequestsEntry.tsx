import { AppIcon } from "./AppIcon";
import "./client-navigation.css";

export function RequestsEntry({ locale, count, onOpen }: { locale: "ru" | "en"; count: number; onOpen: () => void }) {
  return <button className="client-requests-entry" type="button" onClick={onOpen}>
    <AppIcon name="▤" /><span><strong>{locale === "ru" ? "Заявки" : "Requests"}{count > 0 ? ` · ${count}` : ""}</strong><small>{locale === "ru" ? "Выбранные услуги и статус оформления" : "Selected services and request status"}</small></span><AppIcon name="→" />
  </button>;
}
