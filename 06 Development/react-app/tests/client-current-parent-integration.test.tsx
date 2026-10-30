import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {ApiError,createApiClient} from '../src/api/client';
import * as bindings from '../src/i18n/client-ui-bindings';
import * as surface from '../src/i18n/client-ui-surface';
import * as preferenceCore from '../src/i18n/client-ui-preference';
import * as localeCore from '../src/i18n/client-ui-locale';
import * as accountCopy from '../src/i18n/client-account-copy';
import * as supportCopy from '../src/i18n/client-support-copy';
import * as navigation from '../src/components/client-navigation';
import {CLIENT_RUNTIME_LOCALES} from '../src/i18n/client-runtime';
import * as uiLocalePolicy from '../../shared/src/ui-locale-policy.mjs';

// Current-base integration fixture. Actual parents, controller and Yoga launch
// run with deterministic hook/event/clock/API facades. This is not ReactDOM,
// real cookies/Telegram/session, visual QA, live messages or release evidence.
// Historical pinned160/167 tests remain unchanged and are not repinned here.
const app=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(app,'package.json'));
function deferred<T=any>(){let resolve!:(value:T)=>void,reject!:(reason:any)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function nodes(value:any):any[]{if(!value||typeof value!=='object')return[];if(Array.isArray(value))return value.flatMap(nodes);return[value,...nodes(value.props?.children)];}
function nodeText(value:any):string{if(value==null||typeof value==='boolean')return'';if(Array.isArray(value))return value.map(nodeText).join('');if(typeof value!=='object')return String(value);return nodeText(value.props?.children);}
class Events{
  listeners=new Map<string,Set<(...args:any[])=>void>>();
  addEventListener=(name:string,fn:(...args:any[])=>void)=>{if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(fn);};
  removeEventListener=(name:string,fn:(...args:any[])=>void)=>{this.listeners.get(name)?.delete(fn);};
  dispatchEvent=(event:{type:string})=>{for(const fn of [...(this.listeners.get(event.type)??[])])fn(event);return true;};
}
class Clock{
  now=0;next=1;timers=new Map<number,{at:number,fn:()=>void}>();
  setTimeout=(fn:()=>void,ms:number)=>{const id=this.next++;this.timers.set(id,{at:this.now+ms,fn});return id;};
  clearTimeout=(id:number)=>{this.timers.delete(id);};
  tick(ms:number){const until=this.now+ms;for(let guard=0;guard<100;guard++){
    const next=[...this.timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
    if(!next){this.now=until;return;}this.now=next[1].at;this.timers.delete(next[0]);next[1].fn();
  }throw Error('FIXTURE_TIMER_LOOP');}
}
type Call={path:string;inputPath:string;options:RequestInit};
class Harness{
  clock=new Clock();events=new Events();docEvents=new Events();slots:any[]=[];cursor=0;dirty=false;mounted=false;
  effects=new Map<number,{deps:any[]|undefined,fn:()=>any,cleanup?:()=>void}>();pending=new Set<number>();
  tree:any;client:any;lateStateWrites=0;actor=101;uiLocale:bindings.ClientUiLocale10='ar';contact:'ru'|'en'='en';revision=0;
  calls:Call[]=[];handler:((call:Call)=>any)|null=null;moduleCache=new Map<string,any>();stubs=new Map<string,any>();
  envReads=0;envApplies=0;logoutSubscriptions=0;logoutPublishes=0;supportClears=0;
  openedTelegram:string[]=[];
  envSaved:string|null=null;clientEnvironment:any;document:any;window:any;location:any;hooks:any;
  constructor(readonly kind:'web'|'mini',pathname=kind==='web'?'/account/home/':'/mini-app/',readonly yoga=false){
    let hash=kind==='mini'?'#/home':'';
    this.location={pathname,search:'',origin:'https://fixture.invalid'};
    Object.defineProperty(this.location,'hash',{get:()=>hash,set:value=>{hash=String(value);this.events.dispatchEvent({type:'hashchange'});}});
    this.document={documentElement:{lang:'ru',dir:'ltr'},visibilityState:'visible',querySelector:()=>null,
      addEventListener:this.docEvents.addEventListener,removeEventListener:this.docEvents.removeEventListener};
    const history={pushState:(_s:any,_t:any,url:string)=>{this.location.pathname=url;},replaceState:(_s:any,_t:any,url:string)=>{if(url.startsWith('#'))hash=url;else this.location.pathname=url;}};
    this.window={location:this.location,history,scrollTo:()=>{},setTimeout:this.clock.setTimeout,clearTimeout:this.clock.clearTimeout,
      addEventListener:this.events.addEventListener,removeEventListener:this.events.removeEventListener,dispatchEvent:this.events.dispatchEvent};
    const storage=new Map<string,string>();this.window.localStorage={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)};
    this.clientEnvironment={initial:'ru',read:()=>{this.envReads++;return this.envSaved;},write:(v:string|null)=>{this.envSaved=v;},
      apply:(v:string)=>{this.envApplies++;this.document.documentElement.lang=v;this.document.documentElement.dir=v==='ar'?'rtl':'ltr';}};
    const next=(kind:string,initial:()=>any)=>{const i=this.cursor++;if(!this.slots[i])this.slots[i]={kind,...initial()};assert.equal(this.slots[i].kind,kind);return[i,this.slots[i]];};
    this.hooks={...React,
      useState:(initial:any)=>{const[i,s]=next('state',()=>({value:typeof initial==='function'?initial():initial}));return[s.value,(value:any)=>{
        if(!this.mounted){this.lateStateWrites++;return;}const v=typeof value==='function'?value(this.slots[i].value):value;
        if(!Object.is(v,this.slots[i].value)){this.slots[i].value=v;this.dirty=true;}
      }];},
      useRef:(value:any)=>next('ref',()=>({ref:{current:value}}))[1].ref,
      useMemo:(fn:()=>any,deps:any[])=>{const[,s]=next('memo',()=>({value:fn(),deps}));if(!sameDeps(s.deps,deps)){s.value=fn();s.deps=deps;}return s.value;},
      useEffect:(fn:()=>any,deps:any[]|undefined)=>{const[i]=next('effect',()=>({}));const old=this.effects.get(i);
        if(!old||!sameDeps(old.deps,deps)){this.effects.set(i,{fn,deps,cleanup:old?.cleanup});this.pending.add(i);}},
    };
  }
  csrf(actor=this.actor){return(actor===101?'a':'b').repeat(64);}
  dashboard(actor=this.actor){return{telegram_id:actor,locale:this.contact,first_name:'Synthetic '+actor,username:'synthetic_'+actor,
    balance:12345,referral_count:21,referral_payload:'r_ABCDEFGH',referral_link:'https://t.me/fixture_bot?start=ref_'+actor,orders:[]};}
  auth(actor=this.actor){return{authenticated:true,telegram_id:actor,locale:this.contact,csrf_token:this.csrf(actor),client_ui_preference:{ui_locale:this.uiLocale,revision:this.revision}};}
  preference(actor=this.actor){return{telegram_id:actor,csrf_token:this.csrf(actor),client_ui_preference:{ui_locale:this.uiLocale,revision:this.revision}};}
  api={request:<T=unknown>(inputPath:string,options:RequestInit={}):Promise<T>=>{
    const preview=this.load('api/account-preview.ts');
    const path=preview.previewRequestPath(inputPath,options.method??'GET',this.location.pathname),call={path,inputPath,options};this.calls.push(call);
    try{const reply=this.handler?this.handler(call):this.defaultReply(call);return Promise.resolve(reply) as Promise<T>;}catch(error){return Promise.reject(error);}
  }};
  defaultReply(call:Call):any{
    if(call.path==='/mini-app/auth/yoga-session')return undefined;
    if(call.path==='/mini-app/yoga-account')return this.dashboard();
    if(call.path==='/mini-app/locale')return undefined;
    if(call.path.includes('/account-preview/account'))return this.dashboard(303);
    if(call.path==='/api/web/auth/me')return this.auth();
    if(call.path==='/api/web/account'||call.path==='/mini-app/me')return this.dashboard();
    if(call.path.endsWith('/preferences/ui-locale')){
      if(call.options.method==='PATCH'){const body=JSON.parse(String(call.options.body));
        if(body.expected_revision!==this.revision)throw new ApiError('synthetic conflict',{kind:'http',status:409,details:{current:{ui_locale:this.uiLocale,revision:this.revision}}});
        this.uiLocale=body.ui_locale;this.revision++;return{ui_locale:this.uiLocale,revision:this.revision};}
      return this.preference();
    }
    if(call.path==='/api/web/auth/logout')return undefined;
    throw Error('UNEXPECTED_FIXTURE_API '+call.path);
  }
  stub(name:string){if(!this.stubs.has(name)){const Stub=(props:any)=>React.createElement('section',{'data-stub':name},props.children);Object.defineProperty(Stub,'name',{value:name});this.stubs.set(name,Stub);}return this.stubs.get(name);}
  load(relative:string,realReact=false):any{
    const key=relative+':'+realReact;if(this.moduleCache.has(key))return this.moduleCache.get(key);
    const filename=path.join(app,'src',relative),exports:any={};
    const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const scoped=(specifier:string):any=>{
      if(specifier==='react')return realReact?React:this.hooks;
      if(specifier==='react/jsx-runtime')return require(specifier);
      if(specifier.endsWith('.css'))return{};
      if(specifier==='../api/account-preview')return this.load('api/account-preview.ts');
      if(specifier==='../api/partner-network')return this.load('api/partner-network.ts');
      if(specifier==='../api/client')return{ApiError,appApiClient:()=>this.api,apiErrorMessage:()=> 'legacy synthetic API error'};
      if(specifier==='../i18n/client-ui-surface'||specifier==='./client-ui-surface')return surface;
      if(specifier==='../i18n/client-ui-preference')return preferenceCore;
      if(specifier==='../i18n/client-ui-bindings'||specifier==='./client-ui-bindings')return bindings;
      if(specifier==='../i18n/client-account-copy')return accountCopy;
      if(specifier==='../i18n/client-support-copy')return supportCopy;
      if(specifier==='./client-ui-locale')return{...localeCore,browserClientUiLocaleEnvironment:()=>this.clientEnvironment};
      if(specifier==='../i18n/use-client-ui-controller'){
        const mod=this.load('i18n/use-client-ui-controller.ts');return{useClientUiController:(...args:any[])=>{this.client=mod.useClientUiController(...args);return this.client;}};
      }
      if(specifier==='../runtime/client-auth-lifecycle')return{
        subscribeClientAuthLogout:(fn:()=>void)=>{this.logoutSubscriptions++;this.events.addEventListener('fixture-logout',fn);return()=>this.events.removeEventListener('fixture-logout',fn);},
        publishClientAuthLogout:()=>{this.logoutPublishes++;this.events.dispatchEvent({type:'fixture-logout'});},
      };
      if(specifier==='../i18n/runtime')return this.load('i18n/runtime.tsx',true);
      if(specifier==='../i18n/locale')return this.load('i18n/locale.ts');
      if(specifier==='../ui/presentation-copy')return this.load('ui/presentation-copy.ts');
      if(specifier==='../../../shared/src/yoga-presentation.mjs')return require(path.join(app,'../shared/src/yoga-presentation.mjs'));
      if(specifier==='../../../shared/src/ui-locale-policy.mjs')return uiLocalePolicy;
      if(specifier==='../../../shared/content/generated/i18n/mini-app.v1.json')return JSON.parse(fs.readFileSync(path.join(app,'../shared/content/generated/i18n/mini-app.v1.json'),'utf8'));
      if(specifier==='../components/client-navigation')return navigation;
      if(specifier.includes('AppearanceControls')&&!specifier.includes('ClientAppearance'))return{
        AppearanceControls:this.stub('AppearanceControls'),useAppearance:()=>({theme:'light',setTheme:()=>{}}),useDocumentLocale:()=>this.document.documentElement.lang==='en'?'en':'ru'};
      if(specifier==='../components/DestinationDesign')return{storedWorld:()=> 'bali'};
      if(specifier==='../components/support-intent')return{supportIntentMemory:{clear:()=>this.supportClears++}};
      if(specifier==='../runtime/browser')return{browserRuntime:{initialize:async()=>{},openTelegram:(url:string)=>this.openedTelegram.push(url)},browserLoginUrl:()=>'/synthetic-login'};
      if(specifier==='../runtime/support-manager')return this.load('runtime/support-manager.ts');
      if(specifier==='./yoga-mini-app')return this.load('runtime/yoga-mini-app.ts');
      if(specifier==='../runtime/yoga-mini-app')return this.load('runtime/yoga-mini-app.ts');
      if(specifier==='../ui/client-brand')return {isYogaBrand:()=>this.yoga};
      if(specifier==='../runtime/telegram')return{loadTelegramWebApp:async()=>this.yoga?{}:null,createTelegramRuntime:()=>({initialize:async()=>{},impact:()=>{},openTelegram:()=>{}}),telegramInitData:()=>this.yoga?'SYNTHETIC_SIGNED_INPUT':''};
      const component=specifier.match(/^(?:\.\.\/components\/|\.\/)([A-Z][A-Za-z]+)$/)?.[1];
      if(component)return{[component]:this.stub(component),...(component==='BaliLifeCabinet'?{BaliLifeEntry:this.stub('BaliLifeEntry')}:{}),...(component==='TelegramSafeArea'?{}:{})};
      throw Error('UNEXPECTED_FIXTURE_IMPORT '+specifier+' in '+relative);
    };
    // Same JavaScript realm as the imported runtime: its plain-object/prototype
    // guard must remain intact. Inject explicit browser facades as lexical args,
    // rather than fabricating foreign-realm variables rejected by that guard.
    const run=vm.runInThisContext('(function(require,module,exports,window,document,location,history,navigator,matchMedia,setTimeout,clearTimeout,__YOGA_MINI_APP__){'+compiled+'\n})',{filename});
    run(scoped,{exports},exports,this.window,this.document,this.location,this.window.history,
      {languages:['en'],onLine:true,clipboard:{writeText:async()=>{}}},()=>({matches:true}),this.clock.setTimeout,this.clock.clearTimeout,this.yoga);
    this.moduleCache.set(key,exports);return exports;
  }
  render(){this.cursor=0;this.dirty=false;const mod=this.load('surfaces/'+(this.kind==='web'?'AccountApp':'MiniApp')+'.tsx');this.tree=mod[this.kind==='web'?'AccountApp':'MiniApp']();
    for(const i of [...this.pending]){this.pending.delete(i);const entry=this.effects.get(i)!;entry.cleanup?.();entry.cleanup=entry.fn()??undefined;}return this.tree;}
  mount(){this.mounted=true;this.render();}
  unmount(){this.mounted=false;for(const e of this.effects.values())e.cleanup?.();this.pending.clear();}
  async settle(){for(let i=0;i<36;i++){await Promise.resolve();if(this.dirty&&this.mounted)this.render();}}
  fire(name:string){(name==='visibilitychange'?this.docEvents:this.events).dispatchEvent({type:name});if(this.dirty)this.render();}
  readyActor(){return nodes(this.tree).find(n=>n.type===this.stub('SupportDrawer')||n.type===this.stub('SupportPanel'))?.props.userId??null;}
  component(name:string){return nodes(this.tree).find(n=>n.type===this.stub(name)||(name==='HomeView'&&n.type?.name==='AccountHomeSection'));}
  logoutCallback(){const node=nodes(this.tree).find(n=>n.type==='button'&&n.props.className==='account-logout');assert.ok(node,'Ready logout button');return node.props.onClick;}
}
function sameDeps(a:any[]|undefined,b:any[]|undefined){return a!==undefined&&b!==undefined&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));}

