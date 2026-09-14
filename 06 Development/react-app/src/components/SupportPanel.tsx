import {AppIcon} from './AppIcon';
import { FormEvent, useEffect, useRef, useState } from "react";
import { appApiClient } from "../api/client";
import type { Chat, RouteContext } from "../api/types";
import { localizedApiError, useI18n } from "../i18n/runtime";

type SupportPanelProps = {
  csrfToken?:string;
  initialContact?:string;
  active?:boolean;
  apiPrefix: "/mini-app" | "/api/web";
  routeContext?: RouteContext;
  onOpenTelegram: (url: string) => void;
};

const MANAGER_URL = "https://t.me/safr_bali_bot";

export function SupportPanel({
  apiPrefix,
  routeContext = {},
  onOpenTelegram,
  initialContact="", active=true, csrfToken,
}: SupportPanelProps) {
  const { locale, t } = useI18n();
  const [contactMethod,setContactMethod]=useState(initialContact?'telegram':'phone');
  const [contact,setContact]=useState(initialContact);
  const [name,setName]=useState('');
  const sendingRef=useRef(false);
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
    if(!active)return;
    const controller = new AbortController();
    void loadChat(controller.signal);
    const timer = window.setInterval(() => {
      void loadChat(controller.signal);
    }, 8000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiPrefix,active]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (!message || sendingRef.current || !name.trim()) return;
    const valid=contactMethod==='phone'?/^[0-9]{7,15}$/.test(contact)&&!/^([0-9])\1+$/.test(contact):contactMethod==='telegram'?/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact):/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    if(!valid){setError(locale==='en'?'Enter valid contact details.':'Укажите корректный контакт.');return;}
    const formatted=`${name.trim()} · ${contactMethod}: ${contactMethod==='phone'?'+':''}${contact}\n\n${message}`;
    sendingRef.current=true;
    setSending(true);
    setError("");
    try {
      const result = await appApiClient().request<Chat>(
        `${apiPrefix}/chat/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(csrfToken?{"X-CSRF-Token":csrfToken}:{}) },
          body: JSON.stringify({ body: formatted, route_context: routeContext }),
        },
      );
      setChat(result);
      setBody("");
    } catch (caught) {
      setError(localizedApiError(locale, caught));
    } finally {
      sendingRef.current=false;
      setSending(false);
    }
  }

  return (
    <section className="page-stack" aria-labelledby="support-heading">
      <header className="page-heading">

        <h1 id="support-heading">{locale==='en'?'Write to your manager':'Написать менеджеру'}</h1>
        <p>{locale==='en'?'We’ll reply your preferred way.':'Ответим удобным для вас способом.'}</p>
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
          <label>{locale==='en'?'Your name':'Как к вам обращаться'}<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80} autoComplete="name" disabled={sending}/></label>
          <fieldset className="contact-methods" disabled={sending}><legend className="visually-hidden">{locale==='en'?'Contact method':'Способ связи'}</legend>{['phone','telegram','email'].map((m,i)=><label key={m}><input type="radio" name="contact-method" checked={contactMethod===m} onChange={()=>{setContactMethod(m);setContact(m==='telegram'?initialContact:'');}}/><span>{(locale==='en'?['Phone','Telegram','Email']:['Телефон','Telegram','Email'])[i]}</span></label>)}</fieldset>
          <label>{contactMethod==='phone'?(locale==='en'?'Phone number':'Номер телефона'):contactMethod==='telegram'?'Telegram':'Email'}<span className="contact-input">{contactMethod==='phone'&&<span className="phone-prefix">+</span>}<input type={contactMethod==='email'?'email':'text'} inputMode={contactMethod==='phone'?'numeric':contactMethod==='email'?'email':'text'} value={contact} onChange={e=>setContact(contactMethod==='phone'?e.target.value.replace(/\D/g,'').slice(0,15):e.target.value)} placeholder={contactMethod==='phone'?'7 ___ ___ __ __':contactMethod==='telegram'?'@username':'name@example.com'} required maxLength={254} disabled={sending}/></span></label>
          <label htmlFor="support-message">{t("support.messageLabel")}</label>
          <textarea
            id="support-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={3000} disabled={sending}
            placeholder={t("support.messagePlaceholder")}
            required
          />
          <button className="button primary" type="submit" disabled={sending}>
            {sending ? t("support.sending") : t("support.send")}
          </button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}
      </div>

      <button
        className="telegram-contact"
        type="button"
        onClick={() => onOpenTelegram(MANAGER_URL)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 3 3 10c-1 .4-1 .9 0 1.2l4.6 1.5L18 6.3c.5-.3.8-.1.4.3l-8.3 7.5-.3 4.6c.5 0 .8-.2 1.1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8L22 4c.3-1.3-.5-1.7-1-1z"/></svg><span>{locale==='en'?'Message':'Написать'}<br/>{locale==='en'?'on Telegram':'в Telegram'}</span>
      </button>
    </section>
  );
}
