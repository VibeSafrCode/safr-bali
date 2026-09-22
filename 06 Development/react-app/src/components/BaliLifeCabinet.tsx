import { useEffect, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import type { VisaCase } from "../api/types";
import { VisaStatusHelp } from "./VisaStatusHelp";
import { visaDatePresentation } from "./VisaCabinet";
import { baliToday, formatLifeDate, formatLifePrice, lifeCopy, lifeDateLabel, lifeGroup, lifeStatus, safeLifeUrl, type LifeGroup, type LifeKind, type LifeLocale, type LifeService } from "./lifeServices";
import "./life-services.css";

type Props = { apiPrefix: "/api/web" | "/mini-app"; userId: number; locale: LifeLocale; onBack: () => void; onOpenVisas: () => void; onManager: () => void };
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
    ...(data?.life ?? []).map((item): Summary => ({ key: `life-${item.id}`, category: item.kind, title: item.title || t[item.kind], group: lifeGroup(item, today), date: item.end_date, dateLabel: lifeDateLabel(item.kind, "end", locale), status: lifeStatus(item, today, locale), life: item })),
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

  return <section className="bali-life page-stack" onKeyDown={(event) => { if (event.key === "Escape" && selected) { event.preventDefault(); closeDetails(); } }}>
    <button className="life-text-action" type="button" onClick={onBack}>← {t.back}</button>
    <header className="page-heading"><span className="eyebrow">SAFRWAY · Bali</span><h1>{t.title}</h1><p>{t.intro}</p></header>
    <div className="life-toolbar"><small>{t.dateZone}</small><button type="button" className="life-text-action" disabled={requestState === "loading"} onClick={() => reload.current()}>{requestState === "loading" && data ? t.refreshing : t.refresh}</button></div>
    <nav className="life-categories" aria-label={t.title}>{(["visa", "housing", "bike", "insurance"] as const).map((kind) => <button type="button" key={kind} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setSelectedKey(null); }}><span>{t[kind]}</span><strong>{data ? summaries.filter((item) => item.category === kind).length : "—"}</strong></button>)}</nav>
    <button ref={allButton} type="button" className="life-all" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setSelectedKey(null); }}>{t.all}{data ? ` · ${summaries.length}` : ""}</button>
    {requestState === "loading" && !data && <p role="status">{t.loading}</p>}
    {requestState === "error" && <div className="life-notice" role="alert"><p>{authError ? t.session : t.error}</p><button className="button secondary" type="button" onClick={() => reload.current()}>{t.retry}</button></div>}
    {data && !filtered.length && <div className="life-notice"><p>{summaries.length ? t.emptyCategory : t.empty}</p><button className="button secondary" type="button" onClick={onManager}>{t.manager}</button></div>}
    {data && filtered.length > 0 && <div className={`life-layout${selected ? " has-selection" : ""}`}>
      <div className="life-lists">{(["current", "future", "history"] as const).map((group) => {
        const records = filtered.filter((item) => item.group === group);
        if (!records.length) return null;
        return <section className="life-group" key={group} aria-labelledby={`life-${group}`}><h2 id={`life-${group}`}>{t[group]}</h2><div className="life-card-grid">{records.map((item) => <article className="life-card" key={item.key}><button type="button" className="life-card-open" aria-expanded={selected?.key === item.key} aria-controls={selected?.key === item.key ? "life-details" : undefined} onClick={(event) => { previousFocus.current = event.currentTarget; setSelectedKey(item.key); }}><small>{t[item.category]}</small><strong>{item.title}</strong><span className="life-due"><small>{item.dateLabel}</small><time dateTime={item.date ?? undefined}>{formatLifeDate(item.date, locale)}</time></span><span className="life-card-footer"><span>{item.visa ? <code>{item.status}</code> : item.status}</span><span>{t.details} →</span></span></button></article>)}</div></section>;
      })}</div>
      {selected && <aside id="life-details" className="life-detail" aria-labelledby="life-detail-title"><button className="life-text-action" type="button" onClick={closeDetails}>← {t.close}</button><small>{t[selected.category]}</small><h2 id="life-detail-title" ref={detailHeading} tabIndex={-1}>{selected.title}</h2>
        <dl><div className="life-detail-due"><dt>{selected.dateLabel}</dt><dd><time dateTime={selected.date ?? undefined}>{formatLifeDate(selected.date, locale)}</time></dd></div>
          {selected.life && <div><dt>{lifeDateLabel(selected.life.kind, "start", locale)}</dt><dd>{selected.life.start_date ? formatLifeDate(selected.life.start_date, locale) : t.noStart}</dd></div>}
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
