import { useEffect, useRef, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { AdminDialog } from "./AdminDialog";

type Locale = "ru" | "en";
export type ReferralPerson = { id: number; first_name?: string | null; last_name?: string | null; username?: string | null; name?: string; status?: string };
type Preview = {
  child_user_id: number; previous_parent_user_id: number | null; new_parent_user_id: number;
  referral_row_id: number | null; last_correction_id: number; reward_ledger_rows: number;
  existing_order_count: number; existing_points_count: number;
  child: ReferralPerson | null; previous_parent: ReferralPerson | null; new_parent: ReferralPerson | null;
  conflicts: string[]; executable: boolean;
};
type Attempt = { body: string };
type UnresolvedOperation = { attempt: Attempt; preview: Preview; reason: string };
const personLabel = (person: ReferralPerson | null) => person ? `${person.name || [person.first_name, person.last_name].filter(Boolean).join(" ") || person.username || "SAFRWAY"} · ID ${person.id}` : "—";
function canConfirm(preview: Preview): boolean {
  return preview.executable && preview.conflicts.length === 0 &&
    [preview.child_user_id, preview.previous_parent_user_id, preview.new_parent_user_id, preview.referral_row_id].every(id => Number.isSafeInteger(id) && Number(id) > 0) &&
    Number.isSafeInteger(preview.last_correction_id) && preview.last_correction_id >= 0 &&
    preview.child?.id === preview.child_user_id && preview.previous_parent?.id === preview.previous_parent_user_id && preview.new_parent?.id === preview.new_parent_user_id;
}
async function referralRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try { return await appApiClient().request<T>(path, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

function PersonPicker({ locale, label, value, disabled, onChange }: {
  locale: Locale; label: string; value: ReferralPerson | null; disabled: boolean;
  onChange: (person: ReferralPerson | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReferralPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  async function search() {
    if (!query.trim() || disabled) return;
    const request = ++generation.current;
    setLoading(true); setError(""); setResults([]);
    try {
      const page = await referralRequest<{ items: ReferralPerson[] }>(`/api/web/admin/users?q=${encodeURIComponent(query.trim())}&page_size=20`);
      if (request === generation.current) setResults(page.items);
    } catch (caught) { if (request === generation.current) setError(apiErrorMessage(caught)); }
    finally { if (request === generation.current) setLoading(false); }
  }
  return <fieldset disabled={disabled}>
    <legend>{label}</legend>
    {value ? <><p>{personLabel(value)}{value.username ? ` · @${value.username.replace(/^@/, "")}` : ""}</p><button type="button" onClick={() => { generation.current += 1; onChange(null); setResults([]); setLoading(false); }}>{locale === "ru" ? "Выбрать другого" : "Choose another"}</button></> : <>
      <label>{locale === "ru" ? "Имя, username или SAFRWAY ID" : "Name, username or SAFRWAY ID"}<input value={query} onChange={event => { generation.current += 1; setQuery(event.target.value); setResults([]); setError(""); setLoading(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /></label>
      <button type="button" disabled={loading || !query.trim()} onClick={() => void search()}>{loading ? (locale === "ru" ? "Ищем…" : "Searching…") : (locale === "ru" ? "Найти" : "Search")}</button>
      <ul>{results.map(person => <li key={person.id}><button type="button" onClick={() => { generation.current += 1; onChange(person); setResults([]); setLoading(false); }}>{personLabel(person)}{person.status !== "active" ? ` · ${person.status ?? "—"}` : ""}</button></li>)}</ul>
    </>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}

export function ReferralCorrectionDialog({ locale, csrfToken, initialChild, onClose, onChanged, unresolved, onUnresolvedChange }: {
  locale: Locale; csrfToken: string; initialChild?: ReferralPerson;
  onClose: () => void; onChanged?: () => void;
  unresolved?: UnresolvedOperation | null; onUnresolvedChange?: (operation: UnresolvedOperation | null) => void;
}) {
  const [child, setChild] = useState<ReferralPerson | null>(unresolved?.preview.child ?? initialChild ?? null);
  const [parent, setParent] = useState<ReferralPerson | null>(unresolved?.preview.new_parent ?? null);
  const [preview, setPreview] = useState<Preview | null>(unresolved?.preview ?? null);
  const [reason, setReason] = useState(unresolved?.reason ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(unresolved?.attempt ?? null);
  const [error, setError] = useState(unresolved ? (locale === "ru" ? "Есть запрос с неподтверждённым результатом. Повторите тот же запрос, чтобы выяснить результат." : "An earlier request has an unconfirmed result. Retry the same request to resolve it.") : "");
  const [saved, setSaved] = useState(false);
  const [currentParent, setCurrentParent] = useState<ReferralPerson | null>(null);
  const [currentRead, setCurrentRead] = useState<"loading" | "ready" | "error">("loading");
  const generation = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  const text = (ru: string, en: string) => locale === "ru" ? ru : en;
  function invalidate() { generation.current += 1; setPreview(null); setConfirmed(false); setError(""); }
  async function check() {
    if (!child || !parent || attempt) return;
    const request = ++generation.current;
    setBusy(true); setPreview(null); setConfirmed(false); setError("");
    try {
      const result = await referralRequest<Preview>(`/api/web/admin/referrals/correction-preview?child_user_id=${child.id}&new_parent_user_id=${parent.id}`);
      if (request !== generation.current) return;
      if (result.child_user_id !== child.id || result.new_parent_user_id !== parent.id) throw new Error("Preview identity mismatch");
      setPreview(result);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof ApiError && caught.status === 404
        ? text("Смена пригласившего пока отключена на сервере.", "Inviter changes are currently disabled on the server.") : apiErrorMessage(caught));
    } finally { if (request === generation.current) setBusy(false); }
  }
  async function apply() {
    if (submitting.current || (!attempt && (!preview || !canConfirm(preview) || !confirmed || reason.trim().length < 3))) return;
    const operation = attempt ?? { body: JSON.stringify({
      child_user_id: preview!.child_user_id, new_parent_user_id: preview!.new_parent_user_id,
      expected_parent_user_id: preview!.previous_parent_user_id,
      expected_last_correction_id: preview!.last_correction_id,
      expected_referral_row_id: preview!.referral_row_id,
      reason: reason.trim(), idempotency_key: crypto.randomUUID(),
    }) };
    submitting.current = true;
    setAttempt(operation); setBusy(true); setError("");
    onUnresolvedChange?.({ attempt: operation, preview: preview!, reason });
    try {
      await referralRequest("/api/web/admin/referrals/corrections", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: operation.body });
      if (!mounted.current) return;
      setSaved(true); setAttempt(null);
      onUnresolvedChange?.(null);
      // A replay confirms that operation, not that its parent is still current.
      try {
        const current = await referralRequest<Preview>(`/api/web/admin/referrals/correction-preview?child_user_id=${preview!.child_user_id}&new_parent_user_id=${preview!.new_parent_user_id}`);
        if (mounted.current) { setCurrentParent(current.previous_parent); setCurrentRead("ready"); }
      } catch { if (mounted.current) setCurrentRead("error"); }
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ApiError && [403, 404, 409, 422].includes(caught.status ?? 0)) {
        setAttempt(null); setPreview(null); setConfirmed(false);
        onUnresolvedChange?.(null);
        setError(caught.status === 404
          ? text("Смена пригласившего отключена на сервере.", "Inviter changes are disabled on the server.")
          : text("Проверка больше не подходит или действие недоступно. Обновите проверку; при спорном результате откройте журнал действий.", "The preview is no longer valid or the action is unavailable. Refresh the preview; consult the audit log if the result is uncertain."));
      } else {
        setError(text("Ответ сервера не получен. Результат пока неизвестен. Повторите тот же запрос кнопкой ниже; повтор не создаст вторую коррекцию.", "No server confirmation was received. The result is unknown. Retry the same request below; it will not create a second correction."));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => { if (saved) onChangedRef.current?.(); }, [saved]);
  const locked = busy || !!attempt;
  const conflictText = (code: string) => ({
    existing_orders_require_separate_policy: text("У пользователя есть заказы — нужен отдельный разбор.", "This user has orders and requires a separate review."),
    existing_points_require_separate_policy: text("У пользователя есть начисления — нужен отдельный разбор.", "This user has Points entries and requires a separate review."),
    reward_ledger_activity_exists: text("Есть реферальные начисления — нужен отдельный разбор.", "Referral rewards exist and require a separate review."),
    referral_cycle: text("Такая связь создаст цикл.", "This relationship would create a cycle."),
    self_referral: text("Нельзя назначить пользователя самому себе.", "A user cannot be their own inviter."),
    inviter_inactive: text("Новый пригласивший неактивен.", "The new inviter is inactive."),
    already_current: text("Пользователь уже закреплён за этим пригласившим.", "The user already has this inviter."),
    root_transfer_forbidden: text("Главного администратора переносить нельзя.", "The root administrator cannot be reassigned."),
    ancestor_unattributed: text("У пригласившего ещё не закреплена собственная связь. Сначала проверьте её.", "The inviter has no confirmed parent yet. Review that relationship first."),
  }[code] ?? text("Связи требуют проверки в журнале администратора.", "The relationships require review in the admin audit log."));
  return <AdminDialog labelledBy="referral-correction-title" onClose={onClose} closeDisabled={busy} className="admin-referral-correction-dialog">
    <header><h2 id="referral-correction-title">{text("Сменить пригласившего", "Change inviter")}</h2></header>
    {saved ? <div role="status"><p>{text("Коррекция подтверждена и записана в журнал.", "The correction is confirmed and recorded in the audit log.")}</p><p>{currentRead === "ready" ? `${text("Текущий пригласивший", "Current inviter")}: ${personLabel(currentParent)}` : currentRead === "loading" ? text("Обновляем текущую связь…", "Refreshing the current relationship…") : text("Текущую связь загрузить не удалось. Проверьте журнал или откройте карточку заново.", "The current relationship could not be loaded. Check the audit log or reopen the profile.")}</p></div> : <>
      <p>{text("Выберите пользователя и нового пригласившего, проверьте имена и подтвердите перенос.", "Select the user and new inviter, check their names, and confirm the change.")}</p>
      <PersonPicker locale={locale} label={text("Пользователь", "User")} value={child} disabled={locked} onChange={value => { invalidate(); setChild(value); }} />
      <PersonPicker locale={locale} label={text("Новый пригласивший", "New inviter")} value={parent} disabled={locked} onChange={value => { invalidate(); setParent(value); }} />
      <button type="button" disabled={locked || !child || !parent} onClick={() => void check()}>{text("Проверить перенос", "Preview change")}</button>
      {preview && <section aria-label={text("Подтверждение переноса", "Confirm inviter change")}>
        <dl><div><dt>{text("Пользователь", "User")}</dt><dd>{personLabel(preview.child)}</dd></div><div><dt>{text("Было", "Before")}</dt><dd>{personLabel(preview.previous_parent)}</dd></div><div><dt>{text("Станет", "After")}</dt><dd>{personLabel(preview.new_parent)}</dd></div></dl>
        {!canConfirm(preview) ? <ul role="alert">{(preview.conflicts.length ? preview.conflicts : ["invalid_preview"]).map(code => <li key={code}>{conflictText(code)}</li>)}</ul> : <>
          <label>{text("Причина исправления", "Reason for correction")}<textarea minLength={3} maxLength={2000} disabled={locked} value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} /></label>
          <label><input type="checkbox" disabled={locked} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{text("Проверил пользователя и нового пригласившего", "I checked the user and new inviter")}</label>
          <button type="button" className="danger" disabled={busy || (!attempt && (!confirmed || reason.trim().length < 3))} onClick={() => void apply()}>{busy ? text("Сохраняем…", "Saving…") : attempt ? text("Повторить тот же запрос", "Retry the same request") : text("Подтвердить перенос", "Confirm change")}</button>
        </>}
      </section>}
      {error && <p role="alert">{error}</p>}
    </>}
    <button type="button" disabled={busy} onClick={onClose}>{text("Закрыть", "Close")}</button>
  </AdminDialog>;
}

export function AdminReferralCorrection(props: { locale: Locale; csrfToken: string; initialChild?: ReferralPerson; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [unresolved, setUnresolved] = useState<UnresolvedOperation | null>(null);
  return <><button type="button" onClick={() => setOpen(true)}>{unresolved ? (props.locale === "ru" ? "Проверить результат переноса" : "Resolve inviter change") : (props.locale === "ru" ? "Сменить пригласившего" : "Change inviter")}</button>{open && <ReferralCorrectionDialog {...props} unresolved={unresolved} onUnresolvedChange={setUnresolved} onClose={() => setOpen(false)} />}</>;
}
