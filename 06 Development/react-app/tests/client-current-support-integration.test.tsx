import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {ApiError} from '../src/api/client';
import * as bindings from '../src/i18n/client-ui-bindings';
import * as copy from '../src/i18n/client-support-copy';
import {translate} from '../src/i18n/runtime';

// Actual current Support TSX/intent with deterministic hooks/timers and mocked
// API. Not real session, real message, DOM/dialog focus or release proof.
const app=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(app,'package.json'));
const root=path.join(app,'src');
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
// The current Support comparator is a different historical contract from the
// original158 consumer donor. Admit the closed three-file lane before compiling
// anything, then transpile only these same held bytes. No current-source fallback.
const currentSupportPins = Object.freeze({
  'components/SupportPanel.tsx': Object.freeze({bytes:12265,sha256:'85b5b13175fb131f84e48d56a02cc98385a127341aa3e22eeb01bb114f734076'}),
  'components/SupportDrawer.tsx': Object.freeze({bytes:3188,sha256:'8a86e03f2b273a3849966aefd4ff80bf05ba816a7bc60521221d795a3985e1b1'}),
  'components/support-chat.ts': Object.freeze({bytes:850,sha256:'2e88d706f9061b66df7b04aa718c424c152917ea27cf7e9b763d6d4839ef1678'}),
});
type CurrentSupportFile = keyof typeof currentSupportPins;
function currentSupportFile(value:unknown):CurrentSupportFile{
  assert.ok(typeof value==='string' && Object.hasOwn(currentSupportPins,value),'CURRENT_SUPPORT_BASELINE_IDENTITY');
  return value as CurrentSupportFile;
}
function acceptedCurrentSupportText(relative:unknown,bytes:unknown):string{
  const id=currentSupportFile(relative),pin=currentSupportPins[id];
  assert.ok(Buffer.isBuffer(bytes),'CURRENT_SUPPORT_BASELINE_BYTES');
  assert.equal(bytes.length,pin.bytes,'CURRENT_SUPPORT_BASELINE_BYTES');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,'CURRENT_SUPPORT_BASELINE_SHA');
  return bytes.toString('utf8');
}
function currentSupportDirectory(value:unknown):string{
  assert.ok(typeof value==='string' && path.isAbsolute(value) && path.resolve(value)===value,'CURRENT_SUPPORT_BASELINE_ROOT');
  const st=fs.lstatSync(value);
  assert.ok(st.isDirectory() && !st.isSymbolicLink() && fs.realpathSync(value)===value,'CURRENT_SUPPORT_BASELINE_ROOT');
  return value;
}
function readCurrentSupportBytes(directory:string,relative:unknown):Buffer{
  const id=currentSupportFile(relative),file=path.join(directory,'react-app/src',id);
  const before=fs.lstatSync(file,{bigint:true});
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.nlink===1n && (before.mode&0o777n)===0o600n,'CURRENT_SUPPORT_BASELINE_NODE');
  assert.equal(fs.realpathSync(file),file,'CURRENT_SUPPORT_BASELINE_PATH');
  assert.ok(Number.isInteger(fs.constants.O_NOFOLLOW),'CURRENT_SUPPORT_BASELINE_NOFOLLOW');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  const identity=(st:fs.BigIntStats)=>[st.dev,st.ino,st.mode,st.nlink,st.uid,st.gid,st.size,st.mtimeNs,st.ctimeNs].join(':');
  try{
    const held=fs.fstatSync(fd,{bigint:true});
    assert.equal(identity(held),identity(before),'CURRENT_SUPPORT_BASELINE_REPLACED');
    const bytes=fs.readFileSync(fd);
    assert.equal(identity(fs.fstatSync(fd,{bigint:true})),identity(held),'CURRENT_SUPPORT_BASELINE_CHANGED');
    assert.equal(identity(fs.lstatSync(file,{bigint:true})),identity(held),'CURRENT_SUPPORT_BASELINE_REPLACED');
    return bytes;
  }finally{fs.closeSync(fd);}
}
function readCurrentSupportBaseline(value:unknown,read=readCurrentSupportBytes):Readonly<Record<CurrentSupportFile,string>>{
  const directory=currentSupportDirectory(value),entries=Object.keys(currentSupportPins).map(relative=>[
    relative,acceptedCurrentSupportText(relative,read(directory,relative)),
  ]);
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<CurrentSupportFile,string>>;
}
const baselineRoot=process.env.SAFR_TEST_CURRENT_SUPPORT_BASE;
const baselineSources=readCurrentSupportBaseline(baselineRoot);
function currentSupportBaselineText(relative:unknown):string{
  return baselineSources[currentSupportFile(relative)];
}
type Locale=typeof locales[number];
const nodes=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const text=(v:any):string=>v==null||typeof v==='boolean'?'':Array.isArray(v)?v.map(text).join(''):typeof v==='object'?text(v.props?.children):String(v);
const deferred=()=>{let resolve!:(v:any)=>void,reject!:(e:any)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const chat=(body='SERVER_CHAT')=>({id:1,status:'open',messages:[{id:1,author_type:'staff',body,created_at:'2026-10-16T00:00:00Z'}]});
const same=(a:any[]|undefined,b:any[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
function loader({react=React,yoga=false,preview=false,locale='en',request=async()=>chat(),baseline=false,window={},server=false}:{react?:typeof React;yoga?:boolean;preview?:boolean;locale?:'ru'|'en';request?:(p:string,o?:RequestInit)=>Promise<any>;baseline?:boolean;window?:any;server?:boolean}={}){
  const cache=new Map<string,any>();
  // The baseline lane uses only the pre-admitted held comparator bodies.
  const source=baseline?path.join(baselineRoot!,'react-app/src'):root;
  const load=(relative:string):any=>{
    if(baseline)currentSupportFile(relative); // Admission always precedes path/cache use.
    const file=path.join(source,relative);if(cache.has(file))return cache.get(file);
    const exports:any={};
    const body=baseline?currentSupportBaselineText(relative):fs.readFileSync(file,'utf8');
    const js=ts.transpileModule(body,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const scoped=(id:string):any=>{
      if(id==='react')return react;if(id==='react/jsx-runtime')return require(id);
      if(id==='../api/client')return{ApiError,appApiClient:()=>({request})};
      if(id==='../api/account-preview')return{isAccountPreview:()=>preview};
      if(id==='../i18n/runtime')return{useI18n:()=>({locale,t:translate.bind(null,locale)}),localizedApiError:()=>locale==='en'?'Synthetic API error':'Ошибка API'};
      if(id==='../i18n/client-ui-bindings')return bindings;if(id==='../i18n/client-support-copy')return copy;
      if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:yoga,YOGA_BOT_URL:'https://t.me/Yoga_ganster_bot'};
      if(id==='../runtime/support-manager'){
        const file=path.join(app,'src/runtime/support-manager.ts'),exports:any={};
        const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
        vm.runInThisContext('(function(require,module,exports){'+code+'\n})')((name:string)=>{assert.equal(name,'./yoga-mini-app');return{YOGA_MINI_APP:yoga,YOGA_BOT_URL:'https://t.me/Yoga_ganster_bot'};},{exports},exports);
        return exports;
      }
      if(id==='./AppIcon')return{AppIcon:()=>null};if(id==='./SectionBoundary')return{SectionBoundary:({children}:any)=>children};
      if(id==='./support-chat')return load('components/support-chat.ts');
      if(id==='./support-intent')return load('components/support-intent.ts');
      throw Error('UNEXPECTED_SUPPORT_FIXTURE_IMPORT '+id);
    };
    const scopedGlobal={crypto:globalThis.crypto,setTimeout:window.setTimeout??globalThis.setTimeout,clearTimeout:window.clearTimeout??globalThis.clearTimeout};
    cache.set(file,exports);
    try{
    vm.runInThisContext('(function(require,module,exports,window,globalThis){'+js+'\n})',{filename:file})(scoped,{exports},exports,server?undefined:window,scopedGlobal);return exports;
    }catch(error){cache.delete(file);throw error;}
  };return load;
}
test('current Support comparator requires its own env and rejects other source identities',()=>{
  for(const value of [undefined,null,'',{},Object('relative'),'relative',baselineRoot+'/../06 Development'])
    assert.throws(()=>currentSupportDirectory(value),/CURRENT_SUPPORT_BASELINE_ROOT/);
  assert.ok(!Object.hasOwn(currentSupportPins,'components/support-intent.ts'));
  for(const relative of ['../components/SupportPanel.tsx','/components/SupportPanel.tsx','components/./SupportPanel.tsx','components/support-intent.ts','__proto__',{},null])
    assert.throws(()=>currentSupportBaselineText(relative),/CURRENT_SUPPORT_BASELINE_IDENTITY/);
  assert.notEqual(currentSupportPins['components/SupportPanel.tsx'].sha256,'1c4484ebdd1967e808f33ba21e2a3f061b498a087be29add821ce9b8b199107c');
  assert.notEqual(currentSupportPins['components/SupportPanel.tsx'].sha256,'eacee45112e5b607fa624665130373f2bf6e90e804b4901fd2792453bc144da1');
});
test('current Support baseline loader rejects repeated fourth loads and cached path aliases',()=>{
  const load=loader({baseline:true});
  load('components/support-chat.ts');
  for(const relative of ['components/support-intent.ts','components/./support-chat.ts','../src/components/support-chat.ts','/components/support-chat.ts']){
    for(let attempt=0;attempt<2;attempt++)
      assert.throws(()=>load(relative),/CURRENT_SUPPORT_BASELINE_IDENTITY/);
  }
});
test('current Support comparator admits every exact held body and rejects missing or tampered inputs',()=>{
  for(const relative of Object.keys(currentSupportPins)){
    const bytes=readCurrentSupportBytes(baselineRoot!,relative);
    assert.equal(acceptedCurrentSupportText(relative,bytes),currentSupportBaselineText(relative));
    const tampered=Buffer.from(bytes);tampered[0]^=1;
    assert.throws(()=>acceptedCurrentSupportText(relative,tampered),/CURRENT_SUPPORT_BASELINE_SHA/);
    assert.throws(()=>acceptedCurrentSupportText(relative,Buffer.concat([bytes,Buffer.from('x')])),/CURRENT_SUPPORT_BASELINE_BYTES/);
    for(const value of [null,undefined,{},bytes.toString('utf8')])
      assert.throws(()=>acceptedCurrentSupportText(relative,value),/CURRENT_SUPPORT_BASELINE_BYTES/);
    assert.throws(()=>readCurrentSupportBaseline(baselineRoot,(directory,id)=>{
      if(id===relative)throw new Error('SYNTHETIC_MISSING_BASELINE');
      return readCurrentSupportBytes(directory,id);
    }),/SYNTHETIC_MISSING_BASELINE/);
  }
});
test('current Support comparator refuses root and file symlinks before reading their targets',()=>{
  // Only this freshly created synthetic fixture is removed; originals are read-only.
  const owned=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'safr-support-baseline-negative-')));
  try{
    const linked=path.join(owned,'root-link');fs.symlinkSync(baselineRoot!,linked,'dir');
    assert.throws(()=>readCurrentSupportBaseline(linked),/CURRENT_SUPPORT_BASELINE_ROOT/);
    const folder=path.join(owned,'react-app/src/components');fs.mkdirSync(folder,{recursive:true});
    fs.symlinkSync(path.join(baselineRoot!,'react-app/src/components/SupportPanel.tsx'),path.join(folder,'SupportPanel.tsx'),'file');
    assert.throws(()=>readCurrentSupportBaseline(owned),/CURRENT_SUPPORT_BASELINE_NODE/);
  }finally{fs.rmSync(owned,{recursive:true,force:true});}
});
class SupportHarness{
  slots:any[]=[];cursor=0;dirty=false;mounted=false;lateWrites=0;key:string|null=null;tree:any;
  effects=new Map<number,{deps:any[]|undefined;fn:()=>any;cleanup?:()=>void}>();pending=new Set<number>();intervals=new Map<number,()=>void>();
  deadlines=new Map<number,{fn:()=>void;ms:number}>();deadlineSequence=0;
  locale:Locale='ar';props:any={apiPrefix:'/api/web',userId:101,csrfToken:'SYNTHETIC_CSRF',initialContact:'fixture_user',active:true};
  calls:{path:string;options:RequestInit}[]=[];opens:string[]=[];handler:((p:string,o:RequestInit)=>Promise<any>)|null=null;
  identityActor:number|undefined;identityHandler:((p:string,o:RequestInit)=>Promise<any>)|null=null;
  load:any;hooks:any;
  constructor(readonly yoga=false,readonly preview=false){
    const next=(kind:string,initial:()=>any)=>{const i=this.cursor++;if(!this.slots[i])this.slots[i]={kind,...initial()};assert.equal(this.slots[i].kind,kind);return[i,this.slots[i]];};
    this.hooks={...React,useState:(initial:any)=>{const[i,s]=next('state',()=>({value:typeof initial==='function'?initial():initial}));const bound=this.slots;
      return[s.value,(v:any)=>{if(!this.mounted||bound!==this.slots){this.lateWrites++;return;}const value=typeof v==='function'?v(s.value):v;if(!Object.is(s.value,value)){s.value=value;this.dirty=true;}}];},
      useRef:(initial:any)=>next('ref',()=>({ref:{current:initial}}))[1].ref,
      useEffect:(fn:()=>any,deps:any[])=>{const[i]=next('effect',()=>({}));const old=this.effects.get(i);if(!old||!same(old.deps,deps)){this.effects.set(i,{fn,deps,cleanup:old?.cleanup});this.pending.add(i);}}};
    this.load=loader({react:this.hooks,yoga,preview,window:{setTimeout:(fn:()=>void,ms:number)=>{const id=++this.deadlineSequence;this.deadlines.set(id,{fn,ms});return id;},clearTimeout:(id:number)=>this.deadlines.delete(id),setInterval:(fn:()=>void)=>{const id=this.intervals.size+1;this.intervals.set(id,fn);return id;},clearInterval:(id:number)=>this.intervals.delete(id)},request:async(p,o={})=>{
      this.calls.push({path:p,options:o});
      if(p.endsWith('/auth/me')||p==='/mini-app/me')return this.identityHandler?this.identityHandler(p,o):{authenticated:true,telegram_id:this.identityActor??this.props.userId};
      return this.handler?this.handler(p,o):chat();}});
  }
  render(){
    const props={...this.props,ui:this.yoga?undefined:bindings.createClientUiBindings(this.locale),onOpenTelegram:(url:string)=>this.opens.push(url)};
    const parent=this.load('components/SupportPanel.tsx').SupportPanel(props);
    if(this.key!==parent.key){for(const e of this.effects.values())e.cleanup?.();this.effects.clear();this.pending.clear();this.slots=[];this.key=parent.key;}
    this.cursor=0;this.dirty=false;this.tree=parent.type(parent.props);
    for(const i of [...this.pending]){this.pending.delete(i);const e=this.effects.get(i)!;e.cleanup?.();e.cleanup=e.fn()??undefined;}
    return this.tree;
  }
  mount(){this.mounted=true;this.render();}
  unmount(){for(const e of this.effects.values())e.cleanup?.();this.mounted=false;}
  async settle(){for(let i=0;i<24;i++){await Promise.resolve();if(this.mounted&&this.dirty)this.render();}}
  field(name:string){return nodes(this.tree).find(n=>name==='body'?n.type==='textarea':name==='name'?n.type==='input'&&n.props.autoComplete==='name':n.type==='input'&&n.props.maxLength===254);}
  edit(name:string,value:string){this.field(name).props.onChange({target:{value}});this.render();}
  async submit(){await nodes(this.tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await this.settle();}
  poll(){for(const fn of [...this.intervals.values()])fn();}
  sends(){return this.calls.filter(c=>c.options.method==='POST');}
}
for(const locale of locales)test('Main Support SSR consumes accepted locale: '+locale,()=>{
  const html=renderToStaticMarkup(React.createElement(loader()('components/SupportPanel.tsx').SupportPanel,{ui:bindings.createClientUiBindings(locale),userId:101,apiPrefix:'/api/web',onOpenTelegram(){}}));
  assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
});
for(const yoga of [false,true])test('legacy RUEN markup exact versus current baseline; yoga='+yoga,()=>{
  for(const locale of ['ru','en'] as const)for(const name of ['SupportPanel','SupportDrawer']){
    const props={apiPrefix:'/mini-app',onOpenTelegram(){},initialContact:'fixture_user',open:false,onClose(){},onOpen(){}};
    const render=(baseline:boolean)=>renderToStaticMarkup(React.createElement(loader({yoga,locale,baseline})('components/'+name+'.tsx')[name],props));
    assert.equal(render(false),render(true));
  }
});
for(const yoga of [false,true])test('one explicit POST: Yoga legacy, Main actor/UUID guarded; yoga='+yoga,async()=>{
  const h=new SupportHarness(yoga);if(yoga){h.props.userId=undefined;h.props.apiPrefix='/mini-app';}h.mount();await h.settle();
  h.props.routeContext={country:'Бали',service:'E33G'};h.render();h.edit('name','Synthetic Client');h.edit('body','  RAW_USER_TEXT 中文 عربي  ');await h.submit();
  assert.equal(h.sends().length,1);const send=h.sends()[0];assert.equal(send.path,(yoga?'/mini-app':'/api/web')+'/chat/messages');
  const payload=JSON.parse(String(send.options.body)),expected={body:'Synthetic Client · telegram: fixture_user\n\nRAW_USER_TEXT 中文 عربي',route_context:{country:'Бали',service:'E33G'}};
  if(yoga){assert.deepEqual(payload,expected);assert.ok(h.calls.every(c=>/\/chat(?:\/messages)?$/.test(c.path)));}
  else{assert.match(payload.idempotency_key,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(payload.expected_actor_telegram_id,101);assert.deepEqual(payload,{...expected,idempotency_key:payload.idempotency_key,expected_actor_telegram_id:101});assert.equal(h.calls.filter(c=>c.path==='/api/web/auth/me').length,1);}
  assert.equal((send.options.headers as any)['X-CSRF-Token'],'SYNTHETIC_CSRF');
  nodes(h.tree).find(n=>n.type==='button'&&n.props.className==='telegram-contact').props.onClick();assert.deepEqual(h.opens,[yoga?'https://t.me/Yoga_ganster_bot':'https://t.me/safr_bali_bot']);h.unmount();
});
test('Main rejects missing/invalid actor even while drawer is closed',()=>{
  for(const name of ['SupportPanel','SupportDrawer'])for(const userId of [undefined,0,-1,NaN,1.5])assert.throws(()=>renderToStaticMarkup(React.createElement(loader()('components/'+name+'.tsx')[name],{ui:bindings.createClientUiBindings('ar'),userId,apiPrefix:'/api/web'})),/CLIENT_SUPPORT_ACTOR_BOUNDARY/);
});
test('preview and inactive submit do not send even when callback is invoked',async()=>{
  for(const preview of [true,false]){const h=new SupportHarness(true,preview);h.mount();await h.settle();h.edit('name','Fixture');h.edit('body','Fixture');if(!preview){h.props.active=false;h.render();}await h.submit();assert.equal(h.sends().length,0);h.unmount();}
});
test('Main locale change preserves private draft and renders captured error using current locale',async()=>{
  const h=new SupportHarness();h.handler=async()=>{throw new ApiError('PRIVATE_SENTINEL',{kind:'configuration'});};h.mount();await h.settle();
  h.edit('name','Fixture');h.edit('body','PRIVATE_DRAFT');assert.ok(text(h.tree).includes(copy.clientSupportApiError(bindings.createClientUiBindings('ar'),new ApiError('',{kind:'configuration'}))));
  h.locale='ja';h.render();assert.equal(h.field('body').props.value,'PRIVATE_DRAFT');assert.ok(text(h.tree).includes(copy.clientSupportApiError(bindings.createClientUiBindings('ja'),new ApiError('',{kind:'configuration'}))));assert.ok(!text(h.tree).includes('PRIVATE_SENTINEL'));h.unmount();
});
test('Main held GET cannot replace successful POST chat or loading state',async()=>{
  const h=new SupportHarness(),held=deferred();h.handler=(p,o)=>o.method==='POST'?Promise.resolve(chat('NEW_POST_CHAT')):held.promise;
  h.mount();await h.settle();h.edit('name','Fixture');h.edit('body','Fixture');await h.submit();assert.ok(text(h.tree).includes('NEW_POST_CHAT'));
  held.resolve(chat('STALE_GET_CHAT'));await h.settle();assert.ok(text(h.tree).includes('NEW_POST_CHAT'));assert.ok(!text(h.tree).includes('STALE_GET_CHAT'));h.unmount();
});
test('Main long GET polling stays single-flight, accepts response after multiple intervals',async()=>{
  const h=new SupportHarness(),held=deferred();h.handler=()=>held.promise;h.mount();await h.settle();h.poll();h.poll();h.poll();await h.settle();assert.equal(h.calls.length,1);
  held.resolve(chat('LONG_READ_COMPLETED'));await h.settle();assert.ok(text(h.tree).includes('LONG_READ_COMPLETED'));h.poll();await h.settle();assert.equal(h.calls.length,2);h.unmount();
});
test('Main A→B resets private draft; late A GET/POST cannot touch B',async()=>{
  const h=new SupportHarness(),get=deferred(),post=deferred();h.handler=(p,o)=>o.method==='POST'?post.promise:get.promise;h.mount();await h.settle();h.edit('name','Actor A');h.edit('body','A_DRAFT');const sending=h.submit();await h.settle();
  h.props.userId=202;h.handler=async()=>chat('B_CHAT');h.render();await h.settle();assert.equal(h.field('body').props.value,'');assert.equal(h.field('name').props.value,'');h.edit('body','B_DRAFT');
  get.resolve(chat('A_GET'));post.resolve(chat('A_POST'));await sending;await h.settle();assert.equal(h.field('body').props.value,'B_DRAFT');assert.ok(!text(h.tree).includes('A_GET')&&!text(h.tree).includes('A_POST'));assert.equal(h.sends().length,1);assert.equal(h.lateWrites,0);h.unmount();
});
test('Main never-settling GET releases at deadline; next poll recovers and late read stays fenced',async()=>{
  const h=new SupportHarness(),held=deferred();h.handler=()=>held.promise;h.mount();await h.settle();assert.equal(h.deadlines.size,1);
  const [timer]=[...h.deadlines.values()];assert.equal(timer.ms,15000);timer.fn();await h.settle();assert.equal(h.deadlines.size,0);
  h.handler=async()=>chat('RECOVERED_AFTER_DEADLINE');h.poll();await h.settle();assert.equal(h.calls.length,2);assert.ok(text(h.tree).includes('RECOVERED_AFTER_DEADLINE'));
  held.resolve(chat('EXPIRED_READ'));await h.settle();assert.ok(!text(h.tree).includes('EXPIRED_READ'));assert.ok(text(h.tree).includes('RECOVERED_AFTER_DEADLINE'));h.unmount();assert.equal(h.deadlines.size,0);
});
test('Main inactive pending send reopens without stuck sending or automatic POST',async()=>{
  const h=new SupportHarness(),held=deferred();h.mount();await h.settle();h.handler=(p,o)=>o.method==='POST'?held.promise:Promise.resolve(chat());h.edit('name','Fixture');h.edit('body','DRAFT');const sending=h.submit();await h.settle();h.props.active=false;h.render();held.resolve(chat('OLD_SEND'));await sending;await h.settle();
  h.props.active=true;h.render();await h.settle();assert.equal(h.field('body').props.value,'DRAFT');assert.equal(h.field('body').props.disabled,false);assert.equal(h.sends().length,1);h.unmount();
});
for(const locale of locales)test('Main guarded send preserves text/identity/CSRF in '+locale,async()=>{
  const h=new SupportHarness();h.locale=locale;h.mount();await h.settle();h.props.routeContext={service:'C1',locale};h.render();h.edit('name','Synthetic Client');h.edit('body',' RAW_CUSTOMER_TEXT 中文 عربي ');await h.submit();
  assert.equal(h.sends().length,1);const send=h.sends()[0],payload=JSON.parse(String(send.options.body));
  assert.equal(payload.body,'Synthetic Client · telegram: fixture_user\n\nRAW_CUSTOMER_TEXT 中文 عربي');assert.deepEqual(payload.route_context,{service:'C1',locale});assert.equal(payload.expected_actor_telegram_id,101);assert.match(payload.idempotency_key,/^[0-9a-f-]{36}$/);assert.equal((send.options.headers as any)['X-CSRF-Token'],'SYNTHETIC_CSRF');assert.equal(h.deadlines.size,0);h.unmount();
});
test('Main manual network retry keeps same UUID and original page despite locale/route changes',async()=>{
  const h=new SupportHarness();h.mount();await h.settle();h.props.routeContext={service:'C1',locale:'ar'};h.render();h.handler=async()=>{throw new ApiError('synthetic',{kind:'network'});};h.edit('name','Fixture');h.edit('body','Same draft');await h.submit();const first=h.sends()[0].options.body;
  h.locale='ja';h.props.routeContext={service:'D2',locale:'ja'};h.render();await h.settle();assert.equal(h.sends().length,1);h.handler=async()=>chat();await h.submit();assert.equal(h.sends().length,2);assert.equal(h.sends()[1].options.body,first);assert.equal(JSON.parse(String(first)).route_context.service,'C1');h.unmount();
});
test('Main closing unknown send then explicit retry keeps exact intent and does not auto-post',async()=>{
  const h=new SupportHarness(),held=deferred();h.mount();await h.settle();h.handler=(p,o)=>o.method==='POST'?held.promise:Promise.resolve(chat());h.edit('name','Fixture');h.edit('body','Unknown draft');const pending=h.submit();await h.settle();const first=h.sends()[0].options.body;
  h.props.active=false;h.render();await pending;h.props.active=true;h.render();await h.settle();assert.equal(h.sends().length,1);h.handler=async()=>chat('ACCEPTED_RETRY');await h.submit();assert.equal(h.sends()[1].options.body,first);h.edit('body','NEW_DRAFT');held.resolve(chat('STALE_UNKNOWN_RESPONSE'));await h.settle();assert.equal(h.field('body').props.value,'NEW_DRAFT');assert.ok(!text(h.tree).includes('STALE_UNKNOWN_RESPONSE'));assert.equal(h.lateWrites,0);h.unmount();
});
test('Main 409 does not silently mint a new key; only explicit edit starts a new intent',async()=>{
  const h=new SupportHarness();h.mount();await h.settle();h.handler=async()=>{throw new ApiError('synthetic conflict',{kind:'http',status:409});};h.edit('name','Fixture');h.edit('body','Conflict draft');await h.submit();const first=JSON.parse(String(h.sends()[0].options.body));
  const button=nodes(h.tree).find(n=>n.type==='button'&&n.props.type==='submit');assert.equal(button.props.disabled,true);await h.submit();assert.equal(h.sends().length,1);h.edit('body','Explicitly changed draft');h.handler=async()=>chat();await h.submit();assert.equal(h.sends().length,2);assert.notEqual(JSON.parse(String(h.sends()[1].options.body)).idempotency_key,first.idempotency_key);h.unmount();
});
test('Main actor preflight mismatch cannot POST with the new cookie identity',async()=>{
  const h=new SupportHarness();h.mount();await h.settle();h.identityActor=202;h.edit('name','Fixture');h.edit('body','Actor A draft');await h.submit();assert.equal(h.sends().length,0);assert.ok(text(h.tree).includes(copy.clientSupportApiError(bindings.createClientUiBindings('ar'),new ApiError('',{kind:'authentication'}))));h.unmount();
});
test('Main retained submit cannot send after render replacement or unmount',async()=>{
  const h=new SupportHarness();h.mount();await h.settle();h.edit('name','Fixture');h.edit('body','Old draft');const old=nodes(h.tree).find(n=>n.type==='form').props.onSubmit;h.locale='ja';h.render();await old({preventDefault(){}});assert.equal(h.sends().length,0);const latest=nodes(h.tree).find(n=>n.type==='form').props.onSubmit;h.unmount();await latest({preventDefault(){}});assert.equal(h.sends().length,0);assert.equal(h.lateWrites,0);
});
test('Main full send deadline releases stuck POST; manual retry reuses key and late response stays fenced',async()=>{
  const h=new SupportHarness(),held=deferred();h.mount();await h.settle();h.handler=(p,o)=>o.method==='POST'?held.promise:Promise.resolve(chat());h.edit('name','Fixture');h.edit('body','Unknown draft');const pending=h.submit();await h.settle();assert.equal(h.sends().length,1);const first=h.sends()[0].options.body;assert.equal(h.deadlines.size,1);const deadline=[...h.deadlines.values()][0];assert.equal(deadline.ms,15000);deadline.fn();await pending;await h.settle();assert.equal(h.field('body').props.disabled,false);assert.equal(h.deadlines.size,0);h.handler=async()=>chat('RETRY_ACCEPTED');await h.submit();assert.equal(h.sends()[1].options.body,first);h.edit('body','FRESH_DRAFT');held.resolve(chat('EXPIRED_POST'));await h.settle();assert.equal(h.field('body').props.value,'FRESH_DRAFT');assert.ok(!text(h.tree).includes('EXPIRED_POST'));h.unmount();
});
test('Main deadline also bounds actor preflight and prevents late POST after abort',async()=>{
  const h=new SupportHarness(),identity=deferred();h.mount();await h.settle();h.identityHandler=()=>identity.promise;h.edit('name','Fixture');h.edit('body','Unknown identity draft');const pending=h.submit();await h.settle();assert.equal(h.sends().length,0);assert.equal(h.deadlines.size,1);[...h.deadlines.values()][0].fn();await pending;await h.settle();assert.equal(h.field('body').props.disabled,false);identity.resolve({authenticated:true,telegram_id:101});await h.settle();assert.equal(h.sends().length,0);h.identityHandler=null;await h.submit();assert.equal(h.sends().length,1);h.unmount();
});
test('Main retained old edit cannot abort a new same-actor view or discard its retry UUID',async()=>{
  const h=new SupportHarness(),held=deferred();h.mount();await h.settle();h.edit('name','Old view');h.edit('body','Old draft');const staleEdit=h.field('body').props.onChange;
  h.unmount();h.key=null;h.mount();await h.settle();h.edit('name','Fresh view');h.edit('body','Fresh draft');h.handler=(p,o)=>o.method==='POST'?held.promise:Promise.resolve(chat());const pending=h.submit();await h.settle();const first=h.sends()[0].options.body;
  staleEdit({target:{value:'STALE_EDIT'}});await h.settle();assert.equal(h.field('body').props.value,'Fresh draft');assert.equal(h.sends()[0].options.signal?.aborted,false);assert.equal(h.lateWrites,0);
  h.props.active=false;h.render();await pending;h.props.active=true;h.render();await h.settle();h.handler=async()=>chat();await h.submit();assert.equal(h.sends()[1].options.body,first);held.resolve(chat('LATE_OLD'));await h.settle();h.unmount();
});
test('server rendering never reads or mutates retained browser intent memory',async()=>{
  const load=loader({server:true}),memory=load('components/support-intent.ts').supportIntentMemory,session=memory.bind('/api/web',101),draft={name:'PRIVATE_SSR_NAME',contactMethod:'telegram',contact:'private_ssr_contact',body:'PRIVATE_SSR_DRAFT'};
  await assert.rejects(session.submit(draft,{service:'C1'},async()=>{throw new ApiError('synthetic',{kind:'network'});}));
  const html=renderToStaticMarkup(React.createElement(load('components/SupportPanel.tsx').SupportPanel,{ui:bindings.createClientUiBindings('ar'),userId:101,apiPrefix:'/api/web',onOpenTelegram(){}}));
  for(const value of Object.values(draft))if(value!=='telegram')assert.ok(!html.includes(value));assert.deepEqual(session.draft(),draft);memory.clear();
});
