import { useEffect, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import type { VisaCase } from "../api/types";
import { ClientVisaStatusHelp as VisaStatusHelp } from "./ClientVisaStatusHelp";
import { visaDatePresentation } from "./visaDatePresentation";
import { baliToday, formatLifeDate, formatLifePrice, lifeCardDate, lifeCopy, lifeCountdown, lifeDateLabel, lifeStatus, isMonthlyRental, lifeRentalSummary, safeLifeUrl, type LifeGroup, type LifeKind, type LifeLocale, type LifeService } from "./lifeServices";
import { usePricing } from "../pricing/runtime";
import { compactLifePrice, approximateLifeUsdt } from "./lifePriceDisplay";
import { lifeProgress } from "./lifeProgress";
import { LifeReminderPreference } from "./LifeReminderPreference";
import "./life-services.css";
import { clientBrand } from "../ui/client-brand";
import { YOGA_MINI_APP, yogaReadDeadline } from "../runtime/yoga-mini-app";
import {isAccountPreview} from '../api/account-preview';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientLifeCopies,clientLifeText,clientLifeStatus,clientLifeDateLabel,formatClientLifeDate,clientLifeRentalSummary,clientLifeReminderUpdate,clientLifeInline,clientLifeUrgency,clientLifeFxTooltip,clientLifePrice} from '../i18n/client-life-presentation';
import {clientLifeCountNumber,clientLifeCountParts,clientLifeCountText} from '../i18n/client-life-counts';
import {clientVisaDatePresentation} from '../i18n/client-visa-presentation';

type Props = { ui?:ClientUiBindings; apiPrefix: "/api/web" | "/mini-app"; csrfToken?: string; locale: LifeLocale; onBack?: () => void; onOpenVisas: () => void; onManager: () => void } & (
  { userId: number; viewInstanceKey?: never; onSessionInvalid?: never } |
  { userId?: never; viewInstanceKey: string; onSessionInvalid: () => void }
);
type Category = LifeKind | "visa";
type Summary = { key: string; category: Category; title: string; group: LifeGroup; date: string | null; dateLabel: string; status: string; life?: LifeService; visa?: VisaCase };

export function BaliLifeEntry({ locale, onOpen,ui }: { locale: LifeLocale; onOpen: () => void;ui?:ClientUiBindings }) {
  const client=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui);
  if(client&&isAccountPreview())throw new Error('CLIENT_LIFE_PREVIEW_BOUNDARY');
  const title=client?clientLifeText(client,'title'):lifeCopy[locale].title;
  const intro=client?clientLifeText(client,'intro'):lifeCopy[locale].intro;
  return <button className="life-entry" type="button" onClick={onOpen} lang={client?.locale} dir={client?.dir}><span><strong>{title}</strong><small>{intro}</small></span><span aria-hidden="true">↗</span></button>;
}

// Remounting on identity changes prevents even a single render of another user's records.
export function BaliLifeCabinet(props: Props) {
  const ui=YOGA_MINI_APP||props.ui===undefined?undefined:requireClientUiBindings(props.ui);
  if(ui&&isAccountPreview())throw new Error('CLIENT_LIFE_PREVIEW_BOUNDARY');
  if(ui&&(!Number.isSafeInteger(props.userId)||(props.userId??0)<=0||props.viewInstanceKey!==undefined))throw new Error('CLIENT_LIFE_ACTOR_BOUNDARY');
  return <BaliLifeContent key={`${props.apiPrefix}:${props.viewInstanceKey ?? props.userId}`} {...props} ui={ui}/>;
}

