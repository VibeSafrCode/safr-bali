import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import type { Dashboard, RouteContext } from "../api/types";
import { AppShell } from "../components/AppShell";
import type { AppTab } from "../components/BottomNavigation";
import { CatalogView } from "../components/CatalogView";
import { CurrencyCalculator } from "../components/CurrencyCalculator";
import { HomeView } from "../components/HomeView";
import { ProfileStats } from "../components/ProfileStats";
import { SupportPanel } from "../components/SupportPanel";
import {
  createTelegramRuntime,
  loadTelegramWebApp,
  telegramInitData,
} from "../runtime/telegram";
import type { TelegramWebApp } from "../runtime/types";
import {
  authenticatedLocale,
  cacheLocale,
  clearPendingLocale,
  initialLocale,
  queuePendingLocale,
  readCachedLocale,
  readPendingLocale,
  type LocaleCode,
} from "../i18n/locale";
import {
  I18nProvider,
  localizedApiError,
  translate,
  type MiniAppTranslationKey,
} from "../i18n/runtime";

const statusKeys: Record<string, MiniAppTranslationKey> = {
  new: "order.status.new",
  contacted: "order.status.contacted",
  waiting_payment: "order.status.waitingPayment",
  paid: "order.status.paid",
  in_progress: "order.status.inProgress",
  completed: "order.status.completed",
  cancelled: "order.status.cancelled",
};

