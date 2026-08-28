import { useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";
import { AdminDialog } from "./AdminDialog";

type Locale = "ru" | "en";
type StaffRole = "visa_manager" | "general_manager";
type StaffGrant = {
  grant_id: number;
  user_id: number;
  name: string;
  role_code: StaffRole;
  active: boolean;
  granted_at: string;
  revoked_at?: string | null;
};

const roleLabels: Record<StaffRole, { ru: string; en: string }> = {
  visa_manager: { ru: "Визовый менеджер", en: "Visa manager" },
  general_manager: { ru: "Менеджер", en: "General manager" },
};

function headers(csrfToken: string) {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };
}

export function AdminManagers({ csrfToken, locale }: { csrfToken: string; locale: Locale }) {
  const [items, setItems] = useState<StaffGrant[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<StaffRole>("visa_manager");
  const [reason, setReason] = useState("");
  const [grantConfirm, setGrantConfirm] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<StaffGrant | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const ui = (ru: string, en: string) => locale === "ru" ? ru : en;

  const active = useMemo(() => items.filter((item) => item.active), [items]);
  const revoked = useMemo(() => items.filter((item) => !item.active), [items]);

  async function load() {
    setState("loading"); setError("");
    try {
      const result = await appApiClient().request<{ items: StaffGrant[] }>("/api/web/admin/visa-cases/staff?include_revoked=true");
      setItems(result.items); setState("ready");
    } catch (caught) {
      setError(apiErrorMessage(caught)); setState("error");
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (feedback) outcomeRef.current?.focus(); }, [feedback]);

  function returnFocus() {
    const target = returnFocusRef.current;
    window.requestAnimationFrame(() => target?.isConnected && target.focus());
  }

  async function grant() {
    const parsed = Number(userId);
    if (!Number.isInteger(parsed) || parsed <= 0 || reason.trim().length < 3 || submitting) return;
    setSubmitting(true); setError(""); setFeedback("");
    try {
      const created = await appApiClient().request<StaffGrant>("/api/web/admin/visa-cases/staff/grants", {
        method: "POST", headers: headers(csrfToken),
        body: JSON.stringify({ user_id: parsed, role_code: role, reason: reason.trim(), idempotency_key: crypto.randomUUID() }),
      });
      setItems((current) => [created, ...current.filter((item) => item.grant_id !== created.grant_id)]);
      setGrantConfirm(false); setUserId(""); setReason("");
      setFeedback(ui(`${created.name}: роль «${roleLabels[created.role_code][locale]}» выдана и уже действует.`, `${created.name}: ${roleLabels[created.role_code][locale]} access is granted and active now.`));
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  async function revoke() {
    if (!revokeTarget || revokeReason.trim().length < 3 || submitting) return;
    setSubmitting(true); setError(""); setFeedback("");
    try {
      const updated = await appApiClient().request<StaffGrant>(`/api/web/admin/visa-cases/staff/grants/${revokeTarget.grant_id}/revoke`, {
        method: "POST", headers: headers(csrfToken),
        body: JSON.stringify({ reason: revokeReason.trim(), idempotency_key: crypto.randomUUID() }),
      });
      setItems((current) => current.map((item) => item.grant_id === updated.grant_id ? updated : item));
      setRevokeTarget(null); setRevokeReason("");
      setFeedback(ui(`${updated.name}: роль отозвана. Доступ прекращён немедленно.`, `${updated.name}: the role was revoked and access ended immediately.`));
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  const grantCards = (records: StaffGrant[], isActive: boolean) => records.length ? <div className="admin-manager-grid">
    {records.map((item) => <article className="admin-manager-card" key={item.grant_id}>
      <div><span className="eyebrow">SAFRWAY ID {item.user_id}</span><h3>{item.name}</h3></div>
      <dl><div><dt>{ui("Роль", "Role")}</dt><dd>{roleLabels[item.role_code][locale]}</dd></div><div><dt>{ui("Состояние", "Status")}</dt><dd>{isActive ? ui("Доступ активен", "Access active") : ui("Доступ отозван", "Access revoked")}</dd></div></dl>
      {isActive ? <button type="button" className="danger" disabled={submitting} onClick={(event) => { returnFocusRef.current = event.currentTarget; setRevokeReason(""); setRevokeTarget(item); }}>{ui("Отозвать роль", "Revoke role")}</button> : <small>{item.revoked_at ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.revoked_at)) : ui("История сохранена", "History retained")}</small>}
    </article>)}
  </div> : <div className="admin-empty">{isActive ? ui("Активных менеджеров пока нет.", "No active managers yet.") : ui("Отозванных ролей нет.", "No revoked roles.")}</div>;

  return <section className="admin-panel admin-managers" aria-labelledby="admin-managers-title">
    <div className="admin-panel-head"><div><h2 id="admin-managers-title">{ui("Менеджеры", "Managers")}</h2><p>{ui("Root-admin управляет ролями; каждое действие подтверждается и записывается в аудит.", "Root admin manages roles; every action is confirmed and audited.")}</p></div><span>{active.length} {ui("активных", "active")}</span></div>
    {error && <div className="admin-alert" role="alert">{error}<button type="button" onClick={() => setError("")}>{ui("Закрыть", "Close")}</button></div>}
    {feedback && <div ref={outcomeRef} className="admin-outcome" role="status" tabIndex={-1}>{feedback}</div>}
    <form className="admin-manager-grant" onSubmit={(event) => { event.preventDefault(); returnFocusRef.current = event.currentTarget.querySelector("button[type=submit]"); setGrantConfirm(true); }}>
      <label>{ui("SAFRWAY ID сотрудника", "Staff SAFRWAY ID")}<input inputMode="numeric" min="1" type="number" value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
      <label>{ui("Роль", "Role")}<select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}><option value="visa_manager">{roleLabels.visa_manager[locale]}</option><option value="general_manager">{roleLabels.general_manager[locale]}</option></select></label>
      <label>{ui("Причина выдачи доступа", "Reason for access")}<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="button primary" disabled={!Number(userId) || reason.trim().length < 3 || submitting}>{ui("Проверить выдачу роли", "Review role grant")}</button>
    </form>
    {state === "loading" ? <div className="admin-empty" role="status">{ui("Загружаем менеджеров…", "Loading managers…")}</div> : state === "error" ? <div className="admin-empty"><button type="button" onClick={() => void load()}>{ui("Повторить", "Retry")}</button></div> : <><section><h3>{ui("Активные", "Active")}</h3>{grantCards(active, true)}</section><details className="admin-manager-revoked"><summary>{ui("Отозванные роли", "Revoked roles")} ({revoked.length})</summary>{grantCards(revoked, false)}</details></>}
    {grantConfirm && <AdminDialog labelledBy="manager-grant-title" onClose={() => { if (!submitting) { setGrantConfirm(false); returnFocus(); } }} closeDisabled={submitting}>
      <h2 id="manager-grant-title">{ui("Выдать роль менеджера?", "Grant manager role?")}</h2><p>{ui("После подтверждения сотрудник сразу получит доступ в рамках выбранной роли. Действие попадёт в неизменяемый аудит.", "After confirmation, the staff member immediately receives access within this role. The action is recorded in the immutable audit.")}</p><dl><div><dt>SAFRWAY ID</dt><dd>{userId}</dd></div><div><dt>{ui("Роль", "Role")}</dt><dd>{roleLabels[role][locale]}</dd></div></dl><div className="admin-dialog-actions"><button type="button" disabled={submitting} onClick={() => { setGrantConfirm(false); returnFocus(); }}>{ui("Отмена", "Cancel")}</button><button type="button" className="button primary" disabled={submitting} onClick={() => void grant()}>{submitting ? ui("Выдаём…", "Granting…") : ui("Выдать роль", "Grant role")}</button></div>
    </AdminDialog>}
    {revokeTarget && <AdminDialog labelledBy="manager-revoke-title" onClose={() => { if (!submitting) { setRevokeTarget(null); returnFocus(); } }} closeDisabled={submitting}>
      <h2 id="manager-revoke-title">{ui("Отозвать роль?", "Revoke role?")}</h2><p>{ui(`${revokeTarget.name} немедленно потеряет доступ этой роли. Назначения и история сохранятся для аудита.`, `${revokeTarget.name} immediately loses this role's access. Assignments and history remain for audit.`)}</p><label>{ui("Причина отзыва", "Revocation reason")}<textarea autoFocus value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} /></label><div className="admin-dialog-actions"><button type="button" disabled={submitting} onClick={() => { setRevokeTarget(null); returnFocus(); }}>{ui("Отмена", "Cancel")}</button><button type="button" className="danger" disabled={submitting || revokeReason.trim().length < 3} onClick={() => void revoke()}>{submitting ? ui("Отзываем…", "Revoking…") : ui("Отозвать роль", "Revoke role")}</button></div>
    </AdminDialog>}
  </section>;
}
