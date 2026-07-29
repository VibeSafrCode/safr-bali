"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  first_name?: string;
  username?: string;
  balance: number;
  referral_count: number;
  referral_link: string;
  orders: Array<{
    id: number;
    service: string;
    status: string;
    payment_status: string;
  }>;
};

export function AccountDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">("loading");

  useEffect(() => {
    void fetch("/api/web/account", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) {
          setStatus("guest");
          return;
        }
        if (response.ok) {
          setDashboard((await response.json()) as Dashboard);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return <p className="account-loading">Загружаем кабинет…</p>;
  }

  if (status === "guest") {
    return (
      <section className="account-login">
        <span className="eyebrow">Единый аккаунт SAFR</span>
        <h1>Войдите через Telegram</h1>
        <p>
          Отдельный пароль не нужен. Сайт подтвердит ваш Telegram-аккаунт и
          покажет те же SAFR Points, реферальную сеть и заявки, что и бот.
        </p>
        {/* OAuth must leave the static app and perform a full document request. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button button-primary" href="/api/web/auth/start?return_to=/account">
          Войти через Telegram
        </a>
        <small>SAFR не получает ваш пароль от Telegram.</small>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="account-login">
        <span className="eyebrow">Ошибка соединения</span>
        <h1>Кабинет временно недоступен</h1>
        <p>Мы не скрываем ошибку: сайт не смог получить данные от backend. Обновите страницу немного позже.</p>
      </section>
    );
  }

  return (
    <div className="account-dashboard">
      <section className="account-intro">
        <span className="eyebrow">Личный кабинет</span>
        <h1>Здравствуйте, {dashboard?.first_name ?? "путешественник"}</h1>
        <p>Профиль общий для сайта, Mini App и Telegram-бота.</p>
      </section>
      <div className="account-grid">
        <article className="account-balance">
          <span>Баланс</span>
          <strong>{(dashboard?.balance ?? 0).toLocaleString("ru-RU")}</strong>
          <small>SAFR Points</small>
        </article>
        <article>
          <span>Моя сеть</span>
          <strong>{dashboard?.referral_count ?? 0}</strong>
          <small>приглашённых пользователей</small>
        </article>
      </div>
      <section className="account-block">
        <h2>Моя ссылка</h2>
        <p className="account-link">{dashboard?.referral_link}</p>
      </section>
      <section className="account-block">
        <h2>Мои заявки</h2>
        {dashboard?.orders.length ? (
          <div className="account-orders">
            {dashboard.orders.map((order) => (
              <article key={order.id}>
                <strong>{order.service}</strong>
                <span>{order.status}</span>
              </article>
            ))}
          </div>
        ) : (
          <p>Заявок пока нет. Выберите услугу в каталоге или напишите менеджеру.</p>
        )}
      </section>
      <button
        className="account-logout"
        type="button"
        onClick={async () => {
          await fetch("/api/web/auth/logout", {
            method: "POST",
            credentials: "same-origin",
          });
          window.location.href = "/";
        }}
      >
        Выйти из аккаунта
      </button>
    </div>
  );
}