function routeSegments() {
  const appHash = window.location.hash.startsWith("#/")
    ? window.location.hash
    : "";
  const requestedScreen = new URLSearchParams(window.location.search).get(
    "screen",
  );
  const value = (
    appHash.replace(/^#\/?/, "") ||
    (/^[a-z0-9/-]{1,200}$/.test(requestedScreen ?? "")
      ? requestedScreen
      : "") ||
    "home"
  );
  return value.split("/").filter(Boolean);
}

function routeTab(segments: string[]): AppTab {
  const value = segments[0];
  if (
    value === "services" ||
    value === "orders" ||
    value === "profile" ||
    value === "support"
  ) {
    return value;
  }
  return "home";
}

export function MiniApp() {
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
  const persistedLocale = useRef<LocaleCode>(locale);
  const [localeStatus, setLocaleStatus] = useState<
    "idle" | "loading" | "pending" | "success" | "error" | "offline"
  >("idle");
  const [status, setStatus] = useState<
    "loading" | "ready" | "outside" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [segments, setSegments] = useState(routeSegments);
  const [supportContext, setSupportContext] = useState<RouteContext>({});
  const [copied, setCopied] = useState(false);
  const activeTab = routeTab(segments);
  const isBaliCurrencyCalculator =
    segments.join("/") === "services/bali/exchange/usdt-idr";
  const t = (key: MiniAppTranslationKey, variables?: Record<string, string | number>) =>
    translate(locale, key, variables);

  useEffect(() => {
    const update = () => {
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
    const controller = new AbortController();

    async function authenticate() {
      const telegram = await loadTelegramWebApp();
      if (controller.signal.aborted) return;
      setWebApp(telegram);
      await createTelegramRuntime(() => telegram).initialize();
      if (!readCachedLocale()) {
        // Telegram language_code is validated and persisted by FastAPI during
        // the signed initData exchange. Before /me returns, use only the
        // browser fallback and never trust parsed Telegram identity.
        const fallbackLocale = initialLocale({
          browser: navigator.languages,
        });
        setLocale(fallbackLocale);
        cacheLocale(fallbackLocale);
      }

      const api = appApiClient();
      try {
        let result: Dashboard;
        try {
          result = await api.request<Dashboard>("/mini-app/me", {
            signal: controller.signal,
          });
        } catch (caught) {
          if (!(caught instanceof ApiError) || caught.kind !== "authentication") {
            throw caught;
          }
          try {
            await api.request("/mini-app/auth/refresh", {
              method: "POST",
              signal: controller.signal,
            });
          } catch (refreshError) {
            if (
              !(refreshError instanceof ApiError) ||
              refreshError.kind !== "authentication"
            ) {
              throw refreshError;
            }
            const initData = telegramInitData(telegram);
            if (!initData) {
              setStatus("outside");
              return;
            }
            await api.request("/mini-app/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ init_data: initData }),
              signal: controller.signal,
            });
          }
          result = await api.request<Dashboard>("/mini-app/me", {
            signal: controller.signal,
          });
        }
        const pendingLocale = readPendingLocale();
        const resolvedLocale = authenticatedLocale(result.locale, pendingLocale);
        persistedLocale.current = result.locale ?? "ru";
        if (pendingLocale) {
          setLocaleStatus(navigator.onLine ? "pending" : "offline");
          try {
            if (navigator.onLine) {
              await api.request("/mini-app/locale", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locale: pendingLocale }),
                signal: controller.signal,
              });
              persistedLocale.current = pendingLocale;
              clearPendingLocale();
              setLocaleStatus("success");
            }
          } catch {
            const previousLocale = persistedLocale.current;
            clearPendingLocale();
            setLocale(previousLocale);
            cacheLocale(previousLocale);
            setLocaleStatus("error");
          }
        }
        setLocale(resolvedLocale);
        cacheLocale(resolvedLocale);
        setDashboard({ ...result, locale: resolvedLocale });
        setStatus("ready");
      } catch (caught) {
        if ((caught as DOMException).name !== "AbortError") {
          setError(localizedApiError(locale, caught));
          setStatus("error");
        }
      }
    }

    void authenticate();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const backButton = webApp?.BackButton;
    if (!backButton) return;
    const canGoBack = segments.length > 1 || activeTab !== "home";
    const handleBack = () => {
      runtime.impact("light");
      if (segments.length > 1) {
        navigate(segments.slice(0, -1).join("/"));
      } else {
        navigate("home");
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
    runtime.impact("light");
    window.location.hash = `#/${path}`;
  }

  function openSupport(context: RouteContext = {}) {
    setSupportContext(context);
    navigate("support");
  }

  async function copyReferralLink() {
    if (!dashboard?.referral_link) return;
    await navigator.clipboard.writeText(dashboard.referral_link);
    setCopied(true);
    runtime.impact("medium");
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function changeLocale(nextLocale: LocaleCode, retry = false) {
    if (nextLocale === locale && !retry) return;
    const previousLocale = persistedLocale.current;
    setLocaleStatus("loading");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    setLocale(nextLocale);
    cacheLocale(nextLocale);
    queuePendingLocale(nextLocale);
    setLocaleStatus(navigator.onLine ? "pending" : "offline");
    setDashboard((current) =>
      current ? { ...current, locale: nextLocale } : current,
    );
    if (!navigator.onLine) return;
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
    return <StatusScreen title={t("mini.loading.title")} detail={t("mini.loading.detail")} />;
  }

  if (status === "outside") {
    return (
      <StatusScreen
        title={t("mini.outside.title")}
        detail={t("mini.outside.detail")}
      >
        <a className="button primary" href="https://t.me/safr_bali_bot">
          {t("mini.outside.backToBot")}
        </a>
      </StatusScreen>
    );
  }

  if (status === "error") {
    return (
      <StatusScreen title={t("mini.error.title")} detail={error}>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          {t("mini.action.retry")}
        </button>
      </StatusScreen>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <AppShell
      webApp={webApp}
      activeTab={activeTab}
      userName={dashboard?.first_name ?? t("mini.user.traveler")}
      locale={locale}
      onLocaleChange={(nextLocale) => void changeLocale(nextLocale)}
      localeStatus={localeStatus}
      onLocaleRetry={() => void changeLocale(locale, true)}
      onNavigate={(tab) => {
        if (tab === "support") openSupport();
        else navigate(tab);
      }}
    >
        {activeTab === "home" && (
          <HomeView
            navigate={navigate}
            onManager={openSupport}
            pointsBalance={dashboard?.balance ?? 0}
          />
        )}

        {activeTab === "services" && (
          isBaliCurrencyCalculator ? (
            <CurrencyCalculator
              navigate={navigate}
              onManager={openSupport}
              onHaptic={() => runtime.impact("light")}
            />
          ) : (
            <CatalogView
              segments={segments}
              navigate={navigate}
              onManager={openSupport}
            />
          )
        )}

        {activeTab === "orders" && (
          <section className="page-stack">
            <header className="page-heading">
              <span className="eyebrow">{t("orders.eyebrow")}</span>
              <h1>{t("orders.title")}</h1>
              <p>{t("orders.description")}</p>
            </header>
            {dashboard?.orders.length ? (
              <div className="order-list">
                {dashboard.orders.map((order) => (
                  <article key={order.id}>
                    <div>
                      <strong>{order.service}</strong>
                      <small>{t("orders.number", { id: order.id })}</small>
                    </div>
                    <span>{statusKeys[order.status] ? t(statusKeys[order.status]) : order.status}</span>
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

        {activeTab === "profile" && (
          <section className="page-stack">
            <header className="page-heading">
              <span className="eyebrow">{t("profile.eyebrow")}</span>
              <h1>{dashboard?.first_name ?? t("mini.user.traveler")}</h1>
              <p>{t("profile.description")}</p>
            </header>
            <ProfileStats dashboard={dashboard} />
            <div className="profile-card">
              <span>{t("profile.username")}</span>
              <strong>
                {dashboard?.username ? `@${dashboard.username}` : t("profile.notSpecified")}
              </strong>
            </div>
            <div className="profile-card">
              <span>{t("profile.referralLink")}</span>
              <strong className="break-word">
                {dashboard?.referral_link ?? t("profile.linkUnavailable")}
              </strong>
              <button
                className="button secondary"
                type="button"
                disabled={!dashboard?.referral_link}
                onClick={copyReferralLink}
              >
                {copied ? t("profile.copied") : t("profile.copyLink")}
              </button>
            </div>
          </section>
        )}

        {activeTab === "support" && (
          <SupportPanel
            apiPrefix="/mini-app"
            routeContext={supportContext}
            onOpenTelegram={runtime.openTelegram}
          />
        )}
      </AppShell>
    </I18nProvider>
  );
}

function StatusScreen({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="status-screen">
      <span className="brand-mark">S</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      <div className="status-actions">{children}</div>
    </main>
  );
}
