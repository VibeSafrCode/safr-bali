import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import ts from 'typescript';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {createHash} from 'node:crypto';
import * as presentation from '../src/i18n/client-life-presentation';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import * as core from '../src/components/lifeServices';
import * as pricing from '../src/components/lifePriceDisplay';
import * as progress from '../src/components/lifeProgress';
import * as countPresentation from '../src/i18n/client-life-counts';
import * as visaPresentation from '../src/i18n/client-visa-presentation';
const app=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(path.join(app,'package.json'));
const baselineRoot=process.env.SAFR_LIFE_BASELINE_ROOT??path.resolve(app,'../../../baseline/06 Development/react-app/src');
for(const [name,expected] of Object.entries({BaliLifeCabinet:'d3682f406737598a90f6e5b328e489a6e3670076390007fddd1ee8e0deef4601',LifeReminderPreference:'bbdb6cefc5d9cd239c1830e2df08003bb79772dab75ced50db8f70447cf3a131'}))
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(baselineRoot,'components',name+'.tsx'))).digest('hex'),expected,'Pinned original baseline '+name);
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const prefix='source:06 Development/react-app/src/components/lifeServices.ts#';
const item={id:11,user_id:101,kind:'housing',housing_type:'villa',title:'RAW_MANAGER_TITLE',description:'RAW_MANAGER_COPY',start_date:'2026-10-01',end_date:'2026-11-01',notifications_enabled:true,notification_unavailable_reason:null,price_amount:'1000000.50',price_currency:'IDR',price_unit:'period',publication_status:'PUBLISHED',version:1} as core.LifeService;
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
const nodes=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const text=(v:any):string=>v==null||typeof v==='boolean'?'':Array.isArray(v)?v.map(text).join(''):typeof v==='object'?text(v.props?.children):String(v);
function loader(options:{baseline?:boolean;yoga?:boolean;preview?:boolean;react?:typeof React;request?:(p:string,o:RequestInit)=>Promise<any>}={}){
 const cache=new Map<string,any>(),root=options.baseline?baselineRoot:path.join(app,'src');
 function load(name:string):any{const file=path.join(root,'components',name+'.tsx');if(cache.has(file))return cache.get(file);const exports:any={};cache.set(file,exports);
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(id:string):any=>{
   if(id==='react')return options.react??React;if(id==='react/jsx-runtime')return require(id);if(id.endsWith('.css'))return{};
   if(id==='../api/account-preview')return{isAccountPreview:()=>options.preview===true};
   if(id==='../api/client')return{appApiClient:()=>({request:options.request??(()=>{throw Error('NO_REAL_API');})})};
   if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:options.yoga===true,yogaReadDeadline:()=>{throw Error('SSR_EFFECT_NOT_ALLOWED');}};
   if(id==='../i18n/client-ui-bindings')return{requireClientUiBindings:(value:any)=>{createClientUiBindings('ru');return requireBinding(value);}};
   if(id==='../i18n/client-life-presentation')return presentation;
   if(id==='../i18n/client-life-counts')return countPresentation;
   if(id==='../i18n/client-visa-presentation')return visaPresentation;
   if(id==='./lifeServices')return core;if(id==='./lifePriceDisplay')return pricing;if(id==='./lifeProgress')return progress;
   if(id==='../pricing/runtime')return{usePricing:()=>({projection:null,refresh:async()=>{}})};
   if(id==='../ui/client-brand')return{clientBrand:{name:options.yoga?'Yoga Ganster':'SAFRWAY'}};
   if(id==='./LifeReminderPreference')return load('LifeReminderPreference');
   if(id==='./VisaStatusHelp')return{VisaStatusHelp:()=>null};if(id==='./ClientVisaStatusHelp')return{ClientVisaStatusHelp:()=>null};if(id==='./visaDatePresentation')return{visaDatePresentation:()=>null};
   throw Error('UNEXPECTED_LIFE_FIXTURE_IMPORT '+id);
  };
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:file})(scoped,{exports},exports);return exports;
 }return load;
}
import {requireClientUiBindings as requireBinding} from '../src/i18n/client-ui-bindings';
for(const locale of locales)test('Life ready helper values/date boundaries replay accepted source: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const kind of ['housing','bike','insurance','other'] as const)for(const boundary of ['start','end'] as const){
  const expected=kind==='other'?clientVisaLifeText(ui,('inline:06 Development/react-app/src/components/lifeServices.ts#'+(boundary==='start'?'b592fe33e88f':'98dc8b09d5a0')) as ClientVisaLifeKey):presentation.clientLifeText(ui,kind==='housing'?(boundary==='start'?'housingStart':'housingEnd'):kind==='bike'?(boundary==='start'?'bikeStart':'bikeEnd'):boundary==='start'?'start':'end');
  assert.equal(presentation.clientLifeDateLabel(kind,boundary,ui),expected);
  if(locale==='ru'||locale==='en')assert.equal(expected,core.lifeDateLabel(kind,boundary,locale));
 }
 for(const kind of ['housing','bike','insurance','other'] as const)for(const [start,end]of [['2026-10-01','2026-10-16'],['2026-10-01','2026-10-15'],['2026-10-17','2026-11-01'],['2026-10-01',null],[null,'2026-11-01']] as const){
  const record={...item,kind,start_date:start,end_date:end},legacy=core.lifeStatus(record,'2026-10-16','ru');
  const key=(['housingToday','bikeToday','today','ended','upcoming','endOnly','currentLabel'] as const).find(k=>core.lifeCopy.ru[k]===legacy);assert.ok(key);
  assert.equal(presentation.clientLifeStatus(record,'2026-10-16',ui),presentation.clientLifeText(ui,key));
 }
 const expectedDate=locale==='ru'||locale==='en'?core.formatLifeDate('2026-10-16',locale):new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Makassar'}).format(new Date('2026-10-16T12:00:00+08:00'));
 assert.equal(presentation.formatClientLifeDate('2026-10-16',ui),expectedDate);
 for(const invalid of [null,'','not-a-date','2026/10/16'])assert.equal(presentation.formatClientLifeDate(invalid,ui),presentation.clientLifeText(ui,'unknown'));
 for(const housing_type of ['guesthouse','hotel','apartment','villa'] as const)assert.equal(presentation.clientLifeRentalSummary({...item,housing_type},ui),clientVisaLifeText(ui,(prefix+'names.'+housing_type) as ClientVisaLifeKey));
 for(const quantity of [0,1,2,11,101])for(const kind of ['bike','other'] as const)assert.equal(presentation.clientLifeRentalSummary({...item,kind,quantity},ui),clientVisaLifeText(ui,'inline:06 Development/react-app/src/components/lifeServices.ts#f834793c5945',{item_quantity____1:quantity}));
 assert.equal(presentation.clientLifeRentalSummary({...item,kind:'insurance'},ui),null);
});
for(const locale of locales)test('actual reminder SSR consumes all ready visible states: '+locale,()=>{
 const load=loader(),ui=createClientUiBindings(locale);for(const reason of ['disabled','no_end_date','not_current',null] as const){
  const html=renderToStaticMarkup(React.createElement(load('LifeReminderPreference').LifeReminderPreference,{item:{...item,end_date:reason==='no_end_date'?null:item.end_date,notification_unavailable_reason:reason},apiPrefix:'/api/web',locale:'en',ui,onSaved(){}}));
  assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+ui.dir+'"'));assert.ok(html.includes(escape(presentation.clientLifeReminderText(ui,'label'))));
  if(reason)assert.ok(html.includes(escape(presentation.clientLifeReminderText(ui,reason==='no_end_date'?'noEndDate':reason==='not_current'?'notCurrent':'disabled'))));
 }
});
for(const yoga of [false,true])for(const locale of ['ru','en'] as const)test('legacy reminder/Life loading/Entry SSR exact yoga='+yoga+' '+locale,()=>{
 for(const name of ['LifeReminderPreference','BaliLifeEntry','BaliLifeCabinet']){
  const render=(baseline:boolean)=>{const load=loader({baseline,yoga});return renderToStaticMarkup(React.createElement(load(name==='LifeReminderPreference'?name:'BaliLifeCabinet')[name],{item,apiPrefix:'/mini-app',locale,userId:101,onSaved(){},onOpen(){},onOpenVisas(){},onManager(){}}));};
  assert.equal(render(false),render(true));
 }
});
test('all Life scalar properties are source-backed and the explicit Main parent accepts foreign bindings',()=>{
 for(const locale of locales.filter(l=>l!=='ru'&&l!=='en')){
  const ui=createClientUiBindings(locale),copy=presentation.clientLifeCopies(ui);
  for(const key of Object.keys(core.lifeCopy.ru) as (keyof typeof core.lifeCopy.ru)[])
   assert.equal(copy[key],clientVisaLifeText(ui,(prefix+'lifeCopy.'+key) as ClientVisaLifeKey));
  const html=renderToStaticMarkup(React.createElement(loader()('BaliLifeCabinet').BaliLifeCabinet,{apiPrefix:'/api/web',userId:101,locale:'en',ui}));
  assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes(escape(copy.loading)));
 }
 for(const locale of ['ru','en'] as const)assert.deepEqual(presentation.clientLifeCopies(createClientUiBindings(locale)),core.lifeCopy[locale]);
});
test('forged/preview bindings cannot activate customer Life/reminder',()=>{
 for(const fake of [{},Object.create(createClientUiBindings('ar')),{...createClientUiBindings('ar')}])assert.throws(()=>presentation.clientLifeText(fake as never,'title'),/BINDING_ROLE_OR_PROVENANCE/);
 for(const name of ['LifeReminderPreference','BaliLifeCabinet'])assert.throws(()=>loader({preview:true})(name)[name]({item,ui:createClientUiBindings('ru'),userId:101,apiPrefix:'/api/web'}),/PREVIEW_BOUNDARY/);
});
function reminderHarness({preview=false,yoga=false}={}){
 let slots:any[]=[],index=0,mounted=true,cleanup:any,pendingEffect:any,effectSeen=false,key:any,tree:any;const calls:any[]=[],saved:any[]=[];let locale:typeof locales[number]='ar',props:any={item:{...item},apiPrefix:'/api/web',locale:'en',csrfToken:'SYNTHETIC_CSRF'},handler:((p:string,o:RequestInit)=>Promise<any>)=async()=>({...props.item,notifications_enabled:false});
 const react={...React,useState:(initial:any)=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;const own=slots;return[slots[i],(value:any)=>{if(mounted&&slots===own)own[i]=typeof value==='function'?value(own[i]):value;}];},useRef:(value:any)=>{const i=index++;return slots[i]??(slots[i]={current:value});},useEffect:(fn:any)=>{if(!effectSeen){effectSeen=true;pendingEffect=fn;}}} as typeof React;
 const load=loader({preview,yoga,react,request:(p,o)=>{calls.push({path:p,options:o});return handler(p,o);}});
 function render(){const root=load('LifeReminderPreference').LifeReminderPreference({...props,ui:yoga?undefined:createClientUiBindings(locale),onSaved:(value:any)=>saved.push(value)});if(root.key!==key){cleanup?.();slots=[];key=root.key;cleanup=undefined;effectSeen=false;pendingEffect=undefined;}index=0;tree=root.type(root.props);if(pendingEffect){cleanup=pendingEffect();pendingEffect=undefined;}return tree;}
 function mount(){render();}
 return{props,calls,saved,render,mount,setLocale:(value:typeof locales[number])=>locale=value,setHandler:(value:typeof handler)=>handler=value,unmount(){cleanup?.();mounted=false;},async settle(){for(let i=0;i<16;i++)await Promise.resolve();render();},toggle(){const checkbox=nodes(tree).find(n=>n.type==='input');checkbox.props.onChange();},get tree(){return tree;}};
}
for(const yoga of [false,true])test('reminder callback uses one exact existing PATCH and no auth/locale preflight yoga='+yoga,async()=>{
 const h=reminderHarness({yoga});h.mount();h.toggle();if(!yoga)h.toggle();await h.settle();assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].path,'/api/web/life-services/11/notifications');assert.equal(h.calls[0].options.method,'PATCH');assert.deepEqual(JSON.parse(h.calls[0].options.body),{enabled:false});assert.equal(h.calls[0].options.headers['X-CSRF-Token'],'SYNTHETIC_CSRF');assert.equal(h.saved.length,1);h.unmount();
});
test('reminder captured failure follows new locale; raw API cause never rendered',async()=>{
 const h=reminderHarness();h.setHandler(async()=>{throw Error('PRIVATE_CAUSE');});h.mount();h.toggle();await h.settle();assert.ok(text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'error')));h.setLocale('ja');h.render();assert.ok(text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ja'),'error')));assert.ok(!text(h.tree).includes('PRIVATE_CAUSE'));h.unmount();
});
test('reminder preview programmatic callback sends nothing',async()=>{
 const h=reminderHarness({preview:true,yoga:true});h.mount();h.toggle();await h.settle();assert.equal(h.calls.length,0);h.unmount();
});
test('foreign response record cannot be saved under Main customer UI',async()=>{
 const h=reminderHarness();h.setHandler(async()=>({...item,user_id:202}));h.mount();h.toggle();await h.settle();assert.equal(h.saved.length,0);assert.ok(text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'error')));h.unmount();
});
for(const notifications_enabled of [undefined,true])test('Main reminder does not confirm missing/opposite response preference: '+String(notifications_enabled),async()=>{
 const h=reminderHarness();h.setHandler(async()=>({...item,version:2,notifications_enabled}));h.mount();h.toggle();await h.settle();
 assert.equal(h.calls.length,1);assert.deepEqual(JSON.parse(h.calls[0].options.body),{enabled:false});assert.equal(h.saved.length,0);
 assert.ok(text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'error')));
 assert.ok(!text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'saved')));h.unmount();
});
test('Main record/actor key change fences late old save and keeps new record untouched',async()=>{
 let resolve!:(v:any)=>void;const wait=new Promise<any>(yes=>resolve=yes);const h=reminderHarness();h.setHandler(()=>wait);h.mount();h.toggle();
 h.props.item={...item,id:22,user_id:202};h.render();resolve({...item,notifications_enabled:false});await h.settle();assert.equal(h.saved.length,0);assert.equal(nodes(h.tree).find(n=>n.type==='input').props.checked,true);h.unmount();
});
test('unmounted reminder never calls onSaved after a late PATCH response',async()=>{
 let resolve!:(v:any)=>void;const wait=new Promise<any>(yes=>resolve=yes);const h=reminderHarness();h.setHandler(()=>wait);h.mount();h.toggle();h.unmount();resolve({...item,notifications_enabled:false});for(let i=0;i<16;i++)await Promise.resolve();assert.equal(h.saved.length,0);
});
test('same-record refresh v3 fences old PATCH v2 without false Saved/rollback claim',async()=>{
 let resolve!:(v:any)=>void;const wait=new Promise<any>(yes=>resolve=yes);const h=reminderHarness();h.setHandler(()=>wait);h.mount();h.toggle();
 h.props.item={...item,version:3,title:'NEW_MANAGER_TITLE',price_amount:'2500000.00'};h.render();resolve({...item,version:2,notifications_enabled:false});await h.settle();assert.equal(h.saved.length,0);assert.ok(!text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'saved')));assert.ok(!text(h.tree).includes(presentation.clientLifeReminderText(createClientUiBindings('ar'),'error')));assert.equal(nodes(h.tree).find(n=>n.type==='input').props.disabled,false);h.unmount();
});
test('parent functional adoption preserves newer manager fields and only accepts same-record nonstale response',()=>{
 const ui=createClientUiBindings('ar'),latest={...item,version:3,title:'NEW_MANAGER_TITLE',price_amount:'2500000.00'};
 for(const next of [{...item,version:2},{...item,version:4,user_id:202},{...item,version:4,id:99},{...item,version:NaN}])assert.equal(presentation.clientLifeReminderUpdate(latest,next,ui),latest);
 const accepted={...latest,version:4,notifications_enabled:false};assert.equal(presentation.clientLifeReminderUpdate(latest,accepted,ui),accepted);
});