// Reused by the route-loading regression tests; this remains an explicit
// parent-hook fixture, not a mounted child/ReactDOM/session implementation.
export {Harness};

function ownNetwork(actor:number,offset=0){
  const total=actor===101?100:200,more=offset+50<total;
  return{restricted_partner:true,direct_count:total,offset,limit:50,has_more:more,
    page_limited:false,depth_limited:false,next_offset:more?offset+50:null,
    nodes:Array.from({length:50},(_,i)=>({label:'№'+(offset+i+1),level:1,created_at:null}))};
}

for(const transition of ['logout','actor'] as const)test('web own-network: late page after '+transition+' cannot restore the prior network',async()=>{
  const h=new Harness('web','/account/referrals/'),late=deferred();
  h.handler=c=>c.path.startsWith('/api/web/referral-network?')?late.promise:c.path==='/api/web/account'
    ?{...h.dashboard(),partner_network:ownNetwork(h.actor)}:h.defaultReply(c);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);
  h.component('OwnPartnerNetwork').props.onPage(50);await h.settle();
  const pageCall=h.calls.find(c=>c.path.startsWith('/api/web/referral-network?'))!;
  assert.ok(pageCall);assert.equal(h.component('OwnPartnerNetwork').props.loading,true);
  if(transition==='logout'){h.fire('fixture-logout');await h.settle();}
  else{h.actor=202;h.fire('focus');h.clock.tick(50);await h.settle();assert.equal(h.readyActor(),202);}
  assert.equal((pageCall.options.signal as AbortSignal).aborted,true);
  late.resolve({actor_telegram_id:101,projection:ownNetwork(101,50)});await h.settle();
  if(transition==='logout'){assert.equal(h.readyActor(),null);assert.equal(h.component('OwnPartnerNetwork'),undefined);}
  else{assert.equal(h.readyActor(),202);assert.equal(h.component('OwnPartnerNetwork').props.network.direct_count,200);
    assert.equal(h.component('OwnPartnerNetwork').props.network.offset,0);}
  h.unmount();assert.equal(h.lateStateWrites,0);
});

