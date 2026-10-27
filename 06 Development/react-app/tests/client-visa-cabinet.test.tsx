import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createClientUiBindings,requireClientUiBindings} from '../src/i18n/client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import * as presentation from '../src/i18n/client-visa-presentation';
import {clientSupportApiError} from '../src/i18n/client-support-copy';
import {ApiError,apiErrorMessage} from '../src/api/client';
import {visaDatePresentation} from '../src/components/visaDatePresentation';
import {canReportVisaEntry,prepareVisaEntryRequest} from '../src/components/visaEntryRequest';
import * as extensionRequest from '../src/components/visaExtensionRequest';
import {renderVisaStayControls} from '../src/components/VisaStayControls';
import {clientVisaStayCopy} from '../src/i18n/client-visa-stay-copy';
import {visaStatusLabel,visaStatusDescription,visaStatusOptions} from '../src/components/visaEditorState';
import type {VisaCase} from '../src/api/types';
import {publicClientProjection} from './fixtures/client-public-projection';

const app=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(app,'package.json'));
const baselineRoot=process.env.SAFR_VISA_CABINET_BASELINE;
assert.ok(baselineRoot,'Explicit immutable prior Visa component directory required');
assert.equal(createHash('sha256').update(fs.readFileSync(path.join(baselineRoot,'VisaCabinet.tsx'))).digest('hex'),'a8ee645ee542130f5be8ea6bc705a1c919291542cbca2fa46678a91281f856e2');
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const prefix='source:06 Development/react-app/src/components/VisaCabinet.tsx#copy.';
const record=(id:number):VisaCase=>({id,version:1,country_code:'ID',visa_type:{code:'C1',name:'RAW_MANAGER_NAME',version:1},custom_visa_name:null,service_status:'PAID',lifecycle_status:'ACTIVE',publication_status:'PUBLISHED',notifications_enabled:true,issued_on:'2026-10-01',entered_on:'2026-10-02',entry_deadline:'2026-12-01',stay_end:'2026-12-01',expected_stay_end:null,recommended_contact_at:'2026-11-20',next_action_text:'RAW_MANAGER_ACTION',next_action_due_at:'2026-11-21',documents:[{id:8,type:'VISA',name:'RAW_DOCUMENT_NAME',access_url:'/mini-app/visa-documents/8'}],timeline:[{id:9,title:'RAW_EVENT_TITLE',description:'RAW_EVENT_DESCRIPTION',created_at:'2026-10-01T14:00:00Z'}],current_process:null});
const nodes=(v:any):any[]=>v==null||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const text=(v:any):string=>v==null||typeof v==='boolean'?'':Array.isArray(v)?v.map(text).join(''):typeof v==='object'?text(v.props?.children):String(v);
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
type Options={baseline?:boolean;yoga?:boolean;preview?:boolean;react?:typeof React;request?:(p:string,o?:RequestInit)=>Promise<any>};
function loader(options:Options={}){
 const cache=new Map<string,any>();
 return function load(name:string):any{
  if(cache.has(name))return cache.get(name);
  const file=options.baseline?path.join(baselineRoot!,name+'.tsx'):path.join(app,'src/components',name+'.tsx');
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports:any={};cache.set(name,exports);
  const scoped=(id:string):any=>{
   if(id==='react')return options.react??React;if(id==='react/jsx-runtime')return require(id);
   if(id==='../api/account-preview')return{isAccountPreview:()=>options.preview===true};
   if(id==='../api/client')return{ApiError,apiErrorMessage,appApiClient:()=>({request:options.request??(()=>{throw Error('NO_REAL_API');})})};
   if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:options.yoga===true,miniAppDocumentPath:(p:string)=>options.yoga?'/yoga'+p:p};
   if(id==='../ui/presentation-copy')return{presentationCopy:(s:string)=>options.yoga?s.replaceAll('SAFRWAY','Yoga Ganster'):s};
   if(id==='../i18n/client-ui-bindings')return{requireClientUiBindings};
   if(id==='../i18n/client-visa-life-copy')return{clientVisaLifeText};
   if(id==='../i18n/client-support-copy')return{clientSupportApiError};
   if(id==='../i18n/client-visa-presentation')return presentation;
   if(id==='./visaDatePresentation')return{visaDatePresentation};
   if(id==='./visaEntryRequest')return{canReportVisaEntry,prepareVisaEntryRequest};
   if(id==='./visaExtensionRequest')return extensionRequest;
   if(id==='./VisaStayControls')return{renderVisaStayControls};
   if(id==='../i18n/client-visa-stay-copy')return{clientVisaStayCopy};
   if(id==='./visaEditorState')return{visaStatusLabel,visaStatusDescription,visaStatusOptions};
   if(id==='./VisaStatusHelp')return load('VisaStatusHelp');
   if(id==='./ClientVisaStatusHelp')return load('ClientVisaStatusHelp');
   throw Error('UNEXPECTED_VISA_IMPORT '+id);
  };
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:file})(scoped,{exports},exports);
  return exports;
 };
}

