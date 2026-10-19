import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
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
import * as presentationCopy from '../src/ui/presentation-copy';
import * as yogaRuntime from '../src/runtime/yoga-mini-app';
import * as supportManager from '../src/runtime/support-manager';
import * as uiLocalePolicy from '../../shared/src/ui-locale-policy.mjs';
import * as navigation from '../src/components/client-navigation';
import {CLIENT_RUNTIME_LOCALES} from '../src/i18n/client-runtime';
import {restoreAcceptedSourceHistory} from './fixtures/client-source-history';

// Actual parent/hook TSX is transpiled in automatic-JSX mode and called with
// explicit deterministic hook/clock/event/API mocks. This is NOT ReactDOM,
// browser, real cookies, Telegram/session verification, layout or production QA.
const app=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SAFR_PARENT_BASE;
assert.ok(base&&path.isAbsolute(base),'Exact frozen160 baseline is required');
const require=createRequire(path.join(app,'package.json'));
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const pins={
  'src/surfaces/AccountApp.tsx':'aec4936688246b3587c1ce002fa145f07f103cc8165cce6c5989a1c8ad5ada05',
  // Root-reviewed optional-read derivative; original53 assertions are retained.
  'src/surfaces/MiniApp.tsx':'f9577e47597f3acbe08fdca94364056c56d6b68e008289d804634fc5a4764da9',
  'src/api/client.ts':'03abab01b98e64698a12df8c79d393d33a490da2ffd5f4d6507322fa5aa9c020',
  'src/i18n/client-ui-surface.ts':'c5664539c834e0a822211353b949c97d2ca57e8bcaf6db5ac337be6dd1cd4c8d',
  'src/i18n/use-client-ui-controller.ts':'819a388e32cf26d5c1912cd60a2cd7ac10703435f104b60afce72da793ce3cde',
} as const;
const historyIds={
  'src/surfaces/AccountApp.tsx':'parentAccount',
  'src/surfaces/MiniApp.tsx':'parentMini',
  'src/api/client.ts':'parentApi',
  'src/i18n/client-ui-surface.ts':'parentSurface',
  'src/i18n/use-client-ui-controller.ts':'parentController',
} as const;
function assertParentHistory(){for(const[f,pin]of Object.entries(pins)){
  const current=fs.readFileSync(path.join(app,f),'utf8');
  assert.equal(sha(restoreAcceptedSourceHistory(historyIds[f as keyof typeof historyIds],current)),pin,f);
}}
assertParentHistory();
for(const[f,pin]of Object.entries({
  'AccountApp.tsx':'a0f9af0c4dfbb9a26692c893729098fd782f66ef2a48bdc026e8adc562a5dc6f',
  'MiniApp.tsx':'2a0a50a53dd4cf6a72aeb3b5628b423b9a393e4276ada1f4acf6bd897230f3c5',
}))assert.equal(sha(fs.readFileSync(path.join(base!,'react-app/src/surfaces',f))),pin,'Frozen160 '+f);

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
  envSaved:string|null=null;clientEnvironment:any;document:any;window:any;location:any;hooks:any;
  constructor(readonly kind:'web'|'mini',pathname=kind==='web'?'/account/home/':'/mini-app/'){
    let hash=kind==='mini'?'#/home':'';
    this.location={pathname,search:'',origin:'https://fixture.invalid'};
    Object.defineProperty(this.location,'hash',{get:()=>hash,set:value=>{hash=String(value);this.events.dispatchEvent({type:'hashchange'});}});
    this.document={documentElement:{lang:'ru',dir:'ltr'},visibilityState:'visible',querySelector:()=>null,
      addEventListener:this.docEvents.addEventListener,removeEventListener:this.docEvents.removeEventListener};
    const history={pushState:(_s:any,_t:any,url:string)=>{this.location.pathname=url;},replaceState:(_s:any,_t:any,url:string)=>{if(url.startsWith('#'))hash=url;else this.location.pathname=url;}};
    this.window={location:this.location,history,scrollTo:()=>{},setTimeout:this.clock.setTimeout,clearTimeout:this.clock.clearTimeout,
      addEventListener:this.events.addEventListener,removeEventListener:this.events.removeEventListener,dispatchEvent:this.events.dispatchEvent};
    this.clientEnvironment={initial:'ru',read:()=>{this.envReads++;return this.envSaved;},write:(v:string|null)=>{this.envSaved=v;},
      apply:(v:string)=>{this.envApplies++;this.document.documentElement.lang=v;this.document.documentElement.dir=v==='ar'?'rtl':'ltr';}};
    const next=(kind:string,initial:()=>any)=>{const i=this.cursor++;if(!this.slots[i])this.slots[i]={kind,...initial()};assert.equal(this.slots[i].kind,kind);return[i,this.slots[i]];};
    this.hooks={...React,
      // Parent-prop inspection only: preserve the literal lazy boundary while
      // substituting the same leaf stubs used before route-level code splitting.
      lazy:(loader:()=>Promise<any>)=>{
        const name=loader.toString().match(/(?:require|import)\(['"]\.\.\/components\/([A-Z][A-Za-z]+)['"]\)/)?.[1];
        assert.ok(name&&['HomeView','CatalogView','CurrencyCalculator','SupportPanel','VisaCabinet'].includes(name),'Finite literal lazy component');
        return this.stub(name);
      },
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
    balance:12345,referral_count:21,referral_link:'https://t.me/fixture_bot?start=ref_'+actor,orders:[]};}
  auth(actor=this.actor){return{authenticated:true,telegram_id:actor,locale:this.contact,csrf_token:this.csrf(actor),client_ui_preference:{ui_locale:this.uiLocale,revision:this.revision}};}
  preference(actor=this.actor){return{telegram_id:actor,csrf_token:this.csrf(actor),client_ui_preference:{ui_locale:this.uiLocale,revision:this.revision}};}
  api={request:<T=unknown>(inputPath:string,options:RequestInit={}):Promise<T>=>{
    const preview=this.load('api/account-preview.ts');
    const path=preview.previewRequestPath(inputPath,options.method??'GET',this.location.pathname),call={path,inputPath,options};this.calls.push(call);
    try{const reply=this.handler?this.handler(call):this.defaultReply(call);return Promise.resolve(reply) as Promise<T>;}catch(error){return Promise.reject(error);}
  }};
  defaultReply(call:Call):any{
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
  load(relative:string,realReact=false,baseline=false):any{
    const key=relative+':'+realReact+':'+baseline;if(this.moduleCache.has(key))return this.moduleCache.get(key);
    const filename=path.join(baseline?path.join(base!,'react-app'):app,'src',relative),exports:any={};
    let source=fs.readFileSync(filename,'utf8');
    if(relative==='ui/client-brand.ts'){
      // Explicit Main presentation build constant, not URL/actor authority.
      const selector='import.meta.env.VITE_CLIENT_BRAND';
      assert.equal(source.split(selector).length-1,1);
      source=source.replace(selector,JSON.stringify('safrway'));
    }
    const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const scoped=(specifier:string):any=>{
      if(specifier==='react')return realReact?React:this.hooks;
      if(specifier==='react/jsx-runtime')return require(specifier);
      if(specifier.endsWith('.css'))return{};
      if(specifier==='../api/account-preview')return this.load('api/account-preview.ts');
      if(specifier==='../api/client')return{ApiError,appApiClient:()=>this.api,apiErrorMessage:()=> 'legacy synthetic API error'};
      if(specifier==='../i18n/client-ui-surface'||specifier==='./client-ui-surface')return surface;
      if(specifier==='../i18n/client-ui-preference')return preferenceCore;
      if(specifier==='../i18n/client-ui-bindings'||specifier==='./client-ui-bindings')return bindings;
      if(specifier==='../i18n/client-account-copy')return accountCopy;
      if(specifier==='../i18n/client-support-copy')return supportCopy;
      if(specifier==='../ui/presentation-copy')return presentationCopy;
      if(specifier==='../runtime/yoga-mini-app')return yogaRuntime;
      if(specifier==='../runtime/support-manager')return supportManager;
      if(specifier==='../ui/client-brand')return this.load('ui/client-brand.ts');
      if(specifier==='../i18n/locale')return this.load('i18n/locale.ts');
      if(specifier==='../../../shared/src/ui-locale-policy.mjs')return uiLocalePolicy;
      if(specifier==='./client-ui-locale')return{...localeCore,browserClientUiLocaleEnvironment:()=>this.clientEnvironment};
      if(specifier==='../i18n/use-client-ui-controller'){
        const mod=this.load('i18n/use-client-ui-controller.ts');return{useClientUiController:(...args:any[])=>{this.client=mod.useClientUiController(...args);return this.client;}};
      }
      if(specifier==='../runtime/client-auth-lifecycle')return{
        subscribeClientAuthLogout:(fn:()=>void)=>{this.logoutSubscriptions++;this.events.addEventListener('fixture-logout',fn);return()=>this.events.removeEventListener('fixture-logout',fn);},
        publishClientAuthLogout:()=>{this.logoutPublishes++;this.events.dispatchEvent({type:'fixture-logout'});},
      };
      if(specifier==='../i18n/runtime')return this.load('i18n/runtime.tsx',true);
      if(specifier==='../../../shared/content/generated/i18n/mini-app.v1.json')return JSON.parse(fs.readFileSync(path.join(app,'../shared/content/generated/i18n/mini-app.v1.json'),'utf8'));
      if(specifier==='../components/client-navigation')return navigation;
      if(specifier.includes('AppearanceControls')&&!specifier.includes('ClientAppearance'))return{
        AppearanceControls:this.stub('AppearanceControls'),useAppearance:()=>({theme:'light',setTheme:()=>{}}),useDocumentLocale:()=>this.document.documentElement.lang==='en'?'en':'ru'};
      if(specifier==='../components/DestinationDesign')return{storedWorld:()=> 'bali'};
      if(specifier==='../components/support-intent')return{supportIntentMemory:{clear:()=>this.supportClears++}};
      if(specifier==='../runtime/browser')return{browserRuntime:{initialize:async()=>{},openTelegram:()=>{}},browserLoginUrl:()=>'/synthetic-login'};
      if(specifier==='../runtime/telegram')return{loadTelegramWebApp:async()=>null,createTelegramRuntime:()=>({initialize:async()=>{},impact:()=>{},openTelegram:()=>{}}),telegramInitData:()=>''};
      const component=specifier.match(/^(?:\.\.\/components\/|\.\/)([A-Z][A-Za-z]+)$/)?.[1];
      if(component)return{[component]:this.stub(component),...(component==='BaliLifeCabinet'?{BaliLifeEntry:this.stub('BaliLifeEntry')}:{}),...(component==='TelegramSafeArea'?{}:{})};
      throw Error('UNEXPECTED_FIXTURE_IMPORT '+specifier+' in '+relative);
    };
    // Same JavaScript realm as the imported runtime: its plain-object/prototype
    // guard must remain intact. Inject explicit browser facades as lexical args,
    // rather than fabricating foreign-realm variables rejected by that guard.
    const run=vm.runInThisContext('(function(require,module,exports,window,document,location,history,navigator,matchMedia,setTimeout,clearTimeout){'+compiled+'\n})',{filename});
    run(scoped,{exports},exports,this.window,this.document,this.location,this.window.history,
      {languages:['en'],onLine:true,clipboard:{writeText:async()=>{}}},()=>({matches:true}),this.clock.setTimeout,this.clock.clearTimeout);
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

for(const kind of ['web','mini'] as const){
  test(kind+': coherent delayed A response after focus cannot become ready; one fresh B bootstrap',async()=>{
    const h=new Harness(kind),old=deferred();let held=false;
    h.handler=call=>{if(!held&&call.path===(kind==='web'?'/api/web/account':'/mini-app/preferences/ui-locale')){held=true;return old.promise;}return h.defaultReply(call);};
    h.mount();await h.settle();assert.ok(held);const prior=h.calls.at(-1)!;assert.equal(prior.options.signal?.aborted,false);
    h.actor=202;h.fire('focus');assert.equal(prior.options.signal?.aborted,true);assert.equal(h.readyActor(),null);
    old.resolve(kind==='web'?h.dashboard(101):h.preference(101));await h.settle();assert.equal(h.readyActor(),null);
    const before=h.calls.length;h.clock.tick(49);await h.settle();assert.equal(h.calls.length,before);
    h.clock.tick(1);await h.settle();assert.equal(h.readyActor(),202);assert.equal(h.calls.length-before,2);h.unmount();
  });
  test(kind+': focus/online/visible burst coalesces one trailing bootstrap',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();assert.equal(h.readyActor(),101);const before=h.calls.length;
    h.fire('focus');h.clock.tick(20);h.fire('online');h.clock.tick(20);h.fire('visibilitychange');assert.equal(h.clock.timers.size,1);
    h.clock.tick(49);await h.settle();assert.equal(h.calls.length,before);h.clock.tick(1);await h.settle();
    assert.equal(h.calls.length-before,2);assert.equal(h.readyActor(),101);h.unmount();
  });
  test(kind+': hidden visibility event does not refresh',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();const before=h.calls.length;h.document.visibilityState='hidden';h.fire('visibilitychange');h.clock.tick(100);await h.settle();assert.equal(h.calls.length,before);assert.equal(h.readyActor(),101);h.unmount();
  });
  test(kind+': unmount cancels pending refresh and ignores late completion',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();h.fire('focus');const count=h.calls.length;h.unmount();assert.equal(h.clock.timers.size,0);h.clock.tick(100);await h.settle();assert.equal(h.calls.length,count);assert.equal(h.lateStateWrites,0);
  });
  test(kind+': broadcast logout cancels refresh and invalidates authority',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();h.fire('focus');const count=h.calls.length;h.fire('fixture-logout');assert.equal(h.clock.timers.size,0);h.clock.tick(100);await h.settle();assert.equal(h.calls.length,count);assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();
  });
  test(kind+': mismatched authenticated responses never bind or expose a dashboard',async()=>{
    const h=new Harness(kind);h.handler=call=>call.path===(kind==='web'?'/api/web/account':'/mini-app/preferences/ui-locale')
      ?kind==='web'?h.dashboard(202):h.preference(202):h.defaultReply(call);
    h.mount();await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);
    assert.equal(h.client.controller.preference.snapshot().enabled,false);assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
  });
  test(kind+': delayed A403 cannot clear ready B or write a B preference',async()=>{
    const h=new Harness(kind),write=deferred();h.mount();await h.settle();h.handler=call=>call.options.method==='PATCH'?write.promise:h.defaultReply(call);
    const choose=h.client.controller.choose('fr');await h.settle();assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,1);
    h.actor=202;h.uiLocale='ja';h.fire('focus');h.clock.tick(50);await h.settle();assert.equal(h.readyActor(),202);
    write.reject(new ApiError('synthetic denied A',{kind:'http',status:403}));await choose;await h.settle();assert.equal(h.readyActor(),202);assert.equal(h.client.controller.preference.snapshot().actor,202);assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,1);h.unmount();
  });
  test(kind+': language choice uses only the dedicated surface CAS, preserving contact RUEN',async()=>{
    const h=new Harness(kind);h.mount();await h.settle();const next=h.client.controller.choose('fr');await h.settle();await next;await h.settle();
    const writes=h.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);assert.equal(writes[0].path,kind==='web'?'/api/web/preferences/ui-locale':'/mini-app/preferences/ui-locale');
    assert.deepEqual(JSON.parse(String(writes[0].options.body)),{ui_locale:'fr',expected_revision:0});assert.equal((writes[0].options.headers as any)['X-CSRF-Token'],h.csrf());
    assert.equal(h.tree.props.locale,'en');assert.equal(h.client.controller.preference.snapshot().status,'saved');assert.ok(h.calls.every(c=>!['/mini-app/locale','/api/web/locale'].includes(c.path)));h.unmount();
  });
}

