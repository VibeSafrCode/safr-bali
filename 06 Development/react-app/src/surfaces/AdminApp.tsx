import { useEffect, useMemo, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { adminLoginUrl } from "../runtime/browser";
import "../admin.css";
import { AdminVisaCRM } from "../components/AdminVisaCRM";
import { AppearanceControls, useAppearance } from "../components/AppearanceControls";
import { BusinessSettingsEditor, ExchangeSettingsEditor } from "../components/AdminBusinessSettings";
import { AdminReferralGraph } from "../components/AdminReferralGraph";
import { AdminVisaArchive } from "../components/AdminVisaArchive";
import { AdminManagers } from "../components/AdminManagers";
import { AdminNotificationCatalogue } from "../components/AdminNotificationCatalogue";
import { AdminUsers } from "../components/AdminUsers";
import { AdminPricingCatalog } from "../components/AdminPricingCatalog";

type AdminTab = "dashboard" | "clients" | "visa-archive" | "managers" | "users" | "referrals" | "orders" | "points" | "queues" | "settings" | "audit" | "inventory";
type Session = { authenticated: true; actor: { first_name?: string; username?: string; role: string; locale?: "ru" | "en"; allowed_tabs?: AdminTab[] }; csrf_token: string };
type PageData = { items?: Array<Record<string, unknown>>; total?: number; metrics?: Record<string, number>; rules?: Array<Record<string, unknown>>; exchange_routes?: Array<Record<string, unknown>>; visa_types?: Array<Record<string, unknown>>; services?: Array<Record<string, unknown>>; notifications?: Array<Record<string, unknown>>; document_storage?: { storage_configured: boolean; encryption_configured: boolean; scanner_configured: boolean; ready: boolean; max_bytes: number }; [key: string]: unknown };
type DashboardMetric = "new_users_7d" | "active_visa_cases" | "open_conversations" | "orders_attention" | "referral_missing_rows" | "visa_cases_attention" | "reviewed_users";
type AuditFilters = { action: string; object: string; actor: string; from: string; to: string };
type ConversationAction = { id: number; target: "open" | "closed"; expectedUpdatedAt: string; idempotencyKey: string };
const metricLabels: Record<DashboardMetric, { ru: string; en: string }> = {
  new_users_7d: { ru: "Новые пользователи за 7 дней", en: "New users in 7 days" }, active_visa_cases: { ru: "Активные визовые кейсы", en: "Active visa cases" }, open_conversations: { ru: "Открытые диалоги", en: "Open conversations" },
  orders_attention: { ru: "Заказы, требующие внимания", en: "Orders needing attention" }, referral_missing_rows: { ru: "Пробелы реферальной синхронизации", en: "Referral sync gaps" }, visa_cases_attention: { ru: "Визовые кейсы, требующие внимания", en: "Visa cases needing attention" }, reviewed_users: { ru: "Проверенные новые пользователи", en: "Reviewed new users" },
};

const referralMetricLabels: Record<string, { ru: string; en: string }> = {
  clients: { ru: "Клиенты в сети", en: "Clients in network" },
  links: { ru: "Подтверждённые связи", en: "Verified links" },
  missing_rows: { ru: "Требуют проверки", en: "Needs review" },
};

const sectionSubtitles: Record<AdminTab, { ru: string; en: string }> = {
  dashboard: { ru: "Точные показатели и доступные действия.", en: "Exact metrics and available actions." },
  clients: { ru: "Клиенты, визы и защищённые рабочие действия.", en: "Clients, visas, and protected work actions." },
  "visa-archive": { ru: "Закрытые визы, безопасное восстановление и контролируемое удаление.", en: "Closed visas, safe restore, and controlled deletion." },
  managers: { ru: "Роли сотрудников, действующий доступ и история отзывов.", en: "Staff roles, active access, and revocation history." },
  users: { ru: "Пользователи и состояние их аккаунтов.", en: "Users and their account state." },
  referrals: { ru: "Подтверждённые связи и безопасные исправления.", en: "Verified relationships and safe corrections." },
  orders: { ru: "Оплата, завершение и отмена — только ручные действия.", en: "Payment, completion, and cancellation are manual actions only." },
  points: { ru: "Неизменяемый журнал и действующие правила наград.", en: "Append-only ledger and active reward rules." },
  queues: { ru: "Понятные обращения клиентов и следующие действия.", en: "Clear client requests and next actions." },
  settings: { ru: "Понятные бизнес-параметры, версии, предпросмотр и безопасное восстановление.", en: "Human business settings with versions, preview, and safe restore." },
  audit: { ru: "Кто, что и когда изменил — без технического шума.", en: "Who changed what and when, without technical noise." },
  inventory: { ru: "Границы доступа и состояние защитных механизмов.", en: "Access boundaries and safeguard status." },
};

const tabs: Array<{ id: AdminTab; label: string; en: string }> = [
  { id: "dashboard", label: "Обзор", en: "Overview" },
  { id: "clients", label: "Клиенты", en: "Clients" },
  { id: "visa-archive", label: "Архив виз", en: "Visa archive" },
  { id: "managers", label: "Менеджеры", en: "Managers" },
  { id: "users", label: "Пользователи", en: "Users" },
  { id: "referrals", label: "Рефералы", en: "Referrals" },
  { id: "orders", label: "Заказы", en: "Orders" },
  { id: "points", label: "Points и награды", en: "Points & rewards" },
  { id: "queues", label: "Обращения клиентов", en: "Client requests" },
  { id: "settings", label: "Настройки бизнеса", en: "Business settings" },
  { id: "audit", label: "История действий", en: "Activity history" },
  { id: "inventory", label: "Система", en: "System" },
];

const actionLabels: Record<string, { ru: string; en: string }> = {
  CLIENT_MESSAGE_QUEUED: { ru: "Сообщение клиенту поставлено в очередь", en: "Client message queued" },
  NEW_USER_REVIEWED: { ru: "Новый клиент проверен", en: "New client reviewed" },
  NEW_USER_REOPENED: { ru: "Клиент возвращён в новые", en: "Client returned to new" },
  CREDENTIAL_CREATED: { ru: "Добавлен ЛК иммиграции", en: "Immigration account added" },
  CREDENTIAL_REVEAL: { ru: "Защищённый доступ показан", en: "Protected access revealed" },
  CREDENTIAL_COPY: { ru: "Защищённый доступ скопирован", en: "Protected access copied" },
  EXCHANGE_SETTINGS_VERSION_CREATED: { ru: "Создана новая версия настроек обмена", en: "Exchange settings version created" },
  EXCHANGE_SETTINGS_VERSION_RESTORED: { ru: "Настройки обмена восстановлены новой версией", en: "Exchange settings restored as a new version" },
  CONVERSATION_CLOSED: { ru: "Обращение клиента закрыто", en: "Client request closed" },
  CONVERSATION_REOPENED: { ru: "Обращение клиента открыто снова", en: "Client request reopened" },
};

function itemTitle(item: Record<string, unknown>, locale: "ru" | "en") {
  return String(item.client_name ?? item.first_name ?? item.username ?? (locale === "ru" ? "Клиент" : "Client"));
}

function routeTab(): AdminTab {
  const part = window.location.pathname.match(/^\/admin\/([^/]+)\/?/)?.[1];
  return tabs.some((tab) => tab.id === part) ? (part as AdminTab) : "dashboard";
}

function tabAllowed(tab: AdminTab, actor: Session["actor"]) {
  if (tab === "visa-archive") return actor.role === "admin" && (!actor.allowed_tabs || actor.allowed_tabs.includes("clients"));
  if (tab === "managers") return actor.role === "admin";
  return !actor.allowed_tabs || actor.allowed_tabs.includes(tab);
}

function routeQueue() {
  return window.location.pathname.match(/^\/admin\/queues\/(visa|housing|support)\/?$/)?.[1] ?? "visa";
}

function routeClientId() {
  const value = Number(window.location.pathname.match(/^\/admin\/clients\/(\d+)\/?$/)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function endpoint(tab: AdminTab, queue: string, metric: DashboardMetric | null, auditFilters: AuditFilters) {
  if (tab === "dashboard") return metric ? `/api/web/admin/dashboard/${metric}` : "/api/web/admin/dashboard";
  if (tab === "queues") return `/api/web/admin/queues/${queue}`;
  if (tab === "inventory") return "";
  if (tab === "audit") {
    const query = new URLSearchParams();
    if (auditFilters.action.trim()) query.set("action_type", auditFilters.action.trim());
    if (auditFilters.object.trim()) query.set("entity_type", auditFilters.object.trim());
    if (auditFilters.actor.trim()) query.set("actor_id", auditFilters.actor.trim());
    if (auditFilters.from) query.set("date_from", `${auditFilters.from}T00:00:00`);
    if (auditFilters.to) query.set("date_to", `${auditFilters.to}T23:59:59`);
    return `/api/web/admin/audit${query.size ? `?${query}` : ""}`;
  }
  return `/api/web/admin/${tab}`;
}

function value(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const auditFieldLabels: Record<string, { ru: string; en: string }> = {
  before: { ru: "Было", en: "Before" }, after: { ru: "Стало", en: "After" },
  status: { ru: "Статус", en: "Status" }, user_id: { ru: "Клиент", en: "Client" },
  message_id: { ru: "Сообщение", en: "Message" }, event_id: { ru: "Доставка", en: "Delivery" },
  route_code: { ru: "Маршрут", en: "Route" }, version: { ru: "Версия", en: "Version" },
  comment: { ru: "Комментарий", en: "Comment" }, reviewed: { ru: "Проверен", en: "Reviewed" },
};

const auditEntityLabels: Record<string, { ru: string; en: string }> = {
  web_conversation: { ru: "Обращение клиента", en: "Client request" },
  visa_case: { ru: "Визовый кейс", en: "Visa case" },
  user: { ru: "Клиент", en: "Client" },
  order: { ru: "Заказ", en: "Order" },
  exchange_route: { ru: "Маршрут обмена", en: "Exchange route" },
};

const auditStatusLabels: Record<string, { ru: string; en: string }> = {
  open: { ru: "Открыто", en: "Open" },
  closed: { ru: "Закрыто", en: "Closed" },
  pending: { ru: "Ожидает", en: "Pending" },
  paid: { ru: "Оплачено", en: "Paid" },
  completed: { ru: "Завершено", en: "Completed" },
  cancelled: { ru: "Отменено", en: "Cancelled" },
  failed: { ru: "Ошибка", en: "Failed" },
};

function auditLabel(key: string, locale: "ru" | "en") {
  return auditFieldLabels[key]?.[locale] ?? key.replaceAll("_", " ");
}

function auditValue(input: unknown, locale: "ru" | "en", field = ""): string {
  if (input === null || input === undefined || input === "") return "—";
  if (Array.isArray(input)) return input.map((item) => auditValue(item, locale, field)).join(", ");
  if (typeof input === "object") return Object.entries(input as Record<string, unknown>)
    .filter(([key]) => !/secret|token|password|storage_key/i.test(key))
    .map(([key, item]) => `${auditLabel(key, locale)}: ${auditValue(item, locale, key)}`).join("; ");
  if (typeof input === "boolean") return input ? (locale === "ru" ? "Да" : "Yes") : (locale === "ru" ? "Нет" : "No");
  if (field === "status") return auditStatusLabels[String(input).toLowerCase()]?.[locale] ?? (locale === "ru" ? "Неизвестный статус" : "Unknown status");
  return String(input);
}

function auditEntityLabel(input: unknown, locale: "ru" | "en") {
  return auditEntityLabels[String(input)]?.[locale] ?? (locale === "ru" ? "Объект системы" : "System object");
}

function auditDate(input: unknown, locale: "ru" | "en") {
  const parsed = new Date(String(input ?? ""));
  if (Number.isNaN(parsed.getTime())) return locale === "ru" ? "Дата не указана" : "Date unavailable";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  }).format(parsed);
}

function auditDetails(input: unknown, locale: "ru" | "en") {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([key]) => !/secret|token|password|storage_key/i.test(key))
    .map(([key, item]) => ({ label: auditLabel(key, locale), value: auditValue(item, locale, key) }));
}

export function AdminApp() {
  const [tab, setTab] = useState<AdminTab>(routeTab);
  const [queue, setQueue] = useState(routeQueue);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "denied" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [action, setAction] = useState<"paid" | "completed" | "cancelled">("paid");
  const [comment, setComment] = useState("");
  const [conversationAction, setConversationAction] = useState<ConversationAction | null>(null);
  const [conversationComment, setConversationComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dashboardMetric, setDashboardMetric] = useState<DashboardMetric | null>(() => (window.location.pathname.match(/^\/admin\/dashboard\/([^/]+)/)?.[1] as DashboardMetric) || null);
  const [initialClientId, setInitialClientId] = useState<number | null>(null);
  const [clientsRouteVersion, setClientsRouteVersion] = useState(0);
  const [settingsSection, setSettingsSection] = useState<"visas" | "exchange" | "services" | "notifications">("visas");
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({ action: "", object: "", actor: "", from: "", to: "" });
  const { theme, setTheme } = useAppearance();

  const locale = session?.actor.locale ?? "ru";
  const title = useMemo(() => { const item = tabs.find((entry) => entry.id === tab); return locale === "en" ? item?.en ?? "Overview" : item?.label ?? "Обзор"; }, [tab, locale]);

  async function loadSession() {
    setState("loading");
    try {
      const result = await appApiClient().request<Session>("/api/web/admin/session");
      document.documentElement.lang = result.actor.locale === "en" ? "en" : "ru";
      if (!tabAllowed(routeTab(), result.actor)) {
        window.history.replaceState({}, "", "/admin/clients/");
        setTab("clients");
        setInitialClientId(null);
        setClientsRouteVersion((value) => value + 1);
      }
      setSession(result);
      setState("ready");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setState("guest");
      else if (caught instanceof ApiError && caught.status === 403) setState("denied");
      else { setError(apiErrorMessage(caught)); setState("error"); }
    }
  }

  async function loadData(filters: AuditFilters = auditFilters) {
    if (!session) return;
    if (!tabAllowed(tab, session.actor)) { setData({ items: [] }); return; }
    if (tab === "inventory" || tab === "clients" || tab === "visa-archive" || tab === "managers" || tab === "users") { setData({ items: [] }); return; }
    setData(null);
    try {
      setData(await appApiClient().request<PageData>(endpoint(tab, queue, dashboardMetric, filters)));
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  async function changeLocale(locale: "ru" | "en") {
    if (!session || session.actor.locale === locale) return;
    try {
      await appApiClient().request("/api/web/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ locale }),
      });
      setSession({ ...session, actor: { ...session.actor, locale } });
      document.documentElement.lang = locale;
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  useEffect(() => { void loadSession(); }, []);
  useEffect(() => { void loadData(); }, [session, tab, queue, dashboardMetric]);
  useEffect(() => {
    const onPopState = () => {
      const next = routeTab();
      setTab(next);
      setQueue(routeQueue());
      setDashboardMetric((window.location.pathname.match(/^\/admin\/dashboard\/([^/]+)/)?.[1] as DashboardMetric) || null);
      if (next === "clients") {
        setInitialClientId(routeClientId());
        setClientsRouteVersion((value) => value + 1);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!selectedOrder && !conversationAction) return;
    const dialog = [...document.querySelectorAll<HTMLElement>('.admin-overlay[role="dialog"]')].at(-1);
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if ([...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1) !== dialog) return;
      if (event.key === "Escape" && !submitting) {
        event.preventDefault(); setSelectedOrder(null); setConversationAction(null); setConversationComment("");
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusable(); if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousBodyOverflow; previousFocus?.focus(); };
  }, [selectedOrder, conversationAction, submitting]);

  function navigate(next: AdminTab) {
    window.history.pushState({}, "", next === "dashboard" ? "/admin/" : `/admin/${next}/`);
    setTab(next);
    if (next === "clients") {
      setInitialClientId(null);
      setClientsRouteVersion((value) => value + 1);
    }
    if (next !== "dashboard") setDashboardMetric(null);
  }

  function openMetric(metric: DashboardMetric) {
    window.history.pushState({ metric }, "", `/admin/dashboard/${metric}/`);
    setDashboardMetric(metric); setData(null);
  }

  function openMetricClient(item: Record<string, unknown>) {
    const id = Number(item.user_id ?? item.id);
    if (!Number.isFinite(id)) return;
    window.history.pushState({ safrClientDetail: true }, "", `/admin/clients/${id}/`);
    setInitialClientId(id); setClientsRouteVersion((value) => value + 1); setDashboardMetric(null); setTab("clients");
  }

  async function reviewNewUser(id: number, reviewed = true) {
    if (!session || submitting) return; setSubmitting(true);
    try {
      await appApiClient().request(`/api/web/admin/users/${id}/new-review`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token }, body: JSON.stringify({ reviewed, comment: reviewed ? "Reviewed from dashboard drill-down" : "Returned to new users from reviewed list" }) });
      await loadData();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  async function submitOrder() {
    if (!session || !selectedOrder || !comment.trim()) return;
    setSubmitting(true);
    try {
      await appApiClient().request(`/api/web/admin/orders/${selectedOrder}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ target: action, comment }),
      });
      setSelectedOrder(null); setComment(""); await loadData();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  function beginConversationAction(item: Record<string, unknown>) {
    const id = Number(item.id);
    const expectedUpdatedAt = String(item.updated_at ?? "");
    if (!Number.isFinite(id) || !expectedUpdatedAt) return;
    setConversationComment("");
    setConversationAction({ id, target: item.status === "open" ? "closed" : "open", expectedUpdatedAt, idempotencyKey: crypto.randomUUID() });
  }

  async function submitConversationAction() {
    if (!session || !conversationAction || !conversationComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await appApiClient().request(`/api/web/admin/conversations/${conversationAction.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token, "Idempotency-Key": conversationAction.idempotencyKey },
        body: JSON.stringify({ status: conversationAction.target, expected_updated_at: conversationAction.expectedUpdatedAt, comment: conversationComment.trim() }),
      });
      setConversationAction(null); setConversationComment(""); await loadData();
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setSubmitting(false); }
  }

  if (state !== "ready" || !session) {
    return <main className="admin-status"><span className="brand"><span className="brand-mark">S</span>SAFRWAY</span><section><span className="eyebrow">Admin</span><h1>{state === "loading" ? "Проверяем доступ…" : state === "guest" ? "Войдите через Telegram" : state === "denied" ? "Недостаточно прав" : "Admin временно недоступен"}</h1><p>{state === "denied" ? "Эта сессия не имеет роли admin." : error}</p>{state === "guest" && <a className="button primary" href={adminLoginUrl()}>Войти</a>}</section></main>;
  }

  const items = data?.items ?? [];
  const visibleTabs = tabs.filter((item) => tabAllowed(item.id, session.actor));
  return <div className="admin-shell">
    <aside className="admin-sidebar"><span className="brand"><span className="brand-mark">S</span>SAFRWAY</span><nav aria-label={locale === "ru" ? "Разделы администратора" : "Admin sections"}>{visibleTabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>{locale === "en" ? item.en : item.label}</button>)}</nav><p><strong>{session.actor.first_name ?? session.actor.username ?? (locale === "ru" ? "Администратор" : "Administrator")}</strong><br />{locale === "ru" ? "Роль" : "Role"}: {session.actor.role}</p></aside>
    <main className="admin-main"><header className="admin-top"><div><span className="eyebrow">SAFRWAY operations</span><strong>{title}</strong></div><div className="admin-top-tools"><AppearanceControls locale={session.actor.locale ?? "ru"} onLocaleChange={(next) => void changeLocale(next)} theme={theme} onThemeChange={setTheme} /><span className="admin-badge">{session.actor.first_name ?? session.actor.username ?? "Admin"}</span></div></header><nav className="admin-mobile" aria-label={locale === "ru" ? "Мобильная навигация" : "Mobile navigation"}>{visibleTabs.filter((item) => ["dashboard", "clients", "visa-archive", "managers", "orders", "queues", "audit"].includes(item.id)).map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>{locale === "en" ? item.en : item.label}</button>)}</nav><div className="admin-content">
      {error && <div className="admin-alert" role="alert">{error}<button onClick={() => setError("")}>{locale === "ru" ? "Закрыть" : "Close"}</button></div>}
      <header className="admin-heading"><h1>{title}</h1><p>{sectionSubtitles[tab][locale]}</p></header>
      {tab === "settings" && <AdminPricingCatalog csrfToken={session.csrf_token} locale={locale} />}
      {tab === "visa-archive" && <AdminVisaArchive csrfToken={session.csrf_token} locale={locale} />}
      {tab === "managers" && <AdminManagers csrfToken={session.csrf_token} locale={locale} />}
      {tab === "dashboard" && !dashboardMetric && !data && <div className="admin-empty" role="status">{locale === "ru" ? "Загружаем показатели…" : "Loading metrics…"}</div>}
      {tab === "dashboard" && !dashboardMetric && data && <div className="admin-metrics">{Object.entries(data).map(([key, count]) => <button type="button" key={key} onClick={() => openMetric(key as DashboardMetric)}><span>{metricLabels[key as DashboardMetric]?.[locale] ?? key.replaceAll("_", " ")}</span><strong>{value(count)}</strong><small>{locale === "ru" ? "Открыть список →" : "Open list →"}</small></button>)}</div>}
      {tab === "dashboard" && dashboardMetric && <section className="admin-panel"><div className="admin-panel-head"><div><button type="button" className="admin-back" onClick={() => { window.history.pushState({}, "", "/admin/"); setDashboardMetric(null); }}>← {locale === "ru" ? "Обзор" : "Overview"}</button><h2>{metricLabels[dashboardMetric][locale]}</h2>{dashboardMetric === "new_users_7d" && <button type="button" onClick={() => openMetric("reviewed_users")}>{locale === "ru" ? "Показать проверенных" : "Show reviewed"}</button>}</div><span>{data ? `${data.total ?? 0} ${locale === "ru" ? "записей" : "items"}` : locale === "ru" ? "Обновляем…" : "Refreshing…"}</span></div>{!data ? <div className="admin-empty">{locale === "ru" ? "Загружаем точный фильтр…" : "Loading exact filter…"}</div> : !(data.items?.length) ? <div className="admin-empty">{locale === "ru" ? "По этому фильтру записей нет." : "No items match this filter."}</div> : <div className="admin-card-grid">{data.items.map((item, index) => <article className="admin-entity-card" key={String(item.id ?? index)}><button type="button" className="admin-card-main" onClick={() => dashboardMetric === "orders_attention" ? setSelectedOrder(Number(item.id)) : dashboardMetric === "referral_missing_rows" ? undefined : openMetricClient(item)}><span className="eyebrow">{dashboardMetric === "orders_attention" ? (locale === "ru" ? "Заказ" : "Order") : locale === "ru" ? "Клиент" : "Client"}</span><strong>{itemTitle(item, locale)}</strong><small>{value(item.created_at ?? item.updated_at)}</small><span>{value(item.lifecycle_status ?? item.status)}</span><span>{value(item.service_status ?? item.payment_status)}</span></button>{dashboardMetric === "new_users_7d" && <button type="button" disabled={submitting} onClick={() => void reviewNewUser(Number(item.id), true)}>{locale === "ru" ? "Убрать из новых" : "Mark reviewed"}</button>}{dashboardMetric === "reviewed_users" && <button type="button" disabled={submitting} onClick={() => void reviewNewUser(Number(item.id), false)}>{locale === "ru" ? "Вернуть в новые" : "Return to new"}</button>}{dashboardMetric === "open_conversations" && <button type="button" disabled={submitting} onClick={() => beginConversationAction(item)}>{locale === "ru" ? "Закрыть обращение" : "Close request"}</button>}{dashboardMetric === "referral_missing_rows" && <span className="admin-risk">{locale === "ru" ? "Только проверка; автоматический ремонт запрещён." : "Review only; no blind repair."}</span>}</article>)}</div>}</section>}
      {tab === "audit" && <form className="admin-audit-filters" onSubmit={(event) => { event.preventDefault(); void loadData(auditFilters); }}><label>{locale === "ru" ? "Действие" : "Action"}<input value={auditFilters.action} onChange={(event) => setAuditFilters({ ...auditFilters, action: event.target.value })} placeholder="CASE_UPDATED" /></label><label>{locale === "ru" ? "Объект" : "Object"}<input value={auditFilters.object} onChange={(event) => setAuditFilters({ ...auditFilters, object: event.target.value })} placeholder="visa_case" /></label><label>{locale === "ru" ? "Кто (ID)" : "Actor (ID)"}<input type="number" min="1" value={auditFilters.actor} onChange={(event) => setAuditFilters({ ...auditFilters, actor: event.target.value })} /></label><label>{locale === "ru" ? "С даты" : "From"}<input type="date" value={auditFilters.from} onChange={(event) => setAuditFilters({ ...auditFilters, from: event.target.value })} /></label><label>{locale === "ru" ? "По дату" : "To"}<input type="date" value={auditFilters.to} onChange={(event) => setAuditFilters({ ...auditFilters, to: event.target.value })} /></label><div><button type="submit">{locale === "ru" ? "Применить" : "Apply"}</button><button type="button" onClick={() => { const empty = { action: "", object: "", actor: "", from: "", to: "" }; setAuditFilters(empty); void loadData(empty); }}>{locale === "ru" ? "Сбросить" : "Reset"}</button></div></form>}
      {tab === "queues" && <div className="admin-tabs" aria-label={locale === "ru" ? "Фильтр обращений" : "Request filter"}>{([['visa', locale === 'ru' ? 'Визы' : 'Visas'], ['housing', locale === 'ru' ? 'Недвижимость' : 'Housing'], ['support', locale === 'ru' ? 'Поддержка' : 'Support']] as const).map(([id, label]) => <button className={queue === id ? "active" : ""} onClick={() => setQueue(id)} key={id}>{label}</button>)}</div>}
      {tab === "referrals" && data?.metrics && <><div className="admin-metrics">{Object.entries(data.metrics).map(([key, count]) => <article key={key}><span>{referralMetricLabels[key]?.[locale] ?? (locale === "ru" ? "Показатель сети" : "Network metric")}</span><strong>{count}</strong></article>)}</div><AdminReferralGraph locale={locale} csrfToken={session.csrf_token} /></>}
      {tab === "settings" && settingsSection === "exchange" && data && <section className="admin-panel admin-exchange-management"><div className="admin-panel-head"><div><span className="eyebrow">Versioned settings</span><h2>{locale === "ru" ? "Маршруты обмена" : "Exchange routes"}</h2></div><span>{data.exchange_routes?.length ?? 0}</span></div><div className="admin-card-grid">{(data.exchange_routes ?? []).map((item) => <article className="admin-entity-card" key={String(item.route_code)}><span className="eyebrow">{value(item.route_code)}</span><h3>{locale === "ru" ? `Активная версия ${value(item.version)}` : `Active version ${value(item.version)}`}</h3><p>{locale === "ru" ? "Все доступные параметры показаны понятными полями внутри редактора. Перед записью обязательны предпросмотр и причина." : "All supported parameters are exposed as labelled fields. Preview and a reason are required before writing."}</p><ExchangeSettingsEditor route={item as { route_code: string; version: number; settings: Record<string, unknown> }} csrfToken={session.csrf_token} locale={locale} onChanged={loadData} /></article>)}</div><p className="admin-risk">{locale === "ru" ? "Сохранение создаёт новую неизменяемую версию. Историю можно восстановить только созданием следующей версии; raw JSON и перезапись старых расчётов запрещены." : "Saving creates a new immutable version. Restore creates another version; raw JSON and rewriting old quote snapshots are prohibited."}</p></section>}
      {tab === "clients" ? <AdminVisaCRM key={clientsRouteVersion} csrfToken={session.csrf_token} initialClientId={initialClientId} locale={locale} actorRole={session.actor.role} /> : tab === "inventory" ? <section className="admin-panel"><h2>{locale === "ru" ? "Безопасность системы" : "System safeguards"}</h2><ul><li>{locale === "ru" ? "Admin, кабинет и Mini App используют одну Telegram-сессию без браузерного service token." : "Admin, account and Mini App share one Telegram session without a browser service token."}</li><li>{locale === "ru" ? "Записи защищены Origin, CSRF, RBAC, idempotency и аудитом." : "Writes are protected by Origin, CSRF, RBAC, idempotency and audit."}</li><li>{locale === "ru" ? "Документы и доступы остаются fail-closed без настроенного защищённого хранилища и ключа." : "Documents and credentials remain fail-closed without configured protected storage and key."}</li></ul></section> : tab === "settings" ? <section className="admin-panel admin-settings"><div className="admin-tabs" aria-label={locale === "ru" ? "Раздел настроек" : "Settings section"}>{([['visas', locale === 'ru' ? 'Визы' : 'Visas'],['exchange', locale === 'ru' ? 'Обменник' : 'Exchange'],['services', locale === 'ru' ? 'Услуги' : 'Services'],['notifications', locale === 'ru' ? 'Уведомления' : 'Notifications']] as const).map(([id,label]) => <button key={id} className={settingsSection === id ? "active" : ""} onClick={() => setSettingsSection(id)}>{label}</button>)}</div>{!data ? <div className="admin-empty">{locale === "ru" ? "Загружаем подтверждённые настройки…" : "Loading verified settings…"}</div> : settingsSection === "visas" ? <div className="admin-card-grid">{(data.visa_types ?? []).map((item) => <article className="admin-entity-card" key={`${item.code}-${item.version}`}><span className="eyebrow">{locale === "ru" ? "Тип визы" : "Visa type"}</span><h3>{value(item.name)}</h3><dl><div><dt>{locale === "ru" ? "Код" : "Code"}</dt><dd>{value(item.code)}</dd></div><div><dt>{locale === "ru" ? "Версия" : "Version"}</dt><dd>{value(item.version)}</dd></div><div><dt>{locale === "ru" ? "Правила" : "Rules"}</dt><dd>{item.rules_verified ? (locale === "ru" ? "проверены" : "verified") : (locale === "ru" ? "ручной режим" : "manual")}</dd></div></dl><BusinessSettingsEditor entityType="visa" entity={item as unknown as { code: string; name: string; settings_version: number; active: boolean; rules_verified: boolean }} csrfToken={session.csrf_token} locale={locale} onChanged={loadData} /></article>)}</div> : settingsSection === "exchange" ? <div className="admin-card-grid">{(data.exchange_routes ?? []).map((item) => { const settings = (item.settings ?? {}) as Record<string, unknown>; return <article className="admin-entity-card" key={String(item.route_code)}><span className="eyebrow">{value(item.route_code)}</span><h3>{locale === "ru" ? "Маршрут обмена" : "Exchange route"}</h3><dl><div><dt>{locale === "ru" ? "Версия" : "Version"}</dt><dd>{value(item.version)}</dd></div><div><dt>{locale === "ru" ? "Комиссия SAFRWAY" : "SAFRWAY fee"}</dt><dd>{value(settings.safrway_fee_percent)}%</dd></div><div><dt>{locale === "ru" ? "Минимальная комиссия" : "Minimum fee"}</dt><dd>{value(settings.safrway_min_fee)} {value(settings.safrway_min_fee_currency)}</dd></div><div><dt>{locale === "ru" ? "Лимит котировки" : "Quote TTL"}</dt><dd>{value(settings.quote_ttl_seconds)} sec</dd></div></dl><p><small>{locale === "ru" ? "Изменение создаёт новую версию; текущая версия остаётся в истории и снимках расчётов." : "A change creates a new version; the current version remains in history and quote snapshots."}</small></p></article>; })}</div> : settingsSection === "services" ? <div className="admin-card-grid">{(data.services ?? []).map((item) => <article className="admin-entity-card" key={String(item.slug)}><span className="eyebrow">{value(item.category)}</span><h3>{value(item.name)}</h3><p>{item.is_active ? (locale === "ru" ? "Доступна" : "Available") : (locale === "ru" ? "Скрыта" : "Hidden")}</p><small>{item.can_pay_with_points ? "SAFR Points" : locale === "ru" ? "Оплата Points отключена" : "Points disabled"}</small><BusinessSettingsEditor entityType="service" entity={item as unknown as { slug: string; name: string; settings_version: number; description?: string; category?: string; is_active: boolean; can_pay_with_points: boolean }} csrfToken={session.csrf_token} locale={locale} onChanged={loadData} /></article>)}</div> : <><AdminNotificationCatalogue locale={locale} /><p className="admin-risk">{locale === "ru" ? "Переключатель согласия находится в карточке каждой визы. UNKNOWN никогда не повторяется автоматически." : "Consent is managed per visa case. UNKNOWN is never retried automatically."}</p></>}<p className="admin-risk">{locale === "ru" ? "Показываются только реальные поля backend. Цены, отсутствующие в канонической модели, не подменяются выдуманными значениями." : "Only real backend fields are exposed. Prices absent from the canonical model are not replaced with invented values."}</p></section> : tab !== "dashboard" && tab !== "visa-archive" && tab !== "managers" && tab !== "users" && <section className="admin-panel"><div className="admin-panel-head"><h2>{title}</h2><span>{data ? `${data.total ?? items.length} ${locale === "ru" ? "записей" : "items"}` : locale === "ru" ? "Загрузка…" : "Loading…"}</span></div>{!data ? <div className="admin-empty">{locale === "ru" ? "Загружаем данные…" : "Loading data…"}</div> : items.length === 0 ? <div className="admin-empty">{locale === "ru" ? "По выбранным условиям записей нет." : "No items match the filter."}</div> : <div className="admin-card-grid">{items.map((item, index) => <article className="admin-entity-card" key={String(item.id ?? index)}><button type="button" className="admin-card-main" onClick={() => Number.isFinite(Number(item.user_id ?? item.id)) && (tab === "queues" ? openMetricClient(item) : undefined)}><span className="eyebrow">{tab === "queues" ? value(item.request_kind) : tab === "audit" ? (locale === "ru" ? "Событие" : "Event") : title}</span><strong>{tab === "audit" ? (actionLabels[String(item.action_type)]?.[locale] ?? String(item.action_type ?? (locale === "ru" ? "Действие" : "Action")).replaceAll("_", " ")) : itemTitle(item, locale)}</strong><small>{tab === "audit" ? auditDate(item.created_at ?? item.updated_at, locale) : value(item.created_at ?? item.updated_at)}</small>{tab === "queues" && <><span>{value(item.request_title)}</span><span>{locale === "ru" ? "Статус" : "Status"}: {value(item.status)}</span></>}{tab === "orders" && <><span>{value(item.service)}</span><span>{value(item.status)} · {value(item.payment_status)}</span></>}{tab === "audit" && <><span>{locale === "ru" ? "Кто" : "Actor"}: {value(item.actor_name)}</span><span>{locale === "ru" ? "Объект" : "Object"}: {auditEntityLabel(item.entity_type, locale)} #{value(item.entity_id)}</span>{Boolean(item.comment) && <span>{locale === "ru" ? "Комментарий" : "Comment"}: {value(item.comment)}</span>}{auditDetails(item.details, locale).length > 0 && <span className="admin-audit-context">{auditDetails(item.details, locale).map((detail, detailIndex) => <span key={`${detail.label}-${detailIndex}`}><strong>{detail.label}:</strong> {detail.value}</span>)}</span>}</>}{tab !== "queues" && tab !== "orders" && tab !== "audit" && <span>{value(item.status ?? item.operation_type ?? item.source)}</span>}</button>{tab === "queues" && <button type="button" disabled={submitting} onClick={() => beginConversationAction(item)}>{item.status === "open" ? (locale === "ru" ? "Закрыть обращение" : "Close request") : (locale === "ru" ? "Открыть снова" : "Reopen request")}</button>}{tab === "orders" && <button onClick={() => setSelectedOrder(Number(item.id))}>{locale === "ru" ? "Действия" : "Actions"}</button>}</article>)}</div>}</section>}
      {tab === "users" && <AdminUsers locale={locale} onOpenClient={(id) => openMetricClient({ id })} />}
    </div></main>
    {selectedOrder && <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby="order-action-title"><section><span className="eyebrow">Двойное подтверждение</span><h2 id="order-action-title">Изменить заказ #{selectedOrder}</h2><label>Действие<select value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="paid">Подтвердить оплату</option><option value="completed">Завершить</option><option value="cancelled">Отменить</option></select></label><p className="admin-risk">Завершение возможно только после оплаты. Отмена начисленного reward создаёт append-only reversal.</p><label>Причина<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label><div><button onClick={() => setSelectedOrder(null)}>Назад</button><button className="danger" disabled={!comment.trim() || submitting} onClick={() => void submitOrder()}>{submitting ? "Сохраняем…" : "Подтвердить"}</button></div></section></div>}
    {conversationAction && <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby="conversation-action-title"><section><span className="eyebrow">{locale === "ru" ? "Аудируемое действие" : "Audited action"}</span><h2 id="conversation-action-title">{conversationAction.target === "closed" ? (locale === "ru" ? "Закрыть обращение?" : "Close request?") : (locale === "ru" ? "Открыть обращение снова?" : "Reopen request?")}</h2><p>{conversationAction.target === "closed" ? (locale === "ru" ? "Обращение исчезнет из счётчика открытых, но история диалога сохранится." : "The request leaves the open counter, while its dialogue history remains intact.") : (locale === "ru" ? "Обращение снова появится в списке открытых без изменения истории." : "The request returns to the open list without changing its history.")}</p><label>{locale === "ru" ? "Причина" : "Reason"}<textarea autoFocus value={conversationComment} onChange={(event) => setConversationComment(event.target.value)} /></label><div><button type="button" disabled={submitting} onClick={() => { setConversationAction(null); setConversationComment(""); }}>{locale === "ru" ? "Отмена" : "Cancel"}</button><button type="button" className="danger" disabled={submitting || conversationComment.trim().length < 3} onClick={() => void submitConversationAction()}>{submitting ? (locale === "ru" ? "Сохраняем…" : "Saving…") : conversationAction.target === "closed" ? (locale === "ru" ? "Закрыть обращение" : "Close request") : (locale === "ru" ? "Открыть снова" : "Reopen")}</button></div></section></div>}
  </div>;
}