function seedRender({baseline=false,yoga=false,locale='en',ui,selected=null,items=[record(11)],state='ready',error=null,message=null}:{baseline?:boolean;yoga?:boolean;locale?:'ru'|'en';ui?:ReturnType<typeof createClientUiBindings>;selected?:VisaCase|null;items?:VisaCase[];state?:string;error?:unknown;message?:string|null}={}){
 let i=0;const slots=[items,selected,state,baseline&&error?apiErrorMessage(error):error,'',null,message,{kind:'APPLIED',on:'',end:''},'2026-10-23'];
 const react={...React,useState:()=>[slots[i++],()=>{}],useRef:(value:any)=>({current:value}),useEffect:()=>{},useId:()=>':visa-fixture:'} as typeof React;
 const component=loader({baseline,yoga,react})('VisaCabinet').VisaCabinet;
 const props={apiPrefix:'/api/web',locale,ui,userId:101,csrfToken:'SYNTHETIC_CSRF'};
 const root=component(props),tree=baseline?root:root.type(root.props);
 return renderToStaticMarkup(tree);
}
// Reverse only the approved detail-heading visual/accessibility delta, never
// normalize source copy, dates, codes or any unrelated HTML against the baseline.
function detailHeadingMarkup(code:string,label=code){
 if(label!==code)return '<h1 tabindex="-1">'+escape(label)+'</h1>';
 return '<h1 tabindex="-1"><code>'+code.split('_').map((part,i,all)=>'<span class="visa-code-segment">'+escape(part+(i<all.length-1?'_':''))+'</span>'+(i<all.length-1?'<wbr/>':'')).join('')+'</code></h1>';
}
function acceptedHeadingLabel(code:string,locale:typeof locales[number]){
 return publicClientProjection.visaLifeEntries['source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.'+code]?.[locale]??code;
}
function reverseDetailHeading(html:string,selected:VisaCase|null,state='ready',locale:'ru'|'en'='en'){
 if(!selected||state!=='ready')return html;
 const exact=detailHeadingMarkup(selected.lifecycle_status,acceptedHeadingLabel(selected.lifecycle_status,locale));assert.equal(html.split(exact).length,2);
 // Reverse only the newly approved stay-controls subtree. The original dates
 // are retained byte-for-byte; all surrounding legacy HTML must still match.
 const marker='<section class="visa-stay-controls" data-visa-stay-controls="v1"';
 assert.equal(html.split(marker).length,2);
 const a=html.indexOf(marker),b=html.indexOf('</section>',a)+10;
 assert.ok(b>a);const panel=html.slice(a,b);
 const da=panel.indexOf('<dl class="visa-dates">'),db=panel.indexOf('</dl>',da)+5;
 assert.ok(da>=0&&db>da);assert.ok(panel.includes('class="visa-stay-ring"'));
 html=html.slice(0,a)+panel.slice(da,db)+html.slice(b);
 return html.replace(exact,'<h1><code>'+escape(selected.lifecycle_status)+'</code></h1>');
}
for(const yoga of [false,true])for(const locale of ['ru','en'] as const)test('actual Visa unbound RUEN list/detail/loading/error HTML equals immutable baseline yoga='+yoga+' '+locale,()=>{
 for(const selected of [null,record(11)])for(const state of ['ready','loading','error']){
  const args={yoga,locale,selected,state,error:new ApiError('SYNTHETIC_PRIVATE_CAUSE',{kind:'network'})};
  assert.equal(reverseDetailHeading(seedRender(args),selected,state,locale),seedRender({...args,baseline:true}));
 }
});
for(const locale of locales)test('actual Visa list/detail labels/date/status/free data consume source: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const selected of [null,record(11)]){
  const html=seedRender({ui,selected});
  assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+ui.dir+'"'));
  for(const key of selected?['important','service','lifecycle','process','action','documents','history','notifications']:['eyebrow','title','intro','open'])
   assert.ok(html.includes(escape(clientVisaLifeText(ui,(prefix+key) as ClientVisaLifeKey))),key);
  assert.ok(html.includes(escape(presentation.clientVisaFormatDate('2026-12-01',ui,''))));
  if(locale!=='ru'&&locale!=='en')for(const literal of selected?['RAW_MANAGER_NAME','RAW_MANAGER_ACTION','RAW_DOCUMENT_NAME','RAW_EVENT_TITLE','RAW_EVENT_DESCRIPTION']:['RAW_MANAGER_NAME'])assert.ok(html.includes(literal));
  assert.equal(html.includes('SYNTHETIC_CSRF'),false);
 }
});
for(const locale of ['ru','en'] as const)test('bound RUEN ready HTML reverses only one exact root lang/dir pair: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const selected of [null,record(11)]){
  const html=seedRender({locale,selected,ui});const token=` lang="${locale}" dir="ltr"`;
  assert.equal(html.split(token).length-1,1);
  assert.equal(reverseDetailHeading(html.replace(token,''),selected,'ready',locale),seedRender({locale,selected,baseline:true}));
 }
});
for(const locale of locales)test('actual Visa detail displays current external/unknown help in selected UI locale: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const code of ['PAID','APPROVED','FUTURE_STATUS']){
  const selected={...record(11),current_process:{type:'APPLICATION',external_status:code,updated_at:'2026-10-18'}};
  const html=seedRender({ui,selected});
  const label=presentation.clientVisaStatusLabel('external',code,ui);
  assert.ok(html.includes('<code>'+escape(label)+'</code>'));
  assert.equal(html.includes('SYNTHETIC_CSRF'),false);
 }
});
test('Visa wrapper rejects forged/preview/non-parent actor; Yoga ignores Main binding',()=>{
 const component=loader()('VisaCabinet').VisaCabinet;
 for(const ui of [{},{...createClientUiBindings('ar')},Object.create(createClientUiBindings('ar'))])assert.throws(()=>component({apiPrefix:'/api/web',locale:'en',userId:101,ui}),/BINDING_ROLE_OR_PROVENANCE/);
 for(const userId of [undefined,0,-1,NaN,Infinity,1.5,'101'])assert.throws(()=>component({apiPrefix:'/api/web',locale:'en',userId,ui:createClientUiBindings('ar')}),/ACTOR_BOUNDARY/);
 assert.throws(()=>loader({preview:true})('VisaCabinet').VisaCabinet({apiPrefix:'/api/web',locale:'en',userId:101,ui:createClientUiBindings('en')}),/PREVIEW_BOUNDARY/);
 assert.doesNotThrow(()=>loader({yoga:true})('VisaCabinet').VisaCabinet({apiPrefix:'/mini-app',locale:'en',ui:{}}));
});

