const launcher=document.querySelector('[data-support-launcher]');
if(launcher instanceof HTMLElement){
 const panel=launcher.querySelector('[data-support-panel]');
 const form=launcher.querySelector('[data-support-form]');
 const submit=launcher.querySelector('[data-support-submit]');
 const status=launcher.querySelector('[data-support-status]');
 const openers=[...document.querySelectorAll('[data-support-open]')];
 const en=document.documentElement.lang==='en';
 let opener=null,submitting=false,returnFocus=false;
 const input=name=>form?.elements.namedItem(name);
 const method=()=>form?.querySelector('[name=contact_method]:checked')?.value??'phone';
 const clearError=field=>{field.removeAttribute('aria-invalid');const error=form.querySelector(`[data-error-for="${field.name}"]`);if(error)error.textContent='';};
 const showError=(field,message)=>{field.setAttribute('aria-invalid','true');const error=form.querySelector(`[data-error-for="${field.name}"]`);if(error)error.textContent=message;};
 const syncMethod=()=>{
  form.querySelectorAll('[data-contact-field]').forEach(wrapper=>{
   const active=wrapper.dataset.contactField===method();wrapper.hidden=!active;
   const field=wrapper.querySelector('input');field.disabled=!active||submitting;field.required=active;clearError(field);
  });
 };
 const syncExpanded=open=>openers.forEach(button=>{
  button.setAttribute('aria-expanded',String(open));
  if(button.hasAttribute('data-support-floating')){
   const label=open?(en?'Close support':'Закрыть поддержку'):(en?'Contact support':'Написать в поддержку');
   button.setAttribute('aria-label',label);button.title=label;
  }
 });
 const close=()=>{if(panel instanceof HTMLDialogElement&&panel.open){returnFocus=panel.contains(document.activeElement);panel.close();}};
 const position=()=>{
  const header=document.querySelector('.site-header')?.getBoundingClientRect();
  const top=header&&header.bottom>0&&header.bottom<innerHeight*.4 ? header.bottom+12 : 16;
  panel.style.setProperty('--support-top',top+'px');
 };
 if(panel instanceof HTMLDialogElement&&form instanceof HTMLFormElement){
  openers.forEach(button=>button.addEventListener('click',()=>{
   if(button.hasAttribute('data-support-floating')&&panel.open){close();return;}
   opener=button;
   const body=input('body');
   if(!submitting&&button.dataset.supportMessage&&body&&!body.value.trim())body.value=button.dataset.supportMessage;
   position();if(!panel.open)panel.show();syncExpanded(true);
   panel.querySelector('#support-title')?.focus({preventScroll:true});
  }));
  panel.querySelector('[data-support-close]')?.addEventListener('click',close);
  addEventListener('resize',()=>{if(panel.open)position();});
  addEventListener('scroll',()=>{if(panel.open)position();},{passive:true});
  panel.addEventListener('close',()=>{
   syncExpanded(false);
   if(returnFocus&&opener instanceof HTMLElement&&opener.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&panel.open&&!event.defaultPrevented){event.preventDefault();close();}
  });
  form.querySelectorAll('[name=contact_method]').forEach(radio=>radio.addEventListener('change',syncMethod));
  const normalize=field=>{
   if(field.name==='phone')field.value=field.value.replace(/[^0-9]/g,'');
   if(field.name==='telegram')field.value=field.value.trim().replace(/^(?:https?:\/\/)?t\.me\//i,'').replace(/^@/,'');
  };
  form.querySelectorAll('input:not([type=radio]),textarea').forEach(field=>field.addEventListener('input',()=>{normalize(field);clearError(field);if(status.dataset.state!=='sending')status.textContent='';}));
  const validate=()=>{
   const name=input('name'),body=input('body'),contact=input(method());
   [name,body,contact].forEach(clearError);normalize(contact);
   const errors=[];
   if(name.value.trim().length<2)errors.push([name,en?'Enter your name (at least 2 characters).':'Укажите имя — минимум 2 символа.']);
   if(method()==='phone'&&(!/^[0-9]{7,15}$/.test(contact.value)||/^([0-9])\1+$/.test(contact.value)))errors.push([contact,en?'Enter 7–15 digits including your country code.':'Укажите 7–15 цифр, включая код страны.']);
   if(method()==='telegram'&&!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact.value))errors.push([contact,en?'Enter a username: 5–32 letters, digits or underscores, starting with a letter.':'Укажите username: 5–32 символа, первая — буква. Можно цифры и подчёркивание.']);
   if(method()==='email'&&(!contact.validity.valid||!/^\S+@[^\s@]+\.[^\s@]+$/.test(contact.value.trim())))errors.push([contact,en?'Enter an email such as you@example.com.':'Укажите email, например you@example.com.']);
   if(!body.value.trim())errors.push([body,en?'Write a message.':'Напишите сообщение.']);
   if(errors.length){errors.forEach(([field,message])=>showError(field,message));errors[0][0].focus();return false;}
   return form.checkValidity();
  };
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(submitting||!validate())return;
   const selected=method();const values=new FormData(form);
   const contact=String(values.get(selected)??'').trim();
   const countryId=document.documentElement.dataset.world??location.pathname.replace(/^\/en\//,'/').split('/')[1];
   const country={bali:'Бали',thailand:'Таиланд',russia:'Россия',nepal:'Непал',uae:'ОАЭ'}[countryId];
   const segments=location.pathname.replace(/^\/en\//,'/').split('/').filter(Boolean);
   const section=({visas:'Визы',housing:'Жильё',exchange:'Обмен валюты',assistant:'Ассистент',guides:'Гайды'})[segments[1]]??'Поддержка';
   const service=new URLSearchParams(location.search).get('service')==='bikes'?'Байки':segments[2]??segments[1]??'Направление';
   const payload={name:String(values.get('name')??'').trim(),contact:(selected==='phone'?'+':selected==='telegram'?'@':'')+contact,body:String(values.get('body')??'').trim(),website:String(values.get('website')??''),route_context:{...(country?{country}:{}),section,service:service.slice(0,150)}};
   submitting=true;
   const controls=[...form.querySelectorAll('input,textarea,button')].map(field=>[field,field.disabled]);controls.forEach(([field])=>field.disabled=true);
   submit.setAttribute('aria-busy','true');status.dataset.state='sending';status.textContent=launcher.dataset.supportSending??'';
   try{
    const response=await fetch('/api/web/chat/guest',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify(payload)});
    if(!response.ok||!(await response.json()).accepted)throw new Error('support:'+response.status);
    form.reset();form.querySelectorAll('[aria-invalid]').forEach(clearError);status.dataset.state='success';status.textContent=launcher.dataset.supportSent??'';
   }catch{status.dataset.state='error';status.textContent=launcher.dataset.supportFailed??'';}
   finally{submitting=false;controls.forEach(([field,disabled])=>field.disabled=disabled);syncMethod();submit.removeAttribute('aria-busy');}
  });
  syncMethod();
 }
}
