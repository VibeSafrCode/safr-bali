import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import test from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import ts from 'typescript';import {ApiError} from '../src/api/client';import {build} from 'vite';import reactPlugin from '@vitejs/plugin-react';
const app=fileURLToPath(new URL('../',import.meta.url)),dev=path.resolve(app,'..'),require=createRequire(path.join(app,'package.json')),base=process.env.SAFR_TEST_SUPPORT_BASE;
assert.ok(base&&path.isAbsolute(base),'Pinned158 baseline required');
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
const nodes=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const content=(v:any):string=>v==null||typeof v==='boolean'?'':typeof v!=='object'?String(v):Array.isArray(v)?v.map(content).join(''):content(v.props?.children);
function loader(root=dev,options:{react?:typeof React;preview?:boolean;request?:(p:string,o?:RequestInit)=>Promise<any>;window?:any}={}){
 const cache=new Map<string,any>();function load(file:string):any{const full=path.resolve(root,file);assert.ok(full.startsWith(root+'/'));
  if(full.endsWith('/api/client.ts'))return{ApiError,appApiClient:()=>({request:options.request??(()=>{throw Error('NO_REAL_NETWORK');})})};
  if(full.endsWith('/api/account-preview.ts'))return{isAccountPreview:()=>options.preview===true};
  if(cache.has(full))return cache.get(full);if(full.endsWith('.css'))return{};if(full.endsWith('.mjs'))return require(full);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  const result={exports:{} as any};cache.set(full,result.exports);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(id:string)=>{if(id==='react')return options.react??React;if(id==='react/jsx-runtime')return require(id);if(id.endsWith('.css'))return{};if(!id.startsWith('.'))throw Error('UNKNOWN_TEST_PACKAGE '+id);const stem=path.resolve(path.dirname(full),id),found=['','.ts','.tsx','.json'].map(e=>stem+e).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());assert.ok(found,id);return load(path.relative(root,found));};
  const clock=options.window;
  const globals={crypto:globalThis.crypto,setTimeout:clock?.setTimeout??globalThis.setTimeout,clearTimeout:clock?.clearTimeout??globalThis.clearTimeout};
  vm.runInThisContext('(function(require,module,exports,window,globalThis){'+js+'\n})',{filename:full})(scoped,result,result.exports,clock,globals);cache.set(full,result.exports);return result.exports;
 }return load;
}
function ssr(name:string,locale:string|undefined,contact:'ru'|'en'='ru',baseline=false,preview=false,initialContact='fixture_user'){
 const load=loader(baseline?base:dev,{preview}),ui=locale===undefined?undefined:load('react-app/src/i18n/client-ui-bindings.ts').createClientUiBindings(locale),props={ui,userId:101,apiPrefix:'/api/web',csrfToken:'SYNTHETIC_CSRF',initialContact,onOpenTelegram(){},open:false,onOpen(){},onClose(){}};
 return renderToStaticMarkup(React.createElement(load('react-app/src/i18n/runtime.tsx').I18nProvider,{locale:contact},React.createElement(load('react-app/src/components/'+name+'.tsx')[name],props)));
}
const source=JSON.parse(fs.readFileSync(path.join(dev,'shared/content/client-ui/client-runtime.v1.json'),'utf8'));
test('fixture loads the actual shared ESM presentation module without transpiling it as CommonJS',()=>{
 const actual=require(path.join(dev,'shared/src/yoga-presentation.mjs'));
 const loaded=loader()('shared/src/yoga-presentation.mjs');
 assert.equal(loaded.yogaPresentationText,actual.yogaPresentationText);
 assert.equal(loaded.yogaPresentationText('SAFRWAY',false),'SAFRWAY');
 assert.equal(loaded.yogaPresentationText('SAFRWAY',true),'Yoga Ganster');
 assert.throws(()=>loader()('../outside.mjs'));
});
for(const locale of locales)test('real SSR support form and drawer consume accepted labels without translating contacts: '+locale,()=>{
 const html=ssr('SupportPanel',locale,'en');assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));assert.ok(html.includes('value="fixture_user"'));
 const both=html+ssr('SupportPanel',locale,'en',false,false,'');
 for(const[key,row]of Object.entries(source.entries) as [string,any][])if(key.includes('/SupportPanel.tsx#')&&!/aec8f8073979|159bc38346f8/.test(key))assert.ok(both.includes(escape(row[locale])),key);
 assert.ok(html.includes(escape(source.entries['support.loading'][locale])));assert.ok(html.includes(escape(source.entries['support.messagePlaceholder'][locale])));
 const drawer=ssr('SupportDrawer',locale);for(const suffix of ['15321ec40383','75e107a9f4b8','08fd5cb77ac8'])assert.ok(drawer.includes(escape(source.entries['inline:06 Development/react-app/src/components/SupportDrawer.tsx#'+suffix][locale])));
});
for(const locale of ['ru','en'] as const)test('prop-absent legacy client/preview SSR remains byte-identical: '+locale,()=>{
 for(const preview of [false,true])for(const name of ['SupportPanel','SupportDrawer'])assert.equal(ssr(name,undefined,locale,false,preview),ssr(name,undefined,locale,true,preview));
});

