import {ApiError} from '../api/client';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiLocale,serverContactLocale, type ServerContactLocaleRUEN} from './client-ui-bindings';
import {createClientUiLocaleSession} from './client-ui-locale';
import {
  createClientUiPreferenceAdapter, ClientUiPreferenceConflict, ClientUiPreferenceRejected,
  requireClientUiPreference, type ClientUiPreference,
} from './client-ui-preference';

export type ClientUiSurface = 'web'|'mini';
export type ClientUiPrincipal = Readonly<{
  actor:number; preference:unknown; csrf?:string;
}>;
type Api = {request<T=unknown>(path:string, options?:RequestInit):Promise<T>};
const endpoints = YOGA_MINI_APP?null:Object.freeze({
  web:{read:'/api/web/auth/me',write:'/api/web/preferences/ui-locale'},
  mini:{read:'/mini-app/preferences/ui-locale',write:'/mini-app/preferences/ui-locale'},
});
const actorId = (value:unknown):number => {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)throw new Error('CLIENT_UI_ACTOR_INVALID');
  return value;
};

/** Only call with a response from this surface's authenticated read. Brand,
 * Telegram initDataUnsafe, browser storage and preview never establish identity. */
export function clientUiPrincipal(surface:ClientUiSurface,value:unknown):ClientUiPrincipal|null{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('CLIENT_UI_PRINCIPAL_INVALID');
  const row=value as Record<string,unknown>;
  if(surface==='web'){
    if(!Object.hasOwn(row,'authenticated')||typeof row.authenticated!=='boolean')throw new Error('CLIENT_UI_PRINCIPAL_INVALID');
    if(!row.authenticated)return null;
  }
  if(!Object.hasOwn(row,'telegram_id'))throw new Error('CLIENT_UI_PRINCIPAL_INVALID');
  const actor=actorId(row.telegram_id);
  const csrf=Object.hasOwn(row,'csrf_token')?row.csrf_token:undefined;
  if(csrf!==undefined&&(typeof csrf!=='string'||!/^[0-9a-f]{64}$/.test(csrf)))throw new Error('CLIENT_UI_CSRF_INVALID');
  return Object.freeze({actor,csrf:csrf as string|undefined,
    preference:Object.hasOwn(row,'client_ui_preference')?row.client_ui_preference:undefined});
}

/** Shared User-only lifecycle around the existing locale session and CAS core.
 * Missing rollout projection stays local; it is never a confirmed saved choice. */
export function createClientUiSurfaceController({surface,api,environment,onAuthorityLost}: {
  surface:ClientUiSurface;api:Api;
  environment:Parameters<typeof createClientUiLocaleSession>[0];
  onAuthorityLost?:()=>void;
}){
  if(!endpoints)throw new Error('CLIENT_UI_MAIN_BUILD_ONLY');
  if(!Object.hasOwn(endpoints,surface))throw new Error('CLIENT_UI_SURFACE_INVALID');
  const locale=createClientUiLocaleSession(environment);
  let generation=0,disposed=false,authority:ClientUiPrincipal|null=null;
  let choiceGeneration=0,loadChoiceGeneration=0;
  const loseAuthority=()=>{
    if(disposed||authority===null)return;
    generation++;authority=null;preference.logout();locale.logout();onAuthorityLost?.();
  };
  const preference=createClientUiPreferenceAdapter({
    applyLocal:next=>{void locale.change(next);},
    transport:{
      async write(actor,value,signal){
        const own=authority,epoch=generation;
        if(!own||own.actor!==actor||!own.csrf)throw new ClientUiPreferenceRejected(true);
        try{return await api.request(endpoints[surface].write,{method:'PATCH',signal,
          headers:{'Content-Type':'application/json','X-CSRF-Token':own.csrf},body:JSON.stringify(value)});}
        catch(error){
          if(error instanceof ApiError&&error.status===409){
            const details=error.details;
            throw new ClientUiPreferenceConflict(details&&typeof details==='object'&&Object.hasOwn(details,'current')
              ?(details as {current:unknown}).current:undefined);
          }
          if(error instanceof ApiError&&(error.kind==='authentication'||[400,401,403,422].includes(error.status??0))){
            const denied=error.kind==='authentication'||error.status===401||error.status===403;
            if(denied&&epoch===generation&&authority?.actor===actor)loseAuthority();
            throw new ClientUiPreferenceRejected(denied);
          }
          throw error;
        }
      },
      async read(actor,signal){
        const epoch=generation,own=authority;
        if(!own||own.actor!==actor)throw new ClientUiPreferenceRejected(true);
        let result:unknown;
        try{result=await api.request(endpoints[surface].read,{signal});}
        catch(error){if(error instanceof ApiError&&error.kind==='authentication'&&epoch===generation)loseAuthority();throw error;}
        if(disposed||epoch!==generation||authority?.actor!==actor)throw new ClientUiPreferenceRejected(true);
        const read=clientUiPrincipal(surface,result);
        if(!read||read.actor!==actor){loseAuthority();return {actor:read?.actor??null,preference:undefined};}
        // A missing/invalid projection is not a new actor or a saved value.
        // CAS validates it; do not rotate credentials on a malformed read.
        const projection=requireClientUiPreference(read.preference);
        if(!read.csrf){loseAuthority();return {actor:null,preference:undefined};}
        authority=read;
        return {actor:read.actor,preference:projection};
      },
    },
  });
  return Object.freeze({
    locale,preference,
    mount(){disposed=false;generation++;authority=null;locale.mount();preference.mount();},
    beginLoad(){generation++;loadChoiceGeneration=choiceGeneration;authority=null;preference.bindPrincipal(null,undefined);return generation;},
    current(token:number){return !disposed&&token===generation;},
    bind(token:number,principal:ClientUiPrincipal|null,contact:unknown){
      if(disposed||token!==generation)return false;
      const contactLocale:ServerContactLocaleRUEN=serverContactLocale(contact);
      if(!principal){authority=null;locale.bindPrincipal(null,contactLocale);preference.logout();return true;}
      actorId(principal.actor);
      // Copy a closed credential record, never trust mutation of a caller DTO.
      authority=Object.freeze({...principal});
      const before=locale.snapshot(),changedActor=before.actor!==null&&before.actor!==principal.actor;
      const keepManual=!changedActor&&(before.source==='manual'||choiceGeneration!==loadChoiceGeneration);
      locale.bindPrincipal(principal.actor,contactLocale);
      let projection:ClientUiPreference|undefined;
      try{projection=requireClientUiPreference(principal.preference);}catch{/* unavailable/local rollout */}
      if(!keepManual&&locale.snapshot().source!=='route'&&projection?.ui_locale!==null&&projection?.ui_locale!==undefined)
        locale.adopt(projection.ui_locale);
      // Even when a newer UI gesture wins, accept current verified credentials
      // and revision. Adoption is not a manual choice or permission to PATCH.
      preference.bindPrincipal(principal.actor,principal.csrf?principal.preference:undefined,undefined,{apply:false});
      return true;
    },
    choose(value:unknown){const next=requireClientUiLocale(value);if(!disposed)choiceGeneration++;return preference.choose(next);},
    retry(){if(!disposed)choiceGeneration++;return preference.retry(locale.snapshot().locale);},
    logout(){generation++;authority=null;preference.logout();locale.logout();},
    dispose(){generation++;authority=null;disposed=true;preference.dispose();locale.dispose();},
  });
}