function deferred(){let resolve!:(value:any)=>void,reject!:(reason:any)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function harness({preview=false,yoga=false}={}){
 let slots:any[]=[],i=0,mounted=true,tree:any,key:any,pendingEffects:Array<()=>void>=[],cleanups:Array<()=>void>=[],effectDeps:any[][]=[];
 const focusTrace:string[]=[];let clearDomRefs:Array<()=>void>=[];
 const body={name:'BODY'},listeners=new Map<string,Set<(event:any)=>void>>();
 const documentFixture={body,activeElement:body as any,addEventListener(type:string,fn:(event:any)=>void){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(fn);},removeEventListener(type:string,fn:(event:any)=>void){listeners.get(type)?.delete(fn);}};
 const dispatchFocus=(type:string,node:any)=>{for(const fn of [...(listeners.get(type)??[])])fn({type,target:node});};
 const focus=(node:any,label:string)=>{documentFixture.activeElement=node;focusTrace.push(label);dispatchFocus('focusin',node);};
 let notificationDom:any=null;
 const stayButtons=new Map<string,any>();let stayHeadingDom:any=null;
 function detachNotification(){if(notificationDom){notificationDom.isConnected=false;if(documentFixture.activeElement===notificationDom)documentFixture.activeElement=body;notificationDom=null;}}
 const calls:Array<{path:string;options?:RequestInit}>=[];
 let handler:(p:string,o?:RequestInit)=>Promise<any>=async p=>p.endsWith('/visa-cases')?{items:[record(11),record(22)]}:record(Number(p.split('/').at(-1)));
 let props:any={apiPrefix:'/api/web',locale:'en',userId:101,csrfToken:'SYNTHETIC_CSRF',ui:yoga?undefined:createClientUiBindings('ar')};
 const react={...React,useState:(initial:any)=>{const n=i++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;const own=slots;return[slots[n],(value:any)=>{if(mounted&&slots===own)own[n]=typeof value==='function'?value(own[n]):value;}];},useRef:(value:any)=>{const n=i++;return slots[n]??(slots[n]={current:value});},useEffect:(effect:()=>any,deps:any[])=>{const n=i++,old=effectDeps[n];if(!old||old.length!==deps.length||old.some((x,j)=>x!==deps[j])){effectDeps[n]=deps;pendingEffects.push(()=>{cleanups[n]?.();cleanups[n]=effect();});}},useId:()=>':visa-fixture:'} as typeof React;
 const component=loader({preview,yoga,react,request:(p,o)=>{calls.push({path:p,options:o});return handler(p,o);}})('VisaCabinet').VisaCabinet;
 function render(){const root=component(props);if(root.key!==key){for(const stop of cleanups)stop?.();detachNotification();slots=[];cleanups=[];effectDeps=[];pendingEffects=[];key=root.key;}i=0;tree=root.type(root.props);
  for(const clear of clearDomRefs)clear();clearDomRefs=[];
  for(const article of nodes(tree).filter(n=>n.props?.className==='visa-case-card')){
   const button=article.props.children;if(typeof button.props.ref==='function'){
    const node={focus:()=>focus(node,'card:'+article.key)};button.props.ref(node);clearDomRefs.push(()=>button.props.ref(null));
   }
  }
  for(const heading of nodes(tree).filter(n=>n.type==='h1'&&n.props?.ref)){
   const ref=heading.props.ref,node={focus:()=>focus(node,'detail-heading')};ref.current=node;clearDomRefs.push(()=>{ref.current=null;});
  }
  const stayHeading=nodes(tree).find(n=>n.type==='h3'&&n.props?.ref);
  if(stayHeading){
   const panel={ownerDocument:documentFixture,contains:(node:any)=>[...stayButtons.values()].includes(node)};
   if(!stayHeadingDom)stayHeadingDom={ownerDocument:documentFixture,isConnected:true,closest:()=>panel,focus(){focus(this,'stay-heading');}};
   stayHeadingDom.isConnected=true;stayHeadingDom.closest=()=>panel;stayHeading.props.ref.current=stayHeadingDom;clearDomRefs.push(()=>{stayHeading.props.ref.current=null;});
  }else if(stayHeadingDom){stayHeadingDom.isConnected=false;stayHeadingDom=null;}
  const stayForms=nodes(tree).filter(n=>n.type==='form'&&n.props?.['data-stay-action']);
  const present=new Set(stayForms.map(n=>n.props['data-stay-action']));
  for(const [action,control] of stayButtons)if(!present.has(action)){control.isConnected=false;if(documentFixture.activeElement===control)documentFixture.activeElement=body;stayButtons.delete(action);}
  for(const form of stayForms){
   const action=form.props['data-stay-action'],button=nodes(form).find(n=>n.type==='button');
   let control=stayButtons.get(action);
   if(!control){control={ownerDocument:documentFixture,isConnected:true,disabled:false,closest:()=>({getAttribute:()=>action}),matches(){return this.disabled;},focus(){if(!this.disabled)focus(this,'stay:'+action);}};stayButtons.set(action,control);}
   control.disabled=!!button.props.disabled;if(control.disabled&&documentFixture.activeElement===control)documentFixture.activeElement=body;
  }
  const toggle=nodes(tree).find(n=>n.type==='article'&&n.props.className==='visa-detail-card visa-toggle')?.props.children[1];
  if(toggle){
   if(!notificationDom){notificationDom={ownerDocument:documentFixture,isConnected:true,disabled:false,focus(){if(!this.disabled&&this.isConnected)focus(this,'notification-toggle');}};}
   notificationDom.disabled=!!toggle.props.disabled;
   // Model the native-disable blur observed in the actual Designer browser,
   // not a browser/runtime claim about this synthetic component harness.
   if(notificationDom.disabled&&documentFixture.activeElement===notificationDom)documentFixture.activeElement=body;
   if(toggle.props.ref){const ref=toggle.props.ref;ref.current=notificationDom;clearDomRefs.push(()=>{ref.current=null;});}
  }else detachNotification();
  const effects=pendingEffects;pendingEffects=[];for(const effect of effects)effect();return tree;}
 const find=(predicate:(n:any)=>boolean)=>{const n=nodes(tree).find(predicate);assert.ok(n,'Expected rendered control');return n;};
 return{focusStay(action:string){const control=stayButtons.get(action);assert.ok(control);control.focus();},calls,props,focusTrace,render,get tree(){return tree;},get focused(){return documentFixture.activeElement;},get body(){return body;},get notificationDom(){return notificationDom;},get focusListeners(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);},focusToggle(){assert.ok(notificationDom&&!notificationDom.disabled);notificationDom.focus();},focusForeign(name:string){focus({name},name);},focusBody(){documentFixture.activeElement=body;dispatchFocus('focusin',body);},pointerBody(){dispatchFocus('pointerdown',body);},setHandler:(fn:typeof handler)=>{handler=fn;},setLocale:(locale:typeof locales[number])=>{props.ui=createClientUiBindings(locale);render();},setActor:(id:number)=>{props.userId=id;render();},setPrefix:(value:string)=>{props.apiPrefix=value;render();},unmount(){for(const stop of cleanups)stop?.();for(const clear of clearDomRefs)clear();clearDomRefs=[];detachNotification();mounted=false;},remount(){for(const stop of cleanups)stop?.();detachNotification();slots=[];cleanups=[];effectDeps=[];pendingEffects=[];key=undefined;mounted=true;render();},async settle(){for(let j=0;j<24;j++)await Promise.resolve();render();},cards(){return nodes(tree).filter(n=>n.props?.className==='visa-card-open');},back(){find(n=>n.props?.className==='text-button visa-back').props.onClick();render();},toggle(){find(n=>n.type==='article'&&n.props.className==='visa-detail-card visa-toggle').props.children[1].props.onClick();render();},entry(value:string){find(n=>n.type==='input'&&n.props.name==='entered_on').props.onChange({target:{value}});render();},submit(){find(n=>n.type==='form'&&n.props['data-stay-action']==='entry').props.onSubmit({preventDefault(){}});render();},message(){return nodes(tree).find(n=>n.props?.className==='visa-mutation-status');},input(){return nodes(tree).find(n=>n.type==='input'&&n.props.name==='entered_on');},retry(){find(n=>n.type==='button').props.onClick();render();},setUi:(value:any)=>{props.ui=value;}};
}
async function ready(h:ReturnType<typeof harness>){h.render();await h.settle();}
async function open(h:ReturnType<typeof harness>,index=0){h.cards()[index].props.onClick();h.render();await h.settle();}
for(const outcome of ['success','failure'] as const)for(const apiPrefix of ['/api/web','/mini-app'] as const)test('notification focus returns to the exact enabled toggle after '+outcome+' '+apiPrefix,async()=>{
 const h=harness();h.props.apiPrefix=apiPrefix;h.props.ui=createClientUiBindings(apiPrefix==='/api/web'?'en':'ar');await ready(h);await open(h);h.focusToggle();const control=h.notificationDom,pending=deferred();h.setHandler(()=>pending.promise);
 h.toggle();assert.equal(control.disabled,true);assert.equal(h.focused,h.body);h.toggle();assert.equal(h.calls.filter(c=>c.options?.method).length,1);
 outcome==='success'?pending.resolve({...record(11),notifications_enabled:false}):pending.reject(Error('SYNTHETIC_PATCH405'));
 await h.settle();assert.equal(h.notificationDom,control);assert.equal(control.disabled,false);assert.equal(h.focused,control);
 assert.equal(h.focusTrace.filter(s=>s==='detail-heading').length,1);assert.equal(h.focusTrace.filter(s=>s==='notification-toggle').length,2);assert.equal(h.focusListeners,0);
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,1);assert.equal(writes[0].path,apiPrefix+'/visa-cases/11/notifications');assert.equal(writes[0].options!.method,'PATCH');assert.deepEqual(JSON.parse(String(writes[0].options!.body)),{enabled:false});assert.equal(writes[0].options!.headers?.['X-CSRF-Token' as keyof HeadersInit],'SYNTHETIC_CSRF');h.unmount();
});
for(const outcome of ['throw','resolve','reject'] as const)test('notification terminal cleanup without a committed pending render '+outcome,async()=>{
 const h=harness();await ready(h);await open(h);h.focusToggle();const control=h.notificationDom;
 h.setHandler(()=>{if(outcome==='throw')throw Error('SYNTHETIC_SYNC_THROW');return outcome==='resolve'?Promise.resolve({...record(11),notifications_enabled:false}):Promise.reject(Error('SYNTHETIC_SYNC_REJECTION'));});
 // Invoke the real handler but deliberately omit the pending render. React
 // may batch a synchronously settled request straight into terminal state.
 nodes(h.tree).find(n=>n.type==='article'&&n.props.className==='visa-detail-card visa-toggle').props.children[1].props.onClick();
 await h.settle();assert.equal(h.notificationDom,control);assert.equal(control.disabled,false);assert.equal(h.focused,control);assert.equal(h.focusTrace.filter(s=>s==='notification-toggle').length,1);assert.equal(h.focusListeners,0);assert.equal(h.calls.filter(c=>c.options?.method).length,1);h.unmount();
});
for(const outcome of ['success','failure'] as const)test('notification focus intent is cancelled by foreign focus or deliberate background pointer '+outcome,async()=>{
 for(const movement of ['locale-selector','other-control','background-pointer']){
  const h=harness();await ready(h);await open(h);h.focusToggle();const pending=deferred();h.setHandler(()=>pending.promise);h.toggle();
  if(movement==='background-pointer')h.pointerBody();else{h.focusForeign(movement);h.focusBody();}
  outcome==='success'?pending.resolve({...record(11),notifications_enabled:false}):pending.reject(Error('SYNTHETIC_PATCH405'));
  await h.settle();assert.equal(h.focused,h.body);assert.equal(h.focusTrace.filter(s=>s==='notification-toggle').length,1);assert.equal(h.focusListeners,0);h.unmount();
 }
});
test('stale notification finally cannot restore or consume a new same-ID focus intent',async()=>{
 const h=harness();await ready(h);await open(h);h.focusToggle();const a=deferred(),b=deferred();let writes=0;h.setHandler((p,o)=>o?.method?(++writes===1?a.promise:b.promise):Promise.resolve(record(11)));
 h.toggle();h.back();await open(h);h.focusToggle();const current=h.notificationDom;h.toggle();assert.equal(h.focused,h.body);
 a.resolve({...record(11),notifications_enabled:false});await h.settle();assert.equal(h.focused,h.body);assert.equal(current.disabled,true);
 b.resolve({...record(11),notifications_enabled:false});await h.settle();assert.equal(h.focused,current);assert.equal(h.focusListeners,0);assert.equal(writes,2);h.unmount();
});
test('notification focus never returns to a different case or actor and listeners are removed on unmount',async()=>{
 for(const transition of ['other-case','actor','unmount']){
  const h=harness();await ready(h);await open(h);h.focusToggle();const old=h.notificationDom,pending=deferred();h.setHandler((p,o)=>o?.method?pending.promise:Promise.resolve(p.endsWith('/visa-cases')?{items:[record(22)]}:record(22)));h.toggle();
  if(transition==='other-case'){h.back();await open(h,1);}else if(transition==='actor'){h.setActor(202);await h.settle();}else h.unmount();
  const focused=h.focused;pending.reject(Error('SYNTHETIC_OLD_PATCH405'));if(transition==='unmount'){for(let i=0;i<24;i++)await Promise.resolve();}else await h.settle();
  assert.equal(h.focused,focused);assert.notEqual(h.focused,old);assert.equal(h.focusListeners,0);h.unmount();
 }
});
test('detail focuses its heading once and Back restores the exact originating card',async()=>{
 const h=harness();await ready(h);assert.deepEqual(h.focusTrace,[]);await open(h,1);
 assert.deepEqual(h.focusTrace,['detail-heading']);h.setLocale('ja');assert.deepEqual(h.focusTrace,['detail-heading']);
 h.setHandler(async()=>({...record(22),notifications_enabled:false}));h.toggle();await h.settle();assert.deepEqual(h.focusTrace,['detail-heading']);
 h.back();assert.deepEqual(h.focusTrace,['detail-heading','card:22']);h.setHandler(async p=>record(Number(p.split('/').at(-1))));await open(h,0);h.back();
 assert.deepEqual(h.focusTrace,['detail-heading','card:22','detail-heading','card:11']);h.unmount();
});
test('late old detail completion never focuses a detached heading or another actor card',async()=>{
 const h=harness();await ready(h);const pending=deferred();h.setHandler(()=>pending.promise);h.cards()[1].props.onClick();h.render();
 h.setHandler(async()=>({items:[record(11)]}));h.setActor(202);await h.settle();pending.resolve(record(22));await h.settle();
 assert.deepEqual(h.focusTrace,[]);assert.equal(h.cards().length,1);h.unmount();
});
const lifecycleCodes=['NOT_ISSUED','ISSUED_NOT_ACTIVATED','ACTIVE','EXPIRING','EXTENSION_PROCESSING','EXTENDED','EXPIRED','CANCELLED','REFUSED'] as const;
for(const locale of locales)test('all nine customer detail headings use accepted neutral labels; raw codes stay in details: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const code of lifecycleCodes){
  const selected={...record(11),lifecycle_status:code},before=JSON.stringify(selected);
  const html=seedRender({ui,selected}),label=acceptedHeadingLabel(code,locale);
  assert.notEqual(label,code);assert.ok(html.includes(detailHeadingMarkup(code,label)));
  assert.ok(html.includes('<code>'+escape(code)+'</code>'));assert.equal(JSON.stringify(selected),before);
 }
});
for(const yoga of [false,true])for(const locale of ['ru','en'] as const)test('unbound RUEN and Yoga detail headings reuse existing labels without foreign bindings: '+yoga+' '+locale,()=>{
 for(const code of lifecycleCodes){
  const html=seedRender({yoga,locale,selected:{...record(11),lifecycle_status:code}});
  assert.ok(html.includes(detailHeadingMarkup(code,acceptedHeadingLabel(code,locale))));
  assert.ok(html.includes('<code>'+escape(code)+'</code>'));
 }
});
test('unknown detail statuses keep exact escaped characters and semantic underscore breakpoints',()=>{
 for(const code of ['FUTURE_LONG_STATUS','<UNKNOWN_&STATUS>']){
  for(const locale of locales){
   const html=seedRender({ui:createClientUiBindings(locale),selected:{...record(11),lifecycle_status:code}});
   assert.ok(html.includes(detailHeadingMarkup(code)));
  }
  for(const yoga of [false,true])for(const locale of ['ru','en'] as const)
   assert.ok(seedRender({yoga,locale,selected:{...record(11),lifecycle_status:code}}).includes(detailHeadingMarkup(code)));
 }
});
test('heading language changes preserve stored data, focus-once, Back target and zero mutations',async()=>{
 const item=record(11),before=JSON.stringify(item),h=harness();
 h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[item]}:item);await ready(h);await open(h);
 const reads=h.calls.length;
 for(const locale of locales){h.setLocale(locale);assert.equal(text(nodes(h.tree).find(n=>n.type==='h1')),acceptedHeadingLabel(item.lifecycle_status,locale));}
 assert.equal(h.calls.length,reads);assert.equal(h.calls.filter(c=>c.options?.method).length,0);
 assert.equal(JSON.stringify(item),before);assert.deepEqual(h.focusTrace,['detail-heading']);
 h.back();assert.deepEqual(h.focusTrace,['detail-heading','card:11']);h.unmount();
});
test('read A/B reverse completion and mismatched response id cannot replace active card',async()=>{
 const h=harness();await ready(h);const cards=h.cards(),a=deferred(),b=deferred();h.setHandler(p=>p.endsWith('/11')?a.promise:b.promise);
 cards[0].props.onClick();cards[1].props.onClick();h.render();b.resolve(record(22));await h.settle();a.resolve(record(11));await h.settle();assert.ok(text(h.tree).includes('RAW_MANAGER_ACTION'));
 h.toggle();assert.ok(h.calls.at(-1)!.path.includes('/22/notifications'));
 h.unmount();
 const wrong=harness();await ready(wrong);wrong.setHandler(async()=>record(22));await open(wrong);assert.equal(wrong.tree.props.role,'alert');assert.equal(text(wrong.tree).includes('RAW_MANAGER_ACTION'),false);
});
for(const outcome of ['success','rejection'] as const)test('late write A '+outcome+' after Back/B never returns old card/message/date',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11),record(22)]}:{...record(Number(p.split('/').at(-1))),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');
 const pending=deferred();h.setHandler((p,o)=>o?.method?pending.promise:Promise.resolve(record(22)));h.toggle();h.back();await open(h,1);
 assert.equal(h.input()?.props.value,undefined); // entered_on is already set on B
 outcome==='success'?pending.resolve({...record(11),notifications_enabled:false}):pending.reject(Error('PRIVATE_ERROR'));
 await h.settle();assert.equal(h.message(),undefined);h.toggle();assert.ok(h.calls.at(-1)!.path.includes('/22/notifications'));h.unmount();
});
test('A/B/A same case id has a new generation and stale finally cannot unlock a new write',async()=>{
 const h=harness();await ready(h);await open(h);const a=deferred(),b=deferred();let writes=0;
 h.setHandler((p,o)=>o?.method?(++writes===1?a.promise:b.promise):Promise.resolve(record(11)));
 h.toggle();h.back();await open(h);h.toggle();a.resolve({...record(11),notifications_enabled:false});await h.settle();
 assert.equal(h.message(),undefined);h.toggle();assert.equal(writes,2);b.resolve({...record(11),notifications_enabled:false});await h.settle();assert.ok(h.message());h.unmount();
});
test('actor replacement and same-actor logout/remount reject old success/error/finally',async()=>{
 for(const remount of [false,true])for(const outcome of ['success','error']){
  const h=harness();await ready(h);await open(h);const pending=deferred();h.setHandler((p,o)=>o?.method?pending.promise:Promise.resolve({items:[record(22)]}));h.toggle();
  remount?h.remount():h.setActor(202);await h.settle();outcome==='success'?pending.resolve(record(11)):pending.reject(Error('OLD_PRIVATE'));
  await h.settle();assert.equal(h.message(),undefined);assert.equal(h.cards().length,1);assert.equal(text(h.tree).includes('OLD_PRIVATE'),false);h.unmount();
 }
});
test('language switch during write preserves contact locale/request and displays current-language semantic result',async()=>{
 const h=harness();await ready(h);await open(h);const pending=deferred();h.setHandler(()=>pending.promise);h.toggle();h.setLocale('ja');pending.resolve({...record(11),notifications_enabled:false});await h.settle();
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/web/visa-cases/11/notifications');assert.equal(writes[0].options!.method,'PATCH');assert.equal(writes[0].options!.headers?.['X-CSRF-Token' as keyof HeadersInit],'SYNTHETIC_CSRF');assert.deepEqual(JSON.parse(String(writes[0].options!.body)),{enabled:false});assert.equal(h.props.locale,'en');assert.equal(text(h.message()),clientVisaLifeText(createClientUiBindings('ja'),(prefix+'saved') as ClientVisaLifeKey));h.unmount();
});
test('preview checks the write entrance, including direct invocation of disabled handler',async()=>{
 const h=harness({preview:true});h.setUi(undefined);await ready(h);await open(h);h.toggle();assert.equal(h.calls.filter(c=>c.options?.method).length,0);h.unmount();
});
test('retained callbacks cannot write after unmount/actor replacement or a new same-id selection',async()=>{
 for(const transition of ['unmount','actor','same-id']){
  const h=harness();await ready(h);await open(h);
  const retained=nodes(h.tree).find(n=>n.type==='article'&&n.props.className==='visa-detail-card visa-toggle').props.children[1].props.onClick;
  if(transition==='unmount')h.unmount();else if(transition==='actor')h.setActor(202);else{h.back();await open(h);}
  retained();assert.equal(h.calls.filter(c=>c.options?.method).length,0);h.unmount();
 }
});
test('entry POST remains one existing idempotent call and rejects duplicate events before rerender',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[{...record(11),entered_on:null}]}:{...record(11),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');const pending=deferred();h.setHandler(()=>pending.promise);
 const form=nodes(h.tree).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});h.render();
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/web/visa-cases/11/entry');assert.equal(writes[0].options?.method,'POST');const body=JSON.parse(String(writes[0].options?.body));assert.equal(body.entered_on,'2026-10-18');assert.match(body.idempotency_key,/^[0-9a-f-]{36}$/);pending.resolve(record(11));await h.settle();h.unmount();
});

