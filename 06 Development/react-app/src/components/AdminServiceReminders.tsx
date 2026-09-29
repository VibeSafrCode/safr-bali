import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { baliToday } from "./lifeServices";
import { DEFAULT_REMINDER_POLICY, parseReminderDraft, reminderDate, reminderDraft, type ReminderDraft, type ReminderPolicy } from "./serviceReminders";
import "./service-reminders.css";

type Version = { version: number; created_at: string; reason: string; policy: ReminderPolicy };
type Settings = { version: number; policy: ReminderPolicy; versions: Version[] };
type PreviewExample = { kind: string; label: string; term_days: number | null; days_remaining?: number | null; monthly?: boolean; schedule: number[]; reason?: string };
type Preview = { valid: boolean; examples: PreviewExample[] };
const BASE = "/api/web/admin/service-reminders";

function exampleLabel(item: PreviewExample, ru: boolean) {
  const kind = ({ visa: ru ? "Виза" : "Visa", housing: ru ? "Жильё" : "Housing", bike: ru ? "Байк" : "Bike", insurance: ru ? "Страховка" : "Insurance" } as Record<string, string>)[item.kind] ?? (ru ? "Услуга" : "Service");
  const term = item.term_days === null ? (item.reason === "monthly_end_missing" ? (ru ? "без даты окончания" : "no end date") : (ru ? "дата начала неизвестна" : "start date unknown")) : (ru ? `${item.term_days} дней` : `${item.term_days} days`);
  return `${kind} · ${term}${item.monthly ? (ru ? " · помесячно" : " · monthly") : ""}`;
}

