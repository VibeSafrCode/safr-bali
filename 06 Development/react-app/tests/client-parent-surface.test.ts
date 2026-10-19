import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import test from 'node:test';
import {ApiError} from '../src/api/client';
import {createClientUiSurfaceController,clientUiPrincipal,type ClientUiSurface} from '../src/i18n/client-ui-surface';
import {CLIENT_RUNTIME_LOCALES} from '../src/i18n/client-runtime';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {clientAccountCopies,clientAccountInvitedCount} from '../src/i18n/client-account-copy';
const app=fileURLToPath(new URL('../',import.meta.url));
const a='a'.repeat(64),b='b'.repeat(64),tick=()=>new Promise<void>(r=>setImmediate(r));
function deferred<T=unknown>(){let resolve!:(v:T)=>void,reject!:(v:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};}
function harness(surface:ClientUiSurface='web',saved:string|null=null){
 const events:any[]=[],requests:{path:string;options:RequestInit}[]=[],lost:number[]=[];
 const server={actor:101,csrf:a,ui_locale:'fr',revision:0},h:any={handler:null};
 const api={async request<T>(url:string,options:RequestInit={}):Promise<T>{
  requests.push({path:url,options});if(h.handler)return await h.handler(url,options) as T;
  if(options.method==='PATCH'){
   const body=JSON.parse(options.body as string);assert.deepEqual(Object.keys(body).sort(),['expected_revision','ui_locale']);
   assert.equal((options.headers as Record<string,string>)['X-CSRF-Token'],server.csrf);
   if(body.expected_revision!==server.revision)throw new ApiError('conflict',{kind:'http',status:409,details:{current:{ui_locale:server.ui_locale,revision:server.revision}}});
   server.ui_locale=body.ui_locale;server.revision++;return {ui_locale:server.ui_locale,revision:server.revision} as T;
  }
  return {...(surface==='web'?{authenticated:true}:{}),telegram_id:server.actor,csrf_token:server.csrf,
   client_ui_preference:{ui_locale:server.ui_locale,revision:server.revision}} as T;
 }};
 const controller=createClientUiSurfaceController({surface,api,environment:{initial:'ru',read:()=>saved,
  write:value=>events.push(['write',value]),apply:value=>events.push(['apply',value])},onAuthorityLost:()=>lost.push(1)});
 controller.mount();
 const bind=(actor=101,preference:unknown={ui_locale:'fr',revision:0},csrf:string|undefined=a,contact:unknown='en')=>{
  const token=controller.beginLoad();controller.bind(token,{actor,preference,csrf},contact);return token;
 };
 return {controller,api,requests,events,lost,server,h,bind};
}

