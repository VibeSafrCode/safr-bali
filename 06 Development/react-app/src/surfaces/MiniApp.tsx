import {isAccountPreview} from '../api/account-preview';
import {serverContactLocale,type ClientUiBindings} from '../i18n/client-ui-bindings';
import type {ClientRuntimeKey} from '../i18n/client-runtime';
import {useClientUiController} from '../i18n/use-client-ui-controller';
import {clientUiPrincipal} from '../i18n/client-ui-surface';
import {requireClientUiPreference} from '../i18n/client-ui-preference';
import {clientSupportApiError as clientUiApiError} from '../i18n/client-support-copy';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import { yogaLaunchSession, YOGA_MINI_APP, YOGA_BOT_URL, type YogaLaunch } from "../runtime/yoga-mini-app";
import type { Dashboard, MiniAppUiPreferenceRead, RouteContext } from "../api/types";
import { AppShell } from "../components/AppShell";
import {SectionBoundary} from '../components/SectionBoundary';
import { isYogaBrand } from "../ui/client-brand";
import type { AppTab } from "../components/BottomNavigation";
import { ProfileIdentity } from "../components/ProfileIdentity";
import { ProfileStats } from "../components/ProfileStats";
import {SupportDrawer} from '../components/SupportDrawer';
import {supportIntentMemory} from '../components/support-intent';
import {storedWorld} from '../components/DestinationDesign';
import { BaliLifeCabinet } from "../components/BaliLifeCabinet";
import { RequestsEntry } from "../components/RequestsEntry";
import { clientNavigationTab, miniRouteSegments } from "../components/client-navigation";
import {
  createTelegramRuntime,
  loadTelegramWebApp,
  telegramInitData,
} from "../runtime/telegram";
import type { TelegramWebApp } from "../runtime/types";
import {
  cacheLocale,
  clearPendingLocale,
  initialLocale,
  queuePendingLocale,
  readCachedLocale,
  type LocaleCode,
} from "../i18n/locale";
import {
  I18nProvider,
  localizedApiError,
  translate,
  type MiniAppTranslationKey,
} from "../i18n/runtime";

// Existing sections, loaded on navigation; no separate application/framework.
const CatalogView = lazy(() => import('../components/CatalogView').then(module => ({default: module.CatalogView})));
const CurrencyCalculator = lazy(() => import('../components/CurrencyCalculator').then(module => ({default: module.CurrencyCalculator})));
const HomeView = lazy(() => import('../components/HomeView').then(module => ({default: module.HomeView})));
const SupportPanel = lazy(() => import('../components/SupportPanel').then(module => ({default: module.SupportPanel})));
const VisaCabinet = lazy(() => import('../components/VisaCabinet').then(module => ({default: module.VisaCabinet})));

type MiniUiKey = Extract<MiniAppTranslationKey,ClientRuntimeKey>;

async function readMiniUiPreference(api:ReturnType<typeof appApiClient>,signal:AbortSignal):Promise<MiniAppUiPreferenceRead>{
  const child=new AbortController();
  let rejectRead!:(reason:Error)=>void,timer:number|undefined;
  const interrupted=new Promise<never>((_resolve,reject)=>{rejectRead=reject;});
  const cleanup=()=>{
    if(timer!==undefined){window.clearTimeout(timer);timer=undefined;}
    signal.removeEventListener('abort',aborted);
  };
  const stop=(reason:Error)=>{cleanup();child.abort();rejectRead(reason);};
  const aborted=()=>stop(new DOMException('Mini UI preference read aborted','AbortError'));
  timer=window.setTimeout(()=>stop(new ApiError('Mini UI preference read timed out',{kind:'network'})),1500);
  signal.addEventListener('abort',aborted,{once:true});
  if(signal.aborted)aborted();
  try{
    return await Promise.race([Promise.resolve().then(()=>{
      if(child.signal.aborted)throw new DOMException('Mini UI preference read aborted','AbortError');
      return api.request<MiniAppUiPreferenceRead>('/mini-app/preferences/ui-locale',{signal:child.signal});
    }),interrupted]);
  }finally{cleanup();}
}