export function AdminServiceReminders({ csrfToken, locale }: { csrfToken: string; locale: "ru" | "en" }) {
  const ru = locale === "ru";
  const [data, setData] = useState<Settings | null>(null);
  const [draft, setDraft] = useState(() => reminderDraft(DEFAULT_REMINDER_POLICY));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [exampleEnd, setExampleEnd] = useState(() => reminderDate(baliToday(), -120) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const dirty = !!data && JSON.stringify(draft) !== JSON.stringify(reminderDraft(data.policy));

  function apply(next: Settings) {
    setData(next); setDraft(reminderDraft(next.policy)); setPreview(null); setReason(""); setConflict(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    void appApiClient().request<Settings>(BASE, { signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) apply(next);
    }).catch((caught) => { if (!controller.signal.aborted) setError(apiErrorMessage(caught)); });
    return () => controller.abort();
  }, []);

  function edit(change: Partial<ReminderDraft>) {
    setDraft((current) => ({ ...current, ...change })); setPreview(null); setNotice(""); setError("");
  }
  function failure(caught: unknown) {
    if (caught instanceof ApiError && caught.status === 409) {
      setConflict(true);
      setError(ru ? "Настройки изменены другим сотрудником. Ваш ввод сохранён. Обновите версию, проверьте расписание и повторите сохранение." : "Another staff member changed the settings. Your draft is preserved. Refresh the version, review the schedule and save again.");
    } else setError(caught instanceof ApiError ? apiErrorMessage(caught) : caught instanceof Error ? caught.message : apiErrorMessage(caught));
  }
  async function checkPreview() {
    if (busy || !data) return;
    setError(""); setNotice("");
    try {
      const policy = parseReminderDraft(draft, locale);
      setBusy(true);
      const result = await appApiClient().request<Preview>(`${BASE}/preview`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ policy }) });
      if (!result.valid) throw new Error(ru ? "Сервер не подтвердил расписание." : "The server did not validate the schedule.");
      setDraft(reminderDraft(policy)); setPreview(result);
    } catch (caught) { failure(caught); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || !data) return;
    setError(""); setNotice("");
    try {
      const policy = parseReminderDraft(draft, locale);
      if (reason.trim().replace(/\s+/g, " ").length < 3) throw new Error(ru ? "Укажите причину изменения для истории: не менее 3 символов." : "Enter a reason for the change history: at least 3 characters.");
      if (!preview?.valid) throw new Error(ru ? "Сначала нажмите «Как это сработает», чтобы проверить текущее расписание." : "Select “How it works” to review the current schedule first.");
      setBusy(true);
      const next = await appApiClient().request<Settings>(BASE, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ expected_version: data.version, policy, reason: reason.trim() }) });
      apply(next); setNotice(ru ? "Настройки сохранены." : "Settings saved.");
    } catch (caught) { failure(caught); }
    finally { setBusy(false); }
  }
  async function refreshVersion() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // Keep the user's draft; require a fresh preview against the new baseline.
      const next = await appApiClient().request<Settings>(BASE);
      if (data) setData(next); else apply(next);
      setPreview(null); setConflict(false);
      setNotice(ru ? "Версия обновлена; ваш ввод сохранён. Проверьте расписание ещё раз." : "Version refreshed; your draft is preserved. Review the schedule again.");
    } catch (caught) { failure(caught); }
    finally { setBusy(false); }
  }

  return <section className="admin-panel service-reminders" aria-labelledby="service-reminder-title" aria-busy={busy}>
    <h2 id="service-reminder-title">{ru ? "Напоминания об окончании услуг" : "Service expiry reminders"}</h2>
    <p>{ru ? "Визы, жильё, байки, страховки и другие услуги · календарные даты по времени Бали." : "Visas, housing, bikes, insurance and other services · Bali calendar dates."}</p>
    {error && <p role="alert" className="admin-alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {conflict && <button type="button" disabled={busy} onClick={() => void refreshVersion()}>{ru ? "Обновить версию, сохранить мой ввод" : "Refresh version, keep my draft"}</button>}
    {!data ? <><p>{error ? (ru ? "Настройки не загружены." : "Settings are unavailable.") : (ru ? "Загрузка…" : "Loading…")}</p>{error && <button type="button" disabled={busy} onClick={() => void refreshVersion()}>{ru ? "Повторить" : "Retry"}</button>}</> : <>
      <p className="service-reminder-status">{ru ? "Сейчас отправка:" : "Delivery is currently:"} <strong>{data.policy.enabled ? (ru ? "Включена" : "On") : (ru ? "Выключена" : "Off")}</strong> · v{data.version}</p>
      <fieldset disabled={busy}>
        <label className="service-reminder-switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => edit({ enabled: event.target.checked })} />{ru ? "Отправлять напоминания" : "Send reminders"}</label>
        <p className="service-reminder-hint">{draft.enabled ? (ru ? "После сохранения бот будет отправлять напоминания в указанные дни. Пропущенные дни не рассылаются задним числом." : "After saving, the bot will send reminders on the selected days. Missed days are not sent retroactively.") : (ru ? "Можно сохранить расписание, оставив отправку выключенной." : "You can save the schedule with delivery switched off.")}</p>
        <label>{ru ? "Длительная услуга — больше дней:" : "Long service — more than this many days:"}<input type="number" min={1} max={3660} step={1} value={draft.threshold} onChange={(event) => edit({ threshold: event.target.value })} /></label>
        <div className="service-reminder-groups">
          <label>{ru ? `Больше ${draft.threshold || "…"} дней` : `More than ${draft.threshold || "…"} days`}<input value={draft.long} maxLength={150} onChange={(event) => edit({ long: event.target.value })} aria-describedby="service-reminder-offset-help" /></label>
          <label>{ru ? `До ${draft.threshold || "…"} дней включительно · помесячные` : `Up to ${draft.threshold || "…"} days inclusive · monthly`}<input value={draft.short} maxLength={150} onChange={(event) => edit({ short: event.target.value })} aria-describedby="service-reminder-offset-help" /></label>
        </div>
        <p id="service-reminder-offset-help" className="service-reminder-hint">{ru ? "Количество дней до окончания услуги, через запятую. Считаем полный срок от начала до окончания, а не оставшиеся дни. Если начало неизвестно — короткое расписание." : "Days before the service ends, separated by commas. Classification uses its full term, not the days remaining. An unknown start uses the short schedule."}</p>
        <p className="service-reminder-hint">{ru ? "Помесячная аренда без даты окончания пока не получает эти напоминания. Дату следующей оплаты не придумываем." : "Open-ended monthly rentals do not receive these expiry reminders. A next payment date is not inferred."}</p>
        <div className="crm-save-actions"><button type="button" onClick={() => void checkPreview()}>{ru ? "Как это сработает" : "How it works"}</button><button type="button" onClick={() => edit({ ...reminderDraft(DEFAULT_REMINDER_POLICY), enabled: draft.enabled })}>{ru ? "Вернуть стандартные интервалы" : "Restore default intervals"}</button></div>
        {preview && <section className="service-reminder-preview" aria-label={ru ? "Предпросмотр расписания" : "Schedule preview"}>
          <h3>{ru ? "Как это сработает" : "How it works"}</h3>
          {!draft.enabled && <p>{ru ? "Это пример расписания. Отправка останется выключенной." : "This is a schedule example. Delivery will remain off."}</p>}
          <label>{ru ? "Пример даты окончания" : "Example end date"}<input type="date" value={exampleEnd} onChange={(event) => setExampleEnd(event.target.value)} /></label>
          {preview.examples.map((item, index) => <article key={`${item.kind}-${index}`}><strong>{exampleLabel(item, ru)}</strong><p>{item.schedule.length ? item.schedule.join(" · ") : (ru ? "Нет применимых напоминаний" : "No applicable reminders")}</p><small>{item.schedule.map((offset) => reminderDate(exampleEnd, offset)).filter(Boolean).map((date) => ru ? date!.split("-").reverse().join(".") : date).join(" · ")}</small></article>)}
        </section>}
        <label>{ru ? "Причина изменения" : "Reason for change"}<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="crm-save-actions"><button type="button" onClick={() => void save()}>{busy ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Сохранить" : "Save")}</button><button type="button" onClick={() => { apply(data); setError(""); setNotice(ru ? "Несохранённые изменения отменены." : "Unsaved changes discarded."); }}>{ru ? "Отменить изменения" : "Discard changes"}</button></div>
        {dirty && <small>{ru ? "Есть несохранённые изменения." : "There are unsaved changes."}</small>}
        <details><summary>{ru ? "История изменений" : "Change history"}</summary>{data.versions.length === 0 && <p>{ru ? "Сохранённых версий пока нет." : "No saved versions yet."}</p>}{data.versions.map((version) => <article key={version.version}><p>v{version.version} · {version.created_at} · {version.reason}</p><p>{version.policy.long_offsets.join(", ")} / {version.policy.short_offsets.join(", ")}</p><button type="button" onClick={() => { edit({ ...reminderDraft(version.policy), enabled: draft.enabled }); setNotice(ru ? "Расписание загружено в редактор. Состояние отправки не изменено. Проверьте и сохраните." : "Schedule loaded into the editor. Delivery switch is unchanged. Review and save."); }}>{ru ? "Загрузить расписание в редактор" : "Load schedule into editor"}</button></article>)}</details>
      </fieldset>
    </>}
  </section>;
}