for(const surface of ['web','mini'] as const){
 test(surface+': all ten actual CAS intents use own endpoint/closed body, never contact locale',async()=>{
  const x=harness(surface);x.bind();
  for(const locale of CLIENT_RUNTIME_LOCALES)assert.equal(await x.controller.choose(locale),'saved');
  assert.equal(x.server.revision,10);assert.equal(x.requests.length,10);
  for(const r of x.requests){assert.equal(r.path,surface==='web'?'/api/web/preferences/ui-locale':'/mini-app/preferences/ui-locale');assert.equal(r.options.method,'PATCH');}
  assert.equal(x.controller.locale.snapshot().contactLocale,'en');assert.equal(x.controller.locale.snapshot().locale,'ar');
  assert.equal(x.controller.preference.snapshot().status,'saved');x.controller.dispose();
 });
 test(surface+': equal-value gestures still fence old intents',async()=>{
  const x=harness(surface);x.bind();assert.equal(await x.controller.choose('fr'),'saved');assert.equal(await x.controller.choose('fr'),'saved');
  assert.equal(x.server.revision,2);assert.equal(x.requests.length,2);x.controller.dispose();
 });
 test(surface+': server wins local cache, unknown rollout projection stays local/no network',async()=>{
  const x=harness(surface,'ar');x.bind();assert.equal(x.controller.locale.snapshot().locale,'fr');
  const token=x.controller.beginLoad();x.controller.bind(token,{actor:101,preference:undefined,csrf:undefined},'en');
  await x.controller.choose('ja');assert.equal(x.requests.length,0);
  assert.equal(x.controller.preference.snapshot().status,'local');x.controller.dispose();
 });
 test(surface+': lost ACK reconciles own read/rotated CSRF, no second PATCH',async()=>{
  const x=harness(surface);x.bind();
  x.h.handler=async(_url:string,options:RequestInit)=>{
   if(options.method==='PATCH'){x.server.ui_locale='ja';x.server.revision=1;throw new ApiError('lost',{kind:'network'});}
   return {...(surface==='web'?{authenticated:true}:{}),telegram_id:101,csrf_token:b,client_ui_preference:{ui_locale:'ja',revision:1}};
  };
  assert.equal(await x.controller.choose('ja'),'saved');assert.equal(x.requests.filter(r=>r.options.method==='PATCH').length,1);
  assert.equal(x.requests[1].path,surface==='web'?'/api/web/auth/me':'/mini-app/preferences/ui-locale');
  x.server.csrf=b;x.h.handler=null;assert.equal(await x.controller.choose('ar'),'saved');x.controller.dispose();
 });
 test(surface+': foreign reconcile invalidates, never adopts B as A or writes again',async()=>{
  const x=harness(surface);x.bind();x.h.handler=async(_url:string,options:RequestInit)=>{
   if(options.method==='PATCH')throw Error('lost');return {...(surface==='web'?{authenticated:true}:{}),telegram_id:202,csrf_token:b,client_ui_preference:{ui_locale:'ar',revision:2}};
  };
  // The existing CAS reports an unknown commit after a foreign read, but the
  // authority is gone: no B adoption, fake saved state or queued A write.
  assert.equal(await x.controller.choose('ja'),'unknown');assert.equal(x.lost.length,1);assert.equal(x.controller.preference.snapshot().actor,null);
  assert.notEqual(x.controller.preference.snapshot().status,'saved');
  assert.equal(await x.controller.choose('ko'),'local');assert.equal(x.requests.length,2);x.controller.dispose();
 });
 test(surface+': delayed A denial cannot clear newly bound B',async()=>{
  const x=harness(surface),pending=deferred();x.bind();x.h.handler=()=>pending.promise;
  const old=x.controller.choose('ja');await tick();
  x.bind(202,{ui_locale:'de',revision:7},b,'ru');
  pending.reject(new ApiError('old-A-denied',{kind:'http',status:403}));await old;await tick();
  assert.equal(x.lost.length,0);assert.equal(x.controller.preference.snapshot().actor,202);
  assert.equal(x.controller.locale.snapshot().locale,'de');x.controller.dispose();
 });
 test(surface+': delayed A read never rotates B credentials',async()=>{
  const x=harness(surface),pending=deferred();x.bind();x.h.handler=async(_url:string,options:RequestInit)=>{
   if(options.method==='PATCH')throw Error('unknown');return await pending.promise;
  };
  const old=x.controller.choose('ja');await tick();await tick();x.bind(202,{ui_locale:'de',revision:7},b,'ru');
  pending.resolve({...(surface==='web'?{authenticated:true}:{}),telegram_id:101,csrf_token:a,client_ui_preference:{ui_locale:'ja',revision:1}});
  await old;await tick();assert.equal(x.lost.length,0);assert.equal(x.controller.preference.snapshot().actor,202);
  x.h.handler=null;x.server.actor=202;x.server.csrf=b;x.server.revision=7;assert.equal(await x.controller.choose('ar'),'saved');x.controller.dispose();
 });
}

