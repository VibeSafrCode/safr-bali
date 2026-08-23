import { useEffect, useMemo, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import { adminLoginUrl } from "../runtime/browser";
import "../admin.css";
import { AdminVisaCRM } from "../components/AdminVisaCRM";

type AdminTab = "dashboard" | "clients" | "users" | "referrals" | "orders" | "points" | "queues" | "settings" | "audit" | "inventory";
type Session = { authenticated: true; actor: { first_name?: string; username?: string; role: string; locale?: "ru" | "en" }; csrf_token: string };
type PageData = { items?: Array<Record<string, unknown>>; total?: number; metrics?: Record<string, number>; rules?: Array<Record<string, unknown>>; exchange_routes?: unknown[]; [key: string]: unknown };
type DashboardMetric = "new_users_7d" | "active_visa_cases" | "open_conversations" | "orders_attention" | "referral_missing_rows" | "visa_cases_attention" | "reviewed_users";
const metricLabels: Record<DashboardMetric, string> = { new_users_7d: "Новые пользователи за 7 дней", active_visa_cases: "Активные визовые кейсы", open_conversations: "Открытые диалоги", orders_attention: "Заказы, требующие внимания", referral_missing_rows: "Пробелы реферальной синхронизации", visa_cases_attention: "Визовые кейсы, требующие внимания", reviewed_users: "Проверенные новые пользователи" };

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "Обзор" },
  { id: "clients", label: "Клиенты" },
  { id: "users", label: "Пользователи" },
  { id: "referrals", label: "Рефералы" },
  { id: "orders", label: "Заказы" },
  { id: "points", label: "Points и награды" },
  { id: "queues", label: "Очереди" },
  { id: "settings", label: "Настройки" },
  { id: "audit", label: "Аудит" },
  { id: "inventory", label: "Контракт" },
];

function routeTab(): AdminTab {
  const part = window.location.pathname.match(/^\/admin\/([^/]+)\/?/)?.[1];
  return tabs.some((tab) => tab.id === part) ? (part as AdminTab) : "dashboard";
}

function routeQueue() {
  return window.location.pathname.match(/^\/admin\/queues\/(visa|housing|support)\/?$/)?.[1] ?? "visa";
}

function endpoint(tab: AdminTab, queue: string, metric: DashboardMetric | null) {
  if (tab === "dashboard") return metric ? `/api/web/admin/dashboard/${metric}` : "/api/web/admin/dashboard";
  if (tab === "queues") return `/api/web/admin/queues/${queue}`;
  if (tab === "inventory") return "";
  return `/api/web/admin/${tab}`;
}