test('web own-network: mismatched page identity cannot replace the verified actor network',async()=>{
  const h=new Harness('web','/account/referrals/');
  h.handler=c=>c.path.startsWith('/api/web/referral-network?')?{actor_telegram_id:202,projection:ownNetwork(202,50)}:
    c.path==='/api/web/account'?{...h.dashboard(),partner_network:ownNetwork(101)}:h.defaultReply(c);
  h.mount();await h.settle();h.component('OwnPartnerNetwork').props.onPage(50);await h.settle();
  assert.equal(h.readyActor(),101);const panel=h.component('OwnPartnerNetwork');
  assert.equal(panel.props.network.direct_count,100);assert.equal(panel.props.network.offset,0);
  assert.equal(panel.props.loading,false);assert.ok(panel.props.error.length>0);h.unmount();
});


for(const kind of ['web','mini'] as const){
  test(kind+': current parent binds the verified actor and accepted UI locale',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();assert.equal(h.readyActor(),101);
    assert.equal(h.client.ui.locale,'ar');assert.equal(h.client.ui.dir,'rtl');
    assert.equal(h.client.controller.preference.snapshot().actor,101);
    assert.equal(h.supportClears,0);assert.ok(h.calls.every(c=>!c.path.endsWith('/locale')));h.unmount();
  });
  test(kind+': current parent language choice keeps contact EN and uses only its CAS',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();await h.client.controller.choose('fr');await h.settle();
    const writes=h.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);
    assert.equal(writes[0].path,kind==='web'?'/api/web/preferences/ui-locale':'/mini-app/preferences/ui-locale');
    assert.deepEqual(JSON.parse(String(writes[0].options.body)),{ui_locale:'fr',expected_revision:0});
    assert.equal((writes[0].options.headers as any)['X-CSRF-Token'],h.csrf());
    assert.equal(h.client.ui.locale,'fr');assert.equal(h.client.controller.preference.snapshot().status,'saved');
    assert.equal(h.component('BaliLifeCabinet')?.props.locale??'en','en');h.unmount();
  });
  test(kind+': focus/online/visible coalesce, remove old actor and bind only fresh B',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();assert.equal(h.readyActor(),101);
    h.actor=202;h.uiLocale='ja';const before=h.calls.length;
    h.fire('focus');assert.equal(h.readyActor(),null);h.clock.tick(20);h.fire('online');h.clock.tick(20);h.fire('visibilitychange');
    assert.equal(h.clock.timers.size,1);h.clock.tick(49);await h.settle();assert.equal(h.calls.length,before);
    h.clock.tick(1);await h.settle();assert.equal(h.readyActor(),202);assert.equal(h.client.ui.locale,'ja');
    assert.equal(h.calls.length-before,2);h.unmount();
  });
  test(kind+': late old bootstrap after logout cannot resurrect private UI',async()=>{
    const h=new Harness(kind),late=deferred();h.handler=c=>c.path===(kind==='web'?'/api/web/account':'/mini-app/me')?late.promise:h.defaultReply(c);
    h.mount();await h.settle();h.fire('fixture-logout');late.resolve(h.dashboard());await h.settle();
    assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();
  });
  test(kind+': delayed A403 cannot clear verified B',async()=>{
    const h=new Harness(kind),late=deferred();h.mount();await h.settle();h.handler=c=>c.options.method==='PATCH'?late.promise:h.defaultReply(c);
    const choice=h.client.controller.choose('fr');await h.settle();h.actor=202;h.fire('focus');h.clock.tick(50);await h.settle();
    late.reject(new ApiError('SYNTHETIC_PRIVATE_CAUSE',{kind:'http',status:403}));await choice;await h.settle();
    assert.equal(h.readyActor(),202);assert.equal(h.client.controller.preference.snapshot().actor,202);h.unmount();
  });
  test(kind+': unmount fences late initial read',async()=>{
    const h=new Harness(kind),late=deferred();h.handler=c=>c.path===(kind==='web'?'/api/web/account':'/mini-app/me')?late.promise:h.defaultReply(c);
    h.mount();await h.settle();h.unmount();late.resolve(h.dashboard());await h.settle();assert.equal(h.lateStateWrites,0);
  });
}
for(const mode of ['pending','503','404'] as const)test('mini: optional UI read '+mode+' does not block verified account',async()=>{
  const h=new Harness('mini'),pending=deferred();h.handler=c=>c.path==='/mini-app/preferences/ui-locale'?
    mode==='pending'?pending.promise:Promise.reject(new ApiError('SYNTHETIC',{kind:'http',status:mode==='503'?503:404})):h.defaultReply(c);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);h.clock.tick(1500);await h.settle();
  assert.equal(h.readyActor(),101);assert.equal(h.client.controller.preference.snapshot().enabled,false);
  await h.client.controller.choose('fr');await h.settle();assert.equal(h.client.ui.locale,'fr');
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});
for(const denied of [401,403])test('mini: preference '+denied+' removes current actor',async()=>{
  const h=new Harness('mini');h.handler=c=>c.path==='/mini-app/preferences/ui-locale'?Promise.reject(new ApiError('SYNTHETIC',{kind:'http',status:denied})):h.defaultReply(c);
  h.mount();await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();
});
test('mini: foreign optional-read identity is fatal, never new private authority',async()=>{
  const h=new Harness('mini');h.handler=c=>c.path==='/mini-app/preferences/ui-locale'?h.preference(202):h.defaultReply(c);
  h.mount();await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();
});
test('web: preview constructs no User locale persistence or broadcast',async()=>{
  const h=new Harness('web','/account/preview/303/home/');h.mount();await h.settle();assert.equal(h.readyActor(),303);
  assert.equal(h.client.controller,null);assert.equal(h.envReads,0);assert.equal(h.envApplies,0);assert.equal(h.logoutSubscriptions,0);
  assert.equal(h.component('HomeView').props.ui,undefined);assert.deepEqual(h.calls.map(c=>c.path),['/api/web/admin/clients/303/account-preview/account']);h.unmount();
});
test('Yoga: signed verification opens shell/Life while account is pending, no Main UI10 requests',async()=>{
  const h=new Harness('mini','/mini-app/',true),pending=deferred();h.handler=c=>c.path==='/mini-app/yoga-account'?pending.promise:h.defaultReply(c);
  h.mount();await h.settle();assert.ok(h.component('AppShell'));h.location.hash='#/life';await h.settle();
  const life=h.component('BaliLifeCabinet');assert.ok(life?.props.viewInstanceKey);assert.equal(life.props.userId,undefined);
  assert.equal(h.client.controller,null);assert.equal(h.envReads,0);assert.equal(h.logoutSubscriptions,0);
  assert.deepEqual(h.calls.map(c=>c.path),['/mini-app/auth/yoga-session','/mini-app/yoga-account']);
  pending.resolve(h.dashboard());await h.settle();assert.equal(h.component('AppShell').props.userName,'Synthetic 101');
  assert.equal(h.component('AppShell').props.ui,undefined);h.unmount();
});
test('Yoga: effect replay reuses one exchange and one account read',async()=>{
  const h=new Harness('mini','/mini-app/',true);h.mount();await h.settle();
  for(const e of h.effects.values()){e.cleanup?.();e.cleanup=e.fn()??undefined;}await h.settle();
  assert.equal(h.calls.filter(c=>c.path==='/mini-app/auth/yoga-session').length,1);
  assert.equal(h.calls.filter(c=>c.path==='/mini-app/yoga-account').length,1);
  assert.ok(h.calls.every(c=>!c.path.includes('preferences')&&!c.path.includes('/auth/refresh')&&!c.path.endsWith('/auth/session')));h.unmount();
});
test('Yoga: locale intent keeps RUEN endpoint and never UI10 CAS',async()=>{
  const h=new Harness('mini','/mini-app/',true);h.mount();await h.settle();
  await h.component('AppShell').props.onLocaleChange('ru');await h.settle();
  const writes=h.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);assert.equal(writes[0].path,'/mini-app/locale');
  assert.deepEqual(JSON.parse(String(writes[0].options.body)),{locale:'ru'});assert.equal(h.client.controller,null);h.unmount();
});
test('Yoga: denied account closes private UI without Main refresh or retry',async()=>{
  const h=new Harness('mini','/mini-app/',true);h.handler=c=>c.path==='/mini-app/yoga-account'?Promise.reject(new ApiError('SYNTHETIC',{kind:'http',status:403})):h.defaultReply(c);
  h.mount();await h.settle();assert.equal(h.component('AppShell'),undefined);
  assert.deepEqual(h.calls.map(c=>c.path),['/mini-app/auth/yoga-session','/mini-app/yoga-account']);h.unmount();
});

