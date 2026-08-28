import { useEffect, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";

type CatalogueItem = {
  code: string;
  trigger: string;
  audience: string[];
  channel: string;
  consent: string;
  preview: { ru: string; en: string };
  current_truth: { queue: string; delivery: string; unknown_policy: string };
};

const labels = {
  trigger: {
    explicit_publish_with_notify: { ru: "Публикация с уведомлением", en: "Publish with notification" },
    explicit_save_and_notify: { ru: "Сохранить и уведомить", en: "Save and notify" },
    root_admin_confirmed_manual_action: { ru: "Ручная кнопка «Уведомить»", en: "Manual Notify action" },
    due_versioned_contact_plan: { ru: "Наступила дата плана связи", en: "Contact-plan date is due" },
  },
  audience: { client: { ru: "Клиент", en: "Client" }, assigned_staff: { ru: "Назначенные сотрудники", en: "Assigned staff" }, root_admin: { ru: "Главный администратор", en: "Root admin" } },
} as const;

export function AdminNotificationCatalogue({ locale }: { locale: "ru" | "en" }) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;
  async function load() {
    setState("loading"); setError("");
    try { const result = await appApiClient().request<{ items: CatalogueItem[] }>("/api/web/admin/visa-cases/notification-catalogue"); setItems(result.items); setState("ready"); }
    catch (caught) { setError(apiErrorMessage(caught)); setState("error"); }
  }
  useEffect(() => { void load(); }, []);
  if (state === "loading") return <div className="admin-empty" role="status">{ui("Загружаем каталог сообщений…", "Loading message catalogue…")}</div>;
  if (state === "error") return <div className="admin-empty" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>{ui("Повторить", "Retry")}</button></div>;
  return <div className="admin-notification-catalogue">
    {items.map((item) => <article className="admin-notification-card" key={item.code}>
      <div><span className="eyebrow">{item.code}</span><h3>{labels.trigger[item.trigger as keyof typeof labels.trigger]?.[locale] ?? ui("Системное событие", "System event")}</h3></div>
      <p className="admin-notification-preview"><strong>{ui("Что увидит получатель", "Recipient preview")}</strong><span>{item.preview[locale]}</span></p>
      <dl><div><dt>{ui("Получатели", "Audience")}</dt><dd>{item.audience.map((audience) => labels.audience[audience as keyof typeof labels.audience]?.[locale] ?? audience).join(", ")}</dd></div><div><dt>{ui("Доставка", "Delivery")}</dt><dd>{ui("Асинхронная очередь Telegram; отправка не гарантируется до статуса «Доставлено».", "Asynchronous Telegram queue; delivery is not guaranteed until Delivered.")}</dd></div><div><dt>{ui("Неизвестный результат", "Unknown outcome")}</dt><dd>{ui("Только ручная проверка, автоматический повтор запрещён.", "Manual review only; automatic retry is prohibited.")}</dd></div></dl>
    </article>)}
  </div>;
}
