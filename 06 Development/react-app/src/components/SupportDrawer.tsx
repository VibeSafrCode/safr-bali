import {useEffect,useRef,useState} from 'react';
import {SupportPanel} from './SupportPanel';
import {AppIcon} from './AppIcon';
import {useI18n} from '../i18n/runtime';
import type {RouteContext} from '../api/types';
export function SupportDrawer({open,onClose,onOpen,apiPrefix,routeContext,onOpenTelegram,initialContact,csrfToken}:{open:boolean;onClose:()=>void;onOpen:()=>void;apiPrefix:'/mini-app'|'/api/web';routeContext?:RouteContext;onOpenTelegram:(url:string)=>void;initialContact?:string;csrfToken?:string}){
 const {locale}=useI18n(),en=locale==='en',dialog=useRef<HTMLDialogElement>(null),button=useRef<HTMLButtonElement>(null),[started,setStarted]=useState(false);
 useEffect(()=>{const el=dialog.current;if(!el)return;if(open){setStarted(true);el.show();el.focus({preventScroll:true});}else if(el.open){const restore=el.contains(document.activeElement);el.close();if(restore)button.current?.focus({preventScroll:true});}},[open]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open){e.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,onClose]);
 return <><button ref={button} className="support-fab" aria-label={open?(en?'Close support':'Закрыть поддержку'):(en?'Contact support':'Написать в поддержку')} aria-expanded={open} aria-controls="app-support-panel" onClick={open?onClose:onOpen}><AppIcon name="◌"/></button><dialog ref={dialog} id="app-support-panel" className="support-drawer" tabIndex={-1} aria-modal="false" aria-label={en?'Write to your manager':'Написать менеджеру'} onCancel={e=>{e.preventDefault();onClose();}}><button className="drawer-close" aria-label={en?'Close':'Закрыть'} onClick={onClose}>×</button>{started&&<SupportPanel apiPrefix={apiPrefix} routeContext={routeContext} onOpenTelegram={onOpenTelegram} initialContact={initialContact} csrfToken={csrfToken} active={open}/>}</dialog></>;
}
