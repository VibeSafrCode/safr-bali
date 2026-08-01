import { useEffect, useMemo, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { Dashboard, RouteContext } from "../api/types";
import { destinations } from "../catalog";
import { CountryGrid } from "../components/CatalogGrids";
import { CatalogView } from "../components/CatalogView";
import { CurrencyCalculator } from "../components/CurrencyCalculator";
import { ProfileStats } from "../components/ProfileStats";
import { SupportPanel } from "../components/SupportPanel";
import {
  createTelegramRuntime,
  loadTelegramWebApp,
  telegramInitData,
} from "../runtime/telegram";
import type { TelegramWebApp } from "../runtime/types";

type MiniTab = "home" | "services" | "orders" | "profile" | "support";

const statusNames: Record<string, string> = {
  new: "Новая",
  contacted: "Связались",
  waiting_payment: "Ожидает оплаты",
  paid: "Оплачена",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
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

function routeTab(segments: string[]): MiniTab {
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
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const runtime = useMemo(
    () => createTelegramRuntime(() => webApp),
    [webApp],
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
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
        setDashboard(result);
        setStatus("ready");
      } catch (caught) {
        if ((caught as DOMException).name !== "AbortError") {
          setError(apiErrorMessage(caught));
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

  if (status === "loading") {
    return <StatusScreen title="Загружаем SAFRWAY…" detail="Проверяем защищённую сессию." />;
  }

  if (status === "outside") {
    return (
      <StatusScreen
        title="Не удалось подтвердить запуск"
        detail="Закройте это окно и снова нажмите «Меню App» в клавиатуре бота."
      >
        <a className="button primary" href="https://t.me/safr_bali_bot">
          Вернуться в бот
        </a>
      </StatusScreen>
    );
  }

  if (status === "error") {
    return (
      <StatusScreen title="Не удалось открыть приложение" detail={error}>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>
          Повторить
        </button>
      </StatusScreen>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#/home" aria-label="SAFRWAY — главная">
          <span className="brand-mark">S</span>
          <span>SAFRWAY</span>
        </a>
        <span className="user-chip">
          {dashboard?.first_name ?? "Путешественник"}
        </span>
      </header>

      <main className="app-content">
        {activeTab === "home" && (
          <section className="page-stack">
            <header className="brand-block">
              <h1>SAFRWAY</h1>
            </header>
            <section className="home-countries" aria-labelledby="home-countries-title">
              <div className="section-heading">
                <span className="eyebrow">Направления</span>
                <h2 id="home-countries-title">Выберите страну</h2>
              </div>
              <CountryGrid
                destinations={destinations}
                onSelect={(destinationId) => navigate(`services/${destinationId}`)}
              />
            </section>
          </section>
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
              <span className="eyebrow">Личный кабинет</span>
              <h1>Мои заявки</h1>
              <p>Следите за статусом услуг и ответами команды.</p>
            </header>
            {dashboard?.orders.length ? (
              <div className="order-list">
                {dashboard.orders.map((order) => (
                  <article key={order.id}>
                    <div>
                      <strong>{order.service}</strong>
                      <small>Заявка №{order.id}</small>
                    </div>
                    <span>{statusNames[order.status] ?? order.status}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>Заявок пока нет</strong>
                <p>Выберите услугу, затем напишите менеджеру.</p>
                <button className="button secondary" type="button" onClick={() => navigate("services")}>
                  Открыть каталог
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === "profile" && (
          <section className="page-stack">
            <header className="page-heading">
              <span className="eyebrow">Профиль</span>
              <h1>{dashboard?.first_name ?? "Путешественник"}</h1>
              <p>Ваши данные, SAFR Points, приглашения и заявки.</p>
            </header>
            <ProfileStats dashboard={dashboard} />
            <div className="profile-card">
              <span>Имя пользователя</span>
              <strong>
                {dashboard?.username ? `@${dashboard.username}` : "Не указано"}
              </strong>
            </div>
            <div className="profile-card">
              <span>Реферальная ссылка</span>
              <strong className="break-word">
                {dashboard?.referral_link ?? "Ссылка пока недоступна"}
              </strong>
              <button
                className="button secondary"
                type="button"
                disabled={!dashboard?.referral_link}
                onClick={copyReferralLink}
              >
                {copied ? "Скопировано" : "Скопировать ссылку"}
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
      </main>

      <nav className="bottom-nav" aria-label="Разделы Mini App">
        <NavButton active={activeTab === "home"} label="Главная" icon="⌂" onClick={() => navigate("home")} />
        <NavButton active={activeTab === "services"} label="Услуги" icon="◇" onClick={() => navigate("services")} />
        <NavButton active={activeTab === "orders"} label="Заявки" icon="▤" onClick={() => navigate("orders")} />
        <NavButton active={activeTab === "profile"} label="Профиль" icon="○" onClick={() => navigate("profile")} />
        <NavButton active={activeTab === "support"} label="Поддержка" icon="✎" onClick={() => openSupport()} />
      </nav>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <small>{label}</small>
    </button>
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
