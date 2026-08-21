import { useEffect, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";
import type { VisaCase } from "../api/types";

type Locale = "ru" | "en";
type Mutation = "notifications" | "entry" | null;

const copy = {
  ru: { eyebrow: "Мои услуги", title: "Мои визы", intro: "Здесь видны только проверенные и опубликованные менеджером данные.", empty: "У вас пока нет опубликованных виз в SAFRWAY.", open: "Открыть визу", back: "К списку", important: "Важные даты и статусы", action: "Что делать дальше", noAction: "Сейчас от вас ничего не требуется", documents: "Документы", history: "История", notifications: "Уведомления по этой визе", entry: "Я уже въехал", entryDate: "Дата въезда", save: "Подтвердить", retry: "Повторить", unknown: "Уточняется", enabled: "Включены", disabled: "Отключены", indonesia: "Индонезия", service: "Статус оформления SAFRWAY", lifecycle: "Статус визы", process: "Текущий процесс", pending: "Сохраняем…", saved: "Изменение сохранено", failed: "Не удалось сохранить. Предыдущее значение восстановлено.", openDocument: "Открыть защищённо", documentFallback: "Документ по визе", eventFallback: "Обновление по визе" },
  en: { eyebrow: "My services", title: "My visas", intro: "Only manager-verified and published information is shown here.", empty: "You have no published SAFRWAY visas yet.", open: "Open visa", back: "Back to list", important: "Important dates and statuses", action: "What to do next", noAction: "Nothing is required from you now", documents: "Documents", history: "Timeline", notifications: "Notifications for this visa", entry: "I have entered", entryDate: "Entry date", save: "Confirm", retry: "Retry", unknown: "Being confirmed", enabled: "Enabled", disabled: "Disabled", indonesia: "Indonesia", service: "SAFRWAY processing status", lifecycle: "Visa status", process: "Current process", pending: "Saving…", saved: "Change saved", failed: "Could not save. The previous value was restored.", openDocument: "Open securely", documentFallback: "Visa document", eventFallback: "Visa update" },
} as const;

const lifecycle: Record<Locale, Record<string, string>> = {
  ru: { NOT_ISSUED: "Оформление", ISSUED_NOT_ACTIVATED: "Виза готова", ACTIVE: "Виза активна", EXPIRING: "Скоро продление", EXTENSION_PROCESSING: "Продление оформляется", EXTENDED: "Продлена", EXPIRED: "Истекла", CANCELLED: "Аннулирована", REFUSED: "Отказано" },
  en: { NOT_ISSUED: "Processing", ISSUED_NOT_ACTIVATED: "Visa issued", ACTIVE: "Visa active", EXPIRING: "Renewal approaching", EXTENSION_PROCESSING: "Extension in progress", EXTENDED: "Extended", EXPIRED: "Expired", CANCELLED: "Cancelled", REFUSED: "Refused" },
};
const service: Record<Locale, Record<string, string>> = {
  ru: { PURCHASED: "Услуга заказана", DOCUMENTS_REQUIRED: "Нужны документы", DOCUMENTS_RECEIVED: "Документы получены", SUBMITTED: "Подано", WAITING_PAYMENT: "Ожидает оплаты", PAID: "Оплачено", PROCESSING: "SAFRWAY оформляет", ACTION_REQUIRED: "Требуется действие", COMPLETED: "Оформление завершено", CANCELLED: "Оформление отменено" },
  en: { PURCHASED: "Service ordered", DOCUMENTS_REQUIRED: "Documents required", DOCUMENTS_RECEIVED: "Documents received", SUBMITTED: "Submitted", WAITING_PAYMENT: "Awaiting payment", PAID: "Paid", PROCESSING: "SAFRWAY is processing", ACTION_REQUIRED: "Action required", COMPLETED: "Processing completed", CANCELLED: "Processing cancelled" },
};
const processStatus: Record<Locale, Record<string, string>> = {
  ru: { UNKNOWN: "Уточняется", WAITING_PAYMENT: "Ожидает оплаты", PAID: "Оплачено", SUBMITTED: "Передано", PROCESSING: "В обработке", ACTION_REQUIRED: "Требуется действие", BIOMETRICS_REQUIRED: "Нужна биометрия", APPROVED: "Одобрено", REJECTED: "Отклонено", CANCELLED: "Отменено" },
  en: { UNKNOWN: "Being confirmed", WAITING_PAYMENT: "Awaiting payment", PAID: "Paid", SUBMITTED: "Submitted", PROCESSING: "In progress", ACTION_REQUIRED: "Action required", BIOMETRICS_REQUIRED: "Biometrics required", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" },
};

function human(map: Record<Locale, Record<string, string>>, locale: Locale, value: string, fallback: string) { return map[locale][value] ?? fallback; }
function localeSafe(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;
  const wrongScript = locale === "en" ? /[А-Яа-яЁё]/.test(value) : /^[\x00-\x7F]+$/.test(value);
  return wrongScript ? fallback : value;
}
function formatDate(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date(`${value.slice(0, 10)}T00:00:00+08:00`));
}

export function VisaCabinet({ apiPrefix, locale, csrfToken }: { apiPrefix: "/mini-app" | "/api/web"; locale: Locale; csrfToken?: string }) {
  const [items, setItems] = useState<VisaCase[]>([]);
  const [selected, setSelected] = useState<VisaCase | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [mutation, setMutation] = useState<Mutation>(null);
  const [message, setMessage] = useState("");
  const t = copy[locale];

  async function load(caseId?: number) {
    setState("loading"); setError("");
    try {
      const result = await appApiClient().request<VisaCase | { items: VisaCase[] }>(`${apiPrefix}/visa-cases${caseId ? `/${caseId}` : ""}`);
      if ("items" in result) setItems(result.items); else setSelected(result);
      setState("ready");
    } catch (caught) { setError(apiErrorMessage(caught)); setState("error"); }
  }
  useEffect(() => { void load(); }, [apiPrefix]);

  async function write(kind: Exclude<Mutation, null>, path: string, body: unknown, method: "PATCH" | "POST") {
    if (mutation) return;
    const previous = selected;
    setMutation(kind); setMessage("");
    if (kind === "notifications" && selected) setSelected({ ...selected, notifications_enabled: !selected.notifications_enabled });
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const result = await appApiClient().request<VisaCase>(`${apiPrefix}/visa-cases/${path}`, { method, headers, body: JSON.stringify(body) });
      setSelected(result); setItems((current) => current.map((item) => item.id === result.id ? result : item)); setMessage(t.saved);
    } catch { setSelected(previous); setMessage(t.failed); }
    finally { setMutation(null); }
  }

  if (state === "loading") return <section className="visa-cabinet" aria-busy="true"><div className="visa-skeleton" /><div className="visa-skeleton" /></section>;
  if (state === "error") return <section className="empty-state" role="alert"><strong>{error}</strong><button className="button secondary" onClick={() => void load(selected?.id)}>{t.retry}</button></section>;

  if (selected) return <section className="page-stack visa-cabinet">
    <button className="text-button visa-back" onClick={() => setSelected(null)}>← {t.back}</button>
    <header className="page-heading"><span className="eyebrow">{t.indonesia} · {localeSafe(selected.custom_visa_name || selected.visa_type.name, locale, selected.visa_type.code)}</span><h1>{human(lifecycle, locale, selected.lifecycle_status, t.unknown)}</h1><p>{localeSafe(selected.next_action_text, locale, t.noAction)}</p></header>
    <article className="visa-detail-card"><h2>{t.important}</h2><dl className="visa-status-list"><div><dt>{t.service}</dt><dd>{human(service, locale, selected.service_status, t.unknown)}</dd></div><div><dt>{t.lifecycle}</dt><dd>{human(lifecycle, locale, selected.lifecycle_status, t.unknown)}</dd></div><div><dt>{t.process}</dt><dd>{selected.current_process ? human(processStatus, locale, selected.current_process.external_status, t.unknown) : t.unknown}</dd></div></dl><dl className="visa-dates"><div><dt>{locale === "ru" ? "Использовать до" : "Enter by"}</dt><dd>{formatDate(selected.entry_deadline, locale, t.unknown)}</dd></div><div><dt>{locale === "ru" ? "Находиться до" : "Stay until"}</dt><dd>{formatDate(selected.stay_end, locale, t.unknown)}</dd></div><div><dt>{locale === "ru" ? "Обратиться в SAFRWAY" : "Contact SAFRWAY"}</dt><dd>{formatDate(selected.recommended_contact_at, locale, t.unknown)}</dd></div></dl></article>
    <article className="visa-detail-card"><h2>{t.action}</h2><p>{localeSafe(selected.next_action_text, locale, t.noAction)}</p>{selected.next_action_due_at && <strong>{formatDate(selected.next_action_due_at, locale, t.unknown)}</strong>}</article>
    {!!selected.documents?.length && <article className="visa-detail-card"><h2>{t.documents}</h2><ul>{selected.documents.map((document) => <li key={document.id}><span>{localeSafe(document.name, locale, t.documentFallback)}</span>{document.access_url && <a className="text-button" href={document.access_url} target="_blank" rel="noopener noreferrer">{t.openDocument}</a>}</li>)}</ul></article>}
    {!!selected.timeline?.length && <article className="visa-detail-card"><h2>{t.history}</h2><ol className="visa-timeline">{selected.timeline.map((event) => <li key={event.id}><strong>{localeSafe(event.title, locale, t.eventFallback)}</strong>{event.description && <p>{localeSafe(event.description, locale, t.eventFallback)}</p>}<small>{formatDate(event.created_at, locale, "")}</small></li>)}</ol></article>}
    {message && <p className="visa-mutation-status" role="status">{message}</p>}
    <article className="visa-detail-card visa-toggle" aria-busy={mutation === "notifications"}><div><h2>{t.notifications}</h2><span>{selected.notifications_enabled ? t.enabled : t.disabled}</span></div><button className="button secondary" disabled={!!mutation} onClick={() => void write("notifications", `${selected.id}/notifications`, { enabled: !selected.notifications_enabled }, "PATCH")}>{mutation === "notifications" ? t.pending : (selected.notifications_enabled ? t.disabled : t.enabled)}</button></article>
    {!selected.entered_on && <form className="visa-detail-card" aria-busy={mutation === "entry"} onSubmit={(event) => { event.preventDefault(); if (entryDate) void write("entry", `${selected.id}/entry`, { entered_on: entryDate, idempotency_key: crypto.randomUUID() }, "POST"); }}><h2>{t.entry}</h2><label>{t.entryDate}<input type="date" required disabled={!!mutation} value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label><button className="button primary" disabled={!!mutation}>{mutation === "entry" ? t.pending : t.save}</button></form>}
  </section>;

  return <section className="page-stack visa-cabinet"><header className="page-heading"><span className="eyebrow">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></header>{items.length ? <div className="visa-card-grid">{items.map((item) => <article className="visa-case-card" key={item.id}><span className="eyebrow">{t.indonesia} · {item.custom_visa_name || item.visa_type.name}</span><h2>{human(lifecycle, locale, item.lifecycle_status, t.unknown)}</h2><p><strong>{t.service}:</strong> {human(service, locale, item.service_status, t.unknown)}</p><div><small>{item.stay_end ? (locale === "ru" ? "Можно находиться до" : "Stay until") : (locale === "ru" ? "Ключевая дата" : "Key date")}</small><strong>{formatDate(item.stay_end || item.entry_deadline, locale, t.unknown)}</strong></div><p>{localeSafe(item.next_action_text, locale, t.noAction)}</p><button className="button primary" onClick={() => void load(item.id)}>{t.open}</button></article>)}</div> : <div className="empty-state"><strong>{t.empty}</strong></div>}</section>;
}