// Callback/effect probes use actual TSX and actual SupportIntent/Chat parser with
// mocked hooks, finite timers, synthetic identities and mock request. NOT DOM,
// real API, clipboard/dialog focus, live messages, authenticated parent or release.
function harness(initialLocale:typeof locales[number],config:{preview?:boolean;chatError?:unknown;sendError?:unknown;identityActor?:number;sendWait?:Promise<void>}={}){
 let values:any[]=[],index=0,sessionKey:string|null=null,locale=initialLocale,props:any={userId:101,apiPrefix:'/api/web',csrfToken:'SYNTHETIC_CSRF',initialContact:'fixture_user',active:true},effect:(()=>void|(()=>void))|undefined,cleanup:(()=>void)|undefined,effectDeps:any[]|undefined,effectPending=false;
 let timerSequence=0;
 const timers=new Map<number,()=>void>(),intervals=new Map<number,()=>void>();
 const clock={setTimeout:(fn:()=>void)=>{const id=++timerSequence;timers.set(id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id),setInterval:(fn:()=>void)=>{const id=++timerSequence;intervals.set(id,fn);return id;},clearInterval:(id:number)=>intervals.delete(id)};
 const calls:{route:string;options:RequestInit|undefined}[]=[],opens:string[]=[],chat={id:1,status:'open',messages:[{id:1,author_type:'client',body:'RAW_USER_MESSAGE_中文_عربي',created_at:'2026-10-16T00:00:00Z'},{id:2,author_type:'staff',body:'RAW_MANAGER_MESSAGE',created_at:'2026-10-16T00:00:00Z'}]};
 const request=async(route:string,options?:RequestInit)=>{calls.push({route,options});if(route.endsWith('/auth/me'))return{authenticated:true,telegram_id:config.identityActor??props.userId};if(route.endsWith('/messages')){if(config.sendError)throw config.sendError;if(config.sendWait)await config.sendWait;return chat;}if(route.endsWith('/chat')){if(config.chatError)throw config.chatError;return chat;}throw Error('UNEXPECTED_MOCK_ROUTE '+route);};
 const react={...React,useState(init:any){const at=index++,bound=values;if(!(at in bound))bound[at]=typeof init==='function'?init():init;return[bound[at],(next:any)=>{bound[at]=typeof next==='function'?next(bound[at]):next;}];},useRef(init:any){const at=index++;if(!(at in values))values[at]={current:init};return values[at];},useEffect(fn:any,deps:any[]){if(!effectDeps||effectDeps.length!==deps.length||effectDeps.some((v,i)=>!Object.is(v,deps[i]))){effect=fn;effectDeps=deps;effectPending=true;}},useContext(){return{locale:'ru',t:load('react-app/src/i18n/runtime.tsx').translate.bind(null,'ru')};}} as typeof React;
 const load=loader(dev,{react,preview:config.preview,request,window:clock}),binding=load('react-app/src/i18n/client-ui-bindings.ts');
 function render(){const ui=binding.createClientUiBindings(locale),root=load('react-app/src/components/SupportPanel.tsx').SupportPanel({...props,ui,onOpenTelegram:(url:string)=>opens.push(url)});if(root.key!==sessionKey){cleanup?.();cleanup=undefined;values=[];effectDeps=undefined;sessionKey=root.key;}index=0;const tree=root.type(root.props);if(effectPending){effectPending=false;cleanup?.();cleanup=effect?.()??undefined;}return tree;}
 async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
 return{render,nodes:()=>nodes(render()),calls,opens,config,props,setLocale:(v:typeof locales[number])=>{locale=v;},async loadChat(){render();assert.ok(effect);await settle();return cleanup;},async submit(){const form=nodes(render()).find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});await settle();},edit(name:string,value:string){const all=nodes(render()),field=name==='name'?all.find(n=>n.type==='input'&&n.props.autoComplete==='name'):name==='body'?all.find(n=>n.type==='textarea'):all.find(n=>n.type==='input'&&n.props.maxLength===254);assert.ok(field);field.props.onChange({target:{value}});},setActive:(v:boolean)=>{props.active=v;},setActor:(v:number)=>{props.userId=v;}};
}

