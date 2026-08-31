import { useEffect, useMemo, useState } from "react";

import { apiErrorMessage, appApiClient } from "../api/client";

type Locale = "ru" | "en";
type PriceItem = {
  sku: string;
  entity_type: "VISA" | "SERVICE";
  entity_key: string;
  option_code: string;
  label_ru: string;
  label_en: string;
  price_qualifier: "EXACT" | "FROM" | "VARIABLE" | "CONTACT";
  amount_idr: number | null;
  show_price: boolean;
  fee_verification_status: "VERIFIED" | "NEEDS_VERIFICATION";
  fee_note_ru?: string | null;
  fee_note_en?: string | null;
  sort_order: number;
};
type Overview = {
  active: null | { publication_version: number; catalog_version: number; fx_version: number; projection_id: string };
  active_fx: null | { version: number; ask_idr_per_usdt: string; acceptance_method: string; observed_at: string; stale_until: string; is_manual_override: boolean; override_expires_at?: string | null };
  items: PriceItem[];
  catalog_history: Array<{ version: number; reason: string; effective_from: string }>;
  fx_history: Array<{ version: number; ask_idr_per_usdt: string; acceptance_method: string; observed_at: string; stale_until: string; is_manual_override: boolean }>;
};
type Preview = { fx_version: number; fx_ask_idr_per_usdt: string; formula_code: string; items: Array<PriceItem & { amount_idr: string | null; display_usdt: string | null }> };

function operationKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function AdminPricingCatalog({ csrfToken, locale }: { csrfToken: string; locale: Locale }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<PriceItem[]>([]);
  const [units, setUnits] = useState<Record<string, "IDR" | "USDT">>({});
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [overrideAsk, setOverrideAsk] = useState("");
  const [overrideBid, setOverrideBid] = useState("");
  const [overrideMinutes, setOverrideMinutes] = useState("60");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = Number(overview?.active_fx?.ask_idr_per_usdt ?? 0);
  const publicationVersion = overview?.active?.publication_version ?? 0;

  async function load() {
    setError("");
    try {
      const result = await appApiClient().request<Overview>("/api/web/admin/pricing");
      setOverview(result); setDraft(result.items);
      setUnits(Object.fromEntries(result.items.map((item) => [item.sku, "IDR"])));
      setAmountInputs(Object.fromEntries(result.items.map((item) => [item.sku, item.amount_idr === null ? "" : String(item.amount_idr)])));
    } catch (caught) { setError(apiErrorMessage(caught)); }
  }
  useEffect(() => { void load(); }, []);

  function update(index: number, change: Partial<PriceItem>) {
    setPreview(null);
    setDraft((current) => current.map((item, itemIndex) => {
      if (index !== itemIndex) return item;
      const next = { ...item, ...change };
      if (["VARIABLE", "CONTACT"].includes(next.price_qualifier)) { next.amount_idr = null; next.show_price = false; }
      if (next.fee_verification_status === "NEEDS_VERIFICATION") next.show_price = false;
      return next;
    }));
  }

  function requestItems() {
    return draft.map((item) => {
      const unit = units[item.sku] ?? "IDR";
      const priced = ["EXACT", "FROM"].includes(item.price_qualifier);
      const result: Record<string, unknown> = { ...item };
      delete result.amount_idr;
      const rawAmount = amountInputs[item.sku]?.trim();
      if (priced && rawAmount) {
        if (unit === "USDT") result.amount_usdt = rawAmount;
        else result.amount_idr = Math.round(Number(rawAmount));
      }
      return result;
    });
  }

  async function createPreview() {
    setBusy(true); setError("");
    try { setPreview(await appApiClient().request<Preview>("/api/web/admin/pricing/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: requestItems() }) })); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!reason.trim()) return;
    setBusy(true); setError("");
    try {
      await appApiClient().request("/api/web/admin/pricing/publish", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": operationKey("catalog") }, body: JSON.stringify({ items: requestItems(), expected_publication_version: publicationVersion, effective_from: new Date().toISOString(), reason: reason.trim() }) });
      setReason(""); setPreview(null); await load();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }
  async function restore(version: number) {
    if (!reason.trim()) { setError(locale === "ru" ? "Укажите причину восстановления." : "Add a restoration reason."); return; }
    setBusy(true); setError("");
    try {
      await appApiClient().request("/api/web/admin/pricing/restore", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": operationKey("catalog-restore") }, body: JSON.stringify({ restore_catalog_version: version, expected_publication_version: publicationVersion, reason: reason.trim() }) });
      setReason(""); setPreview(null); await load();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }
  async function refreshFx() {
    setBusy(true); setError("");
    try { await appApiClient().request("/api/web/admin/pricing/fx/refresh", { method: "POST", headers: { "X-CSRF-Token": csrfToken } }); await load(); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function createOverride() {
    const duration = Number(overrideMinutes);
    if (!reason.trim() || !overrideAsk || !overrideBid || !Number.isFinite(duration)) return;
    setBusy(true); setError("");
    try {
      await appApiClient().request("/api/web/admin/pricing/fx/override", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": operationKey("fx-override") },
        body: JSON.stringify({
          ask_idr_per_usdt: overrideAsk,
          bid_idr_per_usdt: overrideBid,
          expires_at: new Date(Date.now() + duration * 60_000).toISOString(),
          expected_publication_version: publicationVersion,
          reason: reason.trim(),
        }),
      });
      setOverrideAsk(""); setOverrideBid(""); setReason(""); await load();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  function changeUnit(item: PriceItem, nextUnit: "IDR" | "USDT") {
    const currentUnit = units[item.sku] ?? "IDR";
    const raw = Number(amountInputs[item.sku] ?? 0);
    if (currentUnit !== nextUnit && raw > 0 && ask > 0) {
      const converted = nextUnit === "USDT"
        ? (raw / ask).toFixed(2)
        : String(Math.ceil((raw * ask) / 1000) * 1000);
      setAmountInputs((current) => ({ ...current, [item.sku]: converted }));
    }
    setUnits((current) => ({ ...current, [item.sku]: nextUnit }));
    setPreview(null);
  }

  const changed = useMemo(() => {
    if (!overview) return false;
    const baselineAmounts = Object.fromEntries(overview.items.map((item) => [item.sku, item.amount_idr === null ? "" : String(item.amount_idr)]));
    return JSON.stringify(draft) !== JSON.stringify(overview.items) || JSON.stringify(amountInputs) !== JSON.stringify(baselineAmounts) || Object.values(units).some((unit) => unit !== "IDR");
  }, [amountInputs, draft, overview, units]);
  if (!overview) return <div className="admin-empty">{error || (locale === "ru" ? "Загружаем каталог цен…" : "Loading price catalog…")}</div>;

  return <section className="admin-panel admin-pricing-catalog">
    <div className="admin-panel-head"><div><span className="eyebrow">{overview.active?.projection_id ?? "No publication"}</span><h2>{locale === "ru" ? "Единые цены и курс" : "Canonical prices and FX"}</h2></div><button type="button" disabled={busy} onClick={() => void refreshFx()}>{locale === "ru" ? "Обновить FX" : "Refresh FX"}</button></div>
    <p>{locale === "ru" ? `IDR — основная цена. Производный USDT использует FX v${overview.active_fx?.version ?? "—"}; ${overview.active_fx?.acceptance_method ?? "курс пока недоступен"}.` : `IDR is canonical. Derived USDT uses FX v${overview.active_fx?.version ?? "—"}; ${overview.active_fx?.acceptance_method ?? "rate unavailable"}.`}</p>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    <div className="admin-pricing-list">{draft.map((item, index) => {
      const unit = units[item.sku] ?? "IDR"; const priced = ["EXACT", "FROM"].includes(item.price_qualifier);
      return <fieldset key={item.sku} className="admin-entity-card"><legend>{item.entity_type} · {item.entity_key} · {item.option_code}</legend>
        <label>{locale === "ru" ? "Название RU" : "RU label"}<input value={item.label_ru} onChange={(event) => update(index, { label_ru: event.target.value })} /></label>
        <label>{locale === "ru" ? "Название EN" : "EN label"}<input value={item.label_en} onChange={(event) => update(index, { label_en: event.target.value })} /></label>
        <label>{locale === "ru" ? "Тип цены" : "Price type"}<select value={item.price_qualifier} onChange={(event) => update(index, { price_qualifier: event.target.value as PriceItem["price_qualifier"] })}><option value="EXACT">EXACT</option><option value="FROM">FROM</option><option value="VARIABLE">VARIABLE</option><option value="CONTACT">CONTACT</option></select></label>
        {priced && <div className="admin-pricing-amount"><label>{locale === "ru" ? "Сумма" : "Amount"}<input type="number" min="1" step={unit === "IDR" ? "1000" : "0.01"} value={amountInputs[item.sku] ?? ""} onChange={(event) => { setAmountInputs((current) => ({ ...current, [item.sku]: event.target.value })); setPreview(null); }} /></label><label>{locale === "ru" ? "Ввод" : "Input"}<select value={unit} onChange={(event) => changeUnit(item, event.target.value as "IDR" | "USDT")}><option>IDR</option><option>USDT</option></select></label></div>}
        <label className="crm-toggle-row"><span>{locale === "ru" ? "Показывать цену" : "Show price"}</span><input type="checkbox" checked={item.show_price} disabled={!priced || item.fee_verification_status !== "VERIFIED"} onChange={(event) => update(index, { show_price: event.target.checked })} /></label>
        <label>{locale === "ru" ? "Проверка состава цены" : "Fee verification"}<select value={item.fee_verification_status} onChange={(event) => update(index, { fee_verification_status: event.target.value as PriceItem["fee_verification_status"] })}><option value="VERIFIED">VERIFIED</option><option value="NEEDS_VERIFICATION">NEEDS_VERIFICATION</option></select></label>
      </fieldset>;
    })}</div>
    {preview && <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Предпросмотр публикации" : "Publication preview"}</h3><p>FX v{preview.fx_version} · {preview.fx_ask_idr_per_usdt} IDR/USDT · {preview.formula_code}</p><ul>{preview.items.filter((item) => item.show_price).map((item) => <li key={item.sku}>{item.entity_key} · {item.label_ru}: {item.amount_idr} IDR{item.display_usdt ? ` · ≈ ${item.display_usdt} USDT` : ""}</li>)}</ul></section>}
    <label>{locale === "ru" ? "Причина изменения или восстановления" : "Change or restore reason"}<textarea value={reason} minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label>
    <div className="crm-save-actions"><button type="button" disabled={busy || !changed} onClick={() => void createPreview()}>{locale === "ru" ? "Предпросмотр" : "Preview"}</button><button type="button" disabled={busy || !preview || !reason.trim()} onClick={() => void publish()}>{locale === "ru" ? "Опубликовать новую версию" : "Publish new version"}</button></div>
    {overview.catalog_history.length > 1 && <details className="crm-advanced"><summary>{locale === "ru" ? "История и восстановление" : "History and restore"}</summary><div className="admin-version-history">{overview.catalog_history.filter((item) => item.version !== overview.active?.catalog_version).map((item) => <button type="button" key={item.version} disabled={busy} onClick={() => void restore(item.version)}>{locale === "ru" ? `Восстановить каталог v${item.version} как новую версию` : `Restore catalog v${item.version} as a new version`}</button>)}</div></details>}
    <details className="crm-advanced admin-fx-override"><summary>{locale === "ru" ? "Аварийный ручной курс" : "Emergency manual FX"}</summary><p>{locale === "ru" ? "Только root-admin, максимум на 24 часа. Действие создаёт новую версию и записывается в аудит." : "Root-admin only, up to 24 hours. The action creates a new version and audit record."}</p><div><label>Ask IDR/USDT<input type="number" min="1" step="0.0000000001" value={overrideAsk} onChange={(event) => setOverrideAsk(event.target.value)} /></label><label>Bid IDR/USDT<input type="number" min="1" step="0.0000000001" value={overrideBid} onChange={(event) => setOverrideBid(event.target.value)} /></label><label>{locale === "ru" ? "Минуты" : "Minutes"}<input type="number" min="1" max="1440" value={overrideMinutes} onChange={(event) => setOverrideMinutes(event.target.value)} /></label></div><button type="button" disabled={busy || !reason.trim() || !overrideAsk || !overrideBid} onClick={() => void createOverride()}>{locale === "ru" ? "Создать ограниченную версию курса" : "Create bounded FX version"}</button></details>
  </section>;
}
