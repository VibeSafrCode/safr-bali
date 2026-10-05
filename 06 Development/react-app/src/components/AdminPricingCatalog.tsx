import { useEffect, useMemo, useState } from "react";

import { AppIcon } from "./AppIcon";
import { businessEntityAvailability, businessEntityLabel, businessEntityMatches, groupBusinessEntities, BUSINESS_CATEGORIES, type BusinessData, type BusinessEntityGroup, type BusinessPriceIdentity } from "./businessCategories";
import "./business-settings.css";

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
  preview_source?: { url: string; published_at: string; read_only: boolean };
  active: null | { publication_version: number; catalog_version: number; fx_version: number; projection_id: string };
  active_fx: null | { version: number; ask_idr_per_usdt: string; acceptance_method: string; observed_at: string; stale_until: string; is_manual_override: boolean; override_expires_at?: string | null };
  items: PriceItem[];
  catalog_history: Array<{ version: number; reason: string; effective_from: string }>;
  fx_history: Array<{ version: number; ask_idr_per_usdt: string; acceptance_method: string; observed_at: string; stale_until: string; is_manual_override: boolean }>;
};
type Preview = { fx_version: number; fx_ask_idr_per_usdt: string; formula_code: string; derived_expires_at?: string; items: Array<PriceItem & { amount_idr: string | null; display_usdt: string | null; display_usd_approx?: string | null }> };

function operationKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type Props = {
  csrfToken: string; locale: Locale; data: BusinessData | null;
  category: string; query: string; view: "catalog" | "fx" | "hidden";
  expandedEntity: string | null; onExpandedEntityChange: (id: string | null) => void;
  onPriceItemsLoaded: (items: BusinessPriceIdentity[]) => void;
  onOpenSettings: (entity: BusinessEntityGroup) => void;
};