for(const locale of locales)test('actual send callbacks retain body/context/idempotency/CSRF and actor guards: '+locale,async()=>{
 const h=harness(locale);h.props.routeContext={country:'Бали',section:'Визы',service:'E33G'};await h.loadChat();let list=h.nodes();const text=content(list);assert.ok(text.includes('RAW_USER_MESSAGE_中文_عربي'));assert.ok(text.includes('RAW_MANAGER_MESSAGE'));
 assert.ok(text.includes(source.entries['support.author.client'][locale]));assert.ok(text.includes(source.entries['support.author.manager'][locale]));
 h.edit('name','Synthetic Client');h.edit('body','  User text НЕ ПЕРЕВОДИТЬ 中文  ');await h.submit();
 const sends=h.calls.filter(c=>c.route.endsWith('/chat/messages'));assert.equal(sends.length,1);const body=JSON.parse(String(sends[0].options?.body));assert.equal(body.body,'Synthetic Client · telegram: fixture_user\n\nUser text НЕ ПЕРЕВОДИТЬ 中文');assert.deepEqual(body.route_context,{country:'Бали',section:'Визы',service:'E33G'});assert.equal(body.expected_actor_telegram_id,101);assert.match(body.idempotency_key,/^[a-f0-9-]{36}$/);assert.equal((sends[0].options?.headers as any)['X-CSRF-Token'],'SYNTHETIC_CSRF');assert.ok(!Object.hasOwn(body,'locale')&&!Object.hasOwn(body,'ui_locale'));
 const telegram=h.nodes().find(n=>n.type==='button'&&n.props.className==='telegram-contact');telegram.props.onClick();assert.deepEqual(h.opens,['https://t.me/safr_bali_bot']);
 h.setActive(false);h.edit('body','inactive');await h.submit();assert.equal(h.calls.filter(c=>c.route.endsWith('/chat/messages')).length,1);
});