test('web: own logout cancels the trailing timer and publishes only after server acknowledgement',async()=>{
  const h=new Harness('web'),done=deferred();h.mount();await h.settle();const logout=h.logoutCallback();
  h.handler=call=>call.path==='/api/web/auth/logout'?done.promise:h.defaultReply(call);h.fire('focus');const count=h.calls.length;const pending=logout();await h.settle();
  assert.equal(h.clock.timers.size,0);assert.equal(h.logoutPublishes,0);h.clock.tick(100);await h.settle();assert.equal(h.calls.length,count+1);assert.equal(h.readyActor(),null);
  done.resolve(undefined);await pending;await h.settle();assert.equal(h.logoutPublishes,1);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();
});
test('web: unmount during bootstrap rejects late A state updates',async()=>{
  const h=new Harness('web'),late=deferred();h.handler=call=>call.path==='/api/web/account'?late.promise:h.defaultReply(call);h.mount();await h.settle();h.unmount();late.resolve(h.dashboard());await h.settle();assert.equal(h.lateStateWrites,0);
});
test('mini: endpoint404 is local only and never falls back to Web or contact writes',async()=>{
  const h=new Harness('mini');h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?Promise.reject(new ApiError('synthetic absent endpoint',{kind:'http',status:404})):h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.client.controller.preference.snapshot().enabled,false);
  assert.equal(await h.client.controller.choose('fr'),'local');await h.settle();assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);assert.ok(h.calls.every(c=>c.path.startsWith('/mini-app/')));h.unmount();
});
test('web: preview uses actual read-only path mapping and creates no client locale controller',async()=>{
  const h=new Harness('web','/account/preview/303/home/');h.mount();await h.settle();assert.equal(h.readyActor(),303);assert.equal(h.client.controller,null);
  assert.equal(h.envReads,0);assert.equal(h.envApplies,0);assert.equal(h.logoutSubscriptions,0);assert.equal(h.component('HomeView').props.ui,undefined);
  assert.deepEqual(h.calls.map(c=>c.path),['/api/web/admin/clients/303/account-preview/account']);h.fire('focus');h.clock.tick(100);await h.settle();assert.equal(h.calls.length,1);h.unmount();
});

