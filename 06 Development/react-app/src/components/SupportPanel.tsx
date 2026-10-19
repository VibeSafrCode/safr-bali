import { isAccountPreview } from "../api/account-preview";
import {AppIcon} from './AppIcon';
import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, appApiClient } from "../api/client";
import type { Chat, RouteContext } from "../api/types";
import { localizedApiError, useI18n } from "../i18n/runtime";
import { parseSupportChat } from "./support-chat";
import {sendSupportIntentRequest,supportIntentMemory} from './support-intent';
import { YOGA_MINI_APP } from '../runtime/yoga-mini-app';
import { SUPPORT_MANAGER_URL } from '../runtime/support-manager';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientSupportPanelText,clientSupportApiError} from '../i18n/client-support-copy';

type SupportPanelProps = {
  userId?:number;
  ui?:ClientUiBindings;
  csrfToken?:string;
  initialContact?:string;
  active?:boolean;
  apiPrefix: "/mini-app" | "/api/web";
  routeContext?: RouteContext;
  onOpenTelegram: (url: string) => void;
};

const MANAGER_URL = SUPPORT_MANAGER_URL;

// Bound the complete Main read, including a transport/JSON promise that ignores
// abort. A failed read releases single-flight polling, never retries a POST.
async function readClientSupportChat(apiPrefix:string,signal?:AbortSignal){
  const child=new AbortController();
  let rejectRead!:(reason:Error)=>void,timer:number|undefined;
  const stopped=new Promise<never>((_resolve,reject)=>{rejectRead=reject;});
  const cleanup=()=>{if(timer!==undefined){window.clearTimeout(timer);timer=undefined;}signal?.removeEventListener('abort',aborted);};
  const stop=(reason:Error)=>{cleanup();child.abort();rejectRead(reason);};
  const aborted=()=>stop(new DOMException('Support view disposed','AbortError'));
  timer=window.setTimeout(()=>stop(new ApiError('Support read timed out',{kind:'network'})),15000);
  signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted)aborted();
  try{return await Promise.race([Promise.resolve().then(()=>{
    if(child.signal.aborted)throw new DOMException('Support view disposed','AbortError');
    return appApiClient().request<unknown>(`${apiPrefix}/chat`,{signal:child.signal});
  }),stopped]);}finally{cleanup();}
}

export function SupportPanel(props:SupportPanelProps){
  const ui=YOGA_MINI_APP||props.ui===undefined?undefined:requireClientUiBindings(props.ui);
  if(ui&&isAccountPreview())throw new Error('CLIENT_SUPPORT_PREVIEW_BOUNDARY');
  if(ui&&(!Number.isSafeInteger(props.userId)||(props.userId??0)<=0))throw new Error('CLIENT_SUPPORT_ACTOR_BOUNDARY');
  // Presentation is not authority. Only the existing server session chooses the
  // actor. Main parents supply the verified actor to isolate private UI state.
  const key=ui?`${props.apiPrefix}:${props.userId}`:'legacy';
  return <SupportPanelSession key={key} {...props} ui={ui}/>;
}

