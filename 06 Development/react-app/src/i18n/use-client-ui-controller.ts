import {useEffect,useMemo,useRef,useState} from 'react';
import {appApiClient} from '../api/client';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {subscribeClientAuthLogout} from '../runtime/client-auth-lifecycle';
import {createClientUiBindings} from './client-ui-bindings';
import {browserClientUiLocaleEnvironment} from './client-ui-locale';
import {createClientUiSurfaceController,type ClientUiSurface} from './client-ui-surface';

/** Preview creates no locale session, reads no client storage, applies no client
 * document locale and subscribes to no client broadcast or persistence API. */
export function useClientUiController(surface:ClientUiSurface,enabled:boolean,
  callbacks:{onLogout?:()=>void;onAuthorityLost?:()=>void}){
  // Build-time brand selection is immutable. Yoga keeps its existing RU/EN
  // lifecycle and must construct no Main locale/CAS/storage subscriptions.
  if(YOGA_MINI_APP){
    if(enabled)throw new Error('CLIENT_UI_MAIN_BUILD_ONLY');
    return {controller:null,ui:undefined,locale:undefined,preference:undefined};
  }
  return useMainClientUiController(surface,enabled,callbacks);
}

function useMainClientUiController(surface:ClientUiSurface,enabled:boolean,
  callbacks:{onLogout?:()=>void;onAuthorityLost?:()=>void}){
  const latest=useRef(callbacks);latest.current=callbacks;
  const mode=useRef({surface,enabled});
  if(mode.current.surface!==surface||mode.current.enabled!==enabled)throw new Error('CLIENT_UI_SURFACE_MODE_CHANGED');
  const [controller]=useState(()=>enabled?createClientUiSurfaceController({
    surface,api:appApiClient(),environment:browserClientUiLocaleEnvironment(),
    onAuthorityLost:()=>latest.current.onAuthorityLost?.(),
  }):null);
  const [locale,setLocale]=useState(()=>controller?.locale.snapshot());
  const [preference,setPreference]=useState(()=>controller?.preference.snapshot());
  useEffect(()=>{
    if(!controller)return;
    const offLocale=controller.locale.subscribe(setLocale),offPreference=controller.preference.subscribe(setPreference);
    controller.mount();
    const offLogout=subscribeClientAuthLogout(()=>{controller.logout();latest.current.onLogout?.();});
    return()=>{offLogout();offLocale();offPreference();controller.dispose();};
  },[controller]);
  const ui=useMemo(()=>locale?createClientUiBindings(locale.locale):undefined,[locale?.locale]);
  return {controller,ui,locale,preference};
}