test('new load/logout/dispose fences pending principal work and drops only UI choice',async()=>{
 const x=harness('web','ar'),old=x.bind();const token=x.controller.beginLoad();
 assert.equal(x.controller.bind(old,{actor:101,preference:{ui_locale:'ja',revision:8},csrf:a},'ru'),false);
 assert.equal(x.controller.current(token),true);x.controller.logout();assert.equal(x.controller.current(token),false);
 assert.equal(x.controller.locale.snapshot().actor,null);assert.equal(x.controller.locale.snapshot().locale,'ru');
 x.controller.dispose();assert.equal(await x.controller.choose('fr'),'stale');x.controller.mount();assert.equal(await x.controller.choose('de'),'local');
 assert.equal(x.requests.length,0);assert.ok(x.events.every(e=>e[0]==='apply'||typeof e[1]==='string'||e[1]===null));x.controller.dispose();
});
test('conflict breaks queued old intent; only explicit retry reads/rebases',async()=>{
 const x=harness();x.bind();x.server.revision=2;x.server.ui_locale='de';
 const first=x.controller.choose('fr'),second=x.controller.choose('ja');await first;await second;
 assert.equal(x.requests.length,1);assert.equal(x.controller.preference.snapshot().status,'conflict');
 assert.equal(await x.controller.retry(),'saved');assert.deepEqual(x.requests.slice(1).map(r=>r.options.method??'GET'),['GET','PATCH']);x.controller.dispose();
});
test('failed fresh read invalidates queued work, never fake saved',async()=>{
 const x=harness();x.bind();let calls=0;x.h.handler=async()=>{calls++;throw new ApiError('private',{kind:'network'});};
 await x.controller.choose('ja');const one=x.controller.retry(),two=x.controller.choose('ko');await one;await two;
 assert.equal(x.requests.filter(r=>r.options.method==='PATCH').length,1);assert.notEqual(x.controller.preference.snapshot().status,'saved');assert.ok(calls>=2);x.controller.dispose();
});
test('same-epoch 401/403 clears principal; validation rejection never grants new identity',async()=>{
 for(const code of [401,403,422]){const x=harness();x.bind();x.h.handler=async()=>{throw new ApiError('sensitive',{kind:code===401?'authentication':'http',status:code});};
 await x.controller.choose('ar');assert.equal(x.lost.length,code===422?0:1);assert.notEqual(x.controller.preference.snapshot().status,'saved');x.controller.dispose();}
});
test('closed principal parser rejects inherited actor, unsafe IDs, bad CSRF and unauthenticated Mini claims',()=>{
 for(const surface of ['web','mini'] as const){
  for(const actor of [0,-1,'101',true,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>clientUiPrincipal(surface,{authenticated:true,telegram_id:actor}));
  assert.throws(()=>clientUiPrincipal(surface,Object.create({authenticated:true,telegram_id:101})));
  for(const csrf of ['',a.toUpperCase(),'plain',123])assert.throws(()=>clientUiPrincipal(surface,{authenticated:true,telegram_id:101,csrf_token:csrf}));
 }
 assert.equal(clientUiPrincipal('web',{authenticated:false}),null);
 assert.throws(()=>clientUiPrincipal('web',{telegram_id:101}));
});
test('source003 import is literal50 ordinary values plus19 foreign plural forms, no source counter increase',()=>{
 const file=path.join(app,'../shared/content/client-ui/client-account-supplement.v1.json'),bytes=fs.readFileSync(file);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'bd38cdd512ae179a1941c0921cf04d3422d2f3b5db3a066fd04be2a5a45b4fb2');
 const projection=JSON.parse(String(bytes));assert.equal(Object.keys(projection.entries).length,5);
 assert.equal(Object.values(projection.invited).flatMap(v=>Object.keys(v as object)).length,21);
 for(const locale of CLIENT_RUNTIME_LOCALES){const ui=createClientUiBindings(locale),copies=clientAccountCopies(ui);
  assert.equal(typeof copies.page.pointsLead,'string');assert.equal(typeof copies.shell.tabs.life,'string');
  for(const count of [0,1,2,3,11,21,100,1000000]){
   const forms=projection.invited[locale],category=new Intl.PluralRules(locale).select(count),pattern=forms[category]??forms.other;
   assert.equal(clientAccountInvitedCount(ui,count),pattern.replace('{count}',String(count)));
  }
 }
 for(const count of [-1,NaN,Infinity,0.5,'1',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>clientAccountInvitedCount(createClientUiBindings('ar'),count));
 assert.throws(()=>clientAccountCopies({role:'client',locale:'ru'} as any));
});

// Actual hook module, explicit hook/effect probes (not ReactDOM or a session).
function hookHarness(enabled:boolean){
 const states:any[]=[],refs:any[]=[],effects:(()=>void|(()=>void))[]=[],applied:string[]=[],writes:any[]=[],calls={api:0,environment:0,read:0,subscribe:0,off:0};
 let stateIndex=0,refIndex=0,logout:()=>void=()=>{},cleanups:(void|(()=>void))[]=[];
 const react={
  useRef:(value:any)=>{const i=refIndex++;return refs[i]??(refs[i]={current:value});},
  useState:(value:any)=>{const i=stateIndex++;if(!(i in states))states[i]=typeof value==='function'?value():value;
   return [states[i],(next:any)=>{states[i]=typeof next==='function'?next(states[i]):next;}];},
  useMemo:(fn:()=>unknown)=>fn(),useEffect:(fn:()=>void|(()=>void))=>{effects.push(fn);},
 };
 const filename=path.join(app,'src/i18n/use-client-ui-controller.ts'),exports:any={};
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const modules:Record<string,unknown>={
  react,
  '../api/client':{appApiClient:()=>{calls.api++;return {request:async()=>{throw Error('UNEXPECTED_NETWORK');}};}},
  '../runtime/yoga-mini-app':{YOGA_MINI_APP:false},
  '../runtime/client-auth-lifecycle':{subscribeClientAuthLogout:(cb:()=>void)=>{calls.subscribe++;logout=cb;return()=>{calls.off++;};}},
  './client-ui-bindings':{createClientUiBindings},
  './client-ui-locale':{browserClientUiLocaleEnvironment:()=>{calls.environment++;return {initial:'ru',read:()=>{calls.read++;return 'ar';},write:(v:any)=>writes.push(v),apply:(v:string)=>applied.push(v)};}},
  './client-ui-surface':{createClientUiSurfaceController},
 };
 const scoped=(specifier:string)=>{assert.ok(Object.hasOwn(modules,specifier),'Unexpected actual hook import '+specifier);return modules[specifier];};
 vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename})(scoped,{exports},exports);
 let callbacks:Record<string,()=>void>={};
 const render=(mode=enabled)=>{stateIndex=0;refIndex=0;effects.length=0;return exports.useClientUiController('web',mode,callbacks);};
 const mount=()=>{cleanups=effects.map(e=>e());},dispose=()=>{cleanups.forEach(c=>c?.());cleanups=[];};
 return {render,mount,dispose,callbacks:(v:Record<string,()=>void>)=>{callbacks=v;},logout:()=>logout(),calls,applied,writes};
}
test('actual preview hook is disabled: no controller/API/storage/document environment/subscriptions',()=>{
 const x=hookHarness(false),r=x.render();x.mount();
 assert.equal(r.controller,null);assert.equal(r.ui,undefined);assert.equal(r.preference,undefined);
 assert.deepEqual(x.calls,{api:0,environment:0,read:0,subscribe:0,off:0});x.dispose();
 assert.deepEqual(x.applied,[]);assert.deepEqual(x.writes,[]);
});
test('actual user hook shares one controller and uses latest logout callback across rerenders',async()=>{
 const x=hookHarness(true);let old=0,latest=0;x.callbacks({onLogout:()=>old++});const first=x.render();x.mount();
 x.callbacks({onLogout:()=>latest++});let next=x.render();assert.equal(next.controller,first.controller);
 assert.equal(x.calls.api,1);assert.equal(x.calls.environment,1);assert.equal(x.calls.read,1);
 assert.equal(next.ui.locale,'ar');await next.controller.choose('ja');next=x.render();assert.equal(next.ui.locale,'ja');
 x.logout();next=x.render();assert.equal(old,0);assert.equal(latest,1);assert.equal(next.ui.locale,'ru');
 x.dispose();assert.equal(x.calls.off,1);assert.equal(await first.controller.choose('en'),'stale');
});
test('actual hook effect cleanup/remount invalidates old tokens and leaves one live subscription',()=>{
 const x=hookHarness(true),first=x.render();x.mount();const token=first.controller.beginLoad();
 x.dispose();assert.equal(first.controller.current(token),false);x.render();x.mount();
 assert.equal(x.calls.subscribe-x.calls.off,1);assert.equal(first.controller.current(token),false);x.dispose();assert.equal(x.calls.subscribe,x.calls.off);
});
test('actual hook refuses an Admin/preview-to-user mode change on the same instance',()=>{
 const x=hookHarness(false);x.render();x.mount();assert.throws(()=>x.render(true),/SURFACE_MODE_CHANGED/);x.dispose();
});
test('both actual User entry closures compile with shared UI10 controller, no Admin/private imports or output writes',async()=>{
 for(const name of ['AccountApp','MiniApp']){
  const result=await build({root:app,configFile:false,envDir:false,envPrefix:'__SAFR_NO_AMBIENT_ENV__',logLevel:'silent',plugins:[reactPlugin()],
   build:{write:false,minify:false,sourcemap:false,lib:{entry:path.join(app,'src/surfaces',name+'.tsx'),formats:['es']}}});
  const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output),chunks=outputs.filter(o=>o.type==='chunk');
  const modules=[...new Set(chunks.flatMap(c=>Object.keys(c.modules)))].sort();
  for(const file of [name+'.tsx','use-client-ui-controller.ts','client-ui-surface.ts','client-ui-preference.ts','client-ui-locale.ts','ClientAppearanceControls.tsx','SupportDrawer.tsx','CatalogView.tsx','client-runtime.v1.json'])assert.ok(modules.some(m=>m.endsWith(file)),name+' missing '+file);
  if(name==='AccountApp')for(const file of ['client-account-copy.ts','client-account-supplement.v1.json'])assert.ok(modules.some(m=>m.endsWith(file)));
  assert.ok(!modules.some(m=>/\/Admin[^/]*\.(?:tsx?|jsx?)$|AUDIT\/|candidates\.v1|registry-copy\//.test(m)));
  console.log('PARENT_ENTRY_PROOF '+JSON.stringify({name,modules:modules.length,moduleListSha256:createHash('sha256').update(JSON.stringify(modules)+'\n').digest('hex'),outputs:outputs.length,jsBytes:chunks.reduce((n,c)=>n+Buffer.byteLength(c.code),0),write:false,fullDependencyClosure:false}));
 }
});
