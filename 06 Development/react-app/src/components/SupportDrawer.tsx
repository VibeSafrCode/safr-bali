import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {SectionBoundary} from './SectionBoundary';
const SupportPanel=lazy(()=>import('./SupportPanel').then(module=>({default:module.SupportPanel})));
import {AppIcon} from './AppIcon';
import {useI18n} from '../i18n/runtime';
import type {RouteContext} from '../api/types';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientSupportDrawerText} from '../i18n/client-support-copy';
import {isAccountPreview} from '../api/account-preview';
export function SupportDrawer({open,onClose,onOpen,apiPrefix,routeContext,onOpenTelegram,initialContact,csrfToken,userId,ui}:{open:boolean;onClose:()=>void;onOpen:()=>void;apiPrefix:'/mini-app'|'/api/web';routeContext?:RouteContext;onOpenTelegram:(url:string)=>void;initialContact?:string;csrfToken?:string;userId?:number;ui?:ClientUiBindings}){
 const {locale}=useI18n(),en=locale==='en',dialog=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),[started,setStarted]=useState(false);
 const client=YOGA_MINI_APP||ui===undefined?undefined:requireClientUiBindings(ui);if(client&&isAccountPreview())throw new Error('CLIENT_SUPPORT_PREVIEW_BOUNDARY');
 if(client&&(!Number.isSafeInteger(userId)||(userId??0)<=0))throw new Error('CLIENT_SUPPORT_ACTOR_BOUNDARY');
 const copy=(key:Parameters<typeof clientSupportDrawerText>[1],legacy:string)=>client?clientSupportDrawerText(client,key):legacy;
 useEffect(()=>{const el=dialog.current;if(!el)return;if(open){setStarted(true);el.show();el.focus({preventScroll:true});}else if(el.open){const restore=el.contains(document.activeElement);el.close();if(restore)button.current?.focus({preventScroll:true});}},[open]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open){e.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,onClose]);
 return <><button ref={button} className="support-fab" aria-label={open?copy('closeSupport',en?'Close support':'Закрыть поддержку'):copy('open',en?'Contact support':'Написать в поддержку')} aria-expanded={open} aria-controls="app-support-panel" onClick={open?onClose:onOpen}><AppIcon name="◌"/></button><dialog ref={dialog} id="app-support-panel" className="support-drawer" tabIndex={-1} lang={client?.locale} dir={client?.dir} aria-modal="false" aria-label={copy('title',en?'Write to your manager':'Написать менеджеру')} onCancel={e=>{e.preventDefault();onClose();}}><button className="drawer-close" aria-label={copy('close',en?'Close':'Закрыть')} onClick={onClose}>×</button>{started&&<SectionBoundary locale={locale}><Suspense fallback={<p role="status">{client?client.text('support.loading'):en?'Loading support…':'Загружаем поддержку…'}</p>}><SupportPanel ui={client} userId={client?userId:undefined} apiPrefix={apiPrefix} routeContext={routeContext} onOpenTelegram={onOpenTelegram} initialContact={initialContact} csrfToken={csrfToken} active={open}/></Suspense></SectionBoundary>}</dialog></>;
}
