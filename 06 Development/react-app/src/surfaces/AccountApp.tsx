import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { AuthStatus, Dashboard } from "../api/types";
import { SupportPanel } from "../components/SupportPanel";
import { VisaCabinet } from "../components/VisaCabinet";
import { AppearanceControls, useAppearance, useDocumentLocale } from "../components/AppearanceControls";
import { browserLoginUrl, browserRuntime } from "../runtime/browser";
import { PointsHistory } from "../components/PointsHistory";
import { ReferralShare } from "../components/ReferralShare";

type AccountTab =
  | "overview"
  | "points"
  | "referrals"
  | "orders"
  | "visas"
  | "profile"
  | "support";

const accountTabs: AccountTab[] = ["overview", "points", "referrals", "orders", "visas", "profile", "support"];
const accountShellCopy = {
  ru: { user: "Пользователь", logout: "Выйти", cabinet: "Личный кабинет", nav: "Разделы личного кабинета", website: "← На сайт и к услугам", calculator: "Открыть калькулятор →", tabs: { overview: "Обзор", points: "Points", referrals: "Моя сеть", orders: "Заявки", visas: "Мои визы", profile: "Профиль", support: "Поддержка" } },
  en: { user: "User", logout: "Log out", cabinet: "My account", nav: "Account sections", website: "← Website and services", calculator: "Open calculator →", tabs: { overview: "Overview", points: "Points", referrals: "My network", orders: "Requests", visas: "My visas", profile: "Profile", support: "Support" } },
} as const;
const accountPageCopy = {
  ru: {
    overview: "Обзор", hello: "Здравствуйте", traveller: "путешественник", overviewLead: "Ваши услуги, заявки и Points — в одном месте.", network: "Моя сеть", requests: "Заявки",
    pointsBalance: "Баланс Points", pointsBalanceHint: "Посмотреть текущий баланс", myRequests: "Мои заявки", myRequestsHint: "Проверить статусы услуг", calculator: "Калькулятор", calculatorHint: "Рассчитать обмен на сайте", support: "Поддержка", supportHint: "Открыть диалог с менеджером",
    pointsLead: "Ваш текущий баланс и последние операции.", pointsUse: "Как использовать Points", pointsUseHint: "Возможность оплаты зависит от конкретной услуги. Итоговые условия подтверждает менеджер до оформления.",
    invited: "приглашённых", referralLead: "Пригласите друзей в SAFRWAY по персональной ссылке.", personalLink: "Персональная ссылка", linkUnavailable: "Ссылка пока недоступна", copied: "Скопировано", copy: "Скопировать",
    services: "Мои услуги", ordersLead: "Ваши заявки и их текущие статусы.", request: "Заявка", noOrders: "Заявок пока нет", noOrdersHint: "Откройте каталог и выберите нужное направление.", openCatalog: "Перейти в каталог",
    profile: "Профиль", user: "Пользователь", profileLead: "Один профиль используется сайтом, Mini App и ботом.", usernameMissing: "Username не указан",
  },
  en: {
    overview: "Overview", hello: "Hello", traveller: "traveller", overviewLead: "Your services, requests and Points — in one place.", network: "My network", requests: "Requests",
    pointsBalance: "Points balance", pointsBalanceHint: "View your current balance", myRequests: "My requests", myRequestsHint: "Check service statuses", calculator: "Calculator", calculatorHint: "Calculate an exchange on the website", support: "Support", supportHint: "Open a conversation with a manager",
    pointsLead: "Your current balance and recent transactions.", pointsUse: "Using Points", pointsUseHint: "Availability depends on the service. A manager confirms the final terms before processing.",
    invited: "invited", referralLead: "Invite friends to SAFRWAY with your personal link.", personalLink: "Personal link", linkUnavailable: "Link is not available yet", copied: "Copied", copy: "Copy",
    services: "My services", ordersLead: "Your requests and their current statuses.", request: "Request", noOrders: "No requests yet", noOrdersHint: "Open the catalogue and choose a destination.", openCatalog: "Open catalogue",
    profile: "Profile", user: "User", profileLead: "The website, Mini App and bot use one profile.", usernameMissing: "Username is not set",
  },
} as const;
const accountStatusCopy = {
  ru: {
    loadingTitle: "Загружаем личный кабинет…", loadingDetail: "Проверяем защищённую сессию.", login: "Войдите через Telegram", loginPreparing: "Вход через Telegram готовится",
    loginDetail: "Отдельный пароль не нужен. Telegram подтверждает личность, а вход не меняет вашу реферальную связь.", preparingDetail: "Кабинет уже размещён, но защищённый вход появится после регистрации production callback в Telegram.",
    loginButton: "Войти через Telegram", website: "Вернуться на сайт", errorTitle: "Кабинет временно недоступен", retry: "Повторить", eyebrow: "Единый аккаунт",
  },
  en: {
    loadingTitle: "Loading your account…", loadingDetail: "Checking the protected session.", login: "Sign in with Telegram", loginPreparing: "Telegram sign-in is being prepared",
    loginDetail: "No separate password is needed. Telegram confirms your identity and sign-in does not change your referral relationship.", preparingDetail: "The account is available, but protected sign-in requires the production callback to be registered with Telegram.",
    loginButton: "Sign in with Telegram", website: "Back to website", errorTitle: "Account is temporarily unavailable", retry: "Retry", eyebrow: "One account",
  },
} as const;

