import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { AuthStatus, Dashboard, RouteContext } from "../api/types";
import {storedWorld} from '../components/DestinationDesign';
import {HomeView} from '../components/HomeView';
import {CatalogView} from '../components/CatalogView';
import {CurrencyCalculator} from '../components/CurrencyCalculator';
import {SupportDrawer} from '../components/SupportDrawer';
import {AppIcon} from '../components/AppIcon';
import {I18nProvider} from '../i18n/runtime';
import { SupportPanel } from "../components/SupportPanel";
import { VisaCabinet } from "../components/VisaCabinet";
import { BaliLifeCabinet, BaliLifeEntry } from "../components/BaliLifeCabinet";
import { BottomNavigation } from "../components/BottomNavigation";
import { RequestsEntry } from "../components/RequestsEntry";
import { accountRouteTab, clientNavigationTab, clientNavigationTabs, type AccountSection } from "../components/client-navigation";
import { AppearanceControls, useAppearance, useDocumentLocale } from "../components/AppearanceControls";
import { browserLoginUrl, browserRuntime } from "../runtime/browser";

type AccountTab = AccountSection;

const accountTabs = clientNavigationTabs;
const accountShellCopy = {
  ru: { user: "Пользователь", logout: "Выйти", cabinet: "Личный кабинет", nav: "Разделы личного кабинета", website: "← На сайт и к услугам", calculator: "Открыть калькулятор →", tabs: { home:"Направления",services:"Сервисы",life:"Моя жизнь",overview: "Обзор", points: "Points", referrals: "Моя сеть", orders: "Заявки", visas: "Мои визы", profile: "Профиль", support: "Поддержка" } },
  en: { user: "User", logout: "Log out", cabinet: "My account", nav: "Account sections", website: "← Website and services", calculator: "Open calculator →", tabs: { home:"Destinations",services:"Services",life:"My life",overview: "Overview", points: "Points", referrals: "My network", orders: "Requests", visas: "My visas", profile: "Profile", support: "Support" } },
} as const;
const accountPageCopy = {
  ru: {
    overview: "Обзор", hello: "Здравствуйте", traveller: "путешественник", overviewLead: "Здесь собраны данные из общей базы SAFRWAY.", network: "Моя сеть", requests: "Заявки",
    pointsBalance: "Баланс Points", pointsBalanceHint: "Посмотреть текущий баланс", myRequests: "Мои заявки", myRequestsHint: "Проверить статусы услуг", calculator: "Калькулятор", calculatorHint: "Рассчитать обмен на сайте", support: "Поддержка", supportHint: "Открыть диалог с менеджером",
    pointsLead: "Баланс рассчитывает только backend. Интерфейс не начисляет, не списывает и не пересчитывает Points.", pointsUse: "Как использовать Points", pointsUseHint: "Возможность оплаты зависит от конкретной услуги. Итоговые условия подтверждает менеджер до оформления.",
    invited: "приглашённых", referralLead: "Реферальная связь назначается backend один раз и не меняется при повторном входе.", personalLink: "Персональная ссылка", linkUnavailable: "Ссылка пока недоступна", copied: "Скопировано", copy: "Скопировать",
    services: "Мои услуги", ordersLead: "Список читается напрямую из backend.", request: "Заявка", noOrders: "Заявок пока нет", noOrdersHint: "Откройте каталог и выберите нужное направление.", openCatalog: "Перейти в каталог",
    profile: "Профиль", user: "Пользователь", profileLead: "Один профиль используется сайтом, Mini App и ботом.", usernameMissing: "Username не указан",
  },
  en: {
    overview: "Overview", hello: "Hello", traveller: "traveller", overviewLead: "This information comes from the shared SAFRWAY backend.", network: "My network", requests: "Requests",
    pointsBalance: "Points balance", pointsBalanceHint: "View your current balance", myRequests: "My requests", myRequestsHint: "Check service statuses", calculator: "Calculator", calculatorHint: "Calculate an exchange on the website", support: "Support", supportHint: "Open a conversation with a manager",
    pointsLead: "The backend is the only source of the balance. The interface never accrues, deducts or recalculates Points.", pointsUse: "Using Points", pointsUseHint: "Availability depends on the service. A manager confirms the final terms before processing.",
    invited: "invited", referralLead: "The backend assigns a referral relationship once; signing in again does not change it.", personalLink: "Personal link", linkUnavailable: "Link is not available yet", copied: "Copied", copy: "Copy",
    services: "My services", ordersLead: "The list is read directly from the backend.", request: "Request", noOrders: "No requests yet", noOrdersHint: "Open the catalogue and choose a destination.", openCatalog: "Open catalogue",
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
  return accountRouteTab(location.pathname, location.hash);
}

export function AccountApp() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<
    "loading" | "guest" | "ready" | "error"
  >("loading");
  const [tab, setTab] = useState<AccountTab>(currentTab);
  const [servicePath,setServicePath]=useState(()=>location.pathname.startsWith('/account/services/')?location.pathname.replace('/account/','').replace(/\/$/,''):'services/bali');
  const [supportOpen,setSupportOpen]=useState(false),[supportContext,setSupportContext]=useState<RouteContext>({}),[menu,setMenu]=useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const { theme, setTheme } = useAppearance();
  const interfaceLocale = useDocumentLocale();
  const statusCopy = accountStatusCopy[interfaceLocale];

  useEffect(() => {
    void browserRuntime.initialize();
    const updateTab = () => {
      setTab(currentTab());
      if(location.pathname.startsWith('/account/services/'))setServicePath(location.pathname.replace('/account/','').replace(/\/$/,''));
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
    setMenu(false);
    if(next==='support'){setSupportOpen(true);return;}
    const path = `/account/${next}/`;
    window.history.pushState({}, "", path);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateCatalog(path:string){
    setMenu(false);
    if(path==='services')path='services/bali';
    if(!path.startsWith('services/')){navigate(path==='profile'?'profile':path==='visas'?'visas':'home');return;}
    history.pushState({},'',`/account/${path}/`);setServicePath(path);setTab('services');window.scrollTo({top:0,behavior:'instant'});
  }
  function openSupport(context:RouteContext={}){setSupportContext(context);setSupportOpen(true);}

  function openLife() {
    navigate("life");
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
    <I18nProvider locale={locale}><div className="account-shell">
      <header className="account-header">
        <a className="brand" href="/account/" onClick={e=>{e.preventDefault();navigate("home");}} aria-label={shell.website}>

          <span>SAFRWAY</span>
        </a>
        <button className="menu-toggle" aria-label={locale==='en'?'Menu':'Меню'} aria-expanded={menu} onClick={()=>setMenu(!menu)}><span/><span/><span/></button>
        <nav className="app-main-menu" aria-label={locale==='en'?'Main menu':'Главное меню'}><button onClick={()=>navigate('home')}>{shell.tabs.home}</button><button onClick={()=>navigateCatalog('services/'+storedWorld())}>{shell.tabs.services}</button><button onClick={()=>openSupport()}>{locale==='en'?'Help':'Помощь'}</button><button onClick={()=>{navigate('home');setTimeout(()=>document.querySelector('.travel-videos')?.scrollIntoView({behavior:'smooth'}),100);}}>{locale==='en'?'Video':'Видео'}</button></nav>
        <div className="account-header-tools">
          <AppearanceControls locale={locale} onLocaleChange={(next) => void changeLocale(next)} theme={theme} onThemeChange={setTheme} />
          <button className="user-chip" aria-label={shell.tabs.profile} onClick={()=>navigate("profile")}><AppIcon name="user"/></button>
          <button className="account-logout" type="button" onClick={logout}>{shell.logout}</button>
        </div>
      </header>

      <div className="account-layout">
        <aside className={`account-sidebar ${menu?'is-open':''}`} hidden={!menu&&(tab==='home'||tab==='services')}>
          <span className="eyebrow">{shell.cabinet}</span>
          <nav aria-label={shell.nav}>
            {accountTabs.map((item) => (
              <button
                className={`${clientNavigationTab(tab) === item ? "active" : ""}${item === "life" ? " life-nav" : ""}`}
                aria-current={clientNavigationTab(tab) === item ? "page" : undefined}
                key={item}
                type="button"
                onClick={() => item==='services'?navigateCatalog('services/'+storedWorld()):navigate(item)}
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
          {tab==='home'&&<HomeView navigate={navigateCatalog} onManager={openSupport} pointsBalance={dashboard?.balance??0}/>}
          {tab==='services'&&(servicePath==='services/bali/exchange/usdt-idr'?<CurrencyCalculator navigate={navigateCatalog} onManager={openSupport} onHaptic={()=>{}} apiPrefix="/api/web" csrfToken={auth?.csrf_token}/>:<CatalogView segments={servicePath.split('/')} navigate={navigateCatalog} onManager={openSupport}/>)}
          {tab === "services" && <RequestsEntry locale={locale} count={dashboard?.orders.length ?? 0} onOpen={() => navigate("orders")} />}
          {tab === "overview" && (
            <section className="page-stack">
              <BaliLifeEntry locale={locale} onOpen={openLife} />
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
            </section>
          )}

          {tab === "referrals" && (
            <section className="page-stack">
              <header className="page-heading">
                <span className="eyebrow">{copy.network}</span>
                <h1>{dashboard?.referral_count ?? 0} {copy.invited}</h1>
                <p>{copy.referralLead}</p>
              </header>
              <div className="profile-card">
                <span>{copy.personalLink}</span>
                <strong className="break-word">
                  {dashboard?.referral_link ?? copy.linkUnavailable}
                </strong>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!dashboard?.referral_link}
                  onClick={copyReferral}
                >
                  {copied ? copy.copied : copy.copy}
                </button>
              </div>
            </section>
          )}

          {tab === "orders" && (
            <section className="page-stack">
              <button className="client-section-back" type="button" onClick={() => navigateCatalog(`services/${storedWorld()}`)}>← {shell.tabs.services}</button>
              <header className="page-heading">
                <span className="eyebrow">{copy.requests}</span>
                <h1>{copy.requests}</h1>
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
                  <button className="button secondary" type="button" onClick={() => navigateCatalog(`services/${storedWorld()}`)}>
                    {copy.openCatalog}
                  </button>
                </div>
              )}
            </section>
          )}

          {tab === "visas" && (
            <><button className="client-section-back" type="button" onClick={() => navigate("life")}>← {shell.tabs.life}</button><VisaCabinet
              apiPrefix="/api/web"
              locale={dashboard?.locale ?? "ru"}
              csrfToken={auth?.csrf_token}
            /></>
          )}

          {tab === "life" && dashboard && <BaliLifeCabinet apiPrefix="/api/web" userId={dashboard.telegram_id} locale={locale} onOpenVisas={() => navigate("visas")} onManager={() => openSupport()} />}

          {tab === "profile" && (
            <section className="page-stack"><button className="button secondary" onClick={logout}>{shell.logout}</button>
              <nav className="client-profile-links" aria-label={shell.nav}>{(["overview", "points", "referrals"] as const).map(item => <button className="button secondary" type="button" key={item} onClick={() => navigate(item)}>{shell.tabs[item]}</button>)}</nav>
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
              csrfToken={auth?.csrf_token}
              initialContact={dashboard?.username}
              apiPrefix="/api/web"
              onOpenTelegram={browserRuntime.openTelegram}
            />
          )}
        </main>
      </div>
      <BottomNavigation activeTab={clientNavigationTab(tab)} onNavigate={next => next === "services" ? navigateCatalog(`services/${storedWorld()}`) : navigate(next)} />
      {tab!=='support'&&<SupportDrawer open={supportOpen} onOpen={()=>openSupport()} onClose={()=>setSupportOpen(false)} apiPrefix="/api/web" routeContext={supportContext} onOpenTelegram={browserRuntime.openTelegram} initialContact={dashboard?.username} csrfToken={auth?.csrf_token}/>}
    </div></I18nProvider>
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
