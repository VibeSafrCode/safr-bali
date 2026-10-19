import { isAccountPreview } from "../api/account-preview";
import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError, apiErrorMessage, appApiClient } from "../api/client";
import type { VisaCase } from "../api/types";
import { presentationCopy } from "../ui/presentation-copy";
import { miniAppDocumentPath, YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import { ClientVisaStatusHelp as VisaStatusHelp } from "./ClientVisaStatusHelp";
import { visaStatusLabel } from "./visaEditorState";
import {visaDatePresentation} from './visaDatePresentation';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../i18n/client-visa-life-copy';
import {clientSupportApiError} from '../i18n/client-support-copy';
import {clientVisaDatePresentation,clientVisaFormatDate,clientVisaCardStatus,clientVisaStatusLabel} from '../i18n/client-visa-presentation';
export {visaDatePresentation, type VisaDatePresentation} from './visaDatePresentation';

type Locale = "ru" | "en";
type Mutation = "notifications" | "entry" | null;
type NotificationFocus = {generation:number;caseId:number;operation:object;control:HTMLButtonElement;completed:boolean;cancel:()=>void};
type Props = {apiPrefix:"/mini-app"|"/api/web";locale:Locale;csrfToken?:string;ui?:ClientUiBindings;userId?:number;viewInstanceKey?:string};

const copy = {
  ru: { eyebrow: "Мои услуги", title: "Мои визы", intro: "Здесь видны только проверенные и опубликованные менеджером данные.", empty: "У вас пока нет опубликованных виз в SAFRWAY.", open: "Открыть визу", back: "К списку", important: "Важные даты и статусы", action: "Что делать дальше", noAction: "Сейчас от вас ничего не требуется", documents: "Документы", history: "История", notifications: "Уведомления по этой визе", entry: "Я уже въехал", entryDate: "Дата въезда", save: "Подтвердить", retry: "Повторить", unknown: "Уточняется", enabled: "Включены", disabled: "Отключены", indonesia: "Индонезия", service: "Статус оформления SAFRWAY", lifecycle: "Статус визы", process: "Текущий процесс", pending: "Сохраняем…", saved: "Изменение сохранено", failed: "Не удалось сохранить. Предыдущее значение восстановлено.", openDocument: "Открыть защищённо", documentFallback: "Документ по визе", eventFallback: "Обновление по визе" },
  en: { eyebrow: "My services", title: "My visas", intro: "Only manager-verified and published information is shown here.", empty: "You have no published SAFRWAY visas yet.", open: "Open visa", back: "Back to list", important: "Important dates and statuses", action: "What to do next", noAction: "Nothing is required from you now", documents: "Documents", history: "Timeline", notifications: "Notifications for this visa", entry: "I have entered", entryDate: "Entry date", save: "Confirm", retry: "Retry", unknown: "Being confirmed", enabled: "Enabled", disabled: "Disabled", indonesia: "Indonesia", service: "SAFRWAY processing status", lifecycle: "Visa status", process: "Current process", pending: "Saving…", saved: "Change saved", failed: "Could not save. The previous value was restored.", openDocument: "Open securely", documentFallback: "Visa document", eventFallback: "Visa update" },
} as const;

const lifecycle: Record<Locale, Record<string, string>> = {
  ru: { NOT_ISSUED: "Оформление", ISSUED_NOT_ACTIVATED: "Виза готова", ACTIVE: "Виза активна", EXPIRING: "Скоро продление", EXTENSION_PROCESSING: "Продление оформляется", EXTENDED: "Продлена", EXPIRED: "Истекла", CANCELLED: "Аннулирована", REFUSED: "Отказано" },
  en: { NOT_ISSUED: "Processing", ISSUED_NOT_ACTIVATED: "Visa issued", ACTIVE: "Visa active", EXPIRING: "Renewal approaching", EXTENSION_PROCESSING: "Extension in progress", EXTENDED: "Extended", EXPIRED: "Expired", CANCELLED: "Cancelled", REFUSED: "Refused" },
};

function human(map: Record<Locale, Record<string, string>>, locale: Locale, value: string, fallback: string) { return map[locale][value] ?? fallback; }
function localeSafe(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;
  const wrongScript = locale === "en" ? /[А-Яа-яЁё]/.test(value) : /^[\x00-\x7F]+$/.test(value);
  return wrongScript ? fallback : value;
}
function formatDate(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date(`${value.slice(0, 10)}T00:00:00+08:00`));
}

