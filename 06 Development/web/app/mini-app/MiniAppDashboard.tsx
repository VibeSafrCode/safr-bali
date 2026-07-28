"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  apiErrorMessage,
  miniAppApiClient,
} from "../../lib/api-client";
import { destinationById, destinations } from "../../lib/catalog";
import {
  loadTelegramWebApp,
  type TelegramUser,
} from "../../lib/telegram-web-app";

type Dashboard = {
  telegram_id: number;
  first_name: string;
  username?: string;
  balance: number;
  referral_count: number;
  referral_link?: string;
  orders: Array<{
    id: number;
    service: string;
    status: string;
    payment_status: string;
    amount_usd?: number | null;
  }>;
};

const statusNames: Record<string, string> = {
  new: "Новая",
  contacted: "Связались",
  waiting_payment: "Ожидает оплаты",
  paid: "Оплачена",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
};

function paginateContent(value?: string, maxLength = 1350) {
  if (!value) return [];

  const blocks = value
    .replaceAll("\\n", "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const pages: string[] = [];
  let page = "";

  for (const block of blocks) {
    const next = page ? `${page}\n\n${block}` : block;
    if (page && next.length > maxLength) {
      pages.push(page);
      page = block;
    } else {
      page = next;
    }
  }
  if (page) pages.push(page);
  return pages;
}

export function MiniAppDashboard() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [copied, setCopied] = useState(false);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [contentPage, setContentPage] = useState(0);
  const [activeTab, setActiveTab] = useState<"home" | "services" | "orders" | "profile">("home");

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      const webApp = await loadTelegramWebApp();
      if (controller.signal.aborted) return;

      try {
        const api = miniAppApiClient();
        let verifiedDashboard: Dashboard;
        try {
          verifiedDashboard = await api.request<Dashboard>("/mini-app/me", {
            signal: controller.signal,
          });
        } catch (error) {
          if (
            !(error instanceof ApiClientError) ||
            error.kind !== "authentication"
          ) {
            throw error;
          }
          try {
            await api.request("/mini-app/auth/refresh", {
              method: "POST",
              signal: controller.signal,
            });
          } catch (refreshError) {
            if (
              !(refreshError instanceof ApiClientError) ||
              refreshError.kind !== "authentication" ||
              !webApp?.initData
            ) {
              throw refreshError;
            }
            await api.request("/mini-app/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ init_data: webApp.initData }),
              signal: controller.signal,
            });
          }
          verifiedDashboard = await api.request<Dashboard>("/mini-app/me", {
            signal: controller.signal,
          });
        }
        setDashboard(verifiedDashboard);
        setUser({
          id: verifiedDashboard.telegram_id,
          first_name: verifiedDashboard.first_name,
          username: verifiedDashboard.username,
        });
        setDashboardError("");
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          setDashboard(null);
          setDashboardError(apiErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, []);

  const selectedDestination = destinationById(destinationId);
  const selectedService =
    selectedDestination?.services.find((service) => service.id === serviceId) ?? null;
  const selectedItem =
    selectedService?.children?.find((item) => item.id === itemId) ?? null;
  const detailItem =
    selectedItem ??
    (selectedService && !selectedService.children?.length ? selectedService : null);
  const detailPages = useMemo(
    () => paginateContent(detailItem?.content),
    [detailItem?.content],
  );

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton;
    if (!backButton) return;

    if (!selectedDestination) {
      backButton.hide();
      return;
    }

    const handleBack = () => {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      if (selectedItem) {
        setItemId(null);
        setContentPage(0);
      } else if (selectedService) {
        setServiceId(null);
        setContentPage(0);
      } else {
        setDestinationId(null);
      }
    };

    backButton.show();
    backButton.onClick(handleBack);
    return () => backButton.offClick(handleBack);
  }, [selectedDestination, selectedService, selectedItem]);

  const firstName = user?.first_name ?? "путешественник";
  const initials = useMemo(() => {
    const value = `${user?.first_name?.[0] ?? "S"}${user?.last_name?.[0] ?? ""}`;
    return value.toUpperCase();
  }, [user]);

  function selectDestination(id: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setDestinationId(id);
    setServiceId(null);
    setItemId(null);
    setContentPage(0);
    setActiveTab("services");
    resetScreenPosition();
  }

  function selectService(id: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setServiceId(id);
    setItemId(null);
    setContentPage(0);
    resetScreenPosition();
  }

  function selectItem(id: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setItemId(id);
    setContentPage(0);
    resetScreenPosition();
  }

  function goBack() {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    if (selectedItem) {
      setItemId(null);
      setContentPage(0);
    } else if (selectedService) {
      setServiceId(null);
      setContentPage(0);
    } else {
      setDestinationId(null);
    }
  }

  function resetScreenPosition() {
    window.requestAnimationFrame(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }

  function openTab(tab: "home" | "services" | "orders" | "profile") {
    setActiveTab(tab);
    resetScreenPosition();
  }

  function openManager() {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
    const url = "https://t.me/safr_bali_bot";
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function copyReferralLink() {
    const link = dashboard?.referral_link;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("medium");
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="mini-app-shell" id="top">
      <header className="mini-header">
        <div className="mini-brand">
          <span className="brand-mark">S</span>
          <span>SAFR</span>
        </div>
        <div className="mini-user">
          <span>{firstName}</span>
          {user?.photo_url ? (
            // Telegram supplies the authenticated profile image URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photo_url} alt="" />
          ) : (
            <span className="mini-avatar">{initials}</span>
          )}
        </div>
      </header>

      {activeTab === "home" && (
        <>
          <section className="mini-welcome">
            <span className="mini-eyebrow">Личный кабинет</span>
            <h1>Добрый день, {firstName}</h1>
            <p>Все ваши путешествия, бонусы и заявки — здесь.</p>
          </section>

          <section className="mini-balance">
            <div>
              <span>Баланс</span>
              <strong>{loading ? "—" : (dashboard?.balance ?? 0).toLocaleString("ru-RU")}</strong>
              <small>SAFR Points</small>
            </div>
            <span className="balance-spark">✦</span>
          </section>
          {dashboardError && (
            <p className="mini-api-error" role="status">
              {dashboardError}
            </p>
          )}

          <section className="mini-section">
            <div className="mini-section-title">
              <h2>Куда отправимся?</h2>
              <span>Все направления</span>
            </div>
            <div className="mini-directions">
              {destinations.map((direction) => (
                <button
                  type="button"
                  className={`mini-direction ${direction.color}`}
                  key={direction.name}
                  onClick={() => selectDestination(direction.id)}
                  aria-label={`Открыть услуги направления ${direction.name}`}
                >
                  <span className="direction-icon">{direction.icon}</span>
                  <strong>{direction.name}</strong>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === "services" && (
      <section className="mini-section mini-catalog">
        <div className="mini-section-title">
          <div>
            <span className="mini-path">
              Услуги{selectedDestination ? ` / ${selectedDestination.name}` : ""}
              {selectedService ? ` / ${selectedService.name}` : ""}
              {selectedItem ? ` / ${selectedItem.name}` : ""}
            </span>
            <h2>
              {selectedItem?.name ??
                selectedService?.name ??
                selectedDestination?.name ??
                "Все направления"}
            </h2>
          </div>
          {selectedDestination && (
            <button
              type="button"
              className="mini-back"
              onClick={goBack}
            >
              ← Назад
            </button>
          )}
        </div>

        {!selectedDestination ? (
          <div className="mini-directions">
            {destinations.map((direction) => (
              <button
                type="button"
                className={`mini-direction ${direction.color}`}
                key={direction.name}
                onClick={() => selectDestination(direction.id)}
              >
                <span className="direction-icon">{direction.icon}</span>
                <strong>{direction.name}</strong>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        ) : selectedService ? (
          <article className="mini-service-detail">
            <div className="mini-service-heading">
              <span className={`mini-service-icon ${selectedDestination.color}`}>
                {detailItem?.icon ?? selectedService.icon}
              </span>
              <div>
                <strong>{detailItem?.name ?? selectedService.name}</strong>
                <p>{detailItem?.summary ?? selectedService.summary}</p>
                {(detailItem?.note ?? selectedService.note) && (
                  <small>{detailItem?.note ?? selectedService.note}</small>
                )}
              </div>
            </div>

            {detailItem ? (
              <>
                {detailPages.length ? (
                  <div className="mini-content-page">
                    <div className="mini-page-meta">
                      <span>Информация</span>
                      <span>
                        {contentPage + 1}/{detailPages.length}
                      </span>
                    </div>
                    <div className="mini-content-text">
                      {detailPages[contentPage]}
                    </div>
                    {detailPages.length > 1 && (
                      <div className="mini-page-controls">
                        <button
                          type="button"
                          disabled={contentPage === 0}
                          onClick={() => setContentPage((page) => Math.max(0, page - 1))}
                        >
                          ← Назад
                        </button>
                        <button
                          type="button"
                          disabled={contentPage === detailPages.length - 1}
                          onClick={() =>
                            setContentPage((page) =>
                              Math.min(detailPages.length - 1, page + 1),
                            )
                          }
                        >
                          Далее →
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mini-coming-soon">
                    <strong>
                      {detailItem.status === "soon"
                        ? "Информацию скоро добавим"
                        : "Услуга уже доступна"}
                    </strong>
                    <p>
                      Уже сейчас можно получить консультацию, нажав отдельную
                      кнопку менеджера ниже.
                    </p>
                  </div>
                )}
              </>
            ) : selectedService.children?.length ? (
              <div className="mini-subservices">
                {selectedService.children.map((item) => (
                  <button type="button" key={item.id} onClick={() => selectItem(item.id)}>
                    <span>{item.icon}</span>
                    <div>
                      <div className="mini-item-title">
                        <strong>{item.name}</strong>
                        {item.status === "soon" && <small>Скоро</small>}
                      </div>
                      <p>{item.summary}</p>
                      {item.note && <em>{item.note}</em>}
                    </div>
                    <b>→</b>
                  </button>
                ))}
              </div>
            ) : null}

            <button type="button" className="mini-manager-button" onClick={openManager}>
              Написать менеджеру <span>↗</span>
            </button>
          </article>
        ) : (
          <div className="mini-service-list">
            {selectedDestination.services.map((service) => (
              <button type="button" key={service.id} onClick={() => selectService(service.id)}>
                <span className={`mini-service-icon ${selectedDestination.color}`}>
                  {service.icon}
                </span>
                <span>
                  <strong>{service.name}</strong>
                  <small>{service.summary}</small>
                </span>
                {service.status === "soon" ? <em>Скоро</em> : <b>→</b>}
              </button>
            ))}
            <button type="button" className="mini-manager-row" onClick={openManager}>
              <span className="mini-service-icon">✎</span>
              <span>
                <strong>Написать менеджеру</strong>
                <small>Откройте отдельный чат и напишите страну и ваш вопрос.</small>
              </span>
              <b>↗</b>
            </button>
          </div>
        )}
      </section>
      )}

      {activeTab === "profile" && (
      <section className="mini-section">
        <div className="mini-section-title">
          <h2>Моя сеть</h2>
          <span>{dashboard?.referral_count ?? 0} приглашённых</span>
        </div>
        <div className="referral-card">
          <div>
            <span className="referral-icon">◎</span>
            <div>
              <strong>Пригласить друга</strong>
              <p>Связь сохранится для всех стран и будущих услуг</p>
            </div>
          </div>
          <button
            type="button"
            onClick={copyReferralLink}
            disabled={!dashboard?.referral_link}
          >
            {copied
              ? "Скопировано"
              : dashboard?.referral_link
                ? "Скопировать ссылку"
                : "Ссылка появится после входа"}
          </button>
        </div>
      </section>
      )}

      {activeTab === "orders" && (
      <section className="mini-section mini-orders">
        <div className="mini-section-title">
          <h2>Мои заявки</h2>
          <span>{dashboard?.orders.length ?? 0}</span>
        </div>
        {dashboard?.orders.length ? (
          dashboard.orders.slice(0, 4).map((order) => (
            <article className="order-row" key={order.id}>
              <span className="order-icon">✓</span>
              <div>
                <strong>{order.service}</strong>
                <span>Заявка №{order.id}</span>
              </div>
              <span className={`order-status status-${order.status}`}>
                {statusNames[order.status] ?? order.status}
              </span>
            </article>
          ))
        ) : (
          <div className="empty-orders">
            <span>⌁</span>
            <div>
              <strong>{loading ? "Загружаем заявки…" : "Пока нет активных заявок"}</strong>
              <p>Выберите направление — менеджер поможет начать.</p>
            </div>
          </div>
        )}
      </section>
      )}

      <nav className="mini-tabbar" aria-label="Навигация личного кабинета">
        <button
          type="button"
          className={activeTab === "home" ? "active" : ""}
          onClick={() => openTab("home")}
        >
          <span>⌂</span>Главная
        </button>
        <button
          type="button"
          className={activeTab === "services" ? "active" : ""}
          onClick={() => openTab("services")}
        >
          <span>◇</span>Услуги
        </button>
        <button
          type="button"
          className={activeTab === "orders" ? "active" : ""}
          onClick={() => openTab("orders")}
        >
          <span>▤</span>Заявки
        </button>
        <button
          type="button"
          className={activeTab === "profile" ? "active" : ""}
          onClick={() => openTab("profile")}
        >
          <span>○</span>Профиль
        </button>
      </nav>
    </main>
  );
}