const statusKeys: Record<string, MiniUiKey> = {
  new: "order.status.new",
  contacted: "order.status.contacted",
  waiting_payment: "order.status.waitingPayment",
  paid: "order.status.paid",
  in_progress: "order.status.inProgress",
  completed: "order.status.completed",
  cancelled: "order.status.cancelled",
};

function routeSegments() {
  return miniRouteSegments(window.location.hash, window.location.search);
}

function routeTab(segments: string[]): AppTab {
  const value = segments[0];
  if (
    value === "services" ||
    value === "life" ||
    value === "orders" ||
    value === "visas" ||
    value === "profile" ||
    value === "support"
  ) {
    return value;
  }
  return "home";
}

export function MiniApp() {
  if(!YOGA_MINI_APP&&isAccountPreview())throw new Error('CLIENT_UI_MINI_PREVIEW_BOUNDARY');
  const [locale, setLocale] = useState<LocaleCode>(() =>
    initialLocale({
      cached: readCachedLocale(),
      browser: typeof navigator === "undefined" ? [] : navigator.languages,
    }),
  );
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const runtime = useMemo(
    () => createTelegramRuntime(() => webApp),
    [webApp],
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  // StrictMode may dispose and replay an effect. Keep one signature exchange
  // for this mounted launch; disposing a view must not abort a server commit.
  const yogaAuthentication = useRef<ReturnType<typeof yogaLaunchSession> | null>(null);
  const yogaLaunch = useRef<YogaLaunch | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const yogaDashboardRef = useRef<Dashboard | null>(null);
  const [yogaViewKey, setYogaViewKey] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<"pending" | "ready" | "error">("pending");
  const yogaLocaleWrite = useRef<Promise<void> | null>(null);
  const yogaLocaleVersion = useRef(0);
  const yogaLocaleIntent=useRef<{locale:LocaleCode;revision:number;launch:YogaLaunch;controller:AbortController}|null>(null);
  const persistedLocale = useRef<LocaleCode>(locale);
  const [localeStatus, setLocaleStatus] = useState<
    "idle" | "loading" | "pending" | "success" | "error" | "offline"
  >("idle");
  const [status, setStatus] = useState<
    "loading" | "ready" | "outside" | "error" | "session-invalid"
  >("loading");
  const [error, setError] = useState<unknown>(null);
  const loadVersion=useRef(0),loadActive=useRef<AbortController|null>(null),refreshTimer=useRef<number|null>(null);
  const client=useClientUiController('mini',!YOGA_MINI_APP,{onLogout:()=>clearMainPrincipal(),onAuthorityLost:()=>clearMainPrincipal()});
  const ui=YOGA_MINI_APP?undefined:client.ui;
  const [segments, setSegments] = useState(routeSegments);
  const [supportContext, setSupportContext] = useState<RouteContext>({});
  const [supportOpen,setSupportOpen]=useState(false);
  const [copied, setCopied] = useState(false);
  const activeTab = routeTab(segments);
  const isBaliCurrencyCalculator =
    segments.join("/") === "services/bali/exchange/usdt-idr";
  const t = (key: MiniUiKey, variables?: Record<string, string | number>) =>
    ui?ui.text(key,variables):translate(locale,key,variables);

  function clearMainPrincipal(){
    supportIntentMemory.clear();
    cancelRefresh();
    loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
    client.controller!.logout();setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('outside');
  }

  function cancelRefresh(){
    if(refreshTimer.current!==null){window.clearTimeout(refreshTimer.current);refreshTimer.current=null;}
  }

  function refreshMainMiniApp(){
    cancelRefresh();loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
    client.controller!.beginLoad();
    setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('loading');
    refreshTimer.current=window.setTimeout(()=>{refreshTimer.current=null;void authenticateMain();},50);
  }

  async function authenticateMain(){
    if(loadActive.current)return;
    cancelRefresh();
    const controller=new AbortController(),version=++loadVersion.current,token=client.controller!.beginLoad();
    loadActive.current=controller;
    const current=()=>!controller.signal.aborted&&version===loadVersion.current&&client.controller!.current(token);
    setDashboard(null);setSupportOpen(false);setCopied(false);setStatus('loading');
    try{
      const telegram=await loadTelegramWebApp();if(!current())return;
      setWebApp(telegram);await createTelegramRuntime(()=>telegram).initialize();if(!current())return;
      const api=appApiClient();let result:Dashboard;
      try{result=await api.request<Dashboard>('/mini-app/me',{signal:controller.signal});}
      catch(caught){
        if(!current())return;
        if(!(caught instanceof ApiError)||caught.kind!=='authentication')throw caught;
        try{await api.request('/mini-app/auth/refresh',{method:'POST',signal:controller.signal});}
        catch(refreshError){
          if(!current())return;
          if(!(refreshError instanceof ApiError)||refreshError.kind!=='authentication')throw refreshError;
          const initData=telegramInitData(telegram);
          if(!initData){client.controller!.bind(token,null,'ru');setStatus('outside');return;}
          await api.request('/mini-app/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({init_data:initData}),signal:controller.signal});
        }
        if(!current())return;
        result=await api.request<Dashboard>('/mini-app/me',{signal:controller.signal});
      }
      if(!current())return;
      const actor=clientUiPrincipal('mini',{telegram_id:result&&typeof result==='object'&&!Array.isArray(result)&&
        Object.hasOwn(result,'telegram_id')?result.telegram_id:undefined}),contact=serverContactLocale(result.locale);
      if(!actor)throw new ApiError('Mini App identity missing',{kind:'invalid_response'});
      // /me has already verified this actor. Do not inherit preference/CSRF
      // fields from its Dashboard or wait for optional configuration to show it.
      if(!client.controller!.bind(token,{actor:actor.actor,preference:undefined},contact))return;
      const preferenceVersion=client.controller!.preference.snapshot().version;
      setLocale(contact);setError(null);setDashboard(result);setStatus('ready');
      const unavailable=()=>{
        if(current()&&client.controller!.preference.snapshot().version===preferenceVersion)
          client.controller!.preference.bindPrincipal(actor.actor,null);
      };
      let read:MiniAppUiPreferenceRead;
      try{read=await readMiniUiPreference(api,controller.signal);}
      catch(caught){
        if(!current())return;
        if(caught instanceof ApiError&&(caught.kind==='authentication'||caught.status===401||caught.status===403))throw caught;
        // Unavailable rollout/network/configuration stays local, with no saved
        // claim, write credentials, Web-cookie fallback or old projection.
        if(!(caught instanceof ApiError&&(caught.kind==='network'||caught.status===404||
          (caught.status!==undefined&&caught.status>=500&&caught.status<=599))))throw caught;
        unavailable();
        return;
      }
      if(!current())return;
      // Identity failures remain fatal even if a newer local language gesture
      // means this preference value must no longer be adopted.
      const identity=clientUiPrincipal('mini',{telegram_id:read&&typeof read==='object'&&!Array.isArray(read)&&
        Object.hasOwn(read,'telegram_id')?read.telegram_id:undefined});
      if(!identity||actor.actor!==identity.actor)throw new ApiError('Mini App identity mismatch',{kind:'invalid_response'});
      let principal;
      try{
        principal=clientUiPrincipal('mini',read);
        if(!principal?.csrf)throw new Error('CLIENT_UI_PREFERENCE_CREDENTIAL_UNAVAILABLE');
        requireClientUiPreference(principal.preference);
      }catch{unavailable();return;}
      client.controller!.bind(token,principal,contact);
    }catch(caught){if(current()&&(caught as DOMException).name!=='AbortError'){
      clearMainPrincipal();setError(caught);setStatus('error');
    }}finally{if(loadActive.current===controller)loadActive.current=null;}
  }

  function isCurrentYogaLaunch(launch: YogaLaunch, controller: AbortController) {
    return yogaLaunch.current === launch && lifecycle.current === controller && !controller.signal.aborted;
  }

  function invalidateYogaSession() {
    yogaLaunch.current?.invalidate();
    yogaDashboardRef.current = null;
    setDashboard(null);
    setSupportOpen(false);
    setStatus("session-invalid");
  }

  function syncYogaLocale(nextLocale: LocaleCode, launch: YogaLaunch, controller: AbortController, revision: number) {
    const write = async () => {
      if (!isCurrentYogaLaunch(launch, controller) || launch.invalidated || revision !== yogaLocaleVersion.current) return;
      const previousLocale = persistedLocale.current;
      try {
        await appApiClient().request("/mini-app/locale", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }), signal: controller.signal,
        });
        if (!isCurrentYogaLaunch(launch, controller) || launch.invalidated) return;
        persistedLocale.current = nextLocale;
        if (revision !== yogaLocaleVersion.current) return;
        yogaLocaleIntent.current=null;
        clearPendingLocale();
        setLocaleStatus("success");
      } catch (caught) {
        if (!isCurrentYogaLaunch(launch, controller)) return;
        if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
          invalidateYogaSession();
          return;
        }
        if (revision !== yogaLocaleVersion.current || launch.invalidated) return;
        yogaLocaleIntent.current=null;
        clearPendingLocale();
        setLocale(previousLocale);
        cacheLocale(previousLocale);
        setDashboard((current) => current ? { ...current, locale: previousLocale } : current);
        setLocaleStatus("error");
      }
    };
    // Keep language writes ordered without holding up the authenticated shell.
    const task = yogaLocaleWrite.current ? yogaLocaleWrite.current.then(write, write) : write();
    yogaLocaleWrite.current = task;
    void task.finally(() => { if (yogaLocaleWrite.current === task) yogaLocaleWrite.current = null; });
    return task;
  }

  async function readYogaAccount(launch: YogaLaunch, controller: AbortController, promise = launch.account) {
    try {
      const result = await promise;
      if (!isCurrentYogaLaunch(launch, controller) || launch.invalidated || !result) return;
      persistedLocale.current = result.locale ?? "ru";
      yogaDashboardRef.current = result;
      setDashboard(result);
      setAccountStatus("ready");
      // Only this live launch's explicit gesture authorizes a delayed contact
      // write. A legacy unbound storage key is not another actor's permission.
      const intent=yogaLocaleIntent.current;
      if (intent?.launch===launch&&intent.controller===controller&&intent.revision===yogaLocaleVersion.current) {
        setLocaleStatus(navigator.onLine ? "pending" : "offline");
        if (navigator.onLine) void syncYogaLocale(intent.locale, launch, controller, intent.revision);
      }
    } catch (caught) {
      if (!isCurrentYogaLaunch(launch, controller)) return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        invalidateYogaSession();
        return;
      }
      if (launch.invalidated || (caught as { name?: string } | null)?.name === "AbortError") return;
      yogaDashboardRef.current = null;
      setDashboard(null);
      setAccountStatus("error");
    }
  }

  function retryYogaAccount() {
    const launch = yogaLaunch.current;
    const controller = lifecycle.current;
    if (!launch || !controller || !isCurrentYogaLaunch(launch, controller) || launch.invalidated) return;
    setAccountStatus("pending");
    void readYogaAccount(launch, controller, launch.retryAccount());
  }

  useEffect(() => {
    const update = () => {
      setSupportOpen(false);
      setSegments(routeSegments());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("hashchange", update);
    if (!window.location.hash.startsWith("#/")) {
      const initialRoute = routeSegments().join("/");
      window.history.replaceState(null, "", `#/${initialRoute}`);
      update();
    }
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if(!YOGA_MINI_APP)return;
    const controller = new AbortController();
    lifecycle.current = controller;

    async function authenticate() {
      const telegram = await loadTelegramWebApp();
      if (controller.signal.aborted) return;
      if (YOGA_MINI_APP && !telegram) {
        setError(locale==='en'?'Telegram could not load. Reopen the Mini App.':'Не удалось загрузить Telegram. Откройте Mini App заново.');
        setStatus('error');
        return;
      }
      setWebApp(telegram);
      await createTelegramRuntime(() => telegram).initialize();
      const api = appApiClient();
      try {
        if (YOGA_MINI_APP) {
          yogaAuthentication.current ??= yogaLaunchSession();
          const launch = yogaAuthentication.current(api, telegramInitData(telegram));
          yogaLaunch.current = launch;
          yogaDashboardRef.current = null;
          setDashboard(null);
          setAccountStatus("pending");
          setYogaViewKey(launch.viewInstanceKey);
          if (!await launch.verified) {
            if (!controller.signal.aborted) setStatus("outside");
            return;
          }
          if (!isCurrentYogaLaunch(launch, controller)) return;
          setStatus("ready");
          // The account promise already depends on verified. Life mounts now,
          // while that logical read continues; it does not need an actor ID.
          void readYogaAccount(launch, controller);
          return;
        }
      } catch (caught) {
        if (!controller.signal.aborted && (caught as DOMException).name !== "AbortError") {
          setError(localizedApiError(locale, caught));
          setStatus("error");
        }
      }
    }

    void authenticate();
    return () => controller.abort();
  }, []);

  useEffect(()=>{
    if(YOGA_MINI_APP)return;
    void authenticateMain();
    const refresh=()=>refreshMainMiniApp();
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);
    return()=>{cancelRefresh();loadVersion.current++;loadActive.current?.abort();loadActive.current=null;
      window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible);};
  },[]);

  useEffect(() => {
    const backButton = webApp?.BackButton;
    if (!backButton) return;
    const canGoBack = activeTab !== "life";
    const handleBack = () => {
      if (!window.dispatchEvent(new Event("safr:modal-back", { cancelable: true }))) return;
      runtime.impact("light");
      if (activeTab === "orders") { navigate(`services/${storedWorld()}`);
      } else if (activeTab === "visas") { navigate("life");
      } else if (segments.length === 2 && segments[0] === "services") { navigate("home");
      } else if (segments.length > 1) {
        navigate(segments.slice(0, -1).join("/"));
      } else {
        navigate("life");
      }
    };
    if (canGoBack) {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
    }
    return () => backButton.offClick(handleBack);
  }, [activeTab, runtime, segments, webApp]);

  function navigate(path: string) {
    setSupportOpen(false);
    runtime.impact("light");
    window.location.hash = `#/${path}`;
  }

  function openSupport(context: RouteContext = {}) {
    setSupportContext(context);
    setSupportOpen(true);
  }

  async function copyReferralLink() {
    if (!dashboard?.referral_link) return;
    const version=loadVersion.current;
    await navigator.clipboard.writeText(dashboard.referral_link);
    if(!YOGA_MINI_APP&&version!==loadVersion.current)return;
    setCopied(true);
    runtime.impact("medium");
    window.setTimeout(() => {if(YOGA_MINI_APP||version===loadVersion.current)setCopied(false);}, 1600);
  }

  async function changeLocale(nextLocale: LocaleCode, retry = false) {
    if(!YOGA_MINI_APP){await client.controller!.choose(nextLocale);return;}
    // Every accepted intent supersedes older writes, including offline and
    // pre-account choices. A late response must not clear or roll back it.
    const yogaIntentRevision = YOGA_MINI_APP ? ++yogaLocaleVersion.current : 0;
    const launchAtStart = yogaLaunch.current;
    const lifecycleAtStart = lifecycle.current;
    const previousLocale = persistedLocale.current;
    setLocaleStatus("loading");
    // Yoga intent (revision, UI and pending value) is one synchronous action.
    // A deferred account response cannot claim a stale pending value under the
    // newer revision. Preserve Main's existing transition delay unchanged.
    if (!YOGA_MINI_APP) await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    if (YOGA_MINI_APP && (!launchAtStart || !lifecycleAtStart || !isCurrentYogaLaunch(launchAtStart, lifecycleAtStart) || launchAtStart.invalidated || yogaIntentRevision !== yogaLocaleVersion.current)) return;
    if(YOGA_MINI_APP&&launchAtStart&&lifecycleAtStart)
      yogaLocaleIntent.current={locale:nextLocale,revision:yogaIntentRevision,launch:launchAtStart,controller:lifecycleAtStart};
    setLocale(nextLocale);
    cacheLocale(nextLocale);
    queuePendingLocale(nextLocale);
    setLocaleStatus(navigator.onLine ? "pending" : "offline");
    setDashboard((current) =>
      current ? { ...current, locale: nextLocale } : current,
    );
    if (!navigator.onLine) return;
    if (YOGA_MINI_APP) {
      const launch = yogaLaunch.current;
      const controller = lifecycle.current;
      // Before account arrives, retain the selected language locally. The
      // account response supplies the rollback baseline, then syncs in background.
      if (launch && controller && yogaDashboardRef.current) await syncYogaLocale(nextLocale, launch, controller, yogaIntentRevision);
      return;
    }
    try {
      await appApiClient().request("/mini-app/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      persistedLocale.current = nextLocale;
      clearPendingLocale();
      setLocaleStatus("success");
    } catch {
      clearPendingLocale();
      setLocale(previousLocale);
      cacheLocale(previousLocale);
      setDashboard((current) =>
        current ? { ...current, locale: previousLocale } : current,
      );
      setLocaleStatus("error");
    }
  }

  if (status === "loading") {
    return <StatusScreen ui={ui} title={t("mini.loading.title")} detail={t("mini.loading.detail")} />;
  }

  if (status === "outside") {
    return (
      <StatusScreen ui={ui}
        title={t("mini.outside.title")}
        detail={t("mini.outside.detail")}
      >
        <a className="button primary" href={YOGA_MINI_APP ? YOGA_BOT_URL : "https://t.me/safr_bali_bot"}>
          {t("mini.outside.backToBot")}
        </a>
      </StatusScreen>
    );
  }

  if (status === "error" || status === "session-invalid") {
    return (
      <StatusScreen ui={ui} title={t("mini.error.title")} detail={status === "session-invalid" ? t("api.error.authentication") : ui?clientUiApiError(ui,error):typeof error==='string'?error:localizedApiError(locale,error)}>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          {t("mini.action.retry")}
        </button>
      </StatusScreen>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <AppShell
      ui={ui} uiPreference={client.preference} onClientLocaleChange={value=>void client.controller?.choose(value)}
      webApp={webApp}
      activeTab={clientNavigationTab(activeTab)}
      userName={YOGA_MINI_APP && !dashboard ? "—" : dashboard?.first_name ?? t("mini.user.traveler")}
      locale={locale}
      onLocaleChange={(nextLocale) => void changeLocale(nextLocale)}
      localeStatus={YOGA_MINI_APP?localeStatus:"idle"}
      onLocaleRetry={() => {if(YOGA_MINI_APP)void changeLocale(locale,true);else void client.controller!.retry();}}
      onNavigate={(tab) => {
        if (tab === "support") openSupport();
        else if(tab==='services')navigate('services/'+storedWorld());
        else navigate(tab);
      }}
    >
      {YOGA_MINI_APP && accountStatus !== "ready" && <div className="panel" role={accountStatus === "error" ? "alert" : "status"}>
        <p>{accountStatus === "pending"
          ? locale === "en" ? "Loading your account… Services are available below." : "Загружаем личный кабинет… Услуги доступны ниже."
          : locale === "en" ? "Your account could not load. Services remain available." : "Не удалось загрузить личный кабинет. Услуги остаются доступны."}</p>
        {accountStatus === "error" && <button className="button secondary" type="button" onClick={retryYogaAccount}>{locale === "en" ? "Retry account" : "Повторить загрузку кабинета"}</button>}
      </div>}
      <SectionBoundary key={segments.join('/')} locale={locale} errorFallback={ui ? <section className="panel" role="alert" lang={ui.locale} dir={ui.dir}>
        <h2>{t('mini.error.title')}</h2>
        <button className="button secondary" type="button" onClick={() => window.location.reload()}>{t('mini.action.retry')}</button>
      </section> : undefined}>
      <Suspense fallback={<div className="panel" role="status">{t('mini.loading.detail')}</div>}>
        {activeTab === "home" && (
          <HomeView
              ui={ui}
            navigate={navigate}
            onManager={openSupport}
            pointsBalance={YOGA_MINI_APP ? dashboard?.balance ?? null : dashboard?.balance ?? 0}
          />
        )}

        {activeTab === "services" && (
          isBaliCurrencyCalculator ? (
            <CurrencyCalculator
              ui={ui}
              navigate={navigate}
              onManager={openSupport}
              onHaptic={() => runtime.impact("light")}
            />
          ) : (
            <CatalogView
              ui={ui}
              segments={segments}
              navigate={navigate}
              onManager={openSupport}
            />
          )
        )}
        {activeTab === "services" && <RequestsEntry ui={ui} locale={locale} count={YOGA_MINI_APP ? dashboard?.orders.length ?? null : dashboard?.orders.length ?? 0} onOpen={() => navigate("orders")} />}

        {activeTab === "orders" && (
          <section className="page-stack">
            <button className="client-section-back" type="button" onClick={() => navigate(`services/${storedWorld()}`)}>← {ui?ui.text('inline:06 Development/react-app/src/surfaces/MiniApp.tsx#18a8f0e56eff'):locale === "ru" ? "Услуги" : "Services"}</button>
            <header className="page-heading">
              <span className="eyebrow">{t("orders.eyebrow")}</span>
              <h1>{t("orders.title")}</h1>
              <p>{t("orders.description")}</p>
            </header>
            {YOGA_MINI_APP && !dashboard ? <p role="status">{accountStatus === "pending" ? t("mini.loading.detail") : locale === "en" ? "Request data is unavailable until your account loads." : "Данные заявок недоступны до загрузки кабинета."}</p> : dashboard?.orders.length ? (
              <div className="order-list">
                {dashboard.orders.map((order) => (
                  <article key={order.id}>
                    <div>
                      <strong>{order.service}</strong>
                      <small>{t("orders.number", { id: order.id })}</small>
                    </div>
                    <span>{Object.hasOwn(statusKeys,order.status) ? t(statusKeys[order.status]) : order.status}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>{t("orders.empty.title")}</strong>
                <p>{t("orders.empty.detail")}</p>
                <button className="button secondary" type="button" onClick={() => navigate("services")}>
                  {t("orders.openCatalog")}
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === "visas" && (
          <><button className="client-section-back" type="button" onClick={() => navigate("life")}>← {ui?ui.text('source:06 Development/react-app/src/surfaces/AccountApp.tsx#accountShellCopy.tabs.life'):locale === "ru" ? "Моя жизнь" : "My life"}</button>{YOGA_MINI_APP
            ? <VisaCabinet apiPrefix="/mini-app" locale={locale} />
            : dashboard && <VisaCabinet ui={ui} userId={dashboard.telegram_id} apiPrefix="/mini-app" locale={locale} />}</>
        )}

        {activeTab === "life" && (YOGA_MINI_APP
          ? yogaViewKey && <BaliLifeCabinet apiPrefix="/mini-app" viewInstanceKey={yogaViewKey} locale={locale} onSessionInvalid={invalidateYogaSession} onOpenVisas={() => navigate("visas")} onManager={() => openSupport()} />
          : dashboard && <BaliLifeCabinet ui={ui} apiPrefix="/mini-app" userId={dashboard.telegram_id} locale={locale} onOpenVisas={() => navigate("visas")} onManager={() => openSupport()} />)}

        {activeTab === "profile" && (
          <section className="page-stack client-profile">
            <header className="page-heading">
              <span className="eyebrow">{t("profile.eyebrow")}</span>
              <h1>{YOGA_MINI_APP && !dashboard ? "—" : dashboard?.first_name ?? t("mini.user.traveler")}</h1>
              <p>{t("profile.description")}</p>
            </header>
            <ProfileStats ui={ui} dashboard={dashboard} pending={YOGA_MINI_APP && !dashboard} />
            {(!YOGA_MINI_APP || dashboard) && <ProfileIdentity ui={ui} locale={locale} username={dashboard?.username} firstName={dashboard?.first_name} referralLink={dashboard?.referral_link} copied={copied} onCopy={copyReferralLink} />}
          </section>
        )}

        {activeTab === "support" && (
          <SupportPanel
              ui={ui} userId={!YOGA_MINI_APP?dashboard?.telegram_id:undefined}
            apiPrefix="/mini-app"
            routeContext={supportContext}
            onOpenTelegram={runtime.openTelegram}
          />
        )}
      </Suspense>
      </SectionBoundary>
        {activeTab!=='support'&&<SupportDrawer ui={ui} userId={!YOGA_MINI_APP?dashboard?.telegram_id:undefined} open={supportOpen} onClose={()=>setSupportOpen(false)} onOpen={()=>openSupport()} apiPrefix="/mini-app" routeContext={supportContext} onOpenTelegram={runtime.openTelegram} initialContact={dashboard?.username}/>}
      </AppShell>
    </I18nProvider>
  );
}

function StatusScreen({
  title,
  detail,
  children,
  ui,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
  ui?:ClientUiBindings;
}) {
  return (
    <main className="status-screen" lang={ui?.locale} dir={ui?.dir}>
      <span className="brand-mark">{isYogaBrand ? "YG" : "S"}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      <div className="status-actions">{children}</div>
    </main>
  );
}
