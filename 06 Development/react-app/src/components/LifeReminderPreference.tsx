import { isAccountPreview } from "../api/account-preview";
import { useEffect, useRef, useState } from "react";
import { appApiClient } from "../api/client";
import type { LifeLocale, LifeService } from "./lifeServices";
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientLifeReminderText} from '../i18n/client-life-presentation';

type Props={
  item: LifeService; apiPrefix: "/api/web" | "/mini-app"; csrfToken?: string; locale: LifeLocale;
  ui?:ClientUiBindings;
  onSaved: (item: LifeService) => void;
};
export function LifeReminderPreference(props:Props){
  const ui=YOGA_MINI_APP||props.ui===undefined?undefined:requireClientUiBindings(props.ui);
  if(ui&&isAccountPreview())throw new Error('CLIENT_LIFE_REMINDER_PREVIEW_BOUNDARY');
  if(ui&&(!Number.isSafeInteger(props.item.user_id)||props.item.user_id<=0||!Number.isSafeInteger(props.item.id)||props.item.id<=0))throw new Error('CLIENT_LIFE_REMINDER_RECORD_BOUNDARY');
  return <LifeReminderSession key={ui?`${props.apiPrefix}:${props.item.user_id}:${props.item.id}`:'legacy'} {...props} ui={ui}/>;
}

function LifeReminderSession({item,apiPrefix,csrfToken,locale,onSaved,ui}:Props) {
  const readOnly = isAccountPreview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const busyRef=useRef(false);
  const latestRecord=useRef(item);latestRecord.current=item;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ru = locale === "ru";
  const copy=(key:Parameters<typeof clientLifeReminderText>[1],legacy:string)=>ui?clientLifeReminderText(ui,key):legacy;
  async function toggle() {
    if (readOnly || busy || (ui&&busyRef.current)) return;
    if(ui)busyRef.current=true;
    setBusy(true); setError(false); setSaved(false);
    const enabled=!item.notifications_enabled;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const next = await appApiClient().request<LifeService>(`${apiPrefix}/life-services/${item.id}/notifications`, { method: "PATCH", headers, body: JSON.stringify({ enabled }) });
      if(ui&&(next.id!==item.id||next.user_id!==item.user_id))throw new Error('CLIENT_LIFE_REMINDER_RESPONSE_IDENTITY');
      if(ui){
        if(!Number.isSafeInteger(next.version)||!Number.isSafeInteger(latestRecord.current.version))throw new Error('CLIENT_LIFE_REMINDER_RESPONSE_VERSION');
        // A newer read is authoritative for this UI. Discard the stale result
        // without claiming either Saved or that the server rolled anything back.
        if(next.version<latestRecord.current.version)return;
        if(typeof next.notifications_enabled!=='boolean'||next.notifications_enabled!==enabled)throw new Error('CLIENT_LIFE_REMINDER_RESPONSE_PREFERENCE');
      }
      if (mounted.current) { onSaved(next); setSaved(true); }
    } catch { if (mounted.current) setError(true); }
    finally { busyRef.current=false;if (mounted.current) setBusy(false); }
  }
  if (typeof item.notifications_enabled !== "boolean") return null;
  const unavailable = item.notification_unavailable_reason;
  return <section className="life-reminder-preference" aria-busy={busy} lang={ui?.locale} dir={ui?.dir}>
    <label><input type="checkbox" checked={item.notifications_enabled} disabled={readOnly || busy} onChange={() => void toggle()} />{copy('label',ru ? "Напоминать об окончании" : "Remind me before this service ends")}</label>
    {unavailable === "disabled" && <p>{copy('disabled',ru ? "Общая отправка напоминаний пока выключена. Ваш выбор сохранится." : "Service reminders are currently off. Your preference will be saved.")}</p>}
    {(!item.end_date || unavailable === "no_end_date") && <p>{copy('noEndDate',ru ? "Без даты окончания напоминания не отправляются." : "Reminders require an end date.")}</p>}
    {unavailable === "not_current" && <p>{copy('notCurrent',ru ? "Сейчас услуга вне периода отправки напоминаний." : "The service is currently outside its reminder period.")}</p>}
    {error && <p role="alert">{copy('error',ru ? "Не удалось сохранить. Выбор не изменён; попробуйте ещё раз." : "Could not save. Your preference is unchanged; try again.")}</p>}
    {saved && <p role="status">{copy('saved',ru ? "Выбор сохранён." : "Preference saved.")}</p>}
  </section>;
}