for(const kind of ['web','mini'] as const)test(kind+': known order status uses existing UI key; unknown/prototype names and service data remain literal',async()=>{
  const h=new Harness(kind),statuses=['new','constructor','__proto__'];
  h.handler=call=>{
    const result=h.defaultReply(call);
    if(call.path==='/api/web/account'||call.path==='/mini-app/me')return{...result,orders:statuses.map((status,id)=>({id:id+1,status,payment_status:'RAW_PAYMENT',service:'RAW_SERVICE_'+id}))};
    return result;
  };
  h.mount();await h.settle();
  if(kind==='web'){h.location.pathname='/account/orders/';h.fire('popstate');}else h.location.hash='#/orders';
  h.render();const text=nodeText(h.tree);assert.ok(text.includes(bindings.createClientUiBindings('ar').text('order.status.new')));
  for(const value of ['constructor','__proto__','RAW_SERVICE_0','RAW_SERVICE_1','RAW_SERVICE_2'])assert.ok(text.includes(value),value);h.unmount();
});

for(const locale of CLIENT_RUNTIME_LOCALES)for(const kind of ['web','mini'] as const)test(kind+': actual parent passes proven '+locale+' binding through ready customer branches',async()=>{
  const h=new Harness(kind);h.uiLocale=locale;h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.tree.props.locale,'en');
  for(const name of ['HomeView','SupportDrawer',...(kind==='web'?['BottomNavigation']:[])]){
    const n=h.component(name);assert.ok(n,name);assert.equal(bindings.requireClientUiBindings(n.props.ui).locale,locale);
  }
  if(kind==='mini'){
    const shell=h.component('AppShell');assert.equal(shell.props.locale,'en');assert.equal(bindings.requireClientUiBindings(shell.props.ui).locale,locale);shell.props.onNavigate('services');
  }else h.component('HomeView').props.navigate('services/bali');
  h.render();for(const name of ['CatalogView','RequestsEntry'])assert.equal(bindings.requireClientUiBindings(h.component(name).props.ui).locale,locale,name);
  if(kind==='mini')h.component('AppShell').props.onNavigate('profile');else nodes(h.tree).find(n=>n.type==='button'&&n.props.className==='user-chip').props.onClick();
  h.render();assert.equal(bindings.requireClientUiBindings(h.component('ProfileIdentity').props.ui).locale,locale);if(kind==='mini')assert.equal(bindings.requireClientUiBindings(h.component('ProfileStats').props.ui).locale,locale);
  assert.equal(h.document.documentElement.lang,locale);assert.equal(h.document.documentElement.dir,locale==='ar'?'rtl':'ltr');assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});