function currentTab(): AccountTab {
  const pathTab = window.location.pathname.match(
    /^\/account\/([A-Za-z0-9_-]+)\/$/,
  )?.[1];
  if (accountTabs.some((item) => item === pathTab)) {
    return pathTab as AccountTab;
  }
  const hash = window.location.hash.replace(/^#/, "");
  return accountTabs.some((item) => item === hash)
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
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [error, setError] = useState("");
  const { theme, setTheme } = useAppearance();
  const interfaceLocale = useDocumentLocale();
  const statusCopy = accountStatusCopy[interfaceLocale];

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
          setAuth(authStatus);
          setStatus("guest");
          return;
        }
        const account = await api.request<Dashboard>("/api/web/account", {
          signal: controller.signal,
        });
        document.documentElement.lang = account.locale === "en" ? "en" : "ru";
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

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await appApiClient().request("/api/web/auth/logout", { method: "POST" });
      setAuth(null);
      setDashboard(null);
      setStatus("guest");
    } catch {
      setLogoutError(true);
    } finally { setLoggingOut(false); }
  }

  async function changeLocale(locale: "ru" | "en") {
    if (!auth?.csrf_token || !dashboard || dashboard.locale === locale) return;
    try {
      await appApiClient().request("/api/web/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.csrf_token },
        body: JSON.stringify({ locale }),
      });
      setDashboard({ ...dashboard, locale });
      document.documentElement.lang = locale;
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  if (status === "loading") {
    return <AccountStatus title={statusCopy.loadingTitle} detail={statusCopy.loadingDetail} eyebrow={statusCopy.eyebrow} />;
  }

  if (status === "guest") {
    const loginConfigured = auth?.login_configured !== false;
    return (
      <AccountStatus
        title={
          loginConfigured
            ? statusCopy.login
            : statusCopy.loginPreparing
        }
        detail={
          loginConfigured
            ? statusCopy.loginDetail
            : statusCopy.preparingDetail
        }
        eyebrow={statusCopy.eyebrow}
      >
        {loginConfigured && (
          <a className="button primary" href={browserLoginUrl()}>
            {statusCopy.loginButton}
          </a>
        )}
        <a className="button secondary" href="https://safrway.online/">
          {statusCopy.website}
        </a>
      </AccountStatus>
    );
  }

  if (status === "error") {
    return (
      <AccountStatus title={statusCopy.errorTitle} detail={error} eyebrow={statusCopy.eyebrow}>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          {statusCopy.retry}
        </button>
      </AccountStatus>
    );
  }

  const locale = dashboard?.locale ?? "ru";
  const shell = accountShellCopy[locale];
  const copy = accountPageCopy[locale];
  const website = locale === "en" ? "https://safrway.online/en/" : "https://safrway.online/";
  const calculator = locale === "en"
    ? "https://safrway.online/en/bali/exchange/usdt-idr/"
    : "https://safrway.online/bali/exchange/usdt-idr/";

  return (
    <div className="account-shell">
      <header className="account-header">
        <a className="brand" href={website} aria-label={shell.website}>
          <span className="brand-mark">S</span>
          <span>SAFRWAY</span>
        </a>
        <div className="account-header-tools">
          <AppearanceControls locale={locale} onLocaleChange={(next) => void changeLocale(next)} theme={theme} onThemeChange={setTheme} />
          <span>{auth?.first_name ?? dashboard?.first_name ?? shell.user}</span>
          <button type="button" disabled={loggingOut} onClick={() => void logout()}>{shell.logout}</button>
        </div>
      </header>

      <div className="account-layout">
        <aside className="account-sidebar">
          <span className="eyebrow">{shell.cabinet}</span>
          <nav aria-label={shell.nav}>
            {accountTabs.map((item) => (
              <button
                className={tab === item ? "active" : ""}
                aria-current={tab === item ? "page" : undefined}
                key={item}
                type="button"
                onClick={() => navigate(item)}
              >
                {shell.tabs[item]}
              </button>
            ))}
          </nav>
          <div className="account-sidebar-actions">
            <a href={website}>{shell.website}</a>
            <a href={calculator}>{shell.calculator}</a>
          </div>
        </aside>

        <main className="account-content">
          {logoutError && <p className="account-action-error" role="alert">{locale === "ru" ? "Не удалось подтвердить выход. Нажмите «Выйти» ещё раз." : "Could not confirm log out. Try Log out again."}</p>}
          {error && <p className="account-action-error" role="alert">{error}</p>}
          {tab === "overview" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">{copy.overview}</span>
                <h1>{copy.hello}, {dashboard?.first_name ?? copy.traveller}</h1>
                <p>{copy.overviewLead}</p>
              </header>
              <div className="metric-grid">
                <article>
                  <span>SAFR Points</span>
                  <strong>{dashboard?.balance.toLocaleString("ru-RU") ?? 0}</strong>
                </article>
                <article>
                  <span>{copy.network}</span>
                  <strong>{dashboard?.referral_count ?? 0}</strong>
                </article>
                <article>
                  <span>{copy.requests}</span>
                  <strong>{dashboard?.orders.length ?? 0}</strong>
                </article>
              </div>
              <div className="quick-grid account-quick">
                <button type="button" onClick={() => navigate("points")}>
                  <strong>{copy.pointsBalance}</strong>
                  <small>{copy.pointsBalanceHint}</small>
                </button>
                <button type="button" onClick={() => navigate("orders")}>
                  <strong>{copy.myRequests}</strong>
                  <small>{copy.myRequestsHint}</small>
                </button>
                <a href={calculator}>
                  <strong>{copy.calculator}</strong>
                  <small>{copy.calculatorHint}</small>
                </a>
                <button type="button" onClick={() => navigate("support")}>
                  <strong>{copy.support}</strong>
                  <small>{copy.supportHint}</small>
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
                  {copy.pointsLead}
                </p>
              </header>
              <div className="info-card">
                <strong>{copy.pointsUse}</strong>
                <p>{copy.pointsUseHint}</p>
              </div>
              <PointsHistory history={dashboard?.points_history} locale={locale} />
            </section>
          )}

          {tab === "referrals" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">{copy.network}</span>
                <h1>{dashboard?.referral_count ?? 0} {copy.invited}</h1>
                <p>{copy.referralLead}</p>
              </header>
              <ReferralShare link={dashboard?.referral_link} locale={locale} />
            </section>
          )}

          {tab === "orders" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">{copy.requests}</span>
                <h1>{copy.services}</h1>
                <p>{copy.ordersLead}</p>
              </header>
              {dashboard?.orders.length ? (
                <div className="order-list">
                  {dashboard.orders.map((order) => (
                    <article key={order.id}>
                      <div>
                        <strong>{order.service}</strong>
                        <small>{copy.request} №{order.id}</small>
                      </div>
                      <span>{order.status}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>{copy.noOrders}</strong>
                  <p>{copy.noOrdersHint}</p>
                  <a className="button secondary" href="https://safrway.online/">
                    {copy.openCatalog}
                  </a>
                </div>
              )}
            </section>
          )}

          {tab === "visas" && (
            <VisaCabinet
              apiPrefix="/api/web"
              locale={dashboard?.locale ?? "ru"}
              csrfToken={auth?.csrf_token}
            />
          )}

          {tab === "profile" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">{copy.profile}</span>
                <h1>{dashboard?.first_name ?? copy.user}</h1>
                <p>{copy.profileLead}</p>
              </header>
              <div className="profile-card">
                <span>Telegram</span>
                <strong>
                  {dashboard?.username ? `@${dashboard.username}` : copy.usernameMissing}
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
  eyebrow,
  children,
}: {
  title: string;
  detail: string;
  eyebrow: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="account-status">
      <a className="brand" href="https://safrway.online/">
        <span className="brand-mark">S</span>
        <span>SAFRWAY</span>
      </a>
      <section>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="status-actions">{children}</div>
      </section>
    </main>
  );
}