for(const locale of locales)for(const apiPrefix of ['/api/web','/mini-app'] as const)test('entry response updates provisional date/ring in place with self-report provenance '+locale+' '+apiPrefix,async()=>{
 const h=harness();h.props.apiPrefix=apiPrefix;h.setLocale(locale);
 const before={...record(11),entered_on:null,stay_end:null,expected_stay_end:null,lifecycle_status:'ISSUED_NOT_ACTIVATED'};
 h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[before]}:before);await ready(h);await open(h);h.entry('2026-10-18');
 const slot={purpose:'INITIAL' as const,state:'READY' as const,estimated:true as const,provenance:'administrator_provisional' as const,confirmation_required:true,
  base:'2026-10-18',estimated_end:'2027-10-18',base_provenance:'client_report' as const,calculated_from_entry_report:true,
  rule:{rule_id:'provisional:'+'a'.repeat(64),version:1,variant_id:'manual-initial-day-365',unit:'day' as const,duration:365,counting_policy:'base_excluded' as const,month_end_policy:'clamp' as const}};
 const after:VisaCase={...before,version:2,entered_on:'2026-10-18',stay_estimates:{initial:slot,extension:{purpose:'EXTENSION',state:'NOT_SELECTED',estimated:true,base:null,estimated_end:null}},stay_reports:{entry_provenance:'client_report',extension:null}};
 h.setHandler(async()=>after);h.submit();await h.settle();
 const ring=nodes(h.tree).find(n=>n.props?.className==='visa-stay-ring is-estimated');assert.ok(ring);
 assert.ok(nodes(ring).some(n=>n.type==='circle'&&n.props.className==='visa-stay-arc'));
 const displayed=nodes(h.tree).find(n=>n.props?.className==='visa-dates');
 assert.ok(text(displayed).includes(presentation.clientVisaFormatDate('2027-10-18',h.props.ui,'')));
 assert.ok(text(displayed).includes(presentation.clientVisaDatePresentation(after,h.props.ui)!.label));
 assert.ok(nodes(h.tree).some(n=>n.props?.['data-entry-provenance']==='client_report'));
 assert.ok(text(h.tree).includes(clientVisaStayCopy(h.props.ui,'en').unverified));assert.equal(h.input(),undefined);
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,1);assert.equal(writes[0].path,apiPrefix+'/visa-cases/11/entry');
 assert.deepEqual(Object.keys(JSON.parse(String(writes[0].options!.body))).sort(),['entered_on','expected_version','idempotency_key']);
 assert.equal(after.stay_end,null);assert.equal(after.lifecycle_status,'ISSUED_NOT_ACTIVATED');h.unmount();
});
test('new selection clears prior entry date and failed mutation message',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11),record(22)]}:{...record(Number(p.split('/').at(-1))),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');h.setHandler(async()=>{throw Error('WRITE_FAILURE');});h.toggle();await h.settle();assert.ok(h.message());h.back();h.setHandler(async()=>({...record(22),entered_on:null}));await open(h,1);assert.equal(h.input().props.value,'');assert.equal(h.message(),undefined);h.unmount();
});
test('failed or unknown entry outcome retains the exact key/body through a retry',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[{...record(11),entered_on:null}]}:{...record(11),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');
 h.setHandler(async()=>{throw new Error('SYNTHETIC_UNKNOWN_OUTCOME');});h.submit();await h.settle();assert.ok(h.message());
 h.setHandler(async()=>({...record(11),version:2,entered_on:'2026-10-18'}));h.submit();await h.settle();
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,2);
 assert.equal(writes[0].options!.body,writes[1].options!.body);
 assert.equal(JSON.parse(String(writes[1].options!.body)).expected_version,1);
 assert.equal(h.input(),undefined);h.unmount();
});
test('terminal/unissued and legacy unversioned details expose no entry submit',async()=>{
 for(const lifecycle_status of ['NOT_ISSUED','EXPIRED','CANCELLED','REFUSED']){
  const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11)]}:{...record(11),entered_on:null,lifecycle_status});await ready(h);await open(h);assert.equal(nodes(h.tree).some(n=>n.type==='form'&&n.props['data-stay-action']==='entry'),false);h.unmount();
 }
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11)]}:{...record(11),version:undefined,entered_on:null});await ready(h);await open(h);assert.equal(nodes(h.tree).some(n=>n.type==='form'&&n.props['data-stay-action']==='entry'),false);h.unmount();
});
test('retained entry submit never prepares or sends after selection generation changes',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11)]}:{...record(11),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');
 const submit=nodes(h.tree).find(n=>n.type==='form').props.onSubmit;h.back();await open(h);
 submit({preventDefault(){}});assert.equal(h.calls.filter(c=>c.options?.method).length,0);h.unmount();
});
for(const apiPrefix of ['/api/web','/mini-app'] as const)test('extension report exact retry/duplicate click and confirmed expiry remain separate '+apiPrefix,async()=>{
 const h=harness();h.props.apiPrefix=apiPrefix;await ready(h);await open(h);
 const change=(name:string,value:string)=>{if(name==='extension_kind')nodes(h.tree).find(n=>n.props?.['data-extension-kind']===value).props.onClick();else nodes(h.tree).find(n=>n.props?.name===name).props.onChange({target:{value}});h.render();};
 change('extension_kind','RECEIVED');change('reported_on','2026-10-18');change('reported_stay_end','2027-12-01');
 change('extension_kind','RECEIVED');assert.equal(nodes(h.tree).find(n=>n.props?.name==='reported_stay_end').props.value,'2027-12-01');
 const form=()=>nodes(h.tree).find(n=>n.type==='form'&&n.props['data-stay-action']==='extension');
 const p=deferred();h.setHandler(()=>p.promise);const submit=form().props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});h.render();assert.equal(h.calls.filter(c=>c.options?.method).length,1);
 p.reject(Error('UNKNOWN_OUTCOME'));await h.settle();assert.equal(text(h.message()),clientVisaStayCopy(h.props.ui,'en').unconfirmed);
 h.setHandler(async()=>({...record(11),version:2,stay_reports:{entry_provenance:'legacy_unknown',extension:{kind:'RECEIVED',reported_on:'2026-10-18',reported_stay_end:'2027-12-01',provenance:'client_report',verified:false}}}));
 form().props.onSubmit({preventDefault(){}});h.render();await h.settle();
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,2);assert.equal(writes[0].options!.body,writes[1].options!.body);assert.equal(writes[0].path,apiPrefix+'/visa-cases/11/extension-report');
 assert.deepEqual(Object.keys(JSON.parse(String(writes[0].options!.body))).sort(),['expected_version','idempotency_key','kind','reported_on','reported_stay_end']);
 const tree=renderToStaticMarkup(h.tree);assert.ok(tree.includes('data-visa-stay-controls="v1"'));assert.ok(text(h.tree).includes(clientVisaStayCopy(h.props.ui,'en').unverified));
 // New reported end is displayed as unverified only. Confirmed countdown still
 // uses original2026-12-01, never reported2027-12-01.
 const ring=nodes(h.tree).find(n=>n.props?.className==='visa-stay-ring');assert.ok(ring);const summary=nodes(h.tree).find(n=>n.props?.className==='visa-dates');assert.ok(text(summary).includes(presentation.clientVisaFormatDate('2026-12-01',h.props.ui,'')));
 h.unmount();
});
test('extension stale callbacks do not edit a new selection or send; refresh preserves visible draft',async()=>{
 const h=harness();await ready(h);await open(h);
 nodes(h.tree).find(n=>n.props?.name==='reported_on').props.onChange({target:{value:'2026-10-18'}});h.render();
 const form=nodes(h.tree).find(n=>n.type==='form'&&n.props['data-stay-action']==='extension');
 const retainedInput=nodes(h.tree).find(n=>n.props?.name==='reported_on').props.onChange;
 const refresh=nodes(h.tree).find(n=>n.type==='button'&&text(n)===clientVisaStayCopy(h.props.ui,'en').refresh);refresh.props.onClick();h.render();await h.settle();
 assert.equal(nodes(h.tree).find(n=>n.props?.name==='reported_on').props.value,'2026-10-18');
 form.props.onSubmit({preventDefault(){}});retainedInput({target:{value:'2026-10-19'}});h.render();assert.equal(h.calls.filter(c=>c.options?.method).length,0);
 assert.equal(nodes(h.tree).find(n=>n.props?.name==='reported_on').props.value,'2026-10-18');h.unmount();
});
for(const deliberateMove of [false,true])test('stay entry removal recovers only lost focus, deliberateMove='+deliberateMove,async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11)]}:{...record(11),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');h.focusStay('entry');
 const p=deferred();h.setHandler(()=>p.promise);h.submit();assert.equal(h.focused,h.body);
 if(deliberateMove)h.focusForeign('intentional-other');
 p.resolve({...record(11),version:2,entered_on:'2026-10-18'});await h.settle();
 assert.equal(h.focusTrace.filter(x=>x==='stay-heading').length,deliberateMove?0:1);assert.equal(h.focusListeners,0);h.unmount();
});
test('fully batched immediate stay failures clean listeners on every retry without stealing focus',async()=>{
 const h=harness();h.setHandler(async p=>p.endsWith('/visa-cases')?{items:[record(11)]}:{...record(11),entered_on:null});await ready(h);await open(h);h.entry('2026-10-18');h.focusStay('entry');
 h.setHandler(async()=>{throw Error('IMMEDIATE_FAILURE');});
 for(let i=0;i<2;i++){
  nodes(h.tree).find(n=>n.type==='form'&&n.props['data-stay-action']==='entry').props.onSubmit({preventDefault(){}});
  await h.settle();assert.equal(h.focusListeners,0);assert.equal(h.focusTrace.filter(x=>x==='stay-heading').length,0);
 }
 h.unmount();
});
test('write response for a different case is rejected and does not replace visible/current list',async()=>{
 const h=harness();await ready(h);await open(h);h.setHandler(async()=>record(22));h.toggle();await h.settle();
 assert.equal(text(h.message()),clientVisaLifeText(createClientUiBindings('ar'),(prefix+'failed') as ClientVisaLifeKey));
 h.setHandler(async()=>record(11));h.toggle();assert.ok(h.calls.at(-1)!.path.includes('/11/notifications'));h.unmount();
});
test('late read rejection after unmount and a retained list handler start no new request',async()=>{
 const h=harness();await ready(h);const cards=h.cards(),pending=deferred();h.setHandler(()=>pending.promise);cards[0].props.onClick();h.render();h.unmount();
 const count=h.calls.length;cards[1].props.onClick();assert.equal(h.calls.length,count);pending.reject(Error('PRIVATE_OLD_READ'));await Promise.resolve();await Promise.resolve();
});
test('Yoga callbacks keep the existing nested API input and receive no foreign binding',async()=>{
 const h=harness({yoga:true});h.props.apiPrefix='/mini-app';await ready(h);await open(h);h.setHandler(async()=>({...record(11),notifications_enabled:false}));h.toggle();await h.settle();
 const writes=h.calls.filter(c=>c.options?.method);assert.equal(writes.length,1);assert.equal(writes[0].path,'/mini-app/visa-cases/11/notifications');assert.equal(h.props.ui,undefined);assert.equal(h.props.locale,'en');h.unmount();
});
for(const locale of locales)test('API error uses existing source-backed copy without private exception disclosure: '+locale,()=>{
 const ui=createClientUiBindings(locale),error=new ApiError('RAW_SECRET_NOT_FOR_UI',{kind:'authentication'});
 const html=seedRender({state:'error',error,ui});assert.ok(html.includes(escape(ui.text('api.error.authentication'))));assert.equal(html.includes('RAW_SECRET_NOT_FOR_UI'),false);
});