function BaliLifeContent({ apiPrefix, csrfToken, locale, onBack, onOpenVisas, onManager, onSessionInvalid,ui }: Props) {
  if(ui?.locale==='ru'||ui?.locale==='en')locale=ui.locale;
  const foreignUi=ui&&ui.locale!=='ru'&&ui.locale!=='en'?ui:undefined;
  const [data, setData] = useState<{ life: LifeService[]; visas: VisaCase[] } | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<"loading" | "ready" | "error">("loading");
  const [authError, setAuthError] = useState(false);
  const [today, setToday] = useState(baliToday);
  const needsPricing = Boolean(data?.life.some((item) => item.price_currency === "IDR" &&
    item.price_amount !== null && /^\d+(?:\.\d+)?$/.test(item.price_amount) &&
    (filter === "all" || filter === item.kind)));
  const { projection, refresh: refreshPricing } = usePricing(!YOGA_MINI_APP || needsPricing);
  const sessionInvalid = useRef(onSessionInvalid);
  sessionInvalid.current = onSessionInvalid;
  const reload = useRef<() => void>(() => {});
  const previousFocus = useRef<HTMLButtonElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const allButton = useRef<HTMLButtonElement>(null);
  // Copy is source-backed on each real branch. Global Account/MiniApp locale
  // activation still has its separate whole-screen/session/rendered gate.
  const t = ui?clientLifeCopies(ui):lifeCopy[locale];
  const dateLabel=(kind:LifeKind,boundary:'start'|'end')=>ui?clientLifeDateLabel(kind,boundary,ui):lifeDateLabel(kind,boundary,locale);
  const displayDate=(value:string|null)=>ui?formatClientLifeDate(value,ui):formatLifeDate(value,locale);
  const rentalSummary=(item:LifeService)=>ui?clientLifeRentalSummary(item,ui):lifeRentalSummary(item,locale);
  const price=(item:LifeService,compact=false)=>ui?clientLifePrice(item,ui,compact):(compact?compactLifePrice:formatLifePrice)(item,locale);
  const visaDate=(item:VisaCase)=>ui?clientVisaDatePresentation(item,ui):visaDatePresentation(item,locale);
  const number=(count:number)=>foreignUi?clientLifeCountNumber(foreignUi,count):String(count);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(baliToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let inFlight = false;
    let denied = false;
    async function load() {
      if (inFlight || disposed || denied) return;
      inFlight = true;
      controller = new AbortController();
      setRequestState("loading");
      setToday(baliToday());
      try {
        const api = appApiClient();
        const read = (signal: AbortSignal) => Promise.all([
          api.request<{ items: LifeService[] }>(`${apiPrefix}/life-services`, { signal }),
          api.request<{ items: VisaCase[] }>(`${apiPrefix}/visa-cases`, { signal }),
        ]);
        const [services, visas] = await (YOGA_MINI_APP
          ? yogaReadDeadline(read, controller.signal)
          : read(controller.signal));
        if (disposed) return;
        setData({ life: services.items.filter((item) => item.publication_status === "PUBLISHED"), visas: visas.items.filter((item) => item.publication_status === "PUBLISHED") });
        setAuthError(false);
        setRequestState("ready");
      } catch (error) {
        if (disposed) return;
        setData(null);
        const sessionDenied = error instanceof ApiError && (error.status === 401 || (YOGA_MINI_APP && error.status === 403));
        setAuthError(sessionDenied);
        setRequestState("error");
        if (YOGA_MINI_APP && sessionDenied) { denied = true; controller?.abort(); sessionInvalid.current?.(); }
      } finally { inFlight = false; }
    }
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    reload.current = () => { void load(); };
    void load();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [apiPrefix]);

  useEffect(() => { if (selectedKey) detailHeading.current?.focus(); }, [selectedKey]);

  function closeDetails() {
    setSelectedKey(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  }

  const summaries: Summary[] = [
    ...(data?.life ?? []).map((item): Summary => {
      const date = lifeCardDate(item, today);
      return { key: `life-${item.id}`, category: item.kind, title: item.title || t[item.kind], group: date.group, date: date.date, dateLabel: dateLabel(item.kind, date.boundary), status: ui?clientLifeStatus(item,today,ui):lifeStatus(item, today, locale), life: item };
    }),
    ...(data?.visas ?? []).map((item): Summary => {
      const date = visaDate(item);
      const terminal = ["EXPIRED", "CANCELLED", "REFUSED"].includes(item.lifecycle_status);
      return { key: `visa-${item.id}`, category: "visa", title: item.custom_visa_name || item.visa_type.name || item.visa_type.code, group: terminal ? "history" : "current", date: date?.value.slice(0, 10) ?? null, dateLabel: date?.label ?? t.unknown, status: item.lifecycle_status, visa: item };
    }),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.key.localeCompare(b.key));
  const selected = summaries.find((item) => item.key === selectedKey);
  useEffect(() => {
    if (selectedKey && !selected && requestState === "ready") {
      setSelectedKey(null);
      allButton.current?.focus();
    }
  }, [selectedKey, selected?.key, requestState]);
  const categories: Category[] = ["visa", "housing", "bike", "insurance", ...(summaries.some((item) => item.category === "other") ? ["other" as const] : [])];
  const filtered = summaries.filter((item) => filter === "all" || item.category === filter);
  const selectedPrice = selected?.life ? price(selected.life) : null;
  const selectedUrl = selected?.life ? safeLifeUrl(selected.life.link_url) : null;
  const otherDateBoundary = selected?.life && lifeCardDate(selected.life, today).boundary === "start" ? "end" : "start";
  const otherDate = selected?.life ? (otherDateBoundary === "start" ? selected.life.start_date : selected.life.end_date) : null;

  return <section className="bali-life page-stack" lang={ui?.locale} dir={ui?.dir} onKeyDown={(event) => { if (event.key === "Escape" && selected) { event.preventDefault(); closeDetails(); } }}>
    {onBack && <button className="life-text-action" type="button" onClick={onBack}>← {t.back}</button>}
    <header className="page-heading life-heading"><div className="life-heading-line"><span className="eyebrow">{clientBrand.name} · Bali ·</span><h1>{t.title}</h1></div><p>{t.intro}</p></header>
    <div className="life-toolbar"><small className="life-timezone">{t.dateZone}</small><div className="life-toolbar-actions life-mobile-toolbar"><button type="button" className="life-refresh" aria-label={requestState === "loading" ? t.refreshing : t.refresh} title={t.refresh} disabled={requestState === "loading"} onClick={() => { reload.current(); void refreshPricing(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.3A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.7"/></svg><span className="life-phone-only">{t.refresh}</span></button><button ref={allButton} type="button" className="life-all" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setSelectedKey(null); }}>{t.all}{data ? ` · ${number(summaries.length)}` : ""}</button></div></div>
    <nav className="life-categories" aria-label={t.title}>{categories.map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setSelectedKey(null); }}><span>{t[kind]}</span><strong>{data ? number(summaries.filter((item) => item.category === kind).length) : "—"}</strong></button>)}</nav>
    {requestState === "loading" && !data && <p role="status">{t.loading}</p>}
    {requestState === "error" && <div className="life-notice" role="alert"><p>{authError ? t.session : t.error}</p><button className="button secondary" type="button" onClick={() => reload.current()}>{t.retry}</button></div>}
    {data && !filtered.length && <div className="life-notice"><p>{summaries.length ? t.emptyCategory : t.empty}</p><button className="button secondary" type="button" onClick={onManager}>{t.manager}</button></div>}
    {data && filtered.length > 0 && <div className={`life-layout${selected ? " has-selection" : ""}`}>
      <div className="life-lists">{(["current", "future", "history"] as const).map((group) => {
        const records = filtered.filter((item) => item.group === group);
        if (!records.length) return null;
        return <section className="life-group" key={group} aria-labelledby={`life-${group}`}><h2 id={`life-${group}`}>{t[group]}</h2><div className="life-card-grid">{records.map((item) => {
          const usdt = item.life?.price_currency === "IDR" ? approximateLifeUsdt(item.life.price_amount, projection, Date.now()) : null;
          const terminalVisa = item.visa && ["CANCELLED", "REFUSED", "EXPIRED"].includes(item.visa.lifecycle_status);
          const monthly = item.life && isMonthlyRental(item.life);
          const start = item.life?.start_date ?? (item.visa?.entered_on ? item.visa.entered_on : item.date === item.visa?.entry_deadline ? item.visa?.issued_on : null) ?? null;
          const progress = terminalVisa || item.group === "future" ? null : lifeProgress(start, item.date, today, !!monthly);
          const countdown = terminalVisa ? null : lifeCountdown(progress?.repeating ? progress.end : item.date, today, locale);
          const urgency = item.group === "future" || (progress?.repeating && progress.end !== item.date) ? null : countdown?.urgency;
          const countdownLabel = item.group === "future" ? (locale === "ru" ? "До начала" : "Starts in") : countdown?.label;
          const wholeCountdown = countdown&&foreignUi ? clientLifeCountParts(foreignUi,
            item.group==='future'?'life.countdown.future':countdown.expired?'life.countdown.expired':'life.countdown.remaining',countdown.value) : null;
          const endUrgency = item.group === "future" || terminalVisa ? null : lifeCountdown(item.date, today, locale)?.urgency;
          const countdownNote = endUrgency === "urgent"
            ? (ui?clientLifeUrgency(ui,'urgent'):(locale === "ru" ? "Срочно свяжитесь с менеджером" : "Contact your manager urgently"))
            : endUrgency === "soon" ? (ui?clientLifeUrgency(ui,'soon'):(locale === "ru" ? "Пора обратиться к менеджеру" : "Time to contact your manager")) : null;
          return <article className="life-card" key={item.key}><button type="button" className={`life-card-open${countdown ? " has-countdown" : ""}`} aria-expanded={selected?.key === item.key} aria-controls={selected?.key === item.key ? "life-details" : undefined} onClick={(event) => { previousFocus.current = event.currentTarget; setSelectedKey(item.key); }}>
            <span className="life-card-mobile-title"><small>{t[item.category]}</small></span>
            <span className="life-card-copy"><span className={`life-card-title${item.visa ? " is-visa" : ""}`}><small>{t[item.category]}</small><strong>{item.title}</strong></span><span className="life-card-facts">{item.life && rentalSummary(item.life) && <small>{rentalSummary(item.life)}</small>}{item.life && price(item.life) && <span className="life-price-line"><span className="life-desktop-only">{price(item.life)}</span><span className="life-phone-only">{price(item.life,true)}{usdt !== null && <span className="life-usdt-estimate" title={ui?clientLifeFxTooltip(ui):(locale === "ru" ? "Примерно, по принятому курсу Indodax. Округлено до 5 USDT." : "Approximate accepted Indodax rate, rounded to 5 USDT.")}> (≈ {usdt} USDT)</span>}</span></span>}<span className="life-due"><small>{monthly && !item.date ? (ui?clientLifeInline(ui,'monthly'):(locale === "ru" ? "Помесячно" : "Monthly")) : item.dateLabel}</small>{monthly && !item.date ? <span className="life-desktop-only">{ui?clientLifeInline(ui,'noEndDate'):(locale === "ru" ? "Без даты окончания" : "No end date")}</span> : <time dateTime={item.date ?? undefined}>{displayDate(item.date)}</time>}</span>{monthly && item.life?.start_date && <span className="life-due"><small>{dateLabel(item.life.kind, "start")}</small><time dateTime={item.life.start_date}>{displayDate(item.life.start_date)}</time></span>}</span></span>
            {countdown && <span className="life-countdown-wrap"><span className={`life-countdown${progress ? " has-ring" : ""}${countdown.expired ? " is-expired" : ""}${urgency ? ` is-${urgency}` : ""}`}>
              {progress && <svg className="life-progress-ring" viewBox="0 0 112 112" aria-hidden="true"><circle className="life-progress-track" cx="56" cy="56" r="50"/><circle className="life-progress-arc" opacity={progress.fraction === 0 ? 0 : 1} cx="56" cy="56" r="50" pathLength="100" strokeDasharray={`${progress.fraction * 100} 100`} transform="rotate(-90 56 56)"/>{progress.repeating && <circle className="life-progress-marker" cx={56 + 50 * Math.sin(progress.fraction * 2 * Math.PI)} cy={56 - 50 * Math.cos(progress.fraction * 2 * Math.PI)} r="4"/>}</svg>}
              <small>{wholeCountdown?wholeCountdown.before:countdownLabel}</small><strong style={countdown.value >= 1000 ? { fontSize: `${Math.floor(110 / String(countdown.value).length)}px` } : undefined}>{wholeCountdown?wholeCountdown.number:countdown.value}</strong><small>{wholeCountdown?wholeCountdown.after:countdown.unit}</small>
            </span>{progress && <small className="life-progress-caption">{progress.repeating ? <>{ui?clientLifeInline(ui,item.category==='other'?'serviceMonth':'rentalMonth'):(locale === "ru" ? (item.category === "other" ? "Месяц услуги" : "Месяц аренды") : (item.category === "other" ? "Service month" : "Rental month"))}<br/>{foreignUi?clientLifeInline(foreignUi,'elapsedDays',{progress_elapsed:number(progress.elapsed),progress_total:number(progress.total)}):(locale === "ru" ? `Прошло ${progress.elapsed} из ${progress.total} дней` : `${progress.elapsed} of ${progress.total} days elapsed`)}</> : foreignUi?clientLifeCountText(foreignUi,'life.termDays',progress.total):(locale === "ru" ? `Срок — ${progress.total} дн.` : `${progress.total}-day term`)}</small>}</span>}
            <span className="life-card-footer"><span>{item.visa ? <code>{item.status}</code> : item.status}</span><span>{t.details} →</span></span>
            {countdownNote && <span className={`life-countdown-note is-${endUrgency}`}>{countdownNote}</span>}
          </button></article>;
        })}</div></section>;
      })}</div>
      {selected && <aside id="life-details" className="life-detail" aria-labelledby="life-detail-title"><button className="life-text-action" type="button" onClick={closeDetails}>← {t.close}</button><small>{t[selected.category]}</small><h2 id="life-detail-title" ref={detailHeading} tabIndex={-1}>{selected.title}</h2>
        <dl><div className="life-detail-due"><dt>{selected.dateLabel}</dt><dd>{selected.life && isMonthlyRental(selected.life) && !selected.date ? (ui?clientLifeInline(ui,'monthlyNoEnd'):(locale === "ru" ? "Помесячно · без даты окончания" : "Monthly · no end date")) : <time dateTime={selected.date ?? undefined}>{displayDate(selected.date)}</time>}</dd></div>
          {selected.life && <div><dt>{dateLabel(selected.life.kind, otherDateBoundary)}</dt><dd>{otherDate ? displayDate(otherDate) : otherDateBoundary === "start" ? t.noStart : t.unknown}</dd></div>}
          {selectedPrice && <div><dt>{t.price}</dt><dd>{selectedPrice}</dd></div>}
          {selected.life?.public_contact && <div><dt>{t.contact}</dt><dd>{selected.life.public_contact}</dd></div>}
          {selected.visa && <div><dt>{t.visaStatus}</dt><dd><VisaStatusHelp kind="visa" code={selected.visa.lifecycle_status} locale={locale} ui={ui} /></dd></div>}
        </dl>
        {selected.life && <LifeReminderPreference ui={ui} key={selected.key} item={selected.life} apiPrefix={apiPrefix} csrfToken={csrfToken} locale={locale} onSaved={(next) => setData((current) => current ? { ...current, life: current.life.map((item) => item.id === next.id ? (ui?clientLifeReminderUpdate(item,next,ui):next) : item) } : current)} />}
        {selected.life?.description && <p className="life-description">{selected.life.description}</p>}
        {selectedUrl && <a className="life-link" href={selectedUrl} target="_blank" rel="noopener noreferrer">{t.link} ↗</a>}
        {selected.visa && <button className="button secondary" type="button" onClick={onOpenVisas}>{t.visaOpen}</button>}
        <button className="life-text-action" type="button" onClick={onManager}>{t.manager}</button>
      </aside>}
    </div>}
  </section>;
}
