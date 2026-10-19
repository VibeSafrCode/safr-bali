import {useEffect,useMemo,useState} from "react";
import {PwaLifecycle} from "./PwaLifecycle";
import {createClientUiBindings} from "../i18n/client-ui-bindings";
import {CLIENT_UI_LOCALE_EVENT,documentClientUiLocale} from "../i18n/client-ui-locale";

export function ClientApplicationLifecycle() {
  const [locale,setLocale]=useState(documentClientUiLocale);
  useEffect(()=>{
    const update=()=>setLocale(documentClientUiLocale());
    window.addEventListener(CLIENT_UI_LOCALE_EVENT,update);
    // Catch a document update between the initial render and this subscription.
    update();
    return()=>window.removeEventListener(CLIENT_UI_LOCALE_EVENT,update);
  },[]);
  const ui=useMemo(()=>createClientUiBindings(locale),[locale]);
  return <PwaLifecycle locale="ru" ui={ui}/>;
}