for(const locale of CLIENT_RUNTIME_LOCALES)test('actual AppShell/ProfileStats React SSR uses '+locale+' labels independently of contact en',()=>{
  const h=new Harness('mini'),ui=bindings.createClientUiBindings(locale),legacy=h.load('i18n/runtime.tsx',true);
  const Shell=h.load('components/AppShell.tsx',true).AppShell,Stats=h.load('components/ProfileStats.tsx',true).ProfileStats;
  const html=renderToStaticMarkup(React.createElement(legacy.I18nProvider,{locale:'en'},React.createElement(Shell,{webApp:null,activeTab:'profile',userName:'Synthetic',locale:'en',onLocaleChange:()=>{},localeStatus:'idle',onLocaleRetry:()=>{},onNavigate:()=>{},ui,onClientLocaleChange:()=>{},children:React.createElement(Stats,{ui,dashboard:h.dashboard()})})));
  for(const key of ['shell.skipToContent','shell.homeAria','profile.statsAria','profile.stats.points','profile.stats.network','profile.stats.orders'])assert.ok(html.includes(escapeHtml(ui.text(key as any))),key);
  assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));assert.ok(html.includes(new Intl.NumberFormat(locale).format(12345)));
});
function escapeHtml(v:string){return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}

test('reviewed parent/controller source pins remain exact after this mocked suite',assertParentHistory);

