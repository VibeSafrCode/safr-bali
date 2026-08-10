import { FormEvent, useEffect, useState } from "react";
import { appApiClient } from "../api/client";
import type { Chat, RouteContext } from "../api/types";
import { localizedApiError, useI18n } from "../i18n/runtime";

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
  const { locale, t } = useI18n();
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
        setError(localizedApiError(locale, caught));
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
      setError(localizedApiError(locale, caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page-stack" aria-labelledby="support-heading">
      <header className="page-heading">
        <span className="eyebrow">{t("support.eyebrow")}</span>
        <h1 id="support-heading">{t("support.title")}</h1>
        <p>{t("support.description")}</p>
      </header>

      <div className="chat-card" aria-live="polite">
        {loading ? (
          <p className="muted">{t("support.loading")}</p>
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
                  {message.author_type === "client" ? t("support.author.client") : t("support.author.manager")}
                </span>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{t("support.empty.title")}</strong>
            <p>{t("support.empty.detail")}</p>
          </div>
        )}

        <form className="chat-form" onSubmit={submit}>
          <label htmlFor="support-message">{t("support.messageLabel")}</label>
          <textarea
            id="support-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            placeholder={t("support.messagePlaceholder")}
            required
          />
          <button className="button primary" type="submit" disabled={sending}>
            {sending ? t("support.sending") : t("support.send")}
          </button>
        </form>

        {error && <p className="error-message">{error}</p>}
      </div>

      <button
        className="button secondary"
        type="button"
        onClick={() => onOpenTelegram(MANAGER_URL)}
      >
        {t("support.openTelegram")}
      </button>
    </section>
  );
}
