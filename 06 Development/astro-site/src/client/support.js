import {insuranceRouteContext} from '../../../shared/src/insurance';
import {publicSourceRoute} from '../lib/public-locale';
import {publicInteractionLocale,publicInteractionDocumentLocale,publicInteractionText} from '../lib/public-interaction-captions.mjs';

const launcher=document.querySelector('[data-support-launcher]');
if(launcher instanceof HTMLElement){
 const panel=launcher.querySelector('[data-support-panel]');
 const form=launcher.querySelector('[data-support-form]');
 const submit=launcher.querySelector('[data-support-submit]');
 const status=launcher.querySelector('[data-support-status]');
 const history=launcher.querySelector('[data-support-history]');
 const recovery=launcher.querySelector('[data-support-recovery]');
 const retryLoad=launcher.querySelector('[data-support-retry]');
 const start=launcher.querySelector('[data-support-start]');
 const end=launcher.querySelector('[data-support-end]');
 const identity=launcher.querySelector('[data-support-identity]');
 const openers=[...document.querySelectorAll('[data-support-open]')];
 const locale=publicInteractionLocale(launcher.dataset.supportLocale??publicInteractionDocumentLocale(document.documentElement));
 const interactionText=key=>publicInteractionText(key,locale);
 const guestChatCaptions=JSON.parse(launcher.dataset.guestChatCopy??'null');
 if(!guestChatCaptions||typeof guestChatCaptions!=='object'||Array.isArray(guestChatCaptions))throw new Error('Invalid guest chat captions');
 const text=key=>{
  if(!Object.hasOwn(guestChatCaptions,key)||typeof guestChatCaptions[key]!=='string'||!guestChatCaptions[key].trim())throw new Error('Unknown guest chat caption');
  return guestChatCaptions[key];
 };
 const endpoint='/api/web/chat/guest';
 let opener=null,returnFocus=false,lastPrefill='',insuranceProvider='',selectedCountry='';
 let session=null,ready=false,accessEnded=false,conversationClosed=false,everOpened=false,epoch=0;
 let flight=null,controller=null,flightKind='',queued=false,pollTimer=null,failures=0;
 let pendingMessage=null,pendingMayHaveCommitted=false,sendConflict=false,historySignature='';
 const input=name=>form?.elements.namedItem(name);
 const active=()=>panel instanceof HTMLDialogElement&&panel.open&&!document.hidden;
 const setStatus=(key,state='')=>{status.textContent=key?text(key):'';status.dataset.state=state;};
 const clearError=field=>{field.removeAttribute('aria-invalid');const error=form.querySelector(`[data-error-for="${field.name}"]`);if(error)error.textContent='';};
 const showError=(field,message)=>{field.setAttribute('aria-invalid','true');const error=form.querySelector(`[data-error-for="${field.name}"]`);if(error)error.textContent=message;};
 const syncControls=()=>{
  const userBusy=queued||flightKind==='send'||flightKind==='end'||flightKind==='start';
  submit.disabled=!ready||userBusy||accessEnded||conversationClosed||sendConflict;
  submit.textContent=text(pendingMessage?'retrySend':'send');
  submit.toggleAttribute('aria-busy',flightKind==='send');
  input('body').readOnly=Boolean(pendingMessage)||userBusy||conversationClosed;
  input('name').readOnly=Boolean(pendingMessage)||userBusy||conversationClosed;
  input('contact').readOnly=Boolean(pendingMessage)||userBusy||conversationClosed;
  identity.hidden=Boolean(session?.chat?.id)||accessEnded;
  end.hidden=!ready||accessEnded;
  end.disabled=userBusy||Boolean(pendingMessage);
  start.disabled=userBusy;
  start.hidden=!accessEnded&&!conversationClosed&&!sendConflict;
  recovery.hidden=start.hidden&&retryLoad.hidden;
  retryLoad.disabled=userBusy;
 };
 const stop=()=>{
  epoch+=1;
  clearTimeout(pollTimer);pollTimer=null;
  controller?.abort();
 };
 const schedule=()=>{
  clearTimeout(pollTimer);pollTimer=null;
  if(active()&&ready&&!accessEnded&&!conversationClosed){
   const delay=Math.min(60000,5000*2**Math.min(failures,4));
   pollTimer=setTimeout(()=>refresh(),delay);
  }
 };
 const clearHistory=()=>{
  historySignature='';history.replaceChildren();
  const empty=document.createElement('p');empty.className='support-chat-empty';empty.textContent=text('empty');history.append(empty);
 };
 const clearDraft=()=>{
  pendingMessage=null;pendingMayHaveCommitted=false;sendConflict=false;input('body').value='';input('name').value='';input('contact').value='';lastPrefill='';
  form.querySelectorAll('[aria-invalid]').forEach(clearError);
 };
 const showClosed=()=>{
  conversationClosed=true;setStatus('unavailable','error');recovery.hidden=false;start.hidden=false;retryLoad.hidden=true;syncControls();
 };
 const showConflict=()=>{
  sendConflict=true;setStatus('conflict','error');recovery.hidden=false;start.hidden=false;retryLoad.hidden=true;syncControls();
 };
 const loseAccess=key=>{
  epoch+=1;ready=false;accessEnded=true;conversationClosed=false;session=null;clearDraft();
  clearHistory();setStatus(key,'error');recovery.hidden=false;start.hidden=false;retryLoad.hidden=true;
  syncControls();
 };
 const render=data=>{
  const signature=JSON.stringify(data.chat.messages);
  if(signature===historySignature)return;
  const nearBottom=history.scrollHeight-history.scrollTop-history.clientHeight<48;
  const fragment=document.createDocumentFragment();
  for(const message of data.chat.messages){
   const row=document.createElement('div');row.className='support-chat-message';row.dataset.author=message.author_type;
   const label=document.createElement('strong');label.className='support-chat-author';label.textContent=text(message.author_type==='client'?'you':'staff');
   const body=document.createElement('p');body.textContent=message.body;
   row.append(label,body);fragment.append(row);
  }
  if(!data.chat.messages.length){const empty=document.createElement('p');empty.className='support-chat-empty';empty.textContent=text('empty');fragment.append(empty);}
  history.replaceChildren(fragment);historySignature=signature;
  if(nearBottom)history.scrollTop=history.scrollHeight;
 };
 const applySession=(data,expectedId)=>{
  if(!Number.isSafeInteger(data?.session_id)||data.session_id<=0||typeof data.csrf_token!=='string'||!data.csrf_token
    ||!data.chat||!Array.isArray(data.chat.messages)||data.chat.messages.length>200
    ||data.chat.messages.some(message=>!Number.isSafeInteger(message.id)||!['client','staff'].includes(message.author_type)||typeof message.body!=='string'))throw new Error('Invalid chat response');
  if(expectedId!=null&&data.session_id!==expectedId){
   loseAccess('expired');
   // A different tab may have replaced this browser's cookie. Do not display
   // its history; keep only the proof needed for an explicit fresh start.
   session={session_id:data.session_id,csrf_token:data.csrf_token,chat:{id:null,status:'empty',messages:[]}};
   return false;
  }
  session=data;ready=true;accessEnded=false;failures=0;recovery.hidden=true;retryLoad.hidden=true;start.hidden=true;
  conversationClosed=data.chat.status==='closed';
  render(data);if(conversationClosed)showClosed();else if(sendConflict)showConflict();else syncControls();return true;
 };
 // One operation owns all its requests. A user action first aborts and awaits
 // an in-flight read; closing/hiding invalidates every response before render.
 const run=async(kind,operation)=>{
  if(kind==='read'&&(flight||queued))return;
  if(kind!=='read'&&(queued||['send','end','start'].includes(flightKind)))return;
  const requestedEpoch=epoch;
  if(kind!=='read'){
   queued=true;syncControls();controller?.abort();
   if(flight)await flight;
   queued=false;
  }
  if(!active()||epoch!==requestedEpoch){syncControls();return;}
  clearTimeout(pollTimer);pollTimer=null;
  const ownController=new AbortController(),ownEpoch=epoch;
  controller=ownController;flightKind=kind;
  const valid=()=>active()&&epoch===ownEpoch;
  const request=async(path,options={})=>{
   const timer=setTimeout(()=>ownController.abort(),15000);
   try{return await fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:ownController.signal});}
   finally{clearTimeout(timer);}
  };
  const promise=(async()=>{
   try{await operation({request,valid});}
   finally{
    if(controller===ownController){controller=null;flightKind='';}
    if(flight===promise)flight=null;
    syncControls();schedule();
   }
  })();
  flight=promise;syncControls();return promise;
 };
 const refresh=()=>run('read',async({request,valid})=>{
  const expectedId=session?.session_id??null;
  if(!ready&&!accessEnded)setStatus('loading');
  try{
   let response=await request(endpoint+'/session');
   if(!valid())return;
   if(response.status===401){
    if(everOpened||session||accessEnded){loseAccess('expired');return;}
    response=await request(endpoint+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({restart:false})});
    if(!valid())return;
   }
   if(response.status===401){loseAccess('expired');return;}
   if(!response.ok)throw new Error('Chat unavailable');
   const data=await response.json();if(!valid())return;
   if(applySession(data,expectedId)){
    everOpened=true;if(conversationClosed)showClosed();else if(sendConflict)showConflict();else setStatus(pendingMessage?'unconfirmed':'',pendingMessage?'error':'');
   }
  }catch{
   if(!valid())return;
   failures+=1;setStatus(ready?'refreshFailed':'failed','error');
   if(!ready){recovery.hidden=false;retryLoad.hidden=false;start.hidden=true;}
  }
 });
 const syncExpanded=open=>openers.forEach(button=>{
  button.setAttribute('aria-expanded',String(open));
  if(button.hasAttribute('data-support-floating')){
   const label=interactionText(open?'support.close':'support.contact');button.setAttribute('aria-label',label);button.title=label;
  }
 });
 const close=()=>{if(panel instanceof HTMLDialogElement&&panel.open){returnFocus=panel.contains(document.activeElement);stop();panel.close();}};
 const position=()=>{
  const header=document.querySelector('.site-header')?.getBoundingClientRect();
  const top=header&&header.bottom>0&&header.bottom<innerHeight*.4?header.bottom+12:16;
  panel.style.setProperty('--support-top',top+'px');
 };
 const routeContext=()=>{
  const countryId=document.documentElement.dataset.world??publicSourceRoute(location.pathname).split('/')[1];
  const country={bali:'Бали',thailand:'Таиланд',russia:'Россия',nepal:'Непал',uae:'ОАЭ',vietnam:'Вьетнам'}[countryId];
  const segments=publicSourceRoute(location.pathname).split('/').filter(Boolean);
  const section=({visas:'Визы',housing:'Жильё',exchange:'Обмен валюты',assistant:'Ассистент',guides:'Гайды',insurance:'Страховки'})[segments[1]]??'Поддержка';
  const service=new URLSearchParams(location.search).get('service')==='bikes'?'Байки':segments[2]??segments[1]??'Направление';
  let registryContext=null;
  try{const source=document.querySelector('[data-route-context]');registryContext=source?JSON.parse(source.dataset.routeContext):null;}catch{}
  const root=document.documentElement;
  const attribution=root.dataset.contentId?{content_id:root.dataset.contentId,source_revision:root.dataset.sourceRevision,locale:root.lang,path:root.dataset.sourcePath}:{};
  return {...(registryContext??insuranceRouteContext(countryId,insuranceProvider)??{...(country?{country}:{}),section,service:service.slice(0,150)}),...attribution,...(selectedCountry?{country:selectedCountry}:{})};
 };
 if(panel instanceof HTMLDialogElement&&form instanceof HTMLFormElement){
  openers.forEach(button=>button.addEventListener('click',()=>{
   if(button.hasAttribute('data-support-floating')&&panel.open){close();return;}
   opener=button;selectedCountry=button.dataset.supportCountry??'';insuranceProvider=button.dataset.insuranceProvider??'';
   const body=input('body');
   if(!pendingMessage&&!conversationClosed&&!accessEnded&&button.dataset.supportMessage&&body&&(!body.value.trim()||body.value===lastPrefill)){
    body.value=button.dataset.supportMessage;lastPrefill=body.value;
   }
   position();if(!panel.open)panel.show();syncExpanded(true);panel.querySelector('#support-title')?.focus({preventScroll:true});
   if(!accessEnded)void refresh();
  }));
  panel.querySelector('[data-support-close]')?.addEventListener('click',close);
  addEventListener('resize',()=>{if(panel.open)position();});
  addEventListener('scroll',()=>{if(panel.open)position();},{passive:true});
  panel.addEventListener('close',()=>{
   stop();syncExpanded(false);
   if(returnFocus&&opener instanceof HTMLElement){
    const target=opener.isConnected&&opener.getClientRects().length?opener:document.querySelector('[data-menu-toggle]');
    if(target instanceof HTMLElement&&target.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});
   }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(panel.open&&!accessEnded)void refresh();});
  addEventListener('pagehide',stop);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.open&&!event.defaultPrevented){event.preventDefault();close();}});
  form.querySelectorAll('input,textarea').forEach(field=>field.addEventListener('input',()=>clearError(field)));
  retryLoad.addEventListener('click',()=>{if(!accessEnded)void refresh();});
  start.addEventListener('click',()=>{
   if(!accessEnded&&!conversationClosed&&!sendConflict)return;
   const previousId=session?.session_id??null;
   void run('start',async({request,valid})=>{
    setStatus('loading');
    try{
     const response=await request(endpoint+'/session',{method:'POST',headers:{'Content-Type':'application/json',...(session?{'X-CSRF-Token':session.csrf_token}:{})},body:JSON.stringify({restart:true})});
     if(!valid())return;
     if(!response.ok)throw new Error('Chat unavailable');
     const data=await response.json();if(!valid())return;
     if(previousId!==null&&data?.session_id===previousId)throw new Error('Guest session not replaced');
     if(applySession(data,null)){
      clearDraft();everOpened=true;setStatus(conversationClosed?'unavailable':'',conversationClosed?'error':'');syncControls();input('body').focus();
     }
    }catch{if(valid())setStatus('failed','error');}
   });
  });
  end.addEventListener('click',()=>{
   if(!ready||!session||pendingMessage||!window.confirm(text('endConfirm')))return;
   void run('end',async({request,valid})=>{
    try{
     const response=await request(endpoint+'/session',{method:'DELETE',headers:{'X-CSRF-Token':session.csrf_token}});
     if(!valid())return;
     if(response.status===401){loseAccess('expired');return;}
     if(!response.ok)throw new Error('Chat unavailable');
     loseAccess('ended');start.focus();
    }catch{if(valid())setStatus('failed','error');}
   });
  });
  form.addEventListener('submit',event=>{
   event.preventDefault();if(!ready||accessEnded||conversationClosed||sendConflict||!session)return;
   const body=input('body'),name=input('name'),contact=input('contact');
   for(const field of [body,name,contact])clearError(field);
   const errors=[];
   if(!body.value.trim())errors.push([body,text('errorMessage')]);
   if(name.value.trim()&&Array.from(name.value.trim()).length<2)errors.push([name,text('errorName')]);
   if(contact.value.trim()&&Array.from(contact.value.trim()).length<3)errors.push([contact,text('errorContact')]);
   if(errors.length){identity.open=true;for(const [field,message]of errors)showError(field,message);errors[0][0].focus();return;}
   if(!form.checkValidity()){form.reportValidity();return;}
   if(!pendingMessage){
    pendingMayHaveCommitted=false;
    pendingMessage={body:body.value.trim(),route_context:routeContext(),idempotency_key:crypto.randomUUID(),website:input('website').value,
     ...(name.value.trim()?{name:name.value.trim()}:{}),...(contact.value.trim()?{contact:contact.value.trim()}:{})};
   }
   const message=pendingMessage,expectedId=session.session_id,csrf=session.csrf_token;
   void run('send',async({request,valid})=>{
    const priorOutcomeUnknown=pendingMayHaveCommitted;
    // Once dispatched, even closing the window before parsing the response
    // leaves a possible commit. Only this attempt's definite response clears it.
    pendingMayHaveCommitted=true;setStatus('sending');syncControls();
    try{
     const response=await request(endpoint+'/messages',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(message)});
     if(!valid())return;
     if(response.status===401){loseAccess('expired');return;}
     if([403,409,422,429].includes(response.status)){
      let detail='';try{detail=(await response.json()).detail;}catch{}
      if(!valid())return;
      if(response.status===409&&detail==='Conversation is closed'){
       if(!priorOutcomeUnknown){pendingMessage=null;pendingMayHaveCommitted=false;}
       showClosed();return;
      }
      if(response.status===409&&detail==='Message replay conflict'){showConflict();return;}
      // A new attempt rejected before writing is editable. A rejection AFTER
      // an earlier timeout cannot establish that earlier request's outcome.
      if(!priorOutcomeUnknown&&[403,422,429].includes(response.status)){
       pendingMessage=null;pendingMayHaveCommitted=false;setStatus(response.status===429?'limited':response.status===403?'denied':'rejected','error');
      }else{
       pendingMayHaveCommitted=true;setStatus('unconfirmed','error');
      }
      syncControls();return;
     }
     if(!response.ok)throw new Error('Chat send unresolved');
     const data=await response.json();if(!valid())return;
     if(data.accepted!==true)throw new Error('Chat send unresolved');
     if(applySession(data,expectedId)){
      pendingMessage=null;pendingMayHaveCommitted=false;sendConflict=false;body.value='';lastPrefill='';setStatus('saved','success');
      document.dispatchEvent(new CustomEvent('safr:lead-submitted'));
     }
    }catch{
     // Closing/hiding also leaves a sent request with an unknown outcome.
     if(pendingMessage===message)pendingMayHaveCommitted=true;
     if(valid())setStatus('unconfirmed','error');
    }
   });
   syncControls();
  });
  syncControls();
 }
}