for(const kind of ['web','mini'] as const)for(const equal of [false,true])test(kind+': early '+(equal?'equal':'different')+' UI gesture survives the complete authenticated load and enables later CAS',async()=>{
  const h=new Harness(kind),pending=deferred();
  h.handler=c=>c.path===(kind==='web'?'/api/web/auth/me':'/mini-app/me')?pending.promise:h.defaultReply(c);
  h.mount();await h.settle();const choice=equal?'ru':'fr';await h.client.controller.choose(choice);await h.settle();
  pending.resolve(kind==='web'?h.auth():h.dashboard());await h.settle();
  assert.equal(h.readyActor(),101);assert.equal(h.client.ui.locale,choice);
  assert.equal(h.client.controller.preference.snapshot().enabled,true);assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);
  await h.client.controller.choose(choice);await h.settle();assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,1);h.unmount();
});
test('mini: gesture during optional read keeps UI but installs current credentials for next CAS',async()=>{
  const h=new Harness('mini'),pending=deferred();h.handler=c=>c.path==='/mini-app/preferences/ui-locale'?pending.promise:h.defaultReply(c);
  h.mount();await h.settle();await h.client.controller.choose('fr');await h.settle();
  pending.resolve(h.preference());await h.settle();assert.equal(h.client.ui.locale,'fr');
  assert.equal(h.client.controller.preference.snapshot().enabled,true);await h.client.controller.choose('fr');await h.settle();
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,1);h.unmount();
});
test('Yoga: system EN is not replaced by contact RU and never becomes an automatic contact write',async()=>{
  const h=new Harness('mini','/mini-app/',true);h.contact='ru';h.mount();await h.settle();
  assert.equal(h.component('AppShell').props.locale,'en');assert.equal(h.window.localStorage.getItem('safr.mini.locale'),null);
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});
test('Yoga: stale unbound pending key is not authorization to write another account language',async()=>{
  const h=new Harness('mini','/mini-app/',true);h.window.localStorage.setItem('safr.mini.pending-locale','ru');
  h.mount();await h.settle();assert.equal(h.component('AppShell').props.locale,'en');
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});
for(const equal of [false,true])test('Yoga: '+(equal?'equal':'different')+' explicit pre-account intent survives late contact and uses only existing RUEN path',async()=>{
  const h=new Harness('mini','/mini-app/',true),pending=deferred();h.contact='ru';
  h.handler=c=>c.path==='/mini-app/yoga-account'?pending.promise:h.defaultReply(c);
  h.mount();await h.settle();const choice=equal?'en':'ru';
  await h.component('AppShell').props.onLocaleChange(choice);await h.settle();
  assert.equal(h.component('AppShell').props.locale,choice);assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);
  pending.resolve(h.dashboard());await h.settle();assert.equal(h.component('AppShell').props.locale,choice);
  const writes=h.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);
  assert.equal(writes[0].path,'/mini-app/locale');assert.deepEqual(JSON.parse(String(writes[0].options.body)),{locale:choice});h.unmount();
});