test('mini optional preference: verified Dashboard is ready before an unresolved read and stays ready after its bounded deadline',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.tree.props.locale,'en');
  const read=h.calls.find(c=>c.path==='/mini-app/preferences/ui-locale')!;assert.equal(read.options.signal?.aborted,false);
  assert.equal(h.client.controller.preference.snapshot().enabled,false);assert.equal(h.client.controller.preference.snapshot().status,'local');
  h.clock.tick(1499);await h.settle();assert.equal(h.readyActor(),101);assert.equal(read.options.signal?.aborted,false);
  h.clock.tick(1);await h.settle();assert.equal(h.readyActor(),101);assert.equal(read.options.signal?.aborted,true);
  assert.equal(h.client.controller.preference.snapshot().status,'unavailable');assert.equal(h.client.controller.preference.snapshot().projection,null);
  assert.equal(h.clock.timers.size,0);assert.equal(await h.client.controller.choose('fr'),'local');await h.settle();
  assert.equal(h.document.documentElement.lang,'fr');assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);
  const applies=h.envApplies;late.resolve(h.preference());await h.settle();assert.equal(h.envApplies,applies);assert.equal(h.document.documentElement.lang,'fr');h.unmount();
});

for(const failure of ['503','network'] as const)test('mini optional preference: '+failure+' leaves verified Dashboard available without credentials or a saved claim',async()=>{
  const h=new Harness('mini');h.handler=call=>{
    if(call.path!=='/mini-app/preferences/ui-locale')return h.defaultReply(call);
    throw failure==='503'?new ApiError('synthetic optional failure',{kind:'http',status:503})
      :new ApiError('synthetic network failure',{kind:'network'});
  };
  h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.tree.props.locale,'en');
  const state=h.client.controller.preference.snapshot();assert.equal(state.actor,101);assert.equal(state.status,'unavailable');assert.equal(state.enabled,false);assert.equal(state.projection,null);
  assert.equal(await h.client.controller.choose('ja'),'local');await h.settle();assert.equal(h.document.documentElement.lang,'ja');
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH'||c.path.includes('/auth/')).length,0);h.unmount();assert.equal(h.clock.timers.size,0);
});

