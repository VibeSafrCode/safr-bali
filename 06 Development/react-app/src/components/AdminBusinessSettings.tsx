import { useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";

type Locale = "ru" | "en";
type ExchangeRoute = {
  route_code: string;
  version: number;
  settings: Record<string, unknown>;
};
type ExchangeVersion = ExchangeRoute & { id: number; is_active: boolean; effective_from?: string; created_at?: string };

const LABELS: Record<string, { ru: string; en: string }> = {
  route_enabled: { ru: "Маршрут доступен", en: "Route available" },
  safrway_fee_percent: { ru: "Комиссия SAFRWAY, %", en: "SAFRWAY fee, %" },
  safrway_min_fee: { ru: "Минимальная комиссия SAFRWAY", en: "SAFRWAY minimum fee" },
  safrway_min_fee_currency: { ru: "Валюта минимальной комиссии", en: "Minimum fee currency" },
  partner_fee_percent: { ru: "Комиссия партнёра, %", en: "Partner fee, %" },
  partner_min_fee: { ru: "Минимальная комиссия партнёра", en: "Partner minimum fee" },
  partner_min_fee_currency: { ru: "Валюта комиссии партнёра", en: "Partner fee currency" },
  technical_fee_percent: { ru: "Техническая комиссия, %", en: "Technical fee, %" },
  quote_ttl_seconds: { ru: "Срок действия расчёта, секунд", en: "Quote lifetime, seconds" },
  rounding_step: { ru: "Шаг округления", en: "Rounding step" },
  manual_confirmation_required: { ru: "Требовать ручное подтверждение", en: "Require manual confirmation" },
  client_surplus_share: { ru: "Доля улучшения курса клиенту", en: "Client rate-improvement share" },
  whitebird_better_rate_threshold: { ru: "Порог улучшенного курса WHITEBIRD", en: "WHITEBIRD better-rate threshold" },
};

function labelFor(key: string, locale: Locale) {
  return LABELS[key]?.[locale] ?? key.replaceAll("_", " ");
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function ExchangeSettingsEditor({
  route,
  csrfToken,
  locale,
  onChanged,
}: {
  route: ExchangeRoute;
  csrfToken: string;
  locale: Locale;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ExchangeVersion[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);

  const changes = useMemo(() => Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => value !== stringValue(route.settings[key])),
  ), [draft, route.settings]);
  const payloadChanges = useMemo(() => Object.fromEntries(
    Object.entries(changes).map(([key, value]) => {
      const original = route.settings[key];
      if (typeof original === "number") return [key, Number(value)];
      if (typeof original === "boolean") return [key, value === "true"];
      return [key, value];
    }),
  ), [changes, route.settings]);

  async function openEditor() {
    setDraft(Object.fromEntries(Object.entries(route.settings).map(([key, value]) => [key, stringValue(value)])));
    setComment(""); setPreview(false); setError(""); setOpen(true);
    try {
      const result = await appApiClient().request<{ versions: ExchangeVersion[] }>(`/api/web/admin/settings/exchange/${encodeURIComponent(route.route_code)}/versions`);
      setHistory(result.versions);
    } catch (caught) { setError(apiErrorMessage(caught)); }
  }

  function closeEditor() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit() {
    if (!comment.trim() || Object.keys(changes).length === 0) return;
    setSubmitting(true); setError("");
    try {
      await appApiClient().request(`/api/web/admin/settings/exchange/${encodeURIComponent(route.route_code)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ expected_active_version: route.version, settings: payloadChanges, comment: comment.trim() }),
      });
      await onChanged(); closeEditor();
    } catch (caught) { setError(apiErrorMessage(caught)); setPreview(false); }
    finally { setSubmitting(false); }
  }

  async function restore(version: number) {
    if (!comment.trim()) { setError(locale === "ru" ? "Укажите причину восстановления." : "Add a restoration reason."); return; }
    setSubmitting(true); setError("");
    try {
      await appApiClient().request(`/api/web/admin/settings/exchange/${encodeURIComponent(route.route_code)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ expected_active_version: route.version, restore_version: version, comment: comment.trim() }),
      });
      await onChanged(); closeEditor();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) { closeEditor(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex='-1'])") ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open, submitting]);

  return <>
    <button ref={triggerRef} type="button" onClick={() => void openEditor()}>{locale === "ru" ? "Изменить с предпросмотром" : "Edit with preview"}</button>
    {open && <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby="exchange-settings-title">
      <form ref={dialogRef} className="admin-exchange-editor" onSubmit={(event) => { event.preventDefault(); preview ? void submit() : setPreview(true); }}>
        <div className="crm-editor-title"><div><span className="eyebrow">{route.route_code} · v{route.version}</span><h2 id="exchange-settings-title" ref={titleRef} tabIndex={-1}>{locale === "ru" ? "Настройки маршрута" : "Route settings"}</h2></div><button type="button" disabled={submitting} onClick={closeEditor} aria-label={locale === "ru" ? "Закрыть" : "Close"}>×</button></div>
        <p>{locale === "ru" ? "Каждое изменение создаёт новую неизменяемую версию. Расчёты, сделанные раньше, сохраняют свой снимок." : "Each change creates a new immutable version. Existing quote snapshots remain unchanged."}</p>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        {!preview ? <div className="admin-setting-fields">
          {Object.entries(route.settings).sort(([a], [b]) => a.localeCompare(b)).map(([key, original]) => typeof original === "boolean" ? <label className="crm-toggle-row" key={key}><span><strong>{labelFor(key, locale)}</strong><small>{key}</small></span><input type="checkbox" checked={draft[key] === "true"} onChange={(event) => setDraft({ ...draft, [key]: String(event.target.checked) })} /></label> : <label key={key}><span>{labelFor(key, locale)} <small>{key}</small></span><input type={typeof original === "number" ? "number" : "text"} value={draft[key] ?? ""} inputMode={/percent|fee|ttl|step|limit|threshold|share/.test(key) ? "decimal" : "text"} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        </div> : <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Проверьте изменения" : "Review changes"}</h3>{Object.keys(changes).length === 0 ? <p>{locale === "ru" ? "Изменений нет." : "No changes."}</p> : <dl>{Object.entries(changes).map(([key, next]) => <div key={key}><dt>{labelFor(key, locale)}</dt><dd><del>{stringValue(route.settings[key])}</del> → <strong>{next}</strong></dd></div>)}</dl>}<p>{locale === "ru" ? `После подтверждения станет активна версия ${route.version + 1}.` : `Version ${route.version + 1} becomes active after confirmation.`}</p></section>}
        <label>{locale === "ru" ? "Причина изменения" : "Change reason"}<textarea value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} /></label>
        {history.length > 1 && <details className="crm-advanced"><summary>{locale === "ru" ? "История и восстановление" : "History and restore"}</summary><div className="admin-version-history">{history.filter((item) => !item.is_active).map((item) => <button type="button" key={item.version} disabled={submitting} onClick={() => void restore(item.version)}>{locale === "ru" ? `Восстановить v${item.version} как новую версию` : `Restore v${item.version} as a new version`}</button>)}</div></details>}
        <div className="crm-save-actions"><button type="button" disabled={submitting || !preview} onClick={() => setPreview(false)}>{locale === "ru" ? "Назад" : "Back"}</button><button type="submit" disabled={submitting || !comment.trim() || Object.keys(changes).length === 0}>{submitting ? (locale === "ru" ? "Сохраняем…" : "Saving…") : preview ? (locale === "ru" ? "Создать новую версию" : "Create new version") : (locale === "ru" ? "Предпросмотр" : "Preview")}</button></div>
      </form>
    </div>}
  </>;
}

type BusinessEntity = {
  code?: string; slug?: string; name: string; settings_version: number;
  active?: boolean; rules_verified?: boolean; description?: string; category?: string;
  is_active?: boolean; can_pay_with_points?: boolean;
};
type BusinessVersion = { version: number; is_active: boolean; payload: Record<string, unknown>; effective_from: string; reason: string };

const BUSINESS_FIELDS = {
  visa: ["name", "active", "rules_verified"],
  service: ["name", "description", "category", "is_active", "can_pay_with_points"],
} as const;
const BUSINESS_LABELS: Record<string, { ru: string; en: string }> = {
  name: { ru: "Название", en: "Name" }, active: { ru: "Доступна для новых кейсов", en: "Available for new cases" },
  rules_verified: { ru: "Правила проверены", en: "Rules verified" }, description: { ru: "Описание", en: "Description" },
  category: { ru: "Категория", en: "Category" }, is_active: { ru: "Услуга доступна", en: "Service available" },
  can_pay_with_points: { ru: "Можно оплатить Points", en: "Points payment allowed" },
};

export function BusinessSettingsEditor({ entityType, entity, csrfToken, locale, onChanged }: {
  entityType: "visa" | "service"; entity: BusinessEntity; csrfToken: string; locale: Locale; onChanged: () => Promise<void> | void;
}) {
  const key = entityType === "visa" ? entity.code! : entity.slug!;
  const [open, setOpen] = useState(false); const [preview, setPreview] = useState(false); const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({}); const [reason, setReason] = useState(""); const [effective, setEffective] = useState("");
  const [versions, setVersions] = useState<BusinessVersion[]>([]); const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null); const title = useRef<HTMLHeadingElement>(null);
  const fields = BUSINESS_FIELDS[entityType];
  const original = useMemo(() => Object.fromEntries(fields.map((field) => [field, stringValue(entity[field as keyof BusinessEntity])])), [entity, fields]);
  const changes = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([field, value]) => value !== original[field])), [draft, original]);
  const payload = useMemo(() => Object.fromEntries(Object.entries(changes).map(([field, value]) => [field, ["active", "rules_verified", "is_active", "can_pay_with_points"].includes(field) ? value === "true" : value || null])), [changes]);

  async function openEditor() {
    setDraft(original); setReason(""); setEffective(new Date().toISOString().slice(0, 10)); setPreview(false); setError(""); setOpen(true);
    try { const result = await appApiClient().request<{ versions: BusinessVersion[] }>(`/api/web/admin/settings/business/${entityType}/${encodeURIComponent(key)}/versions`); setVersions(result.versions); }
    catch (caught) { setError(apiErrorMessage(caught)); }
  }
  function close() { setOpen(false); window.requestAnimationFrame(() => trigger.current?.focus()); }
  async function save() {
    setSubmitting(true); setError("");
    try {
      await appApiClient().request(`/api/web/admin/settings/business/${entityType}/${encodeURIComponent(key)}/versions`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ expected_active_version: entity.settings_version, fields: payload, effective_from: `${effective}T00:00:00Z`, reason: reason.trim() }) });
      await onChanged(); close();
    } catch (caught) { setError(apiErrorMessage(caught)); setPreview(false); }
    finally { setSubmitting(false); }
  }
  async function restore(version: number) {
    if (!reason.trim()) { setError(locale === "ru" ? "Укажите причину восстановления." : "Add a restoration reason."); return; }
    setSubmitting(true); setError("");
    try { await appApiClient().request(`/api/web/admin/settings/business/${entityType}/${encodeURIComponent(key)}/restore`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ expected_active_version: entity.settings_version, restore_version: version, reason: reason.trim() }) }); await onChanged(); close(); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }
  useEffect(() => { if (open) title.current?.focus(); }, [open]);
  return <>
    <button ref={trigger} type="button" onClick={() => void openEditor()}>{locale === "ru" ? "Изменить" : "Edit"}</button>
    {open && <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby={`business-${entityType}-title`}><form className="admin-exchange-editor" onSubmit={(event) => { event.preventDefault(); preview ? void save() : setPreview(true); }}>
      <div className="crm-editor-title"><div><span className="eyebrow">{key} · settings v{entity.settings_version || 0}</span><h2 id={`business-${entityType}-title`} ref={title} tabIndex={-1}>{locale === "ru" ? "Настройки бизнеса" : "Business settings"}</h2></div><button type="button" disabled={submitting} onClick={close} aria-label={locale === "ru" ? "Закрыть" : "Close"}>×</button></div>
      <p>{locale === "ru" ? "Изменяются только реальные поля backend. Цены и правила, которых нет в канонической модели, здесь не выдумываются." : "Only real backend fields are editable. Prices or rules absent from the canonical model are not invented here."}</p>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {!preview ? <div className="admin-setting-fields">{fields.map((field) => ["active", "rules_verified", "is_active", "can_pay_with_points"].includes(field) ? <label className="crm-toggle-row" key={field}><span><strong>{BUSINESS_LABELS[field][locale]}</strong></span><input type="checkbox" checked={draft[field] === "true"} onChange={(event) => setDraft({ ...draft, [field]: String(event.target.checked) })} /></label> : <label key={field}><span>{BUSINESS_LABELS[field][locale]}</span>{field === "description" ? <textarea value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /> : <input required={field === "name"} value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />}</label>)}</div> : <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Проверьте изменения" : "Review changes"}</h3><dl>{Object.entries(changes).map(([field, next]) => <div key={field}><dt>{BUSINESS_LABELS[field][locale]}</dt><dd><del>{original[field] || "—"}</del> → <strong>{next || "—"}</strong></dd></div>)}</dl></section>}
      <label>{locale === "ru" ? "Дата начала действия" : "Effective date"}<input type="date" required max={new Date().toISOString().slice(0, 10)} value={effective} onChange={(event) => setEffective(event.target.value)} /></label>
      <label>{locale === "ru" ? "Причина изменения" : "Change reason"}<textarea required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {versions.length > 1 && <details className="crm-advanced"><summary>{locale === "ru" ? "История и восстановление" : "History and restore"}</summary><div className="admin-version-history">{versions.filter((item) => !item.is_active).map((item) => <button type="button" key={item.version} disabled={submitting} onClick={() => void restore(item.version)}>{locale === "ru" ? `Восстановить v${item.version} как новую версию` : `Restore v${item.version} as a new version`}</button>)}</div></details>}
      <div className="crm-save-actions"><button type="button" disabled={submitting || !preview} onClick={() => setPreview(false)}>{locale === "ru" ? "Назад" : "Back"}</button><button type="submit" disabled={submitting || !reason.trim() || !effective || Object.keys(changes).length === 0}>{submitting ? (locale === "ru" ? "Сохраняем…" : "Saving…") : preview ? (locale === "ru" ? "Создать версию" : "Create version") : (locale === "ru" ? "Предпросмотр" : "Preview")}</button></div>
    </form></div>}
  </>;
}
