import { FormEvent, useEffect, useState } from "react";
import { appApiClient, apiErrorMessage } from "../api/client";
import type { Chat, RouteContext } from "../api/types";

type SupportPanelProps = {
  apiPrefix: "/mini-app" | "/api/web";
  routeContext?: RouteContext;
  onOpenTelegram: (url: string) => void;
};

const MANAGER_URL = "https://t.me/safr_bali_bot";

export function SupportPanel({
  apiPrefix,
  routeContext = {},
  onOpenTelegram,
}: SupportPanelProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function loadChat(signal?: AbortSignal) {
    try {
      const result = await appApiClient().request<Chat>(`${apiPrefix}/chat`, {
        signal,
      });
      setChat(result);
      setError("");
    } catch (caught) {
      if ((caught as DOMException).name !== "AbortError") {
        setError(apiErrorMessage(caught));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadChat(controller.signal);
    const timer = window.setInterval(() => {
      void loadChat(controller.signal);
    }, 8000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiPrefix]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await appApiClient().request<Chat>(
        `${apiPrefix}/chat/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: message, route_context: routeContext }),
        },
      );
      setChat(result);
      setBody("");
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page-stack" aria-labelledby="support-heading">
      <header className="page-heading">
        <span className="eyebrow">Поддержка</span>
        <h1 id="support-heading">Диалог с менеджером</h1>
        <p>
          Сообщения остаются внутри SAFRWAY и передаются менеджерам через
          backend. Внутренние заметки команды здесь не показываются.
        </p>
      </header>

      <div className="chat-card" aria-live="polite">
        {loading ? (
          <p className="muted">Загружаем диалог…</p>
        ) : chat?.messages.length ? (
          <div className="chat-messages">
            {chat.messages.map((message) => (
              <article
                className={
                  message.author_type === "client"
                    ? "chat-message from-client"
                    : "chat-message from-staff"
                }
                key={message.id}
              >
                <span>
                  {message.author_type === "client" ? "Вы" : "Менеджер"}
                </span>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Начните новый диалог</strong>
            <p>Опишите направление, услугу и ваш вопрос.</p>
          </div>
        )}

        <form className="chat-form" onSubmit={submit}>
          <label htmlFor="support-message">Ваше сообщение</label>
          <textarea
            id="support-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            placeholder="Например: нужна консультация по визе D12"
            required
          />
          <button className="button primary" type="submit" disabled={sending}>
            {sending ? "Отправляем…" : "Отправить менеджеру"}
          </button>
        </form>

        {error && <p className="error-message">{error}</p>}
      </div>

      <button
        className="button secondary"
        type="button"
        onClick={() => onOpenTelegram(MANAGER_URL)}
      >
        Перейти в Telegram
      </button>
    </section>
  );
}