for(const status of [401,403])test('mini optional preference: current '+status+' clears private UI without a second login',async()=>{
  const h=new Harness('mini');h.handler=call=>{if(call.path==='/mini-app/preferences/ui-locale')throw new ApiError('synthetic denied',{kind:status===401?'authentication':'http',status});return h.defaultReply(call);};
  h.mount();await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);
  assert.equal(h.client.controller.preference.snapshot().enabled,false);assert.equal(h.calls.filter(c=>c.path.includes('/auth/')).length,0);h.unmount();assert.equal(h.clock.timers.size,0);
});

for(const choice of ['ja','en'] as const)test('mini optional preference: newer '+choice+' gesture fences adoption, while verified credentials enable only the next explicit CAS',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/preferences/ui-locale'&&call.options.method!=='PATCH'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);const version=h.client.controller.preference.snapshot().version;
  assert.equal(await h.client.controller.choose(choice),'local');await h.settle();assert.ok(h.client.controller.preference.snapshot().version>version);
  late.resolve(h.preference());await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.document.documentElement.lang,choice);
  const state=h.client.controller.preference.snapshot();assert.equal(state.enabled,true);assert.deepEqual(state.projection,{ui_locale:'ar',revision:0});assert.equal(state.status,'idle');
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);
  assert.equal(await h.client.controller.choose(choice),'saved');await h.settle();
  const writes=h.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);
  assert.equal(writes[0].path,'/mini-app/preferences/ui-locale');assert.equal((writes[0].options.headers as Record<string,string>)['X-CSRF-Token'],h.csrf());
  assert.deepEqual(JSON.parse(String(writes[0].options.body)),{ui_locale:choice,expected_revision:0});h.unmount();assert.equal(h.clock.timers.size,0);
});