function value(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
  const [submitting, setSubmitting] = useState(false);
  const [dashboardMetric, setDashboardMetric] = useState<DashboardMetric | null>(() => (window.location.pathname.match(/^\/admin\/dashboard\/([^/]+)/)?.[1] as DashboardMetric) || null);
  const [initialClientId, setInitialClientId] = useState<number | null>(null);

  const title = useMemo(() => tabs.find((item) => item.id === tab)?.label ?? "Обзор", [tab]);

  async function loadSession() {
    setState("loading");
    try {
      const result = await appApiClient().request<Session>("/api/web/admin/session");
      setSession(result);
      setState("ready");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setState("guest");
      else if (caught instanceof ApiError && caught.status === 403) setState("denied");
      else { setError(apiErrorMessage(caught)); setState("error"); }
    }
  }

  async function loadData() {
    if (!session) return;
    if (tab === "inventory" || tab === "clients") { setData({ items: [] }); return; }
    setData(null);
    try {
      setData(await appApiClient().request<PageData>(endpoint(tab, queue, dashboardMetric)));
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  useEffect(() => { void loadSession(); }, []);
  useEffect(() => { void loadData(); }, [session, tab, queue, dashboardMetric]);

  function navigate(next: AdminTab) {
    window.history.pushState({}, "", next === "dashboard" ? "/admin/" : `/admin/${next}/`);
    setTab(next);
    if (next !== "dashboard") setDashboardMetric(null);
  }

  function openMetric(metric: DashboardMetric) {
    window.history.pushState({ metric }, "", `/admin/dashboard/${metric}/`);
    setDashboardMetric(metric); setData(null);
  }

  function openMetricClient(item: Record<string, unknown>) {
    const id = Number(item.user_id ?? item.id);
    if (!Number.isFinite(id)) return;
    window.history.pushState({}, "", "/admin/clients/");
    setInitialClientId(id); setDashboardMetric(null); setTab("clients");
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

  if (state !== "ready" || !session) {
    return <main className="admin-status"><span className="brand"><span className="brand-mark">S</span>SAFRWAY</span><section><span className="eyebrow">Admin</span><h1>{state === "loading" ? "Проверяем доступ…" : state === "guest" ? "Войдите через Telegram" : state === "denied" ? "Недостаточно прав" : "Admin временно недоступен"}</h1><p>{state === "denied" ? "Эта сессия не имеет роли admin." : error}</p>{state === "guest" && <a className="button primary" href={adminLoginUrl()}>Войти</a>}</section></main>;
  }

  const items = data?.items ?? [];
  return <div className="admin-shell">
    <aside className="admin-sidebar"><span className="brand"><span className="brand-mark">S</span>SAFRWAY</span><nav aria-label="Разделы администратора">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav><p><strong>{session.actor.first_name ?? session.actor.username ?? "Администратор"}</strong><br />Роль: {session.actor.role}</p></aside>
    <main className="admin-main"><header className="admin-top"><div><span className="eyebrow">SAFRWAY operations</span><strong>{title}</strong></div><span className="admin-badge">server session</span></header><div className="admin-content">
      {error && <div className="admin-alert" role="alert">{error}<button onClick={() => setError("")}>Закрыть</button></div>}
      <header className="admin-heading"><h1>{title}</h1><p>{tab === "orders" ? "Оплата, завершение и отмена — только ручные actor-bound действия." : tab === "points" ? "Append-only ledger и действующие правила наград." : tab === "settings" ? "Только подтверждённые versioned exchange settings." : "Данные загружаются из канонического backend без клиентских секретов."}</p></header>
      {tab === "dashboard" && !dashboardMetric && !data && <div className="admin-empty" role="status">Загружаем показатели…</div>}
      {tab === "dashboard" && !dashboardMetric && data && <div className="admin-metrics">{Object.entries(data).map(([key, count]) => <button type="button" key={key} onClick={() => openMetric(key as DashboardMetric)}><span>{metricLabels[key as DashboardMetric] ?? key.replaceAll("_", " ")}</span><strong>{value(count)}</strong><small>Открыть список →</small></button>)}</div>}
      {tab === "dashboard" && dashboardMetric && <section className="admin-panel"><div className="admin-panel-head"><div><button type="button" className="admin-back" onClick={() => { window.history.pushState({}, "", "/admin/"); setDashboardMetric(null); }}>← Обзор</button><h2>{metricLabels[dashboardMetric]}</h2>{dashboardMetric === "new_users_7d" && <button type="button" onClick={() => openMetric("reviewed_users")}>Показать проверенных</button>}</div><span>{data ? `${data.total ?? 0} записей` : "Обновляем…"}</span></div>{!data ? <div className="admin-empty">Загружаем точный фильтр…</div> : !(data.items?.length) ? <div className="admin-empty">По этому фильтру записей нет.</div> : <div className="admin-list">{data.items.map((item, index) => <article className="admin-row" key={String(item.id ?? index)}><button type="button" onClick={() => dashboardMetric === "orders_attention" ? setSelectedOrder(Number(item.id)) : dashboardMetric === "referral_missing_rows" ? undefined : openMetricClient(item)}><strong>#{value(item.id)}</strong><small>{value(item.created_at ?? item.updated_at)}</small></button><span>{value(item.lifecycle_status ?? item.status)}</span><span>{value(item.service_status ?? item.payment_status)}</span>{dashboardMetric === "new_users_7d" && <button type="button" disabled={submitting} onClick={() => void reviewNewUser(Number(item.id), true)}>Убрать из новых</button>}{dashboardMetric === "reviewed_users" && <button type="button" disabled={submitting} onClick={() => void reviewNewUser(Number(item.id), false)}>Вернуть в новые</button>}{dashboardMetric === "referral_missing_rows" && <span className="admin-risk">Только проверка; автоматический ремонт запрещён.</span>}</article>)}</div>}</section>}
      {tab === "queues" && <div className="admin-tabs" aria-label="Тип очереди">{["visa", "housing", "support"].map((item) => <button className={queue === item ? "active" : ""} onClick={() => setQueue(item)} key={item}>{item}</button>)}</div>}
      {tab === "referrals" && data?.metrics && <div className="admin-metrics">{Object.entries(data.metrics).map(([key, count]) => <article key={key}><span>{key.replaceAll("_", " ")}</span><strong>{count}</strong></article>)}</div>}
      {tab === "clients" ? <AdminVisaCRM csrfToken={session.csrf_token} initialClientId={initialClientId} locale={session.actor.locale ?? "ru"} /> : tab === "inventory" ? <section className="admin-panel"><h2>Screen / state inventory</h2><ul><li>Dashboard, clients, users, referrals, orders/payments, Points, queues, settings и audit.</li><li>Data, empty, loading, error и permission denied.</li><li>Все mutations требуют actor, comment, Origin, CSRF и idempotency key.</li></ul></section> : tab === "settings" ? <section className="admin-panel"><h2>Exchange route settings</h2><pre>{JSON.stringify(data?.exchange_routes ?? [], null, 2)}</pre></section> : tab !== "dashboard" && <section className="admin-panel"><div className="admin-panel-head"><h2>{title}</h2><span>{data ? `${data.total ?? items.length} записей` : "Загрузка…"}</span></div>{!data ? <div className="admin-empty">Загружаем данные…</div> : items.length === 0 ? <div className="admin-empty">По выбранным условиям записей нет.</div> : <div className="admin-list">{items.map((item, index) => <article className="admin-row" key={String(item.id ?? index)}><div><strong>#{value(item.id)}</strong><small>{value(item.created_at ?? item.updated_at)}</small></div><span>{value(item.username ?? item.service ?? item.action_type ?? item.source ?? item.status)}</span><span>{value(item.payment_status ?? item.operation_type ?? item.entity_type ?? item.route_context)}</span>{tab === "orders" && <button onClick={() => setSelectedOrder(Number(item.id))}>Действия</button>}</article>)}</div>}</section>}
    </div></main>
    <nav className="admin-mobile" aria-label="Мобильная навигация">{[tabs[0], tabs[1], tabs[3], tabs[5], tabs[8]].map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => navigate(item.id)}>{item.id === "inventory" ? "Ещё" : item.label}</button>)}</nav>
    {selectedOrder && <div className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby="order-action-title"><section><span className="eyebrow">Двойное подтверждение</span><h2 id="order-action-title">Изменить заказ #{selectedOrder}</h2><label>Действие<select value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="paid">Подтвердить оплату</option><option value="completed">Завершить</option><option value="cancelled">Отменить</option></select></label><p className="admin-risk">Завершение возможно только после оплаты. Отмена начисленного reward создаёт append-only reversal.</p><label>Причина<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label><div><button onClick={() => setSelectedOrder(null)}>Назад</button><button className="danger" disabled={!comment.trim() || submitting} onClick={() => void submitOrder()}>{submitting ? "Сохраняем…" : "Подтвердить"}</button></div></section></div>}
  </div>;
}