// A cached-ready render fixture, not a browser/session/API transport claim.
function readyLife({locale='en',ui,baseline=false,selectedKey=null,life,visas=[]}:{locale?:'ru'|'en';ui?:ReturnType<typeof createClientUiBindings>;baseline?:boolean;selectedKey?:string|null;life:core.LifeService[];visas?:any[]}){
 let index=0;const slots:any[]=[{life,visas},'all',selectedKey,'ready',false,'2026-10-16'];
 const react={...React,useState:(initial:any)=>{const i=index++;return[i in slots?slots[i]:typeof initial==='function'?initial():initial,()=>{}];},useRef:(value:any)=>({current:value}),useEffect:()=>{}} as typeof React;
 const load=loader({baseline,react});
 const outer=load('BaliLifeCabinet').BaliLifeCabinet({apiPrefix:'/api/web',userId:101,locale,ui,onOpenVisas(){},onManager(){},onBack(){}});
 const tree=outer.type(outer.props);
 return {tree,html:()=>renderToStaticMarkup(tree)};
}
const readyRecords:core.LifeService[]=[
 {...item,id:11,start_date:'2026-10-16',end_date:'2026-10-18',public_contact:'RAW_CONTACT',description:'RAW_MANAGER_DESCRIPTION'},
 {...item,id:12,kind:'bike',start_date:'2026-10-18',end_date:'2026-10-20',quantity:2},
 {...item,id:13,kind:'insurance',start_date:'2026-10-12',end_date:'2026-10-14',price_currency:'USD',price_unit:'policy'},
 {...item,id:14,kind:'other',rental_mode:'monthly',start_date:'2026-10-01',end_date:null,price_unit:'month',quantity:1},
 {...item,id:15,kind:'other',start_date:null,end_date:null,price_amount:null},
];
for(const locale of locales)test('cached-ready Life list/detail consumes all scalar/monthly/whole-count copy: '+locale,()=>{
 const ui=createClientUiBindings(locale),before=JSON.stringify(readyRecords);
 const view=readyLife({ui,locale:locale==='ru'?'ru':'en',life:readyRecords}),html=view.html();
 assert.ok(html.includes('lang="'+locale+'"'));assert.ok(html.includes('dir="'+ui.dir+'"'));assert.ok(html.includes(escape(presentation.clientLifeText(ui,'title'))));
 if(locale!=='ru'&&locale!=='en'){
  const countdowns=nodes(view.tree).filter(n=>n.props?.className?.split(' ').includes('life-countdown')).map(n=>text(n.props.children));
  for(const key of ['life.countdown.future','life.countdown.remaining','life.countdown.expired'] as const)assert.ok(countdowns.includes(countPresentation.clientLifeCountText(ui,key,2)),key);
  assert.ok(html.includes(escape(countPresentation.clientLifeCountText(ui,'life.termDays',2))));
  assert.ok(html.includes(escape(presentation.clientLifeInline(ui,'monthly'))));
  assert.ok(html.includes(escape(presentation.clientLifeInline(ui,'serviceMonth'))));
 }
 for(const record of readyRecords){
  const detail=readyLife({ui,locale:locale==='ru'?'ru':'en',life:readyRecords,selectedKey:'life-'+record.id}).html();
  const agreedPrice=presentation.clientLifePrice(record,ui);if(agreedPrice)assert.ok(detail.includes(escape(agreedPrice)));
  if(record.public_contact)assert.ok(detail.includes(record.public_contact));if(record.description)assert.ok(detail.includes(record.description));
  if(record.rental_mode==='monthly')assert.ok(detail.includes(escape(presentation.clientLifeInline(ui,'monthlyNoEnd'))));
 }
 assert.equal(JSON.stringify(readyRecords),before,'Presentation must not mutate manager/customer data');
});
for(const locale of ['ru','en'] as const)test('cached-ready RUEN stays exact; bound markup reverses only1parent/1reminder lang-dir pair: '+locale,()=>{
 const same=(actual:string,expected:string,scope:string)=>{let first=0;while(first<Math.min(actual.length,expected.length)&&actual[first]===expected[first])first++;assert.ok(actual===expected,scope+' firstdiff='+first+' actual='+JSON.stringify(actual.slice(Math.max(0,first-35),first+90))+' expected='+JSON.stringify(expected.slice(Math.max(0,first-35),first+90)));};
 for(const selectedKey of [null,...readyRecords.map(r=>'life-'+r.id)]){
  const options={locale,life:readyRecords,selectedKey};
  same(readyLife(options).html(),readyLife({...options,baseline:true}).html(),'unbound');
  let bound=readyLife({...options,ui:createClientUiBindings(locale)}).html();
  const parent='<section class="bali-life page-stack" lang="'+locale+'" dir="ltr">';
  assert.equal(bound.split(parent).length,2);bound=bound.replace(parent,'<section class="bali-life page-stack">');
  if(selectedKey){const reminder='<section class="life-reminder-preference" aria-busy="false" lang="'+locale+'" dir="ltr">';assert.equal(bound.split(reminder).length,2);bound=bound.replace(reminder,'<section class="life-reminder-preference" aria-busy="false">');}
  same(bound,readyLife({...options,baseline:true}).html(),'bound after exact permitted lang-dir reverse');
 }
});
for(const locale of locales)test('Life visa date/list uses current date source; child receives same trusted UI: '+locale,()=>{
 const ui=createClientUiBindings(locale),visa={id:71,custom_visa_name:'RAW_VISA_TITLE',visa_type:{name:'RAW_VISA_NAME',code:'C1'},lifecycle_status:'ACTIVE',entered_on:'2026-10-01',entry_deadline:null,stay_end:'2026-10-18',expected_stay_end:null};
 const view=readyLife({locale:locale==='ru'?'ru':'en',ui,life:[],visas:[visa],selectedKey:'visa-71'}),date=visaPresentation.clientVisaDatePresentation(visa,ui);
 assert.ok(view.html().includes(escape(date!.label)));
 const helper=nodes(view.tree).find(n=>n.props?.kind==='visa'&&n.props?.code==='ACTIVE');assert.ok(helper);assert.equal(helper.props.ui,ui);
});