for(const invalid of ['foreign','malformed-actor'] as const)test('mini optional preference: '+invalid+' identity is fatal even after a new language gesture',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);await h.client.controller.choose('ja');await h.settle();
  const body={...h.preference(),...(invalid==='foreign'?{telegram_id:202}:{telegram_id:'101'})};
  late.resolve(body);await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();assert.equal(h.clock.timers.size,0);
});

test('mini optional preference: current late403 is not hidden by a newer local choice',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();await h.client.controller.choose('ja');await h.settle();
  late.reject(new ApiError('synthetic current denied',{kind:'http',status:403}));await h.settle();assert.equal(h.readyActor(),null);
  assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();assert.equal(h.clock.timers.size,0);
});

for(const lifecycle of ['unmount','logout'] as const)test('mini optional preference: '+lifecycle+' synchronously aborts its child and clears deadline, late result is inert',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();const read=h.calls.find(c=>c.path==='/mini-app/preferences/ui-locale')!;assert.equal(h.readyActor(),101);
  if(lifecycle==='unmount')h.unmount();else h.fire('fixture-logout');assert.equal(read.options.signal?.aborted,true);assert.equal(h.clock.timers.size,0);
  const applies=h.envApplies;late.resolve(h.preference());await h.settle();assert.equal(h.envApplies,applies);assert.equal(h.lateStateWrites,0);
  if(lifecycle==='logout'){assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);h.unmount();}
});

test('mini optional preference: old A403 after focus cannot clear the freshly verified B dashboard',async()=>{
  const h=new Harness('mini'),late=deferred();let held=false;h.handler=call=>{if(call.path==='/mini-app/preferences/ui-locale'&&!held){held=true;return late.promise;}return h.defaultReply(call);};
  h.mount();await h.settle();assert.equal(h.readyActor(),101);const read=h.calls.find(c=>c.path==='/mini-app/preferences/ui-locale')!;
  h.actor=202;h.uiLocale='de';h.fire('focus');assert.equal(read.options.signal?.aborted,true);assert.equal(h.readyActor(),null);
  h.clock.tick(50);await h.settle();assert.equal(h.readyActor(),202);assert.equal(h.document.documentElement.lang,'de');
  late.reject(new ApiError('synthetic old A denied',{kind:'http',status:403}));await h.settle();assert.equal(h.readyActor(),202);
  assert.equal(h.client.controller.preference.snapshot().actor,202);assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();assert.equal(h.clock.timers.size,0);
});

test('mini optional preference: Dashboard fields cannot supply persistence authority before the separate read',async()=>{
  const h=new Harness('mini'),late=deferred();h.handler=call=>call.path==='/mini-app/me'?{...h.dashboard(),csrf_token:h.csrf(),client_ui_preference:{ui_locale:'ar',revision:999}}
    :call.path==='/mini-app/preferences/ui-locale'?late.promise:h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);const state=h.client.controller.preference.snapshot();
  assert.equal(state.actor,101);assert.equal(state.projection,null);assert.equal(state.enabled,false);
  // UI bootstrap is independent from the verified RUEN contact locale. The
  // forged Dashboard projection must supply neither write authority nor UI.
  assert.equal(h.document.documentElement.lang,h.clientEnvironment.initial);assert.equal(h.tree.props.locale,'en');
  assert.equal(await h.client.controller.choose('ja'),'local');await h.settle();assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);
  h.unmount();late.resolve(h.preference());await h.settle();assert.equal(h.lateStateWrites,0);
});

test('mini optional preference: invalid projection remains unavailable without discarding verified identity',async()=>{
  const h=new Harness('mini');h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?{...h.preference(),client_ui_preference:{ui_locale:'ar',revision:-1}}:h.defaultReply(call);
  h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.client.controller.preference.snapshot().enabled,false);
  assert.equal(h.client.controller.preference.snapshot().status,'unavailable');assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});

