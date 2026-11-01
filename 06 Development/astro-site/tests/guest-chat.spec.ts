import {expect,test,type Page} from '@playwright/test';

type Message = {id:number,author_type:'client'|'staff',body:string,created_at:string};
const sessionPath='/api/web/chat/guest/session';
const messagesPath='/api/web/chat/guest/messages';
const synthetic=(messages:Message[]=[],id=41)=>({session_id:id,expires_at:'2099-01-01T00:00:00Z',csrf_token:'synthetic-guest-csrf',chat:{id:messages.length?71:null,status:messages.length?'open':'empty',messages}});
async function openChat(page:Page){
 await page.goto('/en/bali/visas/e33g/');
 await page.locator('[data-support-floating]').click();
 await expect(page.locator('[data-support-submit]')).toBeEnabled();
}

for(const viewport of [{width:320,height:740},{width:1280,height:800}]){
 test(`guest text history, safe reply and same-browser reload ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  let messages:Message[]=[],sessionExists=false,postBody:Record<string,unknown>|null=null;
  await page.route('**/api/web/chat/guest/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path===sessionPath&&request.method()==='GET'){
    await route.fulfill(sessionExists?{json:synthetic(messages)}:{status:401,json:{detail:'Guest session unavailable'}});return;
   }
   if(path===sessionPath&&request.method()==='POST'){
    expect(request.postDataJSON()).toEqual({restart:false});sessionExists=true;await route.fulfill({json:synthetic()});return;
   }
   if(path===messagesPath&&request.method()==='POST'){
    expect(request.headers()['x-csrf-token']).toBe('synthetic-guest-csrf');
    postBody=request.postDataJSON();expect(postBody?.idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
    messages=[{id:1,author_type:'client',body:String(postBody?.body),created_at:'2026-10-31T20:00:00Z'},
     {id:2,author_type:'staff',body:'Reply <img src=x onerror="alert(1)">',created_at:'2026-10-31T20:01:00Z'}];
    await route.fulfill({status:201,json:{...synthetic(messages),accepted:true,message_id:1,idempotent_replay:false}});return;
   }
   throw new Error('Unexpected synthetic guest request '+request.method()+' '+path);
  });
  await openChat(page);
  await expect(page.locator('#support-title')).toBeFocused();
  await page.locator('#support-body').fill('Question <script>window.__guestXss=1</script>');
  await page.locator('[data-support-submit]').click();
  await expect(page.locator('[data-support-history]')).toContainText('Reply <img src=x onerror="alert(1)">');
  await expect(page.locator('[data-support-history] script, [data-support-history] img')).toHaveCount(0);
  expect(await page.evaluate(()=>Object.hasOwn(window,'__guestXss'))).toBe(false);
  expect(postBody).not.toHaveProperty('contact');
  await expect(page.locator('[data-support-status]')).toContainText('Saved in the chat');
  const bounds=await page.locator('#support-panel').evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth,right:element.getBoundingClientRect().right}));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);expect(bounds.right).toBeLessThanOrEqual(viewport.width);
  await page.reload();await page.locator('[data-support-floating]').click();
  await expect(page.locator('[data-support-history]')).toContainText('Reply <img src=x onerror="alert(1)">');
  await expect(page.locator('[data-support-identity]')).toBeHidden();
 });
}

test('unknown send outcome keeps the exact body/context/key until retry is accepted',async({page})=>{
 const payloads:unknown[]=[];let first=true;
 await page.route('**/api/web/chat/guest/**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:synthetic()});return;}
  const payload=route.request().postDataJSON();payloads.push(payload);
  if(first){first=false;await route.abort('timedout');return;}
  await route.fulfill({status:201,json:{...synthetic([{id:1,author_type:'client',body:payload.body,created_at:'2026-10-31T20:00:00Z'}]),accepted:true,message_id:1,idempotent_replay:true}});
 });
 await openChat(page);await page.locator('#support-body').fill('Preserve this question');await page.locator('[data-support-submit]').click();
 await expect(page.locator('[data-support-status]')).toContainText('not been confirmed');
 await expect(page.locator('#support-body')).toHaveAttribute('readonly','');
 await expect(page.locator('[data-support-end]')).toBeDisabled();
 await page.locator('[data-support-submit]').click();
 await expect(page.locator('[data-support-status]')).toContainText('Saved in the chat');
 expect(payloads).toHaveLength(2);expect(payloads[1]).toEqual(payloads[0]);
 await expect(page.locator('#support-body')).toHaveValue('');await expect(page.locator('#support-body')).not.toHaveAttribute('readonly','');
});

test('polling pauses when closed or hidden and backs off after a failed read',async({page})=>{
 await page.clock.install();let reads=0,fail=false;
 await page.route('**/api/web/chat/guest/session',async route=>{
  expect(route.request().method()).toBe('GET');reads+=1;
  await route.fulfill(fail?{status:503,json:{detail:'Synthetic unavailable'}}:{json:synthetic()});
 });
 await openChat(page);expect(reads).toBe(1);
 await page.clock.runFor(5100);await expect.poll(()=>reads).toBe(2);
 await page.keyboard.press('Escape');await page.clock.runFor(20000);expect(reads).toBe(2);
 await page.locator('[data-support-floating]').click();await expect(page.locator('[data-support-submit]')).toBeEnabled();
 await expect.poll(()=>reads).toBe(3);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(20000);expect(reads).toBe(3);
 fail=true;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('[data-support-status]')).toContainText('could not refresh');const failedReads=reads;
 await page.clock.runFor(5100);expect(reads).toBe(failedReads);
 await page.clock.runFor(5100);await expect.poll(()=>reads).toBe(failedReads+1);
});

test('expiry clears previous text and requires an explicit new chat',async({page})=>{
 await page.clock.install();let expired=false,starts=0;
 await page.route('**/api/web/chat/guest/session',async route=>{
  if(route.request().method()==='GET'){await route.fulfill(expired?{status:401,json:{detail:'Guest session unavailable'}}:{json:synthetic([{id:1,author_type:'staff',body:'Previous private history',created_at:'2026-10-31T20:00:00Z'}])});return;}
  starts+=1;expect(route.request().postDataJSON()).toEqual({restart:true});await route.fulfill({json:synthetic([],42)});
 });
 await openChat(page);await page.locator('#support-body').fill('Do not transfer this draft');expired=true;
 await page.clock.runFor(5100);await expect(page.locator('[data-support-start]')).toBeVisible();
 await expect(page.locator('[data-support-history]')).not.toContainText('Previous private history');await expect(page.locator('#support-body')).toHaveValue('');expect(starts).toBe(0);
 await page.locator('[data-support-start]').click();await expect(page.locator('[data-support-submit]')).toBeEnabled();expect(starts).toBe(1);
 await expect(page.locator('[data-support-history]')).not.toContainText('Previous private history');
});

test('a response from a closed generation cannot replace the reopened history',async({page})=>{
 await page.clock.install();let latest=false;
 await page.addInitScript(()=>{
  const nativeFetch=window.fetch.bind(window);let reads=0;
  window.fetch=(resource,options)=>{
   if(String(resource).endsWith('/api/web/chat/guest/session')&&(!options?.method||options.method==='GET')&&++reads===2){
    return new Promise<Response>(resolve=>{
     Object.assign(window,{releaseStaleGuestRead:()=>resolve(new Response(JSON.stringify({session_id:99,csrf_token:'stale-proof',chat:{id:90,status:'open',messages:[{id:90,author_type:'staff',body:'Stale other-session response',created_at:'2026-10-31T20:00:00Z'}]}}),{status:200,headers:{'Content-Type':'application/json'}}))});
    });
   }
   return nativeFetch(resource,options);
  };
 });
 await page.route('**/api/web/chat/guest/session',async route=>{
  await route.fulfill({json:synthetic(latest?[{id:2,author_type:'staff',body:'Current history',created_at:'2026-10-31T20:00:00Z'}]:[])});
 });
 await openChat(page);await page.clock.runFor(5100);
 await expect.poll(()=>page.evaluate(()=>Object.hasOwn(window,'releaseStaleGuestRead'))).toBe(true);
 await page.keyboard.press('Escape');latest=true;await page.locator('[data-support-floating]').click();
 await page.evaluate(()=>{(window as unknown as {releaseStaleGuestRead:()=>void}).releaseStaleGuestRead();});
 await expect(page.locator('[data-support-history]')).not.toContainText('Stale other-session response');
 await page.clock.runFor(5100);await expect(page.locator('[data-support-history]')).toContainText('Current history');
 await expect(page.locator('[data-support-start]')).toBeHidden();
});

for(const closedFrom of ['read','send']){
 test(`closed from ${closedFrom} keeps history and draft until a successful explicit restart`,async({page})=>{
  await page.clock.install();let closed=false,starts=0,sends=0;
  const previous=[{id:1,author_type:'staff' as const,body:'History of this same session',created_at:'2026-10-31T20:00:00Z'}];
  await page.route('**/api/web/chat/guest/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()==='GET'){
    const data=synthetic(previous);if(closed)data.chat.status='closed';await route.fulfill({json:data});return;
   }
   if(path===messagesPath){sends+=1;await route.fulfill({status:409,json:{detail:'Conversation is closed'}});return;}
   expect(path).toBe(sessionPath);starts+=1;expect(request.headers()['x-csrf-token']).toBe('synthetic-guest-csrf');
   expect(request.postDataJSON()).toEqual({restart:true});
   await route.fulfill(starts===1?{status:403,json:{detail:'Synthetic restart refusal'}}:{json:synthetic([],42)});
  });
  await openChat(page);await page.locator('#support-body').fill('Copy this unsent draft');
  if(closedFrom==='read'){closed=true;await page.clock.runFor(5100);}else await page.locator('[data-support-submit]').click();
  await expect(page.locator('[data-support-start]')).toBeVisible();await expect(page.locator('[data-support-start]')).toBeEnabled();
  await expect(page.locator('[data-support-submit]')).toBeDisabled();await expect(page.locator('#support-body')).toHaveValue('Copy this unsent draft');
  await expect(page.locator('#support-body')).toHaveAttribute('readonly','');await expect(page.locator('[data-support-history]')).toContainText('History of this same session');
  await page.locator('[data-support-start]').click();await expect(page.locator('[data-support-status]')).toContainText('temporarily unavailable');
  await expect(page.locator('#support-body')).toHaveValue('Copy this unsent draft');await expect(page.locator('[data-support-history]')).toContainText('History of this same session');
  await expect(page.locator('[data-support-start]')).toBeEnabled();
  await page.locator('[data-support-start]').click();await expect(page.locator('[data-support-submit]')).toBeEnabled();
  await expect(page.locator('#support-body')).toHaveValue('');await expect(page.locator('[data-support-history]')).not.toContainText('History of this same session');
  await expect(page.locator('[data-support-start]')).toBeHidden();expect(sends).toBe(closedFrom==='send'?1:0);
 });
}

for(const rejection of [403,422,429]){
 test(`a first definite ${rejection} rejection keeps an editable draft`,async({page})=>{
  const payloads:{body:string,idempotency_key:string}[]=[];
  await page.route('**/api/web/chat/guest/**',async route=>{
   if(route.request().method()==='GET'){await route.fulfill({json:synthetic()});return;}
   const payload=route.request().postDataJSON();payloads.push(payload);
   if(payloads.length===1){await route.fulfill({status:rejection,json:{detail:'Synthetic pre-write rejection'}});return;}
   await route.fulfill({status:201,json:{...synthetic([{id:1,author_type:'client',body:payload.body,created_at:'2026-10-31T20:00:00Z'}]),accepted:true,message_id:1,idempotent_replay:false}});
  });
  await openChat(page);await page.locator('#support-body').fill('Correct this draft');await page.locator('[data-support-submit]').click();
  await expect(page.locator('[data-support-status]')).toContainText(rejection===429?'Too many messages':'not accepted');
  await expect(page.locator('#support-body')).not.toHaveAttribute('readonly','');await expect(page.locator('#support-body')).toHaveValue('Correct this draft');
  await page.locator('#support-body').fill('Corrected draft');await page.locator('[data-support-submit]').click();
  await expect(page.locator('[data-support-status]')).toContainText('Saved in the chat');expect(payloads).toHaveLength(2);
  expect(payloads[1].body).toBe('Corrected draft');expect(payloads[1].idempotency_key).not.toBe(payloads[0].idempotency_key);
 });
}

test('timeout followed by 403 keeps the original body/context/key locked until acceptance',async({page})=>{
 const payloads:unknown[]=[];
 await page.route('**/api/web/chat/guest/**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:synthetic()});return;}
  const payload=route.request().postDataJSON();payloads.push(payload);
  if(payloads.length===1){await route.abort('timedout');return;}
  if(payloads.length===2){await route.fulfill({status:403,json:{detail:'Synthetic access refusal after unknown outcome'}});return;}
  await route.fulfill({status:201,json:{...synthetic([{id:1,author_type:'client',body:payload.body,created_at:'2026-10-31T20:00:00Z'}]),accepted:true,message_id:1,idempotent_replay:true}});
 });
 await openChat(page);await page.locator('#support-body').fill('Keep exact unknown request');
 await page.locator('[data-support-submit]').click();await expect(page.locator('[data-support-status]')).toContainText('not been confirmed');
 await page.locator('[data-support-submit]').click();await expect.poll(()=>payloads.length).toBe(2);
 await expect(page.locator('#support-body')).toHaveAttribute('readonly','');await expect(page.locator('[data-support-status]')).toContainText('not been confirmed');
 await page.locator('[data-support-submit]').click();await expect(page.locator('[data-support-status]')).toContainText('Saved in the chat');
 expect(payloads).toHaveLength(3);expect(payloads[1]).toEqual(payloads[0]);expect(payloads[2]).toEqual(payloads[0]);
});

test('a replay conflict stops sending without silently issuing a new key',async({page})=>{
 let sends=0;
 await page.route('**/api/web/chat/guest/**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:synthetic()});return;}
  sends+=1;await route.fulfill({status:409,json:{detail:'Message replay conflict'}});
 });
 await openChat(page);await page.locator('#support-body').fill('Conflicting request');await page.locator('[data-support-submit]').click();
 await expect(page.locator('[data-support-status]')).toContainText('could not be safely retried');await expect(page.locator('[data-support-submit]')).toBeDisabled();
 await expect(page.locator('#support-body')).toHaveAttribute('readonly','');await expect(page.locator('#support-body')).toHaveValue('Conflicting request');
 await expect(page.locator('[data-support-start]')).toBeVisible();expect(sends).toBe(1);
});

test('name validation counts Unicode characters in the same way as the API',async({page})=>{
 let sends=0;
 await page.route('**/api/web/chat/guest/**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:synthetic()});return;}
  sends+=1;throw new Error('A one-character name must be rejected before sending');
 });
 await openChat(page);await page.locator('[data-support-identity] summary').click();await page.locator('#support-name').fill('🙂');
 await page.locator('#support-body').fill('Question');await page.locator('[data-support-submit]').click();
 await expect(page.locator('#support-name-error')).toContainText('at least two characters');await expect(page.locator('#support-name')).toBeFocused();expect(sends).toBe(0);
});
