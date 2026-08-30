import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, appApiClient } from "../api/client";

type Locale = "ru" | "en";
type UserSort = "joined_desc" | "joined_asc" | "name_asc" | "name_desc";
type UserItem = { id: number; username?: string | null; first_name?: string | null; last_name?: string | null; status: string; role: string; created_at: string; telegram_url?: string | null; visa_count: number; next_visa_expiry?: string | null; dialogue_count: number; service_count: number };
type UserPage = { items: UserItem[]; total: number; page: number; page_size: number; filters?: { service_categories?: string[] } };
type Filters = { search: string; hasVisas: boolean; expiry: "" | "7" | "15" | "30" | "45" | "60"; neverDialogued: boolean; noServices: boolean; serviceCategory: string; sort: UserSort; page: number };

const safeTelegramUrl = (value?: string | null) => value && /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/.test(value) ? value : null;

function initialFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") as UserSort | null;
  const expiry = params.get("visa_expires_within") ?? "";
  return { search: params.get("q") ?? "", hasVisas: params.get("has_visas") === "true", expiry: (["7", "15", "30", "45", "60"].includes(expiry) ? expiry : "") as Filters["expiry"], neverDialogued: params.get("never_dialogued") === "true", noServices: params.get("no_services") === "true", serviceCategory: params.get("service_category") ?? "", sort: (["joined_desc", "joined_asc", "name_asc", "name_desc"] as UserSort[]).includes(sort ?? "" as UserSort) ? sort! : "joined_desc", page: Math.max(1, Number(params.get("page")) || 1) };
}