for(const failure of ['invalid-json','configuration','400','422','programming'] as const)test('mini optional preference: unexpected '+failure+' is not silently downgraded to a network fallback',async()=>{
  const h=new Harness('mini');h.handler=call=>{if(call.path!=='/mini-app/preferences/ui-locale')return h.defaultReply(call);
    throw failure==='programming'?new Error('synthetic programming fault'):new ApiError('synthetic unexpected read',{
      kind:failure==='configuration'?'configuration':failure==='invalid-json'?'invalid_response':'http',
      ...(failure==='400'||failure==='422'?{status:Number(failure)}:{}),
    });};
  h.mount();await h.settle();assert.equal(h.readyActor(),null);assert.equal(h.client.controller.preference.snapshot().actor,null);
  assert.equal(h.calls.filter(c=>c.options.method==='PATCH'||c.path.includes('/auth/')).length,0);h.unmount();
});

for(const csrf of ['missing','malformed'] as const)test('mini optional preference: same verified actor with '+csrf+' CSRF is unavailable, not a lost identity',async()=>{
  const h=new Harness('mini');h.handler=call=>{if(call.path!=='/mini-app/preferences/ui-locale')return h.defaultReply(call);
    const {csrf_token,...body}=h.preference();return csrf==='missing'?body:{...body,csrf_token:'invalid'};};
  h.mount();await h.settle();assert.equal(h.readyActor(),101);const state=h.client.controller.preference.snapshot();
  assert.equal(state.actor,101);assert.equal(state.enabled,false);assert.equal(state.status,'unavailable');assert.equal(state.projection,null);
  assert.equal(await h.client.controller.choose('ja'),'local');await h.settle();assert.equal(h.calls.filter(c=>c.options.method==='PATCH').length,0);h.unmount();
});

async function withActualApi(bodyStatus:number,body:()=>Promise<unknown>,run:(api:ReturnType<typeof createApiClient>,stats:{fetches:number,jsonReads:number})=>Promise<void>){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),stats={fetches:0,jsonReads:0};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://fixture.invalid',pathname:'/mini-app/'}}});
  try{
    const api=createApiClient({baseUrl:'https://fixture.invalid',logger:{error:()=>{}},fetchImplementation:(async()=>{
      stats.fetches++;return{status:bodyStatus,ok:bodyStatus>=200&&bodyStatus<300,headers:new Headers({'Content-Type':'application/json'}),json:()=>{stats.jsonReads++;return body();}} as Response;
    }) as typeof fetch});
    await run(api,stats);
  }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
}

for(const status of [401,403])test('actual API wrapper: optional Mini GET '+status+' is denied before its never-settling JSON body',{timeout:1000},async()=>{
  await withActualApi(status,()=>new Promise(()=>{}),async(api,stats)=>{
    await assert.rejects(api.request('/mini-app/preferences/ui-locale'),(e:any)=>e instanceof ApiError&&e.status===status&&e.kind===(status===401?'authentication':'http'));
    assert.equal(stats.fetches,1);assert.equal(stats.jsonReads,0);
  });
});

test('actual API wrapper: optional Mini successful response JSON is bounded by parent read without blocking verified UI',async()=>{
  await withActualApi(200,()=>new Promise(()=>{}),async(api,stats)=>{
    const h=new Harness('mini');h.handler=call=>call.path==='/mini-app/preferences/ui-locale'?api.request(call.path,call.options):h.defaultReply(call);
    h.mount();await h.settle();assert.equal(h.readyActor(),101);assert.equal(stats.jsonReads,1);
    h.clock.tick(1500);await h.settle();assert.equal(h.readyActor(),101);assert.equal(h.client.controller.preference.snapshot().status,'unavailable');
    assert.equal(h.clock.timers.size,0);assert.equal(stats.fetches,1);h.unmount();
  });
});

for(const request of [{path:'/api/web/account',method:'GET'},{path:'/mini-app/preferences/ui-locale',method:'PATCH'}])test('actual API wrapper: existing '+request.method+' '+request.path+' denial body flow is unchanged',async()=>{
  await withActualApi(403,async()=>({detail:'synthetic existing detail'}),async(api,stats)=>{
    await assert.rejects(api.request(request.path,{method:request.method}),(e:any)=>e instanceof ApiError&&e.kind==='http'&&e.status===403&&e.details?.detail==='synthetic existing detail');
    assert.equal(stats.fetches,1);assert.equal(stats.jsonReads,1);
  });
});
