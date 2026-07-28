import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { AuthStatus, Dashboard } from "../api/types";
import { SupportPanel } from "../components/SupportPanel";
import { browserLoginUrl, browserRuntime } from "../runtime/browser";

type AccountTab =
  | "overview"
  | "points"
  | "referrals"
  | "orders"
  | "profile"
  | "support";

const accountTabs: Array<{ id: AccountTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "points", label: "Points" },
  { id: "referrals", label: "Моя сеть" },
  { id: "orders", label: "Заявки" },
  { id: "profile", label: "Профиль" },
  { id: "support", label: "Поддержка" },
];

function currentTab(): AccountTab {
  const pathTab = window.location.pathname.match(
    /^\/account\/([A-Za-z0-9_-]+)\/$/,
  )?.[1];
  if (accountTabs.some((item) => item.id === pathTab)) {
    return pathTab as AccountTab;
  }
  const hash = window.location.hash.replace(/^#/, "");
  return accountTabs.some((item) => item.id === hash)
    ? (hash as AccountTab)
    : "overview";
}

export function AccountApp() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<
    "loading" | "guest" | "ready" | "error"
  >("loading");
  const [tab, setTab] = useState<AccountTab>(currentTab);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void browserRuntime.initialize();
    const updateTab = () => {
      setTab(currentTab());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", updateTab);
    window.addEventListener("popstate", updateTab);
    return () => {
      window.removeEventListener("hashchange", updateTab);
      window.removeEventListener("popstate", updateTab);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const api = appApiClient();
        const authStatus = await api.request<AuthStatus>("/api/web/auth/me", {
          signal: controller.signal,
        });
        if (!authStatus.authenticated) {
          setAuth(null);
          setStatus("guest");
          return;
        }
        const account = await api.request<Dashboard>("/api/web/account", {
          signal: controller.signal,
        });
        setAuth(authStatus);
        setDashboard(account);
        setStatus("ready");
      } catch (caught) {
        if ((caught as DOMException).name === "AbortError") return;
        if (caught instanceof ApiError && caught.kind === "authentication") {
          setStatus("guest");
          return;
        }
        setError(apiErrorMessage(caught));
        setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  function navigate(next: AccountTab) {
    const path = next === "overview" ? "/account/" : `/account/${next}/`;
    window.history.pushState({}, "", path);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function copyReferral() {
    if (!dashboard?.referral_link) return;
    await navigator.clipboard.writeText(dashboard.referral_link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function logout() {
    await appApiClient().request("/api/web/auth/logout", { method: "POST" });
    setAuth(null);
    setDashboard(null);
    setStatus("guest");
  }

  if (status === "loading") {
    return <AccountStatus title="Загружаем личный кабинет…" detail="Проверяем защищённую сессию." />;
  }

  if (status === "guest") {
    return (
      <AccountStatus
        title="Войдите через Telegram"
        detail="Отдельный пароль не нужен. Telegram подтверждает личность, а login не меняет вашу реферальную связь."
      >
        <a className="button primary" href={browserLoginUrl()}>
          Войти через Telegram
        </a>
        <a className="button secondary" href="https://safrway.online/">
          Вернуться на сайт
        </a>
      </AccountStatus>
    );
  }

  if (status === "error") {
    return (
      <AccountStatus title="Кабинет временно недоступен" detail={error}>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          Повторить
        </button>
      </AccountStatus>
    );
  }

  return (
    <div className="account-shell">
      <header className="account-header">
        <a className="brand" href="/account/">
          <span className="brand-mark">S</span>
          <span>SAFRWAY</span>
        </a>
        <div>
          <span>{auth?.first_name ?? dashboard?.first_name ?? "Пользователь"}</span>
          <button type="button" onClick={logout}>Выйти</button>
        </div>
      </header>

      <div className="account-layout">
        <aside className="account-sidebar">
          <span className="eyebrow">Личный кабинет</span>
          <nav aria-label="Разделы личного кабинета">
            {accountTabs.map((item) => (
              <button
                className={tab === item.id ? "active" : ""}
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <a href="https://safrway.online/directions/">Открыть каталог услуг →</a>
        </aside>

        <main className="account-content">
          {tab === "overview" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">Обзор</span>
                <h1>Здравствуйте, {dashboard?.first_name ?? "путешественник"}</h1>
                <p>Здесь собраны данные из общей базы SAFRWAY.</p>
              </header>
              <div className="metric-grid">
                <article>
                  <span>SAFR Points</span>
                  <strong>{dashboard?.balance.toLocaleString("ru-RU") ?? 0}</strong>
                </article>
                <article>
                  <span>Моя сеть</span>
                  <strong>{dashboard?.referral_count ?? 0}</strong>
                </article>
                <article>
                  <span>Заявки</span>
                  <strong>{dashboard?.orders.length ?? 0}</strong>
                </article>
              </div>
              <div className="quick-grid account-quick">
                <button type="button" onClick={() => navigate("points")}>
                  <strong>Баланс Points</strong>
                  <small>Посмотреть текущий баланс</small>
                </button>
                <button type="button" onClick={() => navigate("orders")}>
                  <strong>Мои заявки</strong>
                  <small>Проверить статусы услуг</small>
                </button>
                <button type="button" onClick={() => navigate("support")}>
                  <strong>Поддержка</strong>
                  <small>Открыть диалог с менеджером</small>
                </button>
              </div>
            </section>
          )}

          {tab === "points" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">SAFR Points</span>
                <h1>{dashboard?.balance.toLocaleString("ru-RU") ?? 0} Points</h1>
                <p>
                  Баланс рассчитывает только backend. Frontend не начисляет,
                  не списывает и не пересчитывает Points.
                </p>
              </header>
              <div className="info-card">
                <strong>Как использовать Points</strong>
                <p>
                  Возможность оплаты зависит от конкретной услуги. Итоговые
                  условия подтверждает менеджер до оформления.
                </p>
              </div>
            </section>
          )}

          {tab === "referrals" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">Моя сеть</span>
                <h1>{dashboard?.referral_count ?? 0} приглашённых</h1>
                <p>
                  Реферальная связь назначается backend один раз и не меняется
                  при повторном входе.
                </p>
              </header>
              <div className="profile-card">
                <span>Персональная ссылка</span>
                <strong className="break-word">
                  {dashboard?.referral_link ?? "Ссылка пока недоступна"}
                </strong>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!dashboard?.referral_link}
                  onClick={copyReferral}
                >
                  {copied ? "Скопировано" : "Скопировать"}
                </button>
              </div>
            </section>
          )}

          {tab === "orders" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">Заявки</span>
                <h1>Мои услуги</h1>
                <p>Список читается напрямую из backend.</p>
              </header>
              {dashboard?.orders.length ? (
                <div className="order-list">
                  {dashboard.orders.map((order) => (
                    <article key={order.id}>
                      <div>
                        <strong>{order.service}</strong>
                        <small>Заявка №{order.id}</small>
                      </div>
                      <span>{order.status}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Заявок пока нет</strong>
                  <p>Откройте каталог и выберите нужное направление.</p>
                  <a className="button secondary" href="https://safrway.online/directions/">
                    Перейти в каталог
                  </a>
                </div>
              )}
            </section>
          )}

          {tab === "profile" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">Профиль</span>
                <h1>{dashboard?.first_name ?? "Пользователь"}</h1>
                <p>Один профиль используется сайтом, Mini App и ботом.</p>
              </header>
              <div className="profile-card">
                <span>Telegram</span>
                <strong>
                  {dashboard?.username ? `@${dashboard.username}` : "Username не указан"}
                </strong>
              </div>
              <div className="profile-card">
                <span>Telegram ID</span>
                <strong>{dashboard?.telegram_id}</strong>
              </div>
            </section>
          )}

          {tab === "support" && (
            <SupportPanel
              apiPrefix="/api/web"
              onOpenTelegram={browserRuntime.openTelegram}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function AccountStatus({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="account-status">
      <a className="brand" href="https://safrway.online/">
        <span className="brand-mark">S</span>
        <span>SAFRWAY</span>
      </a>
      <section>
        <span className="eyebrow">Единый аккаунт</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="status-actions">{children}</div>
      </section>
    </main>
  );
}