function SemanticStatusCode({ code }: { code: string }) {
  const segments = code.split("_");
  return <>{segments.map((segment, index) => <Fragment key={`${segment}-${index}`}><span className="visa-code-segment">{segment}{index < segments.length - 1 ? "_" : ""}</span>{index < segments.length - 1 && <wbr />}</Fragment>)}</>;
}

// Identity is supplied by an authenticated parent, never inferred from a case,
// brand or start parameter. This key is a UI isolation fence, not server ACL.
export function VisaCabinet(props:Props){
  const ui=YOGA_MINI_APP||props.ui===undefined?undefined:requireClientUiBindings(props.ui);
  if(ui&&isAccountPreview())throw new Error('CLIENT_VISA_PREVIEW_BOUNDARY');
  if(ui&&(!Number.isSafeInteger(props.userId)||(props.userId??0)<=0||props.viewInstanceKey!==undefined))throw new Error('CLIENT_VISA_ACTOR_BOUNDARY');
  return <VisaCabinetContent key={`${props.apiPrefix}:${props.viewInstanceKey??props.userId??'legacy'}`} {...props} ui={ui}/>;
}

function VisaCabinetContent({ apiPrefix, locale, csrfToken,ui }:Props) {
  if(ui?.locale==='ru'||ui?.locale==='en')locale=ui.locale;
  const readOnly = isAccountPreview();
  const [items, setItems] = useState<VisaCase[]>([]);
  const [selected, setSelected] = useState<VisaCase | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [entryDate, setEntryDate] = useState("");
  const [mutation, setMutation] = useState<Mutation>(null);
  const [message, setMessage] = useState<'saved'|'failed'|null>(null);
  const active=useRef(true),generation=useRef(0),target=useRef<number|undefined>(undefined);
  const readController=useRef<AbortController|null>(null),writeLock=useRef<object|null>(null);
  const detailHeading=useRef<HTMLHeadingElement|null>(null);
  const cardButtons=useRef(new Map<number,HTMLButtonElement>());
  const openingCard=useRef<number|null>(null),returnFocus=useRef<number|null>(null);
  const notificationButton=useRef<HTMLButtonElement|null>(null),notificationFocus=useRef<NotificationFocus|null>(null);
  const renderedGeneration=generation.current;
  const t = Object.fromEntries(Object.entries(copy[locale]).map(([key, value]) => [key, presentationCopy(ui?clientVisaLifeText(ui,('source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.'+key) as ClientVisaLifeKey):value)])) as Record<keyof typeof copy.ru, string>;
  const date=(value:string|null|undefined,fallback:string)=>ui?clientVisaFormatDate(value,ui,fallback):formatDate(value,locale,fallback);
  // Published manager/customer text is data, not an implicit request to translate.
  const freeText=(value:string|null|undefined,fallback:string)=>ui&&ui.locale!=='ru'&&ui.locale!=='en'?(value||fallback):localeSafe(value,locale,fallback);
  const primary=(item:VisaCase)=>ui?clientVisaDatePresentation(item,ui):visaDatePresentation(item,locale);

  function clearNotificationFocus(){const intent=notificationFocus.current;notificationFocus.current=null;intent?.cancel();}
  function invalidate(){
    clearNotificationFocus();
    generation.current++;readController.current?.abort();writeLock.current=null;
    setEntryDate('');setMessage(null);setError(null);setMutation(null);
  }
  function back(){invalidate();target.current=undefined;returnFocus.current=openingCard.current;setSelected(null);setState('ready');}

  async function load(caseId?: number) {
    if(!active.current)return;
    invalidate();const own=generation.current;target.current=caseId;
    const controller=new AbortController();readController.current=controller;
    const current=()=>active.current&&own===generation.current&&target.current===caseId;
    setSelected(null);setState("loading");
    try {
      const result = await appApiClient().request<VisaCase | { items: VisaCase[] }>(`${apiPrefix}/visa-cases${caseId ? `/${caseId}` : ""}`,{signal:controller.signal});
      if(!current())return;
      if(caseId===undefined&&result&&'items' in result&&Array.isArray(result.items))setItems(result.items);
      else if(caseId!==undefined&&result&&'id' in result&&result.id===caseId)setSelected(result);
      else throw new ApiError('Unexpected visa response identity',{kind:'invalid_response'});
      setState("ready");
    } catch (caught) { if(current()){setError(caught);setState("error");} }
  }
  useEffect(() => { active.current=true;void load();return()=>{active.current=false;generation.current++;readController.current?.abort();writeLock.current=null;clearNotificationFocus();}; }, [apiPrefix]);
  useEffect(()=>{
    if(state!=='ready')return;
    if(selected){detailHeading.current?.focus();return;}
    if(returnFocus.current!==null){cardButtons.current.get(returnFocus.current)?.focus();returnFocus.current=null;}
  },[state,selected?.id]);
  useEffect(()=>{
    const intent=notificationFocus.current;
    if(mutation!==null||!intent?.completed||writeLock.current!==null)return;
    clearNotificationFocus();
    const control=notificationButton.current;
    if(active.current&&state==='ready'&&generation.current===intent.generation&&target.current===intent.caseId
        &&selected?.id===intent.caseId&&control===intent.control&&control.isConnected&&!control.disabled
        &&control.ownerDocument.activeElement===control.ownerDocument.body)control.focus();
  },[mutation,state,selected?.id]);

  async function write(kind: Exclude<Mutation, null>, path: string, body: unknown, method: "PATCH" | "POST") {
    if (readOnly||!active.current||renderedGeneration!==generation.current||writeLock.current||!selected||target.current!==selected.id) return;
    const own=generation.current,caseId=selected.id,operation={};writeLock.current=operation;
    const current=()=>active.current&&generation.current===own&&target.current===caseId&&writeLock.current===operation;
    clearNotificationFocus();
    const control=notificationButton.current;
    if(kind==='notifications'&&control&&control.ownerDocument.activeElement===control){
      const doc=control.ownerDocument;
      // Native disable can blur to BODY. Only restore that lost position;
      // an intentional focus/pointer move cancels even if it later reaches BODY.
      const moved=(event:Event)=>{if(event.target!==control&&(event.type==='pointerdown'||event.target!==doc.body))clearNotificationFocus();};
      notificationFocus.current={generation:own,caseId,operation,control,completed:false,cancel:()=>{doc.removeEventListener('focusin',moved,true);doc.removeEventListener('pointerdown',moved,true);}};
      doc.addEventListener('focusin',moved,true);doc.addEventListener('pointerdown',moved,true);
    }
    const previous = selected;
    setMutation(kind); setMessage(null);
    if (kind === "notifications" && selected) setSelected({ ...selected, notifications_enabled: !selected.notifications_enabled });
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const result = await appApiClient().request<VisaCase>(`${apiPrefix}/visa-cases/${path}`, { method, headers, body: JSON.stringify(body) });
      if(!current())return;
      if(!result||result.id!==caseId)throw new ApiError('Unexpected visa response identity',{kind:'invalid_response'});
      setSelected(result); setItems((items) => items.map((item) => item.id === result.id ? result : item)); setMessage('saved');
    } catch { if(current()){setSelected(previous);setMessage('failed');} }
    finally {
      if(current()){
        const intent=notificationFocus.current;
        if(intent?.operation===operation){
          // A settled request can be batched without ever disabling the DOM
          // control. There is no lost position (or future effect) to await.
          if(!intent.control.disabled)clearNotificationFocus();else intent.completed=true;
        }
        writeLock.current=null;setMutation(null);
      }
    }
  }

  if (state === "loading") return <section className="visa-cabinet" lang={ui?.locale} dir={ui?.dir} aria-busy="true"><div className="visa-skeleton" /><div className="visa-skeleton" /></section>;
  if (state === "error") return <section className="empty-state" lang={ui?.locale} dir={ui?.dir} role="alert"><strong>{ui?clientSupportApiError(ui,error):apiErrorMessage(error)}</strong><button className="button secondary" onClick={() => void load(target.current)}>{t.retry}</button></section>;

  if (selected) {
    const primaryDate = primary(selected);
    return <section className="page-stack visa-cabinet" lang={ui?.locale} dir={ui?.dir}>
    <button className="text-button visa-back" onClick={back}>← {t.back}</button>
    <header className="page-heading"><span className="eyebrow">{t.indonesia} · {freeText(selected.custom_visa_name || selected.visa_type.name, selected.visa_type.code)}</span><h1 ref={detailHeading} tabIndex={-1}><code><SemanticStatusCode code={selected.lifecycle_status} /></code></h1><VisaStatusHelp kind="visa" code={selected.lifecycle_status} locale={locale} ui={ui} showCode={false} /><p>{freeText(selected.next_action_text, t.noAction)}</p></header>
    <article className="visa-detail-card"><h2>{t.important}</h2><dl className="visa-status-list"><div><dt>{t.service}</dt><dd>{ui?clientVisaStatusLabel("service",selected.service_status,ui):visaStatusLabel("service", selected.service_status, locale)}</dd></div><div><dt>{t.lifecycle}</dt><dd><VisaStatusHelp kind="visa" code={selected.lifecycle_status} locale={locale} ui={ui} /></dd></div><div><dt>{t.process}</dt><dd>{selected.current_process ? <VisaStatusHelp kind="external" code={selected.current_process.external_status} locale={locale} ui={ui} /> : t.unknown}</dd></div></dl>{(primaryDate || selected.recommended_contact_at) && <dl className="visa-dates">{primaryDate && <div data-date-kind={primaryDate.estimated ? "estimated" : "confirmed"}><dt>{primaryDate.label}</dt><dd>{date(primaryDate.value, "")}</dd></div>}{selected.recommended_contact_at && <div className="visa-contact-date"><dt>{presentationCopy(ui?clientVisaLifeText(ui,"source:06 Development/react-app/src/components/VisaCabinet.tsx#dates.recommendedContact"):locale === "ru" ? "Рекомендуем связаться с SAFRWAY" : "Recommended contact with SAFRWAY")}</dt><dd>{date(selected.recommended_contact_at, "")}</dd></div>}</dl>}</article>
    <article className="visa-detail-card"><h2>{t.action}</h2><p>{freeText(selected.next_action_text, t.noAction)}</p>{selected.next_action_due_at && <strong>{date(selected.next_action_due_at, t.unknown)}</strong>}</article>
    {!!selected.documents?.length && <article className="visa-detail-card"><h2>{t.documents}</h2><ul>{selected.documents.map((document) => <li key={document.id}><span>{freeText(document.name, t.documentFallback)}</span>{document.access_url && <a className="text-button" href={miniAppDocumentPath(document.access_url)} target="_blank" rel="noopener noreferrer">{t.openDocument}</a>}</li>)}</ul></article>}
    {!!selected.timeline?.length && <article className="visa-detail-card"><h2>{t.history}</h2><ol className="visa-timeline">{selected.timeline.map((event) => <li key={event.id}><strong>{freeText(event.title, t.eventFallback)}</strong>{event.description && <p>{freeText(event.description, t.eventFallback)}</p>}<small>{date(event.created_at, "")}</small></li>)}</ol></article>}
    {message && <p className="visa-mutation-status" role="status">{t[message]}</p>}
    <article className="visa-detail-card visa-toggle" aria-busy={mutation === "notifications"}><div><h2>{t.notifications}</h2><span>{selected.notifications_enabled ? t.enabled : t.disabled}</span></div><button ref={notificationButton} className="button secondary" disabled={readOnly || !!mutation} onClick={() => void write("notifications", `${selected.id}/notifications`, { enabled: !selected.notifications_enabled }, "PATCH")}>{mutation === "notifications" ? t.pending : (selected.notifications_enabled ? t.disabled : t.enabled)}</button></article>
    {!selected.entered_on && <form className="visa-detail-card" aria-busy={mutation === "entry"} onSubmit={(event) => { event.preventDefault(); if (entryDate) void write("entry", `${selected.id}/entry`, { entered_on: entryDate, idempotency_key: crypto.randomUUID() }, "POST"); }}><h2>{t.entry}</h2><label>{t.entryDate}<input type="date" required disabled={readOnly || !!mutation} value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label><button className="button primary" disabled={readOnly || !!mutation}>{mutation === "entry" ? t.pending : t.save}</button></form>}
  </section>;
  }

  return <section className="page-stack visa-cabinet" lang={ui?.locale} dir={ui?.dir}><header className="page-heading"><span className="eyebrow">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></header>{items.length ? <div className="visa-card-grid">{items.map((item) => {
    const primaryDate = primary(item);
    const name = freeText(item.custom_visa_name || item.visa_type.name, item.visa_type.code);
    return <article className="visa-case-card" key={item.id}><button ref={node=>{if(node)cardButtons.current.set(item.id,node);else cardButtons.current.delete(item.id);}} className="visa-card-open" type="button" onClick={() => {if(!active.current)return;openingCard.current=item.id;returnFocus.current=null;void load(item.id);}}><span className="eyebrow">{t.indonesia} · {name}</span><strong className="visa-summary-code"><SemanticStatusCode code={item.lifecycle_status} /></strong><span className="visa-summary-status">{ui?clientVisaCardStatus(item.lifecycle_status,ui):human(lifecycle, locale, item.lifecycle_status, item.lifecycle_status)}</span>{primaryDate && <span className="visa-summary-date" data-date-kind={primaryDate.estimated ? "estimated" : "confirmed"}><small>{primaryDate.label}</small><strong>{date(primaryDate.value, "")}</strong></span>}<span className="visa-card-open-label">{t.open} →</span></button></article>;
  })}</div> : <div className="empty-state"><strong>{t.empty}</strong></div>}</section>;
}
