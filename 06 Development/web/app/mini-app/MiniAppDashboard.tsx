"use client";

import { useEffect, useMemo, useState } from "react";

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
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const directions = [
  { name: "Бали", icon: "◉", color: "coral", start: "bali" },
  { name: "Таиланд", icon: "⌁", color: "blue", start: "thailand" },
  { name: "Россия", icon: "◇", color: "violet", start: "russia" },
  { name: "Непал", icon: "△", color: "orange", start: "nepal" },
] as const;

const statusNames: Record<string, string> = {
  new: "Новая",
  contacted: "Связались",
  waiting_payment: "Ожидает оплаты",
  paid: "Оплачена",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
};

export function MiniAppDashboard() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const firstName = user?.first_name ?? "путешественник";
  const initials = useMemo(() => {
    const value = `${user?.first_name?.[0] ?? "S"}${user?.last_name?.[0] ?? ""}`;
    return value.toUpperCase();
  }, [user]);

  function openDirection(start: string) {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
    const url = `https://t.me/safr_bali_bot?start=${start}`;
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
    <main className="mini-app-shell">
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

      <section className="mini-section">
        <div className="mini-section-title">
          <h2>Куда отправимся?</h2>
          <span>Все направления</span>
        </div>
        <div className="mini-directions">
          {directions.map((direction) => (
            <button
              className={`mini-direction ${direction.color}`}
              key={direction.name}
              onClick={() => openDirection(direction.start)}
            >
              <span className="direction-icon">{direction.icon}</span>
              <strong>{direction.name}</strong>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>

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
          <button onClick={copyReferralLink}>{copied ? "Скопировано" : "Скопировать ссылку"}</button>
        </div>
      </section>

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

      {!user && (
        <a className="mini-telegram-cta" href="https://t.me/safr_bali_bot" target="_blank" rel="noreferrer">
          Открыть кабинет в Telegram
        </a>
      )}

      <nav className="mini-tabbar" aria-label="Навигация личного кабинета">
        <a className="active" href="/mini-app"><span>⌂</span>Главная</a>
        <a href="#directions"><span>◇</span>Услуги</a>
        <a href="#orders"><span>▤</span>Заявки</a>
        <a href="#profile"><span>○</span>Профиль</a>
      </nav>
    </main>
  );
}
