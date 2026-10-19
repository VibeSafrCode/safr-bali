import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup,renderToPipeableStream} from 'react-dom/server';
import {Writable} from 'node:stream';
import ts from 'typescript';
import {ApiError} from '../src/api/client';
import {build} from 'vite';
import reactPlugin from '@vitejs/plugin-react';

const app=fileURLToPath(new URL('../',import.meta.url)),dev=path.resolve(app,'..');
const require=createRequire(path.join(app,'package.json'));
const base=process.env.SAFR_TEST_CATALOG_CONSUMER_BASE;
assert.ok(base&&path.isAbsolute(base),'Exact current283 baseline source required');
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
const exactText=(html:string,s:string)=>assert.ok(html.includes(escape(s)),'Missing literal customer text: '+s.slice(0,100));
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
// Synthetic viewport only; no browser/layout claim. Needed by old current283 Home.
Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});

// Actual component/data source graph + real React SSR. CSS is not executed;
// transport is a throwing stub, so this never proves API/real-auth behavior.
// Separate callback probes below mock hooks; they are NOT ReactDOM/browser QA.
function loader(root=dev,react:typeof React=React){
 const cache=new Map<string,any>();
 function load(file:string):any{
  const full=path.resolve(root,file);assert.ok(full.startsWith(root+'/'));
  if(full.endsWith('/react-app/src/api/client.ts'))return {ApiError,appApiClient(){throw Error('TEST_NETWORK_FORBIDDEN');}};
  if(full.endsWith('/src/ui/client-brand.ts'))return{isYogaBrand:false,clientBrand:{id:'safrway',name:'SAFRWAY'}};
  if(cache.has(full))return cache.get(full);
  if(full.endsWith('.css'))return {};
  if(full.endsWith('.mjs'))return require(full);
  if(full.endsWith('.json')){const value=JSON.parse(fs.readFileSync(full,'utf8'));cache.set(full,value);return value;}
  const result={exports:{} as any};cache.set(full,result.exports);
  const source=fs.readFileSync(full,'utf8'),js=ts.transpileModule(source,{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(id:string)=>{
   if(id==='react')return react;
   if(id==='react/jsx-runtime')return require(id);
   if(id.endsWith('.css'))return {}; // SSR excludes CSS, including the sparse old baseline.
   if(!id.startsWith('.'))throw new Error('UNEXPECTED_TEST_PACKAGE '+id);
   const stem=path.resolve(path.dirname(full),id),found=['','.ts','.tsx','.json'].map(ext=>stem+ext).find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
   assert.ok(found,'Missing current source dependency '+id);return load(path.relative(root,found));
  };
  const win={location:{pathname:'/account/'},localStorage:{getItem:()=>null},matchMedia:()=>({matches:false})};
  vm.runInThisContext('(function(require,module,exports,window,matchMedia,__YOGA_MINI_APP__){'+js+'\n})',{filename:full})(scoped,result,result.exports,win,win.matchMedia,false);cache.set(full,result.exports);return result.exports;
 }
 return load;
}
const load=loader(),old=loader(base);
const bindings=load('react-app/src/i18n/client-ui-bindings.ts');
const catalog=load('react-app/src/i18n/client-catalog-destination.ts');
const articles=load('react-app/src/i18n/client-catalog-runtime.ts');
const supplemental=load('react-app/src/i18n/client-catalog-journey.ts');
function render(name:string,props:any,contact:'ru'|'en'='ru',baseline=false){
 const modules=baseline?old:load;
 return renderToStaticMarkup(React.createElement(modules('react-app/src/i18n/runtime.tsx').I18nProvider,{locale:contact},React.createElement(modules('react-app/src/components/'+name+'.tsx')[name],props)));
}
const route=async(segments:string[],ui:any)=>{
 const element=React.createElement(load('react-app/src/i18n/runtime.tsx').I18nProvider,{locale:'ru'},React.createElement(load('react-app/src/components/CatalogView.tsx').CatalogView,{segments,navigate(){},onManager(){},ui}));
 return new Promise<string>((resolve,reject)=>{const chunks:Buffer[]=[],sink=new Writable({write(chunk,_enc,done){chunks.push(Buffer.from(chunk));done();}});sink.on('finish',()=>resolve(Buffer.concat(chunks).toString('utf8')));sink.on('error',reject);const stream=renderToPipeableStream(element,{onAllReady(){stream.pipe(sink);},onError:reject,onShellError:reject});});
};

test('fixed thirteen supplemental keys replay literal complete source packs; held property entirely excluded',()=>{
 const body=fs.readFileSync(path.join(dev,'shared/content/client-ui/client-catalog-journey.v1.json'));
 assert.equal(sha(body),'dbb50a6ac72438bcf1222964a01b66f37e42254db9eb3174fbc0584d1602560b');
 const entries=JSON.parse(String(body)).entries;assert.equal(Object.keys(entries).length,13);assert.ok(!Object.hasOwn(entries,'serviceCaption.property'));
 for(const locale of locales){const ui=bindings.createClientUiBindings(locale);for(const [key,value]of Object.entries(entries) as [any,any][])assert.equal(supplemental.clientJourneyText(ui,key),value[locale]);assert.equal(supplemental.clientCompactPriceLabels(ui).from.match(/\s*$/u)[0],' ');}
 assert.throws(()=>supplemental.clientJourneyText(bindings.createClientUiBindings('ar'),'constructor'));
});

for(const locale of locales)test('actual Home and all five destination/service/detail branches: '+locale,async()=>{
 const ui=bindings.createClientUiBindings(locale),home=render('HomeView',{navigate(){},onManager(){},pointsBalance:0,ui});
 assert.ok(home.includes('lang="'+locale+'"'));assert.ok(home.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));exactText(home,ui.text('home.heading'));
 for(const key of ['home.video.heading','home.video.title','home.video.description'])exactText(home,supplemental.clientJourneyText(ui,key));
 for(const d of catalog.clientActiveDestinations(locale)){
  exactText(home,d.name);const country=await route(['services',d.id],ui);exactText(country,d.name);exactText(country,ui.text('catalog.backAllDestinations'));
  const services=catalog.clientActiveServicesById(d.id,locale);
  for(const s of services){exactText(country,s.name);const list=await route(['services',d.id,s.id],ui);
   if(s.id==='insurance'){for(const brand of ['LUMA','SafetyWing'])exactText(list,brand);exactText(list,supplemental.clientJourneyText(ui,'insurance.brandLink'));}
   if(s.status==='soon')exactText(list,ui.text('catalog.soon'));
   for(const item of (s.children??[]).filter((c:any)=>!c.publiclyHidden)){
    const detail=await route(['services',d.id,s.id,item.id],ui);if(s.id!=='visas'||item.id==='other-visa')exactText(detail,item.name);
    if(item.download){for(const field of ['href','fileName','mediaType','language'])exactText(detail,item.download[field]);exactText(detail,item.download.label);}
    if(item.content&&s.id!=='visas')exactText(detail,item.content);
   }
   if(s.content&&!s.children?.length&&s.id!=='insurance')exactText(list,s.content);
  }
  assert.equal(services.filter((s:any)=>s.id==='bikes').length,d.id==='bali'?1:0);
 }
});

for(const locale of locales)test('all five actual visa detail renders preserve complete ordered Registry HTML and tables: '+locale,async()=>{
 const ui=bindings.createClientUiBindings(locale);
 for(const id of ['e33g','d12','d1-d2','c1','voa']){
  const a=articles.clientCatalogVisaArticle(id,locale),html=await route(['services','bali','visas',id],ui);
  exactText(html,a.title);assert.equal((html.match(/<h1>/g)??[]).length,1);
  let position=-1;
  for(const fragment of [a.directHtml,a.introHtml,a.factHtml,...a.sections.flatMap((s:any)=>[escape(s.heading),s.html])].filter(Boolean)){
   const at=html.indexOf(fragment,position+1);assert.ok(at>position,'Missing/reordered complete fragment '+id+'/'+locale);position=at;
  }
  const source=[a.directHtml,a.introHtml,a.factHtml,...a.sections.map((s:any)=>s.html)].join('');
  assert.equal((html.match(/<table(?:\s|>)/g)??[]).length,(source.match(/<table(?:\s|>)/g)??[]).length);
  // Source replay: D1/D2 has ONE table/header+12 data rows. The historical
  // 'both tables' gate belongs to knowledge_evoa_vs_voa, not this article.
  if(id==='d1-d2'){
   assert.equal(a.bodyMarkdown.split('\n').filter((line:string)=>/^\|?\s*:?-{3,}/.test(line)).length,1);
   assert.equal((html.match(/<table(?:\s|>)/g)??[]).length,1);
   assert.equal((html.match(/<tbody>/g)??[]).length,1);
  }
  assert.equal((html.match(/data-registry-section=/g)??[]).length,a.sections.length);
  assert.ok(!html.includes(a.bodyMarkdown),'Do not display raw Markdown as the full compiled article');
  assert.doesNotMatch(html,/<(?:script|iframe|form|style)(?:\s|>)|\son[a-z]+\s*=|(?:href|src)="\s*(?:javascript|data):/i);
 }
});

for(const contact of ['ru','en'] as const)test('unbound legacy Home/Catalog and children keep actual exact current283 SSR markup: '+contact,()=>{
 const legacyCatalog=load('react-app/src/catalog.ts');
 assert.equal(render('HomeView',{navigate(){},onManager(){},pointsBalance:0},contact),render('HomeView',{navigate(){},onManager(){},pointsBalance:0},contact,true));
 for(const d of legacyCatalog.activeDestinations(contact)){
  const paths=[['services',d.id],...legacyCatalog.activeServices(d,contact).flatMap((s:any)=>[['services',d.id,s.id],...(s.children??[]).filter((c:any)=>!c.publiclyHidden).map((c:any)=>['services',d.id,s.id,c.id])])];
  for(const segments of paths){const props={segments,navigate(){},onManager(){}};assert.equal(render('CatalogView',props,contact),render('CatalogView',props,contact,true),'Legacy route '+segments.join('/'));}
 }
});

function nodes(value:any):any[]{if(!value||typeof value!=='object')return[];if(Array.isArray(value))return value.flatMap(nodes);return[value,...nodes(value.props?.children)];}
function probe(name:string,props:any,options:{contact?:'ru'|'en';states?:any[]}={}){
 let cursor=0;const state=options.states??[];
 const react={...React,useState(init:any){const i=cursor++;if(!(i in state))state[i]=typeof init==='function'?init():init;return[state[i],(v:any)=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useEffect(){},useMemo:(fn:any)=>fn(),useRef:(value:any)=>({current:value}),useContext:()=>({locale:options.contact??'ru',t:load('react-app/src/i18n/runtime.tsx').translate.bind(null,options.contact??'ru')})} as unknown as typeof React;
 const local=loader(dev,react),binding=local('react-app/src/i18n/client-ui-bindings.ts');
 const component=local('react-app/src/components/'+name+'.tsx')[name];
 const bound=props.ui===undefined?undefined:binding.createClientUiBindings(props.ui);
 return{render(){cursor=0;return component({...props,ui:bound});},local,state};
}

for(const locale of locales)test('real callbacks keep routes, planner indices and canonical manager context independent of display language: '+locale,()=>{
 const calls:any[]=[],navigate=(s:string)=>calls.push(s),onManager=(c:any)=>calls.push(c);
 const home=probe('HomeView',{ui:locale,navigate,onManager,pointsBalance:0});
 const h=nodes(home.render());const carousel=h.find(n=>n.type?.name==='CountryCarousel');assert.ok(carousel);carousel.props.onOpen('thailand');assert.equal(calls.pop(),'services/thailand');
 for(const d of catalog.clientActiveDestinations(locale)){
  const view=probe('CatalogView',{ui:locale,segments:['services',d.id],navigate,onManager});
  const grid=nodes(view.render()).find(n=>n.type?.name==='ServiceGrid');assert.ok(grid);grid.props.onSelect('insurance');assert.equal(calls.pop(),'services/'+d.id+'/insurance');
 }
 const planner=probe('VisaPlanner',{ui:locale,onManager,onRequests:()=>calls.push('requests'),children:'CATALOG_SENTINEL'},{states:['plan',{purpose:1,duration:2}]});
 const p=nodes(planner.render()),form=p.find(n=>n.type==='form');assert.ok(form);form.props.onSubmit({preventDefault(){}});assert.deepEqual(calls.pop(),{country:'Бали',section:'Визы',service:'Бизнес; 1–2 месяца'});
 const tabs=p.find(n=>n.type==='nav').props.children;tabs[1].props.onClick();assert.ok(JSON.stringify(planner.render()).includes('CATALOG_SENTINEL'));
 tabs[2].props.onClick();const requestButton=nodes(planner.render()).find(n=>n.type==='button'&&n.props.className==='button primary');requestButton.props.onClick();assert.equal(calls.pop(),'requests');
 const insurance=probe('CatalogView',{ui:locale,segments:['services','thailand','insurance'],navigate,onManager});
 nodes(insurance.render()).find(n=>n.type?.name==='InsuranceOptions').props.onContact('LUMA');assert.deepEqual(calls.pop(),{country:'Таиланд',section:'Страховки',service:'LUMA'});
 const bikes=probe('CatalogView',{ui:locale,segments:['services','bali','bikes'],navigate,onManager});
 const bikeButton=nodes(bikes.render()).find(n=>n.type==='button'&&n.props.className==='button primary');bikeButton.props.onClick();const context=calls.pop();assert.equal(context.country,'Бали');assert.equal(context.section,load('react-app/src/catalog.ts').canonicalCatalogItemName('bali','assistant'));
});

test('forged/inherited/null bindings and arbitrary HTML/article identities are rejected, not RU fallbacks',async()=>{
 for(const value of [null,{}, {role:'admin',locale:'ar'}, {role:'client',locale:'ar'},Object.create(bindings.createClientUiBindings('ar'))]){
  await assert.rejects(()=>route(['services','bali'],value),/BINDING_ROLE_OR_PROVENANCE/);
  assert.throws(()=>render('HomeView',{ui:value,navigate(){},onManager(){},pointsBalance:0}),/BINDING_ROLE_OR_PROVENANCE/);
  assert.throws(()=>render('ClientVisaArticleView',{ui:value,visaId:'d12'}),/BINDING_ROLE_OR_PROVENANCE/);
 }
 for(const id of ['__proto__','<script>','D12','other'])assert.throws(()=>render('ClientVisaArticleView',{ui:bindings.createClientUiBindings('ar'),visaId:id}),/UNKNOWN_VISA/);
 const ui=bindings.createClientUiBindings('ar');exactText(await route(['services','unknown'],ui),ui.text('home.heading'));
});

test('client hidden direct child stays inaccessible and empty soon services show only one preparation panel',async()=>{
 for(const locale of locales){const ui=bindings.createClientUiBindings(locale);
  const hidden=catalog.clientActiveServicesById('bali',locale).find((s:any)=>s.id==='exchange').children.find((c:any)=>c.publiclyHidden);
  assert.ok(hidden);const page=await route(['services','bali','exchange',hidden.id],ui);
  if(hidden.content)assert.ok(!page.includes(escape(hidden.content)));
  assert.ok(!page.includes('<h1>'+escape(hidden.name)+'</h1>'));
  for(const d of catalog.clientActiveDestinations(locale))for(const s of catalog.clientActiveServicesById(d.id,locale))if(s.status==='soon'&&!s.children?.length){
   const html=await route(['services',d.id,s.id],ui);assert.equal((html.match(/class="empty-state preparation-state"/g)??[]).length,1);
  }
 }
});

test('actual Vite compiles the complete local Home/Catalog source dependency graph without writing release files',async()=>{
 const result=await build({root:app,configFile:false,envDir:false,envPrefix:'__SAFR_NO_AMBIENT_ENV__',logLevel:'silent',plugins:[reactPlugin()],build:{write:false,minify:false,sourcemap:false,lib:{entry:path.join(app,'src/components/CatalogView.tsx'),formats:['es'],name:'ClientCatalogLocal'}}});
 const outputs=Array.isArray(result)?result.flatMap(r=>'output'in r?r.output:[]):'output'in result?result.output:[];
 const modules=outputs.flatMap(o=>o.type==='chunk'?Object.keys(o.modules):[]);
 for(const suffix of ['src/components/HomeView.tsx','src/components/CatalogView.tsx','src/components/ClientVisaArticleView.tsx','src/components/VisaPlanner.tsx','src/components/InsuranceOptions.tsx','shared/content/client-ui/client-catalog-journey.v1.json','shared/content/generated/client-catalog/cards.v1.json','shared/styles/insurance.css'])assert.ok(modules.some(m=>m.endsWith(suffix)),suffix);
 assert.ok(!modules.some(m=>m.endsWith('/client-catalog-runtime.ts')||m.endsWith('/client-ui/client-catalog-runtime.v1.json')));
 for(const id of ['e33g','d12','d1-d2','c1','voa'])assert.ok(modules.some(m=>m.endsWith('/generated/client-catalog/'+id+'.v1.json')));
 assert.ok(outputs.some(o=>o.type==='chunk'&&o.code.length>0));assert.ok(outputs.some(o=>o.type==='asset'&&o.fileName.endsWith('.css')));
 assert.ok(!modules.some(m=>/AdminApp|AccountApp|surfaces\/MiniApp/.test(m)),'Not a global Client10/Admin/parent activation');
 assert.ok(!modules.some(m=>/AUDIT\/|candidates\.v1|_SOURCE_RECEIPT|EDITORIAL_SOURCE_ARCHIVE|registry-copy\//.test(m)));
 console.log('CATALOG_ENTRY_PROOF '+JSON.stringify({modules:modules.length,outputs:outputs.length,jsBytes:outputs.reduce((n,o)=>n+(o.type==='chunk'?Buffer.byteLength(o.code):0),0),cssBytes:outputs.reduce((n,o)=>n+(o.type==='asset'?Buffer.byteLength(o.source):0),0),write:false}));
});
