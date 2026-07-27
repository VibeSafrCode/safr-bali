"use client";

import { useEffect, useMemo, useState } from "react";
import { destinationById, destinations } from "../../lib/catalog";

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type Dashboard = {
  telegram_id: number;
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

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramUser };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: { impactOccurred: (style: "light" | "medium") => void };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

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
  const [copied, setCopied] = useState(false);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [contentPage, setContentPage] = useState(0);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const controller = new AbortController();
    webApp?.ready();
    webApp?.expand();
    const telegramUser = webApp?.initDataUnsafe?.user ?? null;

    async function loadDashboard() {
      await Promise.resolve();
      setUser(telegramUser);

      if (!webApp?.initData) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/mini-app/me`,
          {
            headers: { Authorization: `tma ${webApp.initData}` },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Dashboard unavailable");
        setDashboard((await response.json()) as Dashboard);
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          setDashboard(null);
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
    window.requestAnimationFrame(() => {
      document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function selectService(id: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setServiceId(id);
    setItemId(null);
    setContentPage(0);
    window.requestAnimationFrame(() => {
      document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function selectItem(id: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    setItemId(id);
    setContentPage(0);
    window.requestAnimationFrame(() => {
      document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" });
    });
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
    const link =
      dashboard?.referral_link ??
      "https://t.me/safr_bali_bot";
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

      <section className="mini-section" id="directions">
        <div className="mini-section-title">
          <h2>Куда отправимся?</h2>
          <span>Все направления</span>
        </div>
        <div className="mini-directions">
          {destinations.map((direction) => (
            <button
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

      <section className="mini-section mini-catalog" id="services">
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
              className="mini-back"
              onClick={goBack}
            >
              ← Назад
            </button>
          )}
        </div>

        {!selectedDestination ? (
          <div className="mini-catalog-empty">
            <span>◇</span>
            <div>
              <strong>Выберите страну выше</strong>
              <p>Раздел откроется здесь, не закрывая Mini App.</p>
            </div>
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
                          disabled={contentPage === 0}
                          onClick={() => setContentPage((page) => Math.max(0, page - 1))}
                        >
                          ← Назад
                        </button>
                        <button
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
                  <button key={item.id} onClick={() => selectItem(item.id)}>
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

            <button className="mini-manager-button" onClick={openManager}>
              Открыть отдельный чат с менеджером <span>↗</span>
            </button>
          </article>
        ) : (
          <div className="mini-service-list">
            {selectedDestination.services.map((service) => (
              <button key={service.id} onClick={() => selectService(service.id)}>
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
            <button className="mini-manager-row" onClick={openManager}>
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

      <section className="mini-section" id="profile">
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
          <button onClick={copyReferralLink}>{copied ? "Скопировано" : "Скопировать ссылку"}</button>
        </div>
      </section>

      <section className="mini-section mini-orders" id="orders">
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

      {!user && (
        <a className="mini-telegram-cta" href="https://t.me/safr_bali_bot" target="_blank" rel="noreferrer">
          Открыть кабинет в Telegram
        </a>
      )}

      <nav className="mini-tabbar" aria-label="Навигация личного кабинета">
        <a className="active" href="#top"><span>⌂</span>Главная</a>
        <a href="#directions"><span>◇</span>Услуги</a>
        <a href="#orders"><span>▤</span>Заявки</a>
        <a href="#profile"><span>○</span>Профиль</a>
      </nav>
    </main>
  );
}