function SupportPanelSession({
  apiPrefix,
  routeContext = {},
  onOpenTelegram,
  initialContact="", active=true, csrfToken, userId,
  ui,
}: SupportPanelProps) {
  const readOnly = isAccountPreview();
  const { locale, t:legacyText } = useI18n();
  const client=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui),t=client?.text??legacyText;
  const copy=(key:Parameters<typeof clientSupportPanelText>[1],legacy:string)=>client?clientSupportPanelText(client,key):legacy;
  type DisplayError=string|{kind:'api';cause:unknown}|{kind:'contact'};
  const apiError=(cause:unknown):DisplayError=>client?{kind:'api',cause}:localizedApiError(locale,cause);
  const [intentSession]=useState(()=>client&&typeof window!=='undefined'?supportIntentMemory.bind(apiPrefix,userId):null);
  const scope=useRef({generation:0,alive:false});
  const readVersion=useRef(0);
  const readInFlight=useRef<{generation:number;version:number}|null>(null);
  const submitView=useRef<symbol|null>(null),capturedSubmitView=Symbol('support-view');
  submitView.current=capturedSubmitView;
  const [contactMethod,setContactMethod]=useState(()=>intentSession?.draft()?.contactMethod??(initialContact?'telegram':'phone'));
  const [contact,setContact]=useState(()=>intentSession?.draft()?.contact??initialContact);
  const [name,setName]=useState(()=>intentSession?.draft()?.name??'');
  const sendingRef=useRef<symbol|null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [body, setBody] = useState(()=>intentSession?.draft()?.body??"");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<DisplayError>(()=>intentSession?.error()?apiError(intentSession.error()):"");
  const errorText=typeof error==='string'?error:error.kind==='contact'?copy('invalidContact',locale==='en'?'Enter valid contact details.':'Укажите корректный контакт.'):client?clientSupportApiError(client,error.cause):localizedApiError(locale,error.cause);
  const routeStamp=client?JSON.stringify(routeContext):undefined;
  function editIntent(){
    if(!client)return true;
    if(!scope.current.alive||submitView.current!==capturedSubmitView)return false;
    const hadIntent=!!intentSession?.draft();intentSession?.edit();if(hadIntent)setError("");
    return true;
  }

  async function loadChat(signal?: AbortSignal) {
    if(client&&readInFlight.current?.generation===scope.current.generation)return;
    const generation=scope.current.generation,version=++readVersion.current;
    const ticket={generation,version};
    if(client)readInFlight.current=ticket;
    try {
      const result = parseSupportChat(client?await readClientSupportChat(apiPrefix,signal):await appApiClient().request<unknown>(`${apiPrefix}/chat`, {
        signal,
      }));
      if(client&&(signal?.aborted||!scope.current.alive||generation!==scope.current.generation||version!==readVersion.current))return;
      setChat(result);
      if(!client||!intentSession?.error())setError("");
    } catch (caught) {
      if ((caught as DOMException).name !== "AbortError"&&(!client||(!signal?.aborted&&scope.current.alive&&generation===scope.current.generation&&version===readVersion.current))) {
        if(!client||!intentSession?.error())setError(apiError(caught));
      }
    } finally {
      if(client&&readInFlight.current===ticket)readInFlight.current=null;
      if(!client||(!signal?.aborted&&scope.current.alive&&generation===scope.current.generation&&version===readVersion.current))setLoading(false);
    }
  }

  useEffect(() => {
    if(!active)return;
    scope.current.alive=true;scope.current.generation++;
    if(client&&!sendingRef.current)setSending(false);
    const controller = new AbortController();
    void loadChat(controller.signal);
    const timer = window.setInterval(() => {
      void loadChat(controller.signal);
    }, 8000);
    return () => {
      scope.current.alive=false;scope.current.generation++;readVersion.current++;
      controller.abort();
      window.clearInterval(timer);
      if(client){intentSession?.pause();sendingRef.current=null;}
    };
  }, [apiPrefix,active,routeStamp]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if(client&&(!scope.current.alive||submitView.current!==capturedSubmitView))return;
    const message = body.trim();
    if (readOnly || !active || !message || sendingRef.current || !name.trim() || (client&&(!intentSession||!userId))) return;
    const valid=contactMethod==='phone'?/^[0-9]{7,15}$/.test(contact)&&!/^([0-9])\1+$/.test(contact):contactMethod==='telegram'?/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact):/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    if(!valid){setError(client?{kind:'contact'}:locale==='en'?'Enter valid contact details.':'Укажите корректный контакт.');return;}
    const formatted=`${name.trim()} · ${contactMethod}: ${contactMethod==='phone'?'+':''}${contact}\n\n${message}`;
    const generation=scope.current.generation;
    const attempt=Symbol('support-attempt');
    sendingRef.current=attempt;
    if(client)readVersion.current++;
    setSending(true);
    setError("");
    try {
      let result:Chat;
      if(client){
        const response=await intentSession!.submit({name,contactMethod,contact,body},routeContext,
          (serialized,signal)=>sendSupportIntentRequest(apiPrefix,userId!,serialized,signal,appApiClient().request,csrfToken));
        if(response.status!=='accepted')return;
        result=response.value;
      }else result = parseSupportChat(await appApiClient().request<unknown>(
        `${apiPrefix}/chat/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(csrfToken?{"X-CSRF-Token":csrfToken}:{}) },
          body: JSON.stringify({ body: formatted, route_context: routeContext }),
        },
      ));
      if(client&&(!scope.current.alive||generation!==scope.current.generation))return;
      // A read started before this send must not replace the accepted result.
      if(client){readVersion.current++;setLoading(false);}
      setChat(result);
      setBody("");
    } catch (caught) {
      if(!client||(scope.current.alive&&generation===scope.current.generation))setError(apiError(caught));
    } finally {
      if(sendingRef.current===attempt){
        sendingRef.current=null;
        if(!client||(scope.current.alive&&generation===scope.current.generation))setSending(false);
      }
    }
  }

  return (
    <section className="page-stack" aria-labelledby="support-heading" lang={client?.locale} dir={client?.dir}>
      <header className="page-heading">

        <h1 id="support-heading">{copy('title',locale==='en'?'Write to your manager':'Написать менеджеру')}</h1>
        <p>{copy('lead',locale==='en'?'We’ll reply your preferred way.':'Ответим удобным для вас способом.')}</p>
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

        {readOnly && <p className="account-preview-action-note">{locale === "ru" ? "Просмотр переписки. Отправка сообщений отключена." : "Conversation preview. Sending messages is disabled."}</p>}
        <form className="chat-form" onSubmit={submit}>
          <label>{copy('name',locale==='en'?'Your name':'Как к вам обращаться')}<input value={name} onChange={e=>{if(editIntent())setName(e.target.value);}} required maxLength={80} autoComplete="name" disabled={readOnly || sending}/></label>
          <fieldset className="contact-methods" disabled={readOnly || sending}><legend className="visually-hidden">{copy('method',locale==='en'?'Contact method':'Способ связи')}</legend>{['phone','telegram','email'].map((m,i)=><label key={m}><input type="radio" name="contact-method" checked={contactMethod===m} onChange={()=>{if(!editIntent())return;setContactMethod(m);setContact(m==='telegram'?initialContact:'');}}/><span>{(client?(['phone','telegram','email'] as const).map(key=>clientSupportPanelText(client,key)):(locale==='en'?['Phone','Telegram','Email']:['Телефон','Telegram','Email']))[i]}</span></label>)}</fieldset>
          <label>{contactMethod==='phone'?copy('phoneNumber',locale==='en'?'Phone number':'Номер телефона'):contactMethod==='telegram'?copy('telegram','Telegram'):copy('email','Email')}<span className="contact-input">{contactMethod==='phone'&&<span className="phone-prefix">+</span>}<input type={contactMethod==='email'?'email':'text'} inputMode={contactMethod==='phone'?'numeric':contactMethod==='email'?'email':'text'} value={contact} onChange={e=>{if(editIntent())setContact(contactMethod==='phone'?e.target.value.replace(/\D/g,'').slice(0,15):e.target.value);}} placeholder={contactMethod==='phone'?'7 ___ ___ __ __':contactMethod==='telegram'?'@username':'name@example.com'} required maxLength={254} disabled={readOnly || sending}/></span></label>
          <label htmlFor="support-message">{t("support.messageLabel")}</label>
          <textarea
            id="support-message"
            value={body}
            onChange={(event) => {if(editIntent())setBody(event.target.value);}}
            maxLength={3000} disabled={readOnly || sending}
            placeholder={t("support.messagePlaceholder")}
            required
          />
          <button className="button primary" type="submit" disabled={readOnly || sending || (!!client&&intentSession?.blocked())}>
            {sending ? t("support.sending") : t("support.send")}
          </button>
        </form>

        {errorText && <p className="error-message" role="alert">{errorText}</p>}
      </div>

      <button
        className="telegram-contact"
        type="button"
        disabled={readOnly}
        onClick={() => onOpenTelegram(MANAGER_URL)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 3 3 10c-1 .4-1 .9 0 1.2l4.6 1.5L18 6.3c.5-.3.8-.1.4.3l-8.3 7.5-.3 4.6c.5 0 .8-.2 1.1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8L22 4c.3-1.3-.5-1.7-1-1z"/></svg><span>{copy('message',locale==='en'?'Message':'Написать')}<br/>{copy('onTelegram',locale==='en'?'on Telegram':'в Telegram')}</span>
      </button>
    </section>
  );
}