export function AdminPricingCatalog({ csrfToken, locale, data, category, query, view, expandedEntity, onExpandedEntityChange, onPriceItemsLoaded, onOpenSettings }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<PriceItem[]>([]);
  const [units, setUnits] = useState<Record<string, "IDR" | "USDT">>({});
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [overrideAsk, setOverrideAsk] = useState("");
  const [overrideBid, setOverrideBid] = useState("");
  const [overrideMinutes, setOverrideMinutes] = useState("60");
  const [overrideReason, setOverrideReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = Number(overview?.active_fx?.ask_idr_per_usdt ?? 0);
  const readOnly = overview?.preview_source?.read_only === true;
  const publicationVersion = overview?.active?.publication_version ?? 0;

  async function load() {
    setError("");
    try {
      const result = await appApiClient().request<Overview>("/api/web/admin/pricing");
      setOverview(result); setDraft(result.items);
      onPriceItemsLoaded(result.items.map(({ entity_type, entity_key, sku, option_code, label_ru, label_en }) => ({ entity_type, entity_key, sku, option_code, label_ru, label_en })));
      setUnits(Object.fromEntries(result.items.map((item) => [item.sku, "IDR"])));
      setAmountInputs(Object.fromEntries(result.items.map((item) => [item.sku, item.amount_idr === null ? "" : String(item.amount_idr)])));
    } catch (caught) { setError(apiErrorMessage(caught)); }
  }
  async function prepareApproved(includeNextStage:boolean){
    if(changed||readOnly||busy)return;
    setBusy(true);setError('');
    try{
      const result=await appApiClient().request<{items:PriceItem[];expected_publication_version:number;published:false}>('/api/web/admin/pricing/prepare-approved',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_publication_version:publicationVersion,include_next_stage:includeNextStage})});
      if(result.expected_publication_version!==publicationVersion||result.published!==false)throw Error('Catalog version changed');
      setDraft(result.items);setPreview(null);setUnits(Object.fromEntries(result.items.map(item=>[item.sku,'IDR'])));setAmountInputs(Object.fromEntries(result.items.map(item=>[item.sku,item.amount_idr===null?'':String(item.amount_idr)])));
      onPriceItemsLoaded(result.items.map(({entity_type,entity_key,sku,option_code,label_ru,label_en})=>({entity_type,entity_key,sku,option_code,label_ru,label_en})));
    }catch(caught){setError(apiErrorMessage(caught));}finally{setBusy(false);}
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!preview?.derived_expires_at) return;
    const expiry = Date.parse(preview.derived_expires_at);
    if (!Number.isFinite(expiry)) return;
    setClock(Date.now());
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(0, Math.min(expiry - Date.now() + 25, 2_147_000_000)));
    return () => window.clearTimeout(timer);
  }, [preview]);
  const previewDerivedAllowed = Boolean(preview?.derived_expires_at && clock <= Date.parse(preview.derived_expires_at));

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
    if (!overrideReason.trim() || !overrideAsk || !overrideBid || !Number.isFinite(duration)) return;
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
          reason: overrideReason.trim(),
        }),
      });
      setOverrideAsk(""); setOverrideBid(""); setOverrideReason(""); await load();
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

  const changedCount = useMemo(() => draft.filter((item) => {
    const before = overview?.items.find((original) => original.sku === item.sku);
    return !before || JSON.stringify(item) !== JSON.stringify(before) ||
      (amountInputs[item.sku] ?? "") !== (before.amount_idr === null ? "" : String(before.amount_idr)) ||
      (units[item.sku] ?? "IDR") !== "IDR";
  }).length, [draft, overview, amountInputs, units]);
  const changed = changedCount > 0;
  const words = locale === "ru" ? { EXACT: "Фиксированная", FROM: "От указанной суммы", VARIABLE: "Индивидуальный расчёт", CONTACT: "По запросу" } : { EXACT: "Fixed price", FROM: "Starting from", VARIABLE: "Custom quote", CONTACT: "On request" };
  const groups = useMemo(() => groupBusinessEntities(data, draft), [data, draft]);
  const visibleCount = groups.filter(group => group.id === expandedEntity || businessEntityMatches(group, category, query)).length;
  function priceLabel(item: PriceItem) {
    const amount = amountInputs[item.sku];
    if (["EXACT", "FROM"].includes(item.price_qualifier)) {
      if (!amount?.trim()) return locale === "ru" ? "Цена не задана" : "No price configured";
      return (item.price_qualifier === "FROM" ? (locale === "ru" ? "от " : "from ") : "") + Number(amount).toLocaleString(locale) + " " + (units[item.sku] ?? "IDR");
    }
    return words[item.price_qualifier];
  }
  function priceStatus(item: PriceItem) {
    return item.fee_verification_status !== "VERIFIED" ? (locale === "ru" ? "Цена требует проверки" : "Price needs verification") : item.show_price ? (locale === "ru" ? "Цена видна клиентам" : "Price visible to clients") : (locale === "ru" ? "Цена скрыта" : "Price hidden");
  }

  return <section hidden={view === "hidden"} className="admin-panel admin-pricing-catalog business-catalog">
    {view==='catalog'&&overview&&<details className="crm-advanced"><summary>{locale==='ru'?'Согласованные новые тарифы':'Approved new tariffs'}</summary><p>{locale==='ru'?'Подготовка добавляет варианты в черновик. Действующие цены и заказы не меняются. Для сохранения нужны отдельные предпросмотр и публикация.':'Preparation adds options to this draft only. Current prices and orders do not change. Saving requires a separate preview and publication.'}</p><button type="button" disabled={readOnly||busy||changed} onClick={()=>void prepareApproved(false)}>{locale==='ru'?'Подготовить C1 и VOA extension':'Prepare C1 and VOA extensions'}</button><button type="button" disabled={readOnly||busy||changed} onClick={()=>void prepareApproved(true)}>{locale==='ru'?'Подготовить все согласованные варианты':'Prepare all approved options'}</button></details>}
    {readOnly && <p className="business-source">{locale === "ru" ? "Каталог рабочего сайта · только просмотр" : "Live site catalog · read only"} · {new Date(overview!.preview_source!.published_at).toLocaleString(locale)}<br/>{locale === "ru" ? "Изменения здесь не сохраняются в реальную базу." : "Changes here are not saved to the live database."}</p>}
    {error && <div className="admin-alert" role="alert">{error} {!overview && <button type="button" onClick={() => void load()}>{locale === "ru" ? "Повторить" : "Retry"}</button>}</div>}
    {!overview && !error && <p role="status">{locale === "ru" ? "Загружаем цены и курс…" : "Loading prices and exchange rate…"}</p>}
    <div className="business-catalog-content" hidden={view !== "catalog"}>
      <div className="business-catalog-heading"><div><h2>{locale === "ru" ? "Каталог и цены" : "Catalog & prices"}</h2><p>{locale === "ru" ? "Все услуги и визы. Откройте нужную услугу, затем выберите вариант цены." : "All services and visas. Open a service, then choose its price option."}</p></div><span className="business-count">{visibleCount}</span></div>
      <div className="business-price-rows">{groups.map(group => {
        const open = expandedEntity === group.id;
        const singlePrice = group.variants.length === 1 ? group.variants[0].item : null;
        const active = businessEntityAvailability(group);
        const availability = active === null ? (locale === "ru" ? "Доступность не указана" : "Availability not provided") : active ? (locale === "ru" ? "Доступна" : "Available") : (locale === "ru" ? "Скрыта" : "Hidden");
        const categoryInfo = BUSINESS_CATEGORIES.find(item => item.id === group.category);
        const noPrice = overview ? (locale === "ru" ? "Цена не задана" : "No price configured") : (locale === "ru" ? "Цены не загружены" : "Prices not loaded");
        return <article key={group.id} hidden={!open && !businessEntityMatches(group, category, query)} className={"business-price-row" + (open ? " is-open" : "")}>
          <button type="button" id={"catalog-" + group.id} className="business-price-summary" aria-expanded={open} aria-controls={"entity-prices-" + group.id} onClick={() => onExpandedEntityChange(open ? null : group.id)}>
            <span className="business-service-icon"><AppIcon name={categoryInfo?.icon ?? "✦"}/></span>
            <span className="business-service-name"><strong>{businessEntityLabel(group, locale)}</strong><small>{group.entityKey || categoryInfo?.[locale]} · {availability}</small></span>
            <span className="business-service-price"><strong>{singlePrice ? priceLabel(singlePrice) : group.variants.length ? (locale === "ru" ? "Вариантов цены: " : "Price options: ") + group.variants.length : noPrice}</strong><small>{singlePrice ? priceStatus(singlePrice) : categoryInfo?.[locale]}</small></span><AppIcon name="chevron"/>
          </button>
          <div id={"entity-prices-" + group.id} hidden={!open} className="business-entity-prices">
            <div className="business-price-context">
              <span>{locale === "ru" ? "Доступность, название и Points" : "Availability, name and Points"}</span>
              {group.source && group.entityKey ? <button type="button" className="business-link" onClick={() => onOpenSettings(group)}>{locale === "ru" ? "Настройки этой услуги" : "Settings for this service"}</button> : <small>{locale === "ru" ? "Настройки услуги не загружены" : "Service settings are not loaded"}</small>}
            </div>
            {group.variants.length === 0 && <p className="business-empty">{noPrice}.{group.source && group.entityKey && (locale === "ru" ? " Доступность и название можно изменить в настройках этой услуги." : " Availability and name can be changed in this service’s settings.")}</p>}
            {group.variants.map(({ item, index }) => {
              const unit = units[item.sku] ?? "IDR";
              const priced = ["EXACT", "FROM"].includes(item.price_qualifier);
              const amount = amountInputs[item.sku];
              return <div key={item.sku} className="business-price-variant">
                {group.variants.length > 1 && <button type="button" className="business-variant-summary" aria-expanded={expanded === item.sku} aria-controls={"price-" + item.sku} onClick={() => setExpanded(expanded === item.sku ? null : item.sku)}>
                  <span className="business-service-name"><strong>{(locale === "ru" ? item.label_ru : item.label_en) || item.option_code}</strong><small>{item.option_code}</small></span>
                  <span className="business-service-price"><strong>{priceLabel(item)}</strong><small>{priceStatus(item)}</small></span><AppIcon name="chevron"/>
                </button>}
        <fieldset hidden={group.variants.length > 1 && expanded !== item.sku} disabled={busy || readOnly} aria-label={locale === "ru" ? "Параметры цены" : "Price settings"} id={`price-${item.sku}`} className="business-price-editor">
          <label>{locale === "ru" ? "Название на русском" : "Russian name"}<input value={item.label_ru} onChange={event => update(index, { label_ru: event.target.value })}/></label>
          <label>{locale === "ru" ? "Название на английском" : "English name"}<input value={item.label_en} onChange={event => update(index, { label_en: event.target.value })}/></label>
          <label>{locale === "ru" ? "Тип цены" : "Price type"}<select value={item.price_qualifier} onChange={event => update(index, { price_qualifier: event.target.value as PriceItem["price_qualifier"] })}>{Object.entries(words).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          {priced && <div className="admin-pricing-amount"><label>{locale === "ru" ? "Сумма" : "Amount"}<input type="number" min="1" step={unit === "IDR" ? "1000" : "0.01"} value={amount ?? ""} onChange={event => { setAmountInputs(current => ({ ...current, [item.sku]: event.target.value })); setPreview(null); }}/></label><label>{locale === "ru" ? "Валюта" : "Currency"}<select value={unit} onChange={event => changeUnit(item, event.target.value as "IDR" | "USDT")}><option>IDR</option><option disabled={!(ask > 0)}>USDT</option></select></label></div>}
          <label>{locale === "ru" ? "Состав цены" : "Fee verification"}<select value={item.fee_verification_status} onChange={event => update(index, { fee_verification_status: event.target.value as PriceItem["fee_verification_status"] })}><option value="VERIFIED">{locale === "ru" ? "Проверен" : "Verified"}</option><option value="NEEDS_VERIFICATION">{locale === "ru" ? "Требует проверки" : "Needs verification"}</option></select></label>
          <label className="business-visibility"><input type="checkbox" checked={item.show_price} disabled={!priced || item.fee_verification_status !== "VERIFIED"} onChange={event => update(index, { show_price: event.target.checked })}/><span>{locale === "ru" ? "Показывать цену клиентам" : "Show price to clients"}<small>{!priced || item.fee_verification_status !== "VERIFIED" ? (locale === "ru" ? "Нужна проверенная фиксированная цена или цена «от»." : "Requires a verified fixed or starting price.") : ""}</small></span></label>
        </fieldset>
              </div>;
            })}
          </div>
        </article>;
      })}</div>
      {visibleCount === 0 && (groups.length > 0 || (data && overview)) && <p className="business-empty">{groups.length === 0 ? (locale === "ru" ? "Каталог пока пуст." : "The catalog is empty.") : (locale === "ru" ? "Ничего не найдено. Попробуйте другую категорию или название." : "No matches. Try another category or name.")}</p>}
      {changed && <p className="business-unsaved" role="status">{locale === "ru" ? `Изменено вариантов цены: ${changedCount}. Публикация включает изменения во всех категориях.` : `${changedCount} price options changed. Publication includes changes in every category.`}</p>}
      {preview && <section className="admin-settings-preview" aria-live="polite"><h3>{locale === "ru" ? "Предпросмотр публикации" : "Publication preview"}</h3><p>FX v{preview.fx_version}{previewDerivedAllowed ? ` · ${preview.fx_ask_idr_per_usdt} IDR/USDT` : ""} · {preview.formula_code}</p><ul>{preview.items.filter((item) => item.show_price).map((item) => <li key={item.sku}>{item.entity_key} · {item.label_ru}: {item.amount_idr} IDR{previewDerivedAllowed && item.display_usd_approx != null ? ` · ≈ $${item.display_usd_approx}` : ""}</li>)}</ul></section>}
      {overview && <div className="business-publication">
        <label>{locale === "ru" ? "Комментарий к изменениям" : "Change comment"}<textarea value={reason} minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="crm-save-actions"><button type="button" disabled={readOnly || busy || !changed} onClick={() => void createPreview()}>{locale === "ru" ? "Предпросмотр" : "Preview"}</button><button type="button" disabled={readOnly || busy || !preview || !reason.trim()} onClick={() => void publish()}>{locale === "ru" ? "Опубликовать новую версию" : "Publish new version"}</button></div>
        {overview.catalog_history.length > 1 && <details className="crm-advanced"><summary>{locale === "ru" ? "История и восстановление" : "History and restore"}</summary><div className="admin-version-history">{overview.catalog_history.filter((item) => item.version !== overview.active?.catalog_version).map((item) => <button type="button" key={item.version} disabled={readOnly || busy || changed} onClick={() => void restore(item.version)}>{locale === "ru" ? `Восстановить каталог v${item.version} как новую версию` : `Restore catalog v${item.version} as a new version`}</button>)}</div></details>}
        <details className="business-technical"><summary>{locale === "ru" ? "Данные публикации" : "Publication details"}</summary><p>{overview.active?.projection_id ?? "—"} · {locale === "ru" ? "Каталог" : "Catalog"} v{overview.active?.catalog_version ?? "—"}</p></details>
      </div>}
    </div>
    <div hidden={view !== "fx"} className="business-fx-content">
      <div className="business-catalog-heading"><div><h2>{locale === "ru" ? "Курс для расчёта цен" : "Exchange rate for prices"}</h2><p>{locale === "ru" ? "Основные цены — в IDR. USDT рассчитывается по сохранённому курсу." : "Base prices are in IDR. USDT is calculated using the saved rate."}</p></div></div>
      {overview && <>
        <div className="business-fx-current"><strong>{overview.active_fx ? Number(overview.active_fx.ask_idr_per_usdt).toLocaleString(locale) + " IDR / USDT" : (locale === "ru" ? "Курс не загружен" : "Rate not loaded")}</strong>{overview.active_fx && <small>{locale === "ru" ? "Время наблюдения" : "Observed at"}: {new Date(overview.active_fx.observed_at).toLocaleString(locale)} · {locale === "ru" ? "Действителен до" : "Valid until"}: {new Date(overview.active_fx.stale_until).toLocaleString(locale)}</small>}</div>
        <div className="crm-save-actions"><button type="button" disabled={readOnly || busy || changed} onClick={() => void refreshFx()}>{locale === "ru" ? "Обновить курс" : "Refresh rate"}</button></div>
        {changed && <p className="business-unsaved">{locale === "ru" ? "В каталоге есть изменения цен. Завершите их перед обновлением курса." : "There are price changes in the catalog. Finish them before refreshing the rate."}</p>}
        <details className="business-technical"><summary>{locale === "ru" ? "Данные курса" : "Rate details"}</summary><p>FX v{overview.active_fx?.version ?? "—"} · {overview.active_fx?.acceptance_method ?? "—"}</p></details>
        <details className="crm-advanced admin-fx-override"><summary>{locale === "ru" ? "Аварийный ручной курс" : "Emergency manual FX"}</summary><p>{locale === "ru" ? "Только root-admin, максимум на 24 часа. Действие создаёт новую версию и записывается в аудит." : "Root-admin only, up to 24 hours. The action creates a new version and audit record."}</p>
          <div><label>Ask IDR/USDT<input type="number" min="1" step="0.0000000001" value={overrideAsk} onChange={(event) => setOverrideAsk(event.target.value)} /></label><label>Bid IDR/USDT<input type="number" min="1" step="0.0000000001" value={overrideBid} onChange={(event) => setOverrideBid(event.target.value)} /></label><label>{locale === "ru" ? "Минуты" : "Minutes"}<input type="number" min="1" max="1440" value={overrideMinutes} onChange={(event) => setOverrideMinutes(event.target.value)} /></label></div>
          <label>{locale === "ru" ? "Причина изменения курса" : "Rate change reason"}<textarea value={overrideReason} minLength={3} maxLength={2000} onChange={event => setOverrideReason(event.target.value)}/></label>
          <button type="button" disabled={readOnly || busy || changed || !overrideReason.trim() || !overrideAsk || !overrideBid} onClick={() => void createOverride()}>{locale === "ru" ? "Создать ограниченную версию курса" : "Create bounded FX version"}</button>
        </details>
      </>}
    </div>
  </section>;
}
