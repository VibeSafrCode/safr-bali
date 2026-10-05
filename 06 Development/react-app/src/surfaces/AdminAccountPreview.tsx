import { useEffect, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import { adminLoginUrl } from "../runtime/browser";
import "../components/account-preview.css";

const devices = [{ id: "phone", title: "Телефон" }, { id: "tablet", title: "Планшет" }, { id: "desktop", title: "Компьютер" }] as const;
type Device = typeof devices[number]["id"];

export function AdminAccountPreview({ userId }: { userId: number }) {
  const [device, setDevice] = useState<Device>("phone");
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    // Session gate only: customer data loads inside the frame via the dedicated API.
    void appApiClient().request<{ actor: { role: string } }>("/api/web/admin/session", { signal: controller.signal }).then(session => {
      if (!controller.signal.aborted) setStatus(session.actor.role === "admin" ? "ready" : "error");
    }).catch(error => { if (!controller.signal.aborted) setStatus(error instanceof ApiError && error.status === 401 ? "guest" : "error"); });
    return () => controller.abort();
  }, [revision]);
  return <main className="account-preview-workspace">
    <header className="account-preview-toolbar">
      <a href={`/admin/clients/${userId}/`}>← Карточка клиента</a>
      <div className="account-preview-identity"><strong>Глазами клиента · №{userId}</strong><small>Актуальные данные · только просмотр</small></div>
      <nav aria-label="Размер экрана">{devices.map(item => <button type="button" key={item.id} aria-pressed={device === item.id} onClick={() => setDevice(item.id)}>{item.title}</button>)}</nav>
      <button type="button" aria-label="Обновить кабинет" onClick={() => setRevision(value => value + 1)}>↻ Обновить</button>
    </header>
    <p className="account-preview-note">Так клиент видит опубликованные услуги. Отправка сообщений, заявок и изменение данных отключены.</p>
    {status === "loading" && <p role="status">Проверяем доступ администратора…</p>}
    {status === "guest" && <p role="alert">Войдите в административный аккаунт. <a href={adminLoginUrl()}>Войти</a></p>}
    {status === "error" && <p role="alert">Просмотр недоступен. Проверьте доступ администратора и повторите загрузку.</p>}
    {status === "ready" && <div className="account-preview-canvas"><iframe key={`${userId}:${revision}`} className={`account-preview-frame device-${device}`} title={`Личный кабинет клиента №${userId}`} src={`/account/preview/${userId}/life/`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" /></div>}
  </main>;
}