function queryFor(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.hasVisas) params.set("has_visas", "true");
  if (filters.expiry) params.set("visa_expires_within", filters.expiry);
  if (filters.neverDialogued) params.set("never_dialogued", "true");
  if (filters.noServices) params.set("no_services", "true");
  if (filters.serviceCategory) params.set("service_category", filters.serviceCategory);
  if (filters.sort !== "joined_desc") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function AdminUsers({ locale, onOpenClient }: { locale: Locale; onOpenClient: (id: number) => void }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [draftSearch, setDraftSearch] = useState(filters.search);
  const [data, setData] = useState<UserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const copy = locale === "ru" ? { title: "Пользователи", count: "пользователей", search: "Поиск по имени, username, SAFRWAY ID или Telegram ID", searchAction: "Найти", all: "Все", visas: "Есть текущие визы", noDialogue: "Без диалогов", noServices: "Без услуг", expiry: "Срок пребывания истекает", days: "дн.", filters: "Все фильтры", service: "Услуга", anyService: "Любая услуга", sort: "Сортировка", newest: "Сначала новые", oldest: "Сначала ранние", nameAsc: "Имя А–Я", nameDesc: "Имя Я–А", reset: "Сбросить", loading: "Загружаем пользователей…", empty: "По выбранным условиям пользователей нет.", visasLabel: "Визы", servicesLabel: "Услуги", dialogueLabel: "Диалоги", joined: "В базе с", expires: "Истекает", open: "Открыть карточку", telegram: "Открыть Telegram", telegramUnavailable: "Telegram username недоступен", previous: "Назад", next: "Далее" } : { title: "Users", count: "users", search: "Search by name, username, SAFRWAY ID, or Telegram ID", searchAction: "Search", all: "All", visas: "Has current visas", noDialogue: "No conversations", noServices: "No services", expiry: "Stay ends within", days: "days", filters: "All filters", service: "Service", anyService: "Any service", sort: "Sort", newest: "Newest first", oldest: "Oldest first", nameAsc: "Name A–Z", nameDesc: "Name Z–A", reset: "Reset", loading: "Loading users…", empty: "No users match these filters.", visasLabel: "Visas", servicesLabel: "Services", dialogueLabel: "Conversations", joined: "Joined", expires: "Expires", open: "Open profile", telegram: "Open Telegram", telegramUnavailable: "Telegram username unavailable", previous: "Previous", next: "Next" };

  async function load(next: Filters, syncUrl = true) {
    setLoading(true); setError(""); const params = queryFor(next);
    try { const result = await appApiClient().request<UserPage>(`/api/web/admin/users${params.size ? `?${params}` : ""}`); setData(result); if (syncUrl) window.history.replaceState({ ...(window.history.state ?? {}), safrUsers: true }, "", `/admin/users/${params.size ? `?${params}` : ""}`); }
    catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(filters, false); }, []);
  const activeFilterCount = useMemo(() => [filters.hasVisas, !!filters.expiry, filters.neverDialogued, filters.noServices, !!filters.serviceCategory].filter(Boolean).length, [filters]);
  function apply(values: Partial<Filters>) { const next = { ...filters, ...values, page: values.page ?? 1 }; setFilters(next); void load(next); }
  function reset() { const next: Filters = { search: "", hasVisas: false, expiry: "", neverDialogued: false, noServices: false, serviceCategory: "", sort: "joined_desc", page: 1 }; setDraftSearch(""); setFilters(next); void load(next); }
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium" }).format(new Date(value));

  return <section className="admin-panel admin-users"><div className="admin-panel-head"><h2>{copy.title}</h2><span>{data?.total ?? 0} {copy.count}</span></div>{error && <div className="admin-alert" role="alert">{error}<button type="button" onClick={() => void load(filters)}>{locale === "ru" ? "Повторить" : "Retry"}</button></div>}<form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); apply({ search: draftSearch }); }}><label htmlFor="admin-user-search">{copy.search}</label><div><input id="admin-user-search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} /><button className="button secondary">{copy.searchAction}</button></div></form><div className="admin-user-chips" aria-label={copy.filters}><button type="button" aria-pressed={activeFilterCount === 0} onClick={reset}>{copy.all}</button><button type="button" aria-pressed={filters.hasVisas} onClick={() => apply({ hasVisas: !filters.hasVisas })}>{copy.visas}</button><button type="button" aria-pressed={filters.neverDialogued} onClick={() => apply({ neverDialogued: !filters.neverDialogued })}>{copy.noDialogue}</button><button type="button" aria-pressed={filters.noServices} onClick={() => apply({ noServices: !filters.noServices })}>{copy.noServices}</button>{[7, 15, 30, 45, 60].map((days) => <button type="button" key={days} aria-pressed={filters.expiry === String(days)} onClick={() => apply({ expiry: filters.expiry === String(days) ? "" : String(days) as Filters["expiry"] })}>≤ {days} {copy.days}</button>)}</div><details className="admin-user-filters"><summary>{copy.filters}{activeFilterCount ? ` · ${activeFilterCount}` : ""}</summary><div><label>{copy.service}<select value={filters.serviceCategory} onChange={(event) => apply({ serviceCategory: event.target.value })}><option value="">{copy.anyService}</option><option value="visa">Visa</option>{(data?.filters?.service_categories ?? []).filter((item) => item !== "visa").map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>{copy.expiry}<select value={filters.expiry} onChange={(event) => apply({ expiry: event.target.value as Filters["expiry"] })}><option value="">—</option>{[7, 15, 30, 45, 60].map((days) => <option key={days} value={days}>≤ {days} {copy.days}</option>)}</select></label><label>{copy.sort}<select value={filters.sort} onChange={(event) => apply({ sort: event.target.value as UserSort })}><option value="joined_desc">{copy.newest}</option><option value="joined_asc">{copy.oldest}</option><option value="name_asc">{copy.nameAsc}</option><option value="name_desc">{copy.nameDesc}</option></select></label><button type="button" onClick={reset}>{copy.reset}</button></div></details>{loading ? <div className="admin-empty" role="status">{copy.loading}</div> : !data?.items.length ? <div className="admin-empty">{copy.empty}</div> : <div className="admin-user-grid">{data.items.map((item) => { const name = [item.first_name, item.last_name].filter(Boolean).join(" ") || item.username || `${locale === "ru" ? "Пользователь" : "User"} ${item.id}`; const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); const telegram = safeTelegramUrl(item.telegram_url); return <article className="admin-user-card" key={item.id}><div className="admin-user-card-head"><span className="crm-client-avatar" aria-hidden="true">{initials}</span><span className="eyebrow">SAFRWAY ID {item.id}</span></div><h3>{name}</h3>{item.username && <span className="admin-user-handle">@{item.username.replace(/^@/, "")}</span>}<dl><div><dt>{copy.visasLabel}</dt><dd>{item.visa_count}</dd></div><div><dt>{copy.servicesLabel}</dt><dd>{item.service_count}</dd></div><div><dt>{copy.dialogueLabel}</dt><dd>{item.dialogue_count}</dd></div>{item.next_visa_expiry && <div><dt>{copy.expires}</dt><dd>{formatDate(item.next_visa_expiry)}</dd></div>}</dl><small>{copy.joined}: {formatDate(item.created_at)}</small><div className="admin-user-actions"><button type="button" onClick={() => onOpenClient(item.id)}>{copy.open}</button>{telegram ? <a href={telegram} target="_blank" rel="noopener noreferrer">{copy.telegram}</a> : <span>{copy.telegramUnavailable}</span>}</div></article>; })}</div>}{data && data.total > data.page_size && <nav className="admin-pagination" aria-label={locale === "ru" ? "Страницы пользователей" : "User pages"}><button type="button" disabled={filters.page <= 1 || loading} onClick={() => apply({ page: filters.page - 1 })}>{copy.previous}</button><span>{filters.page} / {Math.ceil(data.total / data.page_size)}</span><button type="button" disabled={filters.page >= Math.ceil(data.total / data.page_size) || loading} onClick={() => apply({ page: filters.page + 1 })}>{copy.next}</button></nav>}</section>;
}