test('invalid contact and captured API error re-render in current UI language without exposing raw error',async()=>{
 const h=harness('ar',{chatError:new ApiError('PRIVATE_SENTINEL',{kind:'configuration'})});await h.loadChat();assert.ok(content(h.nodes()).includes(source.entries['api.error.configuration'].ar));h.setLocale('ja');assert.ok(content(h.nodes()).includes(source.entries['api.error.configuration'].ja));assert.ok(!content(h.nodes()).includes('PRIVATE_SENTINEL'));
 h.edit('name','Fixture');h.edit('body','Fixture');h.edit('contact','!invalid!');await h.submit();assert.equal(h.calls.filter(c=>c.route.endsWith('/messages')).length,0);assert.ok(content(h.nodes()).includes(source.entries['inline:06 Development/react-app/src/components/SupportPanel.tsx#159bc38346f8'].ja));h.setLocale('de');assert.ok(content(h.nodes()).includes(source.entries['inline:06 Development/react-app/src/components/SupportPanel.tsx#159bc38346f8'].de));
});
test('failed send retry preserves one serialized intent across language changes; identity mismatch never posts',async()=>{
 const h=harness('fr',{sendError:new ApiError('PRIVATE_SENTINEL',{kind:'network'})});h.edit('name','Fixture');h.edit('body','Fixture body');await h.submit();const first=h.calls.find(c=>c.route.endsWith('/messages'))!;assert.ok(first);h.setLocale('ar');await h.submit();assert.equal(h.calls.filter(c=>c.route.endsWith('/messages')).length,2);assert.equal(h.calls.filter(c=>c.route.endsWith('/messages'))[1].options?.body,first.options?.body);
 const b=harness('ar',{identityActor:202});b.edit('name','Fixture');b.edit('body','Fixture body');await b.submit();assert.equal(b.calls.filter(c=>c.route.endsWith('/messages')).length,0);assert.ok(content(b.nodes()).includes(source.entries['api.error.authentication'].ar));
 b.setActor(202);assert.equal(b.nodes().find(n=>n.type==='textarea').props.value,'');assert.equal(b.nodes().find(n=>n.type==='input'&&n.props.autoComplete==='name').props.value,'');
});
test('forged and preview bindings cannot activate Client10 or grant support identity',()=>{
 const load=loader(),binding=load('react-app/src/i18n/client-ui-bindings.ts');for(const value of [null,{}, {role:'client',locale:'ar'},Object.create(binding.createClientUiBindings('ar'))])for(const name of ['SupportPanel','SupportDrawer'])assert.throws(()=>renderToStaticMarkup(React.createElement(load('react-app/src/components/'+name+'.tsx')[name],{ui:value})),/BINDING_ROLE_OR_PROVENANCE/);
 assert.throws(()=>ssr('SupportPanel','ar','ru',false,true),/CLIENT_SUPPORT_PREVIEW_BOUNDARY/);assert.throws(()=>ssr('SupportDrawer','ar','ru',false,true),/CLIENT_SUPPORT_PREVIEW_BOUNDARY/);
 const h=harness('ar');h.props.userId=undefined;assert.throws(()=>h.render(),/CLIENT_SUPPORT_ACTOR_BOUNDARY/);assert.equal(h.calls.filter(c=>c.route.endsWith('/messages')).length,0);
});
test('late actor-A send never replaces new actor-B private draft or triggers another POST',async()=>{
 let resolve!:()=>void;const wait=new Promise<void>(yes=>{resolve=yes;});const h=harness('ar',{sendWait:wait});h.edit('name','Actor A');h.edit('body','A_PRIVATE_DRAFT');const pending=h.submit();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(h.calls.filter(c=>c.route.endsWith('/messages')).length,1);h.setActor(202);h.render();h.edit('body','B_PRIVATE_DRAFT');resolve();await pending;assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,'B_PRIVATE_DRAFT');assert.ok(!content(h.nodes()).includes('A_PRIVATE_DRAFT'));assert.equal(h.calls.filter(c=>c.route.endsWith('/messages')).length,1);
});
test('all existing API error kinds map by accepted keys, never raw message',()=>{
 const load=loader(),binding=load('react-app/src/i18n/client-ui-bindings.ts'),copy=load('react-app/src/i18n/client-support-copy.ts');for(const locale of locales)for(const[kind,key]of [['authentication','authentication'],['configuration','configuration'],['invalid_response','invalidResponse'],['network','data'],['http','data'],[null,'unknown']] as const){const error=kind?new ApiError('PRIVATE_SENTINEL',{kind}):new Error('PRIVATE_SENTINEL');assert.equal(copy.clientSupportApiError(binding.createClientUiBindings(locale),error),source.entries['api.error.'+key][locale]);}
});
test('real Vite Support entry compiles in memory, without Admin or private source corpus',async()=>{
 const r=await build({root:app,configFile:false,envDir:false,envPrefix:'__SAFR_NO_AMBIENT_ENV__',logLevel:'silent',plugins:[reactPlugin()],build:{write:false,minify:false,sourcemap:false,lib:{entry:path.join(app,'src/components/SupportDrawer.tsx'),formats:['es']}}});const outputs=(Array.isArray(r)?r:[r]).flatMap(x=>x.output),chunks=outputs.filter(o=>o.type==='chunk'),modules=chunks.flatMap(c=>Object.keys(c.modules));for(const name of ['SupportDrawer.tsx','SupportPanel.tsx','client-support-copy.ts','support-intent.ts','support-chat.ts','client-runtime.v1.json'])assert.ok(modules.some(m=>m.endsWith(name)));assert.ok(!modules.some(m=>/AdminApp|AUDIT\/|candidates\.v1|registry-copy\//.test(m)));console.log('SUPPORT_ENTRY_PROOF '+JSON.stringify({modules:modules.length,outputs:outputs.length,jsBytes:chunks.reduce((n,c)=>n+Buffer.byteLength(c.code),0),write:false}));
});
