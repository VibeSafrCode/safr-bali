import { useEffect, useRef, useState } from "react";
import { appApiClient } from "../api/client";
import type { LifeLocale, LifeService } from "./lifeServices";

export function LifeReminderPreference({ item, apiPrefix, csrfToken, locale, onSaved }: {
  item: LifeService; apiPrefix: "/api/web" | "/mini-app"; csrfToken?: string; locale: LifeLocale;
  onSaved: (item: LifeService) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ru = locale === "ru";
  async function toggle() {
    if (busy) return;
    setBusy(true); setError(false); setSaved(false);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const next = await appApiClient().request<LifeService>(`${apiPrefix}/life-services/${item.id}/notifications`, { method: "PATCH", headers, body: JSON.stringify({ enabled: !item.notifications_enabled }) });
      if (mounted.current) { onSaved(next); setSaved(true); }
    } catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (typeof item.notifications_enabled !== "boolean") return null;
  const unavailable = item.notification_unavailable_reason;
  return <section className="life-reminder-preference" aria-busy={busy}>
    <label><input type="checkbox" checked={item.notifications_enabled} disabled={busy} onChange={() => void toggle()} />{ru ? "Напоминать об окончании" : "Remind me before this service ends"}</label>
    {unavailable === "disabled" && <p>{ru ? "Общая отправка напоминаний пока выключена. Ваш выбор сохранится." : "Service reminders are currently off. Your preference will be saved."}</p>}
    {(!item.end_date || unavailable === "no_end_date") && <p>{ru ? "Без даты окончания напоминания не отправляются." : "Reminders require an end date."}</p>}
    {unavailable === "not_current" && <p>{ru ? "Сейчас услуга вне периода отправки напоминаний." : "The service is currently outside its reminder period."}</p>}
    {error && <p role="alert">{ru ? "Не удалось сохранить. Выбор не изменён; попробуйте ещё раз." : "Could not save. Your preference is unchanged; try again."}</p>}
    {saved && <p role="status">{ru ? "Выбор сохранён." : "Preference saved."}</p>}
  </section>;
}
