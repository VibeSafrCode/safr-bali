"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type RouteContext = {
  country?: string;
  city?: string;
  section?: string;
  service?: string;
};

type ChatMessage = {
  id: number;
  author_type: string;
  body: string;
  created_at: string;
};

type Chat = {
  id: number | null;
  status: string;
  messages: ChatMessage[];
};

type AuthStatus = {
  authenticated: boolean;
  first_name?: string;
};

const telegramManagerUrl = "https://t.me/safr_bali_bot";

export function ManagerChatWidget() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"choice" | "chat">("choice");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [chat, setChat] = useState<Chat | null>(null);
  const [context, setContext] = useState<RouteContext>({});
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const isMiniAppSurface =
    pathname.startsWith("/mini-app") ||
    (typeof window !== "undefined" &&
      window.location.hostname.toLowerCase().startsWith("app."));

  async function loadChat() {
    try {
      const response = await fetch("/api/web/chat", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok) setChat((await response.json()) as Chat);
    } catch {
      setError("Не удалось обновить диалог. Проверьте соединение.");
    }
  }

  useEffect(() => {
    if (isMiniAppSurface) return;

    const openWidget = (event: Event) => {
      const customEvent = event as CustomEvent<RouteContext>;
      setContext(customEvent.detail ?? {});
      setVisible(true);
      setMode("choice");
    };
    window.addEventListener("safr:manager", openWidget);

    void fetch("/api/web/auth/me", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok) {
          const status = (await response.json()) as AuthStatus;
          setAuthUser(status.authenticated ? status : null);
        }
      })
      .finally(() => setAuthChecked(true));
    return () => window.removeEventListener("safr:manager", openWidget);
  }, [isMiniAppSurface]);

  useEffect(() => {
    if (!authUser || mode !== "chat" || !visible) return;
    const initial = window.setTimeout(() => void loadChat(), 0);
    const timer = window.setInterval(() => void loadChat(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [authUser, mode, visible]);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (authUser) {
        const response = await fetch("/api/web/chat/messages", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: message, route_context: context }),
        });
        if (!response.ok) throw new Error("send failed");
        setChat((await response.json()) as Chat);
        setMessage("");
      } else {
        const response = await fetch("/api/web/chat/guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            contact,
            body: message,
            route_context: context,
            website: "",
          }),
        });
        if (!response.ok) throw new Error("send failed");
        setSent(true);
      }
    } catch {
      setError("Сообщение не отправлено. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (isMiniAppSurface) return null;

  return (
    <div className="manager-widget">
      {visible && (
        <section className="manager-panel" aria-label="Связь с менеджером">
          <header>
            <div>
              <small>SAFR · поддержка</small>
              <strong>Написать менеджеру</strong>
            </div>
            <button type="button" onClick={() => setVisible(false)} aria-label="Закрыть">
              ×
            </button>
          </header>

          {mode === "choice" ? (
            <div className="manager-choice">
              <p>Выберите удобный способ. Вопрос попадёт менеджеру нужного направления.</p>
              <button type="button" onClick={() => setMode("chat")}>
                💬 Написать здесь
              </button>
              <a href={telegramManagerUrl} target="_blank" rel="noreferrer">
                ✈️ Перейти в Telegram
              </a>
              {authChecked && !authUser && (
                <a className="manager-login" href="/api/web/auth/start?return_to=/account">
                  Войти через Telegram для истории диалога
                </a>
              )}
            </div>
          ) : sent ? (
            <div className="manager-success">
              <strong>Сообщение отправлено</strong>
              <p>Менеджер свяжется с вами по указанному контакту.</p>
              <button type="button" onClick={() => setVisible(false)}>Готово</button>
            </div>
          ) : (
            <div className="manager-chat">
              {authUser && chat?.messages?.length ? (
                <div className="manager-messages">
                  {chat.messages.map((item) => (
                    <p className={item.author_type === "client" ? "from-client" : "from-staff"} key={item.id}>
                      {item.body}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="manager-caption">
                  {authUser
                    ? `Здравствуйте, ${authUser.first_name ?? ""}. Напишите вопрос — ответ появится здесь.`
                    : "Можно отправить вопрос без регистрации. Для ответа оставьте удобный контакт."}
                </p>
              )}
              <form onSubmit={submitMessage}>
                {!authUser && (
                  <>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ваше имя"
                      minLength={2}
                      required
                    />
                    <input
                      value={contact}
                      onChange={(event) => setContact(event.target.value)}
                      placeholder="Telegram, WhatsApp или телефон"
                      minLength={3}
                      required
                    />
                  </>
                )}
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ваш вопрос"
                  maxLength={4000}
                  required
                />
                <button type="submit" disabled={busy}>
                  {busy ? "Отправляем…" : "Отправить"}
                </button>
              </form>
              {error && <p className="manager-error">{error}</p>}
              <button className="manager-back" type="button" onClick={() => setMode("choice")}>
                ← Выбрать другой способ
              </button>
            </div>
          )}
        </section>
      )}
      <button
        className="manager-fab"
        type="button"
        onClick={() => {
          setVisible((current) => !current);
          setMode("choice");
        }}
      >
        <span>💬</span> Написать менеджеру
      </button>
    </div>
  );
}
