import { accountPreview, isAccountPreview, previewAccountPath } from "../api/account-preview";
import {ClientApplicationLifecycle} from '../components/ClientApplicationLifecycle';
import "../components/account-preview.css";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { AuthStatus, Dashboard, RouteContext } from "../api/types";
import {storedWorld} from '../components/DestinationDesign';
import {SupportDrawer} from '../components/SupportDrawer';
import {AppIcon} from '../components/AppIcon';
import {I18nProvider} from '../i18n/runtime';
import { ProfileIdentity } from "../components/ProfileIdentity";
import { SectionBoundary } from "../components/SectionBoundary";
import { BaliLifeCabinet, BaliLifeEntry } from "../components/BaliLifeCabinet";
import { BottomNavigation } from "../components/BottomNavigation";
import { RequestsEntry } from "../components/RequestsEntry";
import { accountRouteTab, clientNavigationTab, clientNavigationTabs, type AccountSection } from "../components/client-navigation";
import { AppearanceControls, useAppearance, useDocumentLocale } from "../components/AppearanceControls";
import { browserLoginUrl, browserRuntime } from "../runtime/browser";
import { publishClientAuthLogout } from "../runtime/client-auth-lifecycle";
import {supportIntentMemory} from '../components/support-intent';
import {useClientUiController} from '../i18n/use-client-ui-controller';
import {clientUiPrincipal} from '../i18n/client-ui-surface';
import {clientAccountCopies,clientAccountInvitedCount} from '../i18n/client-account-copy';
import {clientPublicHome,clientPublicCalculator,serverContactLocale} from '../i18n/client-ui-bindings';
import {clientSupportApiError as clientUiApiError} from '../i18n/client-support-copy';
import {ClientAppearanceControls} from '../components/ClientAppearanceControls';
import {ClientUiSyncNotice} from '../components/ClientUiSyncNotice';
import type {ClientRuntimeKey} from '../i18n/client-runtime';
import {SUPPORT_MANAGER_URL} from '../runtime/support-manager';

type AccountTab = AccountSection;

// Reuse MiniApp's literal route-level boundaries; keep account/session state above them.
const HomeView = lazy(() => import('../components/HomeView').then(module => ({default: module.HomeView})));
const CatalogView = lazy(() => import('../components/CatalogView').then(module => ({default: module.CatalogView})));
const CurrencyCalculator = lazy(() => import('../components/CurrencyCalculator').then(module => ({default: module.CurrencyCalculator})));
const SupportPanel = lazy(() => import('../components/SupportPanel').then(module => ({default: module.SupportPanel})));
const VisaCabinet = lazy(() => import('../components/VisaCabinet').then(module => ({default: module.VisaCabinet})));

function AccountHomeSection({onReady, ...props}: ComponentProps<typeof HomeView> & {onReady: () => void}) {
  // This effect commits only once the lazy child has resolved and mounted.
  useEffect(onReady, [onReady]);
  return <HomeView {...props} />;
}

const accountTabs = clientNavigationTabs;
const accountOrderStatusKeys:Readonly<Record<string,ClientRuntimeKey>>=Object.freeze({
  new:'order.status.new',contacted:'order.status.contacted',waiting_payment:'order.status.waitingPayment',
  paid:'order.status.paid',in_progress:'order.status.inProgress',completed:'order.status.completed',cancelled:'order.status.cancelled',
});
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
  return accountRouteTab(accountPreview(location.pathname)?.accountPath ?? location.pathname, location.hash);
}

/** Same sibling lifecycle/shared commit as the original root, no extra lazy chunk. */
export function AccountClientEntry({withClientLifecycle}:{withClientLifecycle:boolean}){
  return <><AccountApp/>{withClientLifecycle&&<ClientApplicationLifecycle/>}</>;
}

