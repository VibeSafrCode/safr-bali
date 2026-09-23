import { useEffect, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import type { VisaCase } from "../api/types";
import { VisaStatusHelp } from "./VisaStatusHelp";
import { visaDatePresentation } from "./VisaCabinet";
import { baliToday, formatLifeDate, formatLifePrice, lifeCardDate, lifeCopy, lifeCountdown, lifeDateLabel, lifeStatus, isMonthlyRental, lifeRentalSummary, safeLifeUrl, type LifeGroup, type LifeKind, type LifeLocale, type LifeService } from "./lifeServices";
import "./life-services.css";

type Props = { apiPrefix: "/api/web" | "/mini-app"; userId: number; locale: LifeLocale; onBack?: () => void; onOpenVisas: () => void; onManager: () => void };
type Category = LifeKind | "visa";
type Summary = { key: string; category: Category; title: string; group: LifeGroup; date: string | null; dateLabel: string; status: string; life?: LifeService; visa?: VisaCase };

export function BaliLifeEntry({ locale, onOpen }: { locale: LifeLocale; onOpen: () => void }) {
  const t = lifeCopy[locale];
  return <button className="life-entry" type="button" onClick={onOpen}><span><strong>{t.title}</strong><small>{t.intro}</small></span><span aria-hidden="true">↗</span></button>;
}

// Remounting on identity changes prevents even a single render of another user's records.
export function BaliLifeCabinet(props: Props) {
  return <BaliLifeContent key={`${props.apiPrefix}:${props.userId}`} {...props} />;
}

function BaliLifeContent({ apiPrefix, locale, onBack, onOpenVisas, onManager }: Props) {
  const [data, setData] = useState<{ life: LifeService[]; visas: VisaCase[] } | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<"loading" | "ready" | "error">("loading");
  const [authError, setAuthError] = useState(false);
  const [today, setToday] = useState(baliToday);
  const reload = useRef<() => void>(() => {});
  const previousFocus = useRef<HTMLButtonElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const allButton = useRef<HTMLButtonElement>(null);
  const t = lifeCopy[locale];

  useEffect(() => {
    const timer = window.setInterval(() => setToday(baliToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let inFlight = false;
    async function load() {
      if (inFlight || disposed) return;
      inFlight = true;
      controller = new AbortController();
      setRequestState("loading");
      setToday(baliToday());
      try {
        const api = appApiClient();
        const [services, visas] = await Promise.all([
          api.request<{ items: LifeService[] }>(`${apiPrefix}/life-services`, { signal: controller.signal }),
          api.request<{ items: VisaCase[] }>(`${apiPrefix}/visa-cases`, { signal: controller.signal }),
        ]);
        if (disposed) return;
        setData({ life: services.items.filter((item) => item.publication_status === "PUBLISHED"), visas: visas.items.filter((item) => item.publication_status === "PUBLISHED") });
        setAuthError(false);
        setRequestState("ready");
      } catch (error) {
        if (disposed) return;
        setData(null);
        setAuthError(error instanceof ApiError && error.status === 401);
        setRequestState("error");
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
      return { key: `life-${item.id}`, category: item.kind, title: item.title || t[item.kind], group: date.group, date: date.date, dateLabel: lifeDateLabel(item.kind, date.boundary, locale), status: lifeStatus(item, today, locale), life: item };
    }),
    ...(data?.visas ?? []).map((item): Summary => {
      const date = visaDatePresentation(item, locale);
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
  const filtered = summaries.filter((item) => filter === "all" || item.category === filter);
  const selectedPrice = selected?.life ? formatLifePrice(selected.life, locale) : null;
  const selectedUrl = selected?.life ? safeLifeUrl(selected.life.link_url) : null;
  const otherDateBoundary = selected?.life && lifeCardDate(selected.life, today).boundary === "start" ? "end" : "start";
  const otherDate = selected?.life ? (otherDateBoundary === "start" ? selected.life.start_date : selected.life.end_date) : null;

  return <section className="bali-life page-stack" onKeyDown={(event) => { if (event.key === "Escape" && selected) { event.preventDefault(); closeDetails(); } }}>
    {onBack && <button className="life-text-action" type="button" onClick={onBack}>← {t.back}</button>}
    <header className="page-heading life-heading"><div className="life-heading-line"><span className="eyebrow">SAFRWAY · Bali ·</span><h1>{t.title}</h1></div><p>{t.intro}</p></header>
    <div className="life-toolbar"><small>{t.dateZone}</small><div className="life-toolbar-actions"><button type="button" className="life-refresh" aria-label={requestState === "loading" ? t.refreshing : t.refresh} title={t.refresh} disabled={requestState === "loading"} onClick={() => reload.current()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.3A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.7"/></svg></button><button ref={allButton} type="button" className="life-all" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setSelectedKey(null); }}>{t.all}{data ? ` · ${summaries.length}` : ""}</button></div></div>
    <nav className="life-categories" aria-label={t.title}>{(["visa", "housing", "bike", "insurance"] as const).map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setSelectedKey(null); }}><span>{t[kind]}</span><strong>{data ? summaries.filter((item) => item.category === kind).length : "—"}</strong></button>)}</nav>
    {requestState === "loading" && !data && <p role="status">{t.loading}</p>}
    {requestState === "error" && <div className="life-notice" role="alert"><p>{authError ? t.session : t.error}</p><button className="button secondary" type="button" onClick={() => reload.current()}>{t.retry}</button></div>}
    {data && !filtered.length && <div className="life-notice"><p>{summaries.length ? t.emptyCategory : t.empty}</p><button className="button secondary" type="button" onClick={onManager}>{t.manager}</button></div>}
    {data && filtered.length > 0 && <div className={`life-layout${selected ? " has-selection" : ""}`}>
      <div className="life-lists">{(["current", "future", "history"] as const).map((group) => {
        const records = filtered.filter((item) => item.group === group);
        if (!records.length) return null;
        return <section className="life-group" key={group} aria-labelledby={`life-${group}`}><h2 id={`life-${group}`}>{t[group]}</h2><div className="life-card-grid">{records.map((item) => {
          const terminalVisa = item.visa && ["CANCELLED", "REFUSED", "EXPIRED"].includes(item.visa.lifecycle_status);
          const monthly = item.life && isMonthlyRental(item.life);
          const countdown = terminalVisa || (monthly && !item.date) ? null : lifeCountdown(item.date, today, locale);
          const countdownLabel = item.group === "future" ? (locale === "ru" ? "До начала" : "Starts in") : countdown?.label;
          const countdownNote = countdown?.urgency === "urgent"
            ? (locale === "ru" ? "Срочно свяжитесь с менеджером" : "Contact your manager urgently")
            : countdown?.urgency === "soon" ? (locale === "ru" ? "Пора обратиться к менеджеру" : "Time to contact your manager") : null;
          return <article className="life-card" key={item.key}><button type="button" className={`life-card-open${countdown ? " has-countdown" : ""}`} aria-expanded={selected?.key === item.key} aria-controls={selected?.key === item.key ? "life-details" : undefined} onClick={(event) => { previousFocus.current = event.currentTarget; setSelectedKey(item.key); }}>
            <span className="life-card-copy"><small>{t[item.category]}</small><strong>{item.title}</strong>{item.life && lifeRentalSummary(item.life, locale) && <small>{lifeRentalSummary(item.life, locale)}</small>}{item.life && formatLifePrice(item.life, locale) && <span>{formatLifePrice(item.life, locale)}</span>}<span className="life-due"><small>{monthly && !item.date ? (locale === "ru" ? "Помесячно" : "Monthly") : item.dateLabel}</small>{monthly && !item.date ? <span>{locale === "ru" ? "Без даты окончания" : "No end date"}</span> : <time dateTime={item.date ?? undefined}>{formatLifeDate(item.date, locale)}</time>}</span>{monthly && item.life?.start_date && <span className="life-due"><small>{lifeDateLabel(item.life.kind, "start", locale)}</small><time dateTime={item.life.start_date}>{formatLifeDate(item.life.start_date, locale)}</time></span>}</span>
            {countdown && <span className={`life-countdown${countdown.expired ? " is-expired" : ""}${countdown.urgency ? ` is-${countdown.urgency}` : ""}`}><small>{countdownLabel}</small><strong style={countdown.value >= 1000 ? { fontSize: `${Math.floor(120 / String(countdown.value).length)}px` } : undefined}>{countdown.value}</strong><small>{countdown.unit}</small></span>}
            <span className="life-card-footer"><span>{item.visa ? <code>{item.status}</code> : item.status}</span><span>{t.details} →</span></span>
            {countdownNote && <span className={`life-countdown-note is-${countdown!.urgency}`}>{countdownNote}</span>}
          </button></article>;
        })}</div></section>;
      })}</div>
      {selected && <aside id="life-details" className="life-detail" aria-labelledby="life-detail-title"><button className="life-text-action" type="button" onClick={closeDetails}>← {t.close}</button><small>{t[selected.category]}</small><h2 id="life-detail-title" ref={detailHeading} tabIndex={-1}>{selected.title}</h2>
        <dl><div className="life-detail-due"><dt>{selected.dateLabel}</dt><dd>{selected.life && isMonthlyRental(selected.life) && !selected.date ? (locale === "ru" ? "Помесячно · без даты окончания" : "Monthly · no end date") : <time dateTime={selected.date ?? undefined}>{formatLifeDate(selected.date, locale)}</time>}</dd></div>
          {selected.life && <div><dt>{lifeDateLabel(selected.life.kind, otherDateBoundary, locale)}</dt><dd>{otherDate ? formatLifeDate(otherDate, locale) : otherDateBoundary === "start" ? t.noStart : t.unknown}</dd></div>}
          {selectedPrice && <div><dt>{t.price}</dt><dd>{selectedPrice}</dd></div>}
          {selected.life?.public_contact && <div><dt>{t.contact}</dt><dd>{selected.life.public_contact}</dd></div>}
          {selected.visa && <div><dt>{t.visaStatus}</dt><dd><VisaStatusHelp kind="visa" code={selected.visa.lifecycle_status} locale={locale} /></dd></div>}
        </dl>
        {selected.life?.description && <p className="life-description">{selected.life.description}</p>}
        {selectedUrl && <a className="life-link" href={selectedUrl} target="_blank" rel="noopener noreferrer">{t.link} ↗</a>}
        {selected.visa && <button className="button secondary" type="button" onClick={onOpenVisas}>{t.visaOpen}</button>}
        <button className="life-text-action" type="button" onClick={onManager}>{t.manager}</button>
      </aside>}
    </div>}
  </section>;
}