export function AccountApp() {
  const preview = accountPreview(location.pathname);
  const readOnly = isAccountPreview();
  const pathForAccount = () => accountPreview(location.pathname)?.accountPath ?? location.pathname;
  const [previewNotice, setPreviewNotice] = useState("");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<
    "loading" | "guest" | "ready" | "error"
  >("loading");
  const [tab, setTab] = useState<AccountTab>(currentTab);
  const [servicePath,setServicePath]=useState(()=>pathForAccount().startsWith('/account/services/')?pathForAccount().replace('/account/','').replace(/\/$/,''):'services/bali');
  const [supportOpen,setSupportOpen]=useState(false),[supportContext,setSupportContext]=useState<RouteContext>({}),[menu,setMenu]=useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const loadVersion=useRef(0),loadActive=useRef<AbortController|null>(null),loggingOut=useRef(false);
  const refreshTimer=useRef<number|null>(null);
  const client=useClientUiController('web',!readOnly,{
    onLogout:()=>clearPrincipal('guest'),onAuthorityLost:()=>clearPrincipal('guest'),
  });
  const ui=client.ui;
  const { theme, setTheme } = useAppearance();
  const interfaceLocale = useDocumentLocale();
  const translated=ui?clientAccountCopies(ui):undefined;
  const statusCopy = translated?.status??accountStatusCopy[interfaceLocale];
  const videoScrollPending = useRef(false);
  useEffect(() => {
    if (tab !== 'home' || status !== 'ready') videoScrollPending.current = false;
  }, [tab, status]);
  function scrollVideosWhenReady() {
    if (!videoScrollPending.current || tab !== 'home' || status !== 'ready') return;
    const target = document.querySelector('.account-content .travel-videos');
    if (!target) return;
    videoScrollPending.current = false;
    target.scrollIntoView({behavior: 'smooth'});
  }
  function openVideos() {
    videoScrollPending.current = true;
    navigate('home');
    if (tab === 'home') scrollVideosWhenReady();
  }

  function clearPrincipal(next:'guest'|'error'){
    supportIntentMemory.clear();
    cancelRefresh();
    loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
    client.controller?.logout();
    setAuth(null);setDashboard(null);setSupportOpen(false);setCopied(false);setStatus(next);
  }

  function cancelRefresh(){
    if(refreshTimer.current!==null){window.clearTimeout(refreshTimer.current);refreshTimer.current=null;}
  }

  function refreshAccount(){
    if(readOnly||loggingOut.current)return;
    // Invalidate immediately, not after the debounce: a coherent old response
    // must not become ready after focus reveals a potentially changed cookie.
    cancelRefresh();loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
    client.controller!.beginLoad();
    setAuth(null);setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('loading');
    refreshTimer.current=window.setTimeout(()=>{refreshTimer.current=null;void loadAccount();},50);
  }

  async function loadAccount(){
    if(loadActive.current||loggingOut.current)return;
    cancelRefresh();
    const controller=new AbortController(),version=++loadVersion.current;
    loadActive.current=controller;
    const token=client.controller?.beginLoad();
    const current=()=>!controller.signal.aborted&&version===loadVersion.current&&
      (readOnly||(token!==undefined&&client.controller!.current(token)));
    setAuth(null);setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('loading');
    try{
      const api=appApiClient();
      const authStatus=readOnly?null:await api.request<AuthStatus>('/api/web/auth/me',{signal:controller.signal});
      if(!current())return;
      const principal=readOnly?null:clientUiPrincipal('web',authStatus);
      if(!readOnly&&!principal){
        client.controller!.bind(token!,null,authStatus?.locale);setAuth(authStatus);setStatus('guest');return;
      }
      const account=await api.request<Dashboard>('/api/web/account',{signal:controller.signal});
      if(!current())return;
      const contact=serverContactLocale(account.locale);
      if(!readOnly&&account.telegram_id!==principal!.actor)throw new ApiError('Account identity mismatch',{kind:'invalid_response'});
      if(readOnly)document.documentElement.lang=contact;
      else if(!client.controller!.bind(token!,principal,contact))return;
      setError(null);setAuth(authStatus);setDashboard(account);setStatus('ready');
    }catch(caught){
      if(!current()||(caught as DOMException).name==='AbortError')return;
      if(caught instanceof ApiError&&caught.kind==='authentication'){
        client.controller?.bind(token!,null,'ru');setAuth(null);setDashboard(null);setStatus('guest');return;
      }
      setError(caught);setAuth(null);setDashboard(null);setStatus('error');
    }finally{if(loadActive.current===controller)loadActive.current=null;}
  }

  useEffect(() => {
    void browserRuntime.initialize();
    const updateTab = () => {
      setSupportOpen(false);
      setTab(currentTab());
      if(pathForAccount().startsWith('/account/services/'))setServicePath(pathForAccount().replace('/account/','').replace(/\/$/,''));
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
    void loadAccount();
    const refresh=()=>refreshAccount();
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    if(!readOnly){window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);}
    return()=>{cancelRefresh();loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
      window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible);};
  }, []);

  function navigate(next: AccountTab) {
    setMenu(false);
    if(next==='support'){
      if(tab==='support'){if(!readOnly)browserRuntime.openTelegram(SUPPORT_MANAGER_URL);}
      else setSupportOpen(true);
      return;
    }
    setSupportOpen(false);
    const path = previewAccountPath(`/account/${next}/`, location.pathname);
    window.history.pushState({}, "", path);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateCatalog(path:string){
    setSupportOpen(false);
    setMenu(false);
    if(path==='services')path='services/bali';
    if(!path.startsWith('services/')){navigate(path==='profile'?'profile':path==='visas'?'visas':'home');return;}
    history.pushState({},'',previewAccountPath(`/account/${path}/`, location.pathname));setServicePath(path);setTab('services');window.scrollTo({top:0,behavior:'instant'});
  }
  function openSupport(context:RouteContext={}){
    // A direct support route may be suspended/failed; its exit cannot depend on that chunk.
    if(tab==='support'){if(!readOnly)browserRuntime.openTelegram(SUPPORT_MANAGER_URL);return;}
    setSupportContext(context);setSupportOpen(true);
  }

  function openLife() {
    navigate("life");
  }

  async function copyReferral() {
    if (!dashboard?.referral_link) return;
    const version=loadVersion.current;
    await navigator.clipboard.writeText(dashboard.referral_link);
    if(version!==loadVersion.current)return;
    setCopied(true);
    window.setTimeout(() => {if(version===loadVersion.current)setCopied(false);}, 1600);
  }

  async function logout() {
    if (readOnly||loggingOut.current) return;
    supportIntentMemory.clear();
    loggingOut.current=true;const version=++loadVersion.current;
    cancelRefresh();
    loadActive.current?.abort();loadActive.current=null;client.controller?.beginLoad();
    setAuth(null);setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('loading');
    try{
      await appApiClient().request('/api/web/auth/logout',{method:'POST'});
      if(version!==loadVersion.current)return;
      publishClientAuthLogout();clearPrincipal('guest');
    }catch(caught){if(version===loadVersion.current){setError(caught);setStatus('error');}}
    finally{loggingOut.current=false;}
  }

  async function changeLocale(locale: "ru" | "en") {
    if (readOnly && dashboard) {
      setDashboard({ ...dashboard, locale }); document.documentElement.lang = locale; return;
    }
    // This is only the legacy read-only Admin preview control. Client choices,
    // including RU/EN and equal-value fences, use the dedicated UI10 CAS.
  }

  const appearance=ui?<ClientAppearanceControls ui={ui} onLocaleChange={next=>void client.controller!.choose(next)} theme={theme} onThemeChange={setTheme}/>:undefined;

  if (status === "loading") {
    return <AccountStatus title={statusCopy.loadingTitle} detail={statusCopy.loadingDetail} eyebrow={statusCopy.eyebrow} tools={appearance} />;
  }

  if (status === "guest" && readOnly) return <AccountStatus title="Нужен вход администратора" detail="Вернитесь в карточку клиента и войдите заново." eyebrow="Просмотр кабинета" />;

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
        tools={appearance}
      >
        {loginConfigured && (
          <a className="button primary" href={ui?browserLoginUrl(undefined,clientPublicHome(ui.locale)):browserLoginUrl()}>
            {statusCopy.loginButton}
          </a>
        )}
        <a className="button secondary" href={ui?'https://safrway.online'+clientPublicHome(ui.locale):'https://safrway.online/'}>
          {statusCopy.website}
        </a>
      </AccountStatus>
    );
  }

  if (status === "error") {
    return (
      <AccountStatus title={statusCopy.errorTitle} detail={ui?clientUiApiError(ui,error):apiErrorMessage(error)} eyebrow={statusCopy.eyebrow} tools={appearance}>
        <button className="button primary" type="button" onClick={() => void loadAccount()}>
          {statusCopy.retry}
        </button>
      </AccountStatus>
    );
  }

  const locale = serverContactLocale(dashboard?.locale);
  const shell = translated?.shell??accountShellCopy[locale];
  const copy = translated?.page??accountPageCopy[locale];
  const website = ui?'https://safrway.online'+clientPublicHome(ui.locale):locale === "en" ? "https://safrway.online/en/" : "https://safrway.online/";
  const calculator = ui?'https://safrway.online'+clientPublicCalculator(ui.locale):locale === "en"
    ? "https://safrway.online/en/bali/exchange/usdt-idr/"
    : "https://safrway.online/bali/exchange/usdt-idr/";

  return (
    <I18nProvider locale={locale}><div className="account-shell" lang={ui?.locale} dir={ui?.dir} onClickCapture={event => {
      if (!readOnly) return;
      const anchor = (event.target as Element).closest("a");
      if (anchor && !anchor.classList.contains("brand")) {
        event.preventDefault(); event.stopPropagation();
        setPreviewNotice(locale === "ru" ? "Внешние переходы в режиме просмотра отключены." : "External navigation is disabled in preview.");
      }
    }}>
      {readOnly && <div className="account-preview-banner"><span>{locale === "ru" ? "Просмотр клиента" : "Client preview"} №{preview?.userId} · {locale === "ru" ? "без изменений" : "read-only"}</span></div>}
      {previewNotice && <p className="account-preview-action-note" role="status">{previewNotice}</p>}
      <header className="account-header">
        <a className="brand" href="/account/" onClick={e=>{e.preventDefault();navigate("home");}} aria-label={shell.website}>

          <span>SAFRWAY</span>
        </a>
        <button className="menu-toggle" aria-label={ui?ui.text('inline:06 Development/react-app/src/surfaces/AccountApp.tsx#7dae3b632430'):locale==='en'?'Menu':'Меню'} aria-expanded={menu} onClick={()=>setMenu(!menu)}><span/><span/><span/></button>
        <nav className="app-main-menu" aria-label={ui?ui.text('inline:06 Development/react-app/src/surfaces/AccountApp.tsx#16aaac3a0561'):locale==='en'?'Main menu':'Главное меню'}><button onClick={()=>navigate('home')}>{shell.tabs.home}</button><button onClick={()=>navigateCatalog('services/'+storedWorld())}>{shell.tabs.services}</button><button onClick={()=>openSupport()}>{ui?ui.text('inline:06 Development/react-app/src/surfaces/AccountApp.tsx#5615deb92612'):locale==='en'?'Help':'Помощь'}</button><button onClick={openVideos}>{ui?ui.text('inline:06 Development/react-app/src/surfaces/AccountApp.tsx#09d409f2df6e'):locale==='en'?'Video':'Видео'}</button></nav>
        <div className="account-header-tools">
          {appearance??<AppearanceControls locale={locale} onLocaleChange={(next) => void changeLocale(next)} theme={theme} onThemeChange={setTheme} />}
          <button className="user-chip" aria-label={shell.tabs.profile} onClick={()=>navigate("profile")}><AppIcon name="user"/></button>
          <button className="account-logout" type="button" disabled={readOnly} onClick={logout}>{shell.logout}</button>
        </div>
      </header>

      {ui&&client.preference&&<ClientUiSyncNotice ui={ui} preference={client.preference} onRetry={()=>void client.controller!.retry()}/>}

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
          {(["profile", "overview", "points", "referrals"].includes(tab)) && <nav className="client-profile-links profile-section-nav" aria-label={shell.nav}>{(["overview", "points", "referrals", "orders"] as const).map(item => <button className="button secondary" type="button" key={item} aria-current={tab === item ? "page" : undefined} onClick={() => navigate(item)}>{shell.tabs[item]}</button>)}<button className="button secondary profile-logout" type="button" disabled={readOnly} onClick={logout}>{shell.logout}</button></nav>}
          <SectionBoundary key={tab === 'services' ? servicePath : tab} locale={locale} errorFallback={<section className="panel" role="alert"><h2>{statusCopy.errorTitle}</h2><button className="button secondary" type="button" onClick={() => window.location.reload()}>{statusCopy.retry}</button></section>}>
          <Suspense fallback={<div className="panel" role="status">{statusCopy.loadingTitle}</div>}>
          {tab==='home'&&<AccountHomeSection ui={ui} navigate={navigateCatalog} onManager={openSupport} pointsBalance={dashboard?.balance??0} onReady={scrollVideosWhenReady}/>}
          {tab==='services'&&(servicePath==='services/bali/exchange/usdt-idr'?(readOnly ? <p className="info-card">{locale === 'ru' ? 'Расчёт и заявки на обмен доступны в самом кабинете клиента.' : 'Exchange quotes and requests are available in the client account.'}</p> : <CurrencyCalculator key={dashboard?.telegram_id} ui={ui} navigate={navigateCatalog} onManager={openSupport} onHaptic={()=>{}} apiPrefix="/api/web" csrfToken={auth?.csrf_token}/>):<CatalogView ui={ui} segments={servicePath.split('/')} navigate={navigateCatalog} onManager={openSupport}/>)}
          {tab === "services" && <RequestsEntry ui={ui} locale={locale} count={dashboard?.orders.length ?? 0} onOpen={() => navigate("orders")} />}
          {tab === "overview" && (
            <section className="page-stack client-overview">
              <BaliLifeEntry ui={ui} locale={locale} onOpen={openLife} />
              <header className="page-heading">
                <span className="eyebrow">{copy.overview}</span>
                <h1>{copy.hello}, {dashboard?.first_name ?? copy.traveller}</h1>
                <p>{copy.overviewLead}</p>
              </header>
              <div className="metric-grid">
                <article>
                  <span>SAFR Points</span>
                  <strong>{dashboard?.balance.toLocaleString(ui?.locale??"ru-RU") ?? 0}</strong>
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
                <h1>{dashboard?.balance.toLocaleString(ui?.locale??"ru-RU") ?? 0} Points</h1>
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
                <h1>{ui?clientAccountInvitedCount(ui,dashboard?.referral_count??0):<>{dashboard?.referral_count ?? 0} {accountPageCopy[locale].invited}</>}</h1>
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
                      <span>{ui&&Object.hasOwn(accountOrderStatusKeys,order.status)?ui.text(accountOrderStatusKeys[order.status]):order.status}</span>
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

          {tab === "visas" && dashboard && (
            <><button className="client-section-back" type="button" onClick={() => navigate("life")}>← {shell.tabs.life}</button><VisaCabinet
              key={`web:${dashboard?.telegram_id}`}
              ui={ui}
              userId={dashboard.telegram_id}
              apiPrefix="/api/web"
              locale={dashboard?.locale ?? "ru"}
              csrfToken={auth?.csrf_token}
            /></>
          )}

          {tab === "life" && dashboard && <BaliLifeCabinet ui={ui} apiPrefix="/api/web" csrfToken={auth?.csrf_token} userId={dashboard.telegram_id} locale={locale} onOpenVisas={() => navigate("visas")} onManager={() => openSupport()} />}

          {tab === "profile" && (
            <section className="page-stack client-profile">
              <header className="page-heading">
                <span className="eyebrow">{copy.profile}</span>
                <h1>{dashboard?.first_name ?? copy.user}</h1>
                <p>{copy.profileLead}</p>
              </header>
              <ProfileIdentity ui={ui} locale={locale} username={dashboard?.username} firstName={dashboard?.first_name} referralLink={dashboard?.referral_link} copied={copied} onCopy={copyReferral} />
            </section>
          )}

          {tab === "support" && (
            <SupportPanel
              ui={ui}
              userId={dashboard?.telegram_id}
              csrfToken={auth?.csrf_token}
              initialContact={dashboard?.username}
              apiPrefix="/api/web"
              onOpenTelegram={readOnly ? () => {} : browserRuntime.openTelegram}
            />
          )}
          </Suspense>
          </SectionBoundary>
        </main>
      </div>
      <BottomNavigation ui={ui} activeTab={clientNavigationTab(tab)} onNavigate={next => next === "services" ? navigateCatalog(`services/${storedWorld()}`) : navigate(next)} />
      {tab!=='support'&&<SupportDrawer ui={ui} userId={dashboard?.telegram_id} open={supportOpen} onOpen={()=>openSupport()} onClose={()=>setSupportOpen(false)} apiPrefix="/api/web" routeContext={supportContext} onOpenTelegram={readOnly ? () => {} : browserRuntime.openTelegram} initialContact={dashboard?.username} csrfToken={auth?.csrf_token}/>}
    </div></I18nProvider>
  );
}

function AccountStatus({
  title,
  detail,
  eyebrow,
  children,
  tools,
}: {
  title: string;
  detail: string;
  eyebrow: string;
  children?: React.ReactNode;
  tools?: React.ReactNode;
}) {
  return (
    <main className="account-status">
      <a className="brand" href="https://safrway.online/">
        <span className="brand-mark">S</span>
        <span>SAFRWAY</span>
      </a>
      {tools}
      <section>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="status-actions">{children}</div>
      </section>
    </main>
  );
}
