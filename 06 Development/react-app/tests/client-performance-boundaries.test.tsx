import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToPipeableStream,renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {Harness} from './client-current-parent-integration.test';
import * as bindings from '../src/i18n/client-ui-bindings';
import {clientAccountCopies} from '../src/i18n/client-account-copy';
import {ApiError} from '../src/api/client';

const app=fileURLToPath(new URL('../',import.meta.url)),dev=path.resolve(app,'..'),require=createRequire(path.join(app,'package.json'));
const previous=process.env.SAFR_TEST_PERFORMANCE_BASE;
assert.ok(previous&&path.isAbsolute(previous),'Exact previous281 source root required');
const locales=bindings.CLIENT_UI_LANGUAGE_OPTIONS.map(o=>o.code);
const nodes=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const jsxRequire=(id:string)=>{assert.equal(id,'react/jsx-runtime');return require(id);};
const source=fs.readFileSync(path.join(app,'src/surfaces/AccountApp.tsx'),'utf8');
const file=ts.createSourceFile('account.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

// Real React SSR and real owned component/data bodies; CSS/transport/brand are
// explicit inert facades. This does not mount ReactDOM, authenticate or send API.
function loader(root:string){
 const cache=new Map<string,any>();
 function load(relative:string):any{
  const full=path.resolve(root,relative);assert.ok(full.startsWith(root+'/'));
  if(cache.has(full))return cache.get(full);
  if(full.endsWith('/src/i18n/client-ui-bindings.ts'))return bindings;
  if(full.endsWith('/src/api/client.ts'))return{ApiError,appApiClient(){throw Error('NO_TEST_NETWORK');}};
  if(full.endsWith('/src/ui/client-brand.ts'))return{isYogaBrand:false,clientBrand:{id:'safrway',name:'SAFRWAY'}};
  if(full.endsWith('.json')){const value=JSON.parse(fs.readFileSync(full,'utf8'));cache.set(full,value);return value;}
  if(full.endsWith('.css'))return{};
  if(full.endsWith('.mjs'))return require(full);
  const result={exports:{} as any};cache.set(full,result.exports);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const scoped=(id:string):any=>{
   if(id==='react'||id==='react/jsx-runtime')return require(id);
   if(id.endsWith('.css'))return{};
   assert.ok(id.startsWith('.'),'UNEXPECTED_PACKAGE '+id);
   const stem=path.resolve(path.dirname(full),id),found=['','.ts','.tsx','.json'].map(ext=>stem+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert.ok(found,id);return load(path.relative(root,found));
  };
  const win={location:{pathname:'/account/'},localStorage:{getItem:()=>null},matchMedia:()=>({matches:false})};
  vm.runInThisContext('(function(require,module,exports,window,matchMedia,__YOGA_MINI_APP__){'+code+'\n})',{filename:full})(scoped,result,result.exports,win,win.matchMedia,false);
  cache.set(full,result.exports);return result.exports;
 }return{load,cache};
}
const current=loader(dev),old=loader(path.join(previous,'06 Development'));
function renderComponent(load:ReturnType<typeof loader>,name:string,props:any){
 const Provider=load.load('react-app/src/i18n/runtime.tsx').I18nProvider,Component=load.load('react-app/src/components/'+name+'.tsx')[name];
 return renderToStaticMarkup(React.createElement(Provider,{locale:'en'},React.createElement(Component,props)));
}
async function resolvedMarkup(element:React.ReactNode){
 return new Promise<string>((resolve,reject)=>{
  const chunks:Buffer[]=[];const sink=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
  sink.on('finish',()=>resolve(Buffer.concat(chunks).toString('utf8')));sink.on('error',reject);
  const stream=renderToPipeableStream(element,{onAllReady(){stream.pipe(sink);},onError:reject,onShellError:reject});
 });
}
function lazyExports(){
 const names=['HomeView','CatalogView','CurrencyCalculator','SupportPanel','VisaCabinet'],statements=file.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&names.includes(d.name.text)));
 assert.equal(statements.length,5);const imports:string[]=[];
 const code=ts.transpileModule(statements.map(s=>s.getText(file)).join('\n')+'\nmodule.exports={'+names.join(',')+'};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const result={exports:{} as any};vm.runInThisContext('(function(lazy,require,module){'+code+'\n})')(
  React.lazy,(id:string)=>{assert.match(id,/^\.\.\/components\/[A-Za-z]+$/);imports.push(id);return current.load('react-app/src/'+id.replace('../','')+'.tsx');},result);
 return{values:result.exports,imports};
}

test('background helper reuses all five exact approved assets and rejects inherited/unknown IDs',()=>{
 const theme=current.load('react-app/src/countryThemes.ts'),before=old.load('react-app/src/countryThemes.ts'),catalog=old.load('react-app/src/catalog.ts');
 for(const destination of catalog.destinations){const hero=theme.countryBackdropHero(destination.id),expected=before.countryTheme(destination).hero;
  for(const key of ['src','srcSet','position'])assert.equal(hero?.[key],expected?.[key]);
 }
 for(const invalid of ['__proto__','constructor','missing',null,{},0])assert.equal(theme.countryBackdropHero(invalid),null);
 assert.ok(theme.countryBackdropHero('bali'));const backdrop=fs.readFileSync(path.join(app,'src/components/DestinationBackdrop.tsx'),'utf8');
 assert.doesNotMatch(backdrop,/from ["']\.\.\/catalog/);assert.match(backdrop,/countryBackdropHero\(id\) \?\? countryBackdropHero\("bali"\)/);
 const beforeBackdrop=fs.readFileSync(path.join(previous,'06 Development/react-app/src/components/DestinationBackdrop.tsx'),'utf8');
 assert.equal(backdrop.replace('import { countryBackdropHero } from "../countryThemes";','import { destinationById } from "../catalog";\nimport { countryTheme } from "../countryThemes";').replace('    const day = countryBackdropHero(id) ?? countryBackdropHero("bali");','    const destination = destinationById(id) ?? destinationById("bali");\n    const day = destination ? countryTheme(destination).hero : null;'),beforeBackdrop);
});

for(const locale of locales)test('resolved lazy Home/Catalog content equals previous281 exact SSR: '+locale,async()=>{
 const ui=bindings.createClientUiBindings(locale),lazy=lazyExports();assert.equal(lazy.imports.length,0);
 const Provider=current.load('react-app/src/i18n/runtime.tsx').I18nProvider;
 for(const[name,props]of [['HomeView',{navigate(){},onManager(){},pointsBalance:0,ui}],['CatalogView',{segments:['services','bali'],navigate(){},onManager(){},ui}]] as const){
  const actual=await resolvedMarkup(React.createElement(Provider,{locale:'en'},React.createElement(lazy.values[name],props)));
  assert.equal(actual,renderComponent(old,name,props));
 }
 assert.deepEqual(lazy.imports,['../components/HomeView','../components/CatalogView']);
});

for(const locale of locales)test('loading/error section states reuse exact accepted UI10 text: '+locale,async()=>{
 const h=new Harness('web','/account/profile/');h.uiLocale=locale as any;h.mount();await h.settle();
 const boundary=h.component('SectionBoundary'),copy=clientAccountCopies(bindings.createClientUiBindings(locale));assert.ok(boundary);
 const error=renderToStaticMarkup(boundary.props.errorFallback);assert.ok(error.includes('role="alert"'));
 assert.ok(error.includes(copy.status.errorTitle.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));
 assert.ok(error.includes(copy.status.retry));const suspense=nodes(boundary.props.children).find(n=>n.type===React.Suspense);assert.ok(suspense);
 const loading=renderToStaticMarkup(suspense.props.fallback);assert.ok(loading.includes('role="status"'));assert.ok(loading.includes(copy.status.loadingTitle));
 const oldKey=boundary.key;await h.client.controller.choose('ja');await h.settle();assert.equal(h.component('SectionBoundary').key,oldKey);h.unmount();
});

test('video intent survives >100ms unavailable Home target and is consumed once on simulated resolved commit',async()=>{
 const h=new Harness('web','/account/profile/');h.mount();await h.settle();let scrolls=0,target:any=null;
 h.document.querySelector=(selector:string)=>{assert.equal(selector,'.account-content .travel-videos');return target;};
 const button=nodes(h.tree).find(n=>n.type==='button'&&n.props.onClick?.name==='openVideos');assert.ok(button);button.props.onClick();await h.settle();
 h.clock.tick(1000);assert.equal(scrolls,0);const home=h.component('HomeView');assert.ok(home);home.props.onReady();assert.equal(scrolls,0);
 target={scrollIntoView(options:any){assert.deepEqual(options,{behavior:'smooth'});scrolls++;}};
 home.props.onReady();home.props.onReady();assert.equal(scrolls,1);h.unmount();
});
for(const exit of ['navigate','logout'])test('video intent cancels before late Home commit: '+exit,async()=>{
 const h=new Harness('web','/account/profile/');h.mount();await h.settle();let scrolls=0;
 nodes(h.tree).find(n=>n.type==='button'&&n.props.onClick?.name==='openVideos').props.onClick();await h.settle();const commit=h.component('HomeView').props.onReady;
 if(exit==='navigate')h.component('BottomNavigation').props.onNavigate('profile');else await h.logoutCallback()();await h.settle();
 h.document.querySelector=()=>({scrollIntoView(){scrolls++;}});commit();assert.equal(scrolls,0);h.unmount();
});
test('Home readiness is a commit effect, no timer or locale-keyed parent remount',()=>{
 const node=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='AccountHomeSection');assert.ok(node);
 assert.match(node.getText(file),/useEffect\(onReady, \[onReady\]\)/);assert.match(node.getText(file),/<HomeView \{\.\.\.props\} \/>/);
 assert.doesNotMatch(source,/setTimeout\([^\n]*travel-videos/);assert.match(source,/key=\{tab === 'services' \? servicePath : tab\}/);
});
for(const trigger of ['help','navigation'])test('direct Support route has an independent Telegram exit without lazy panel/API: '+trigger,async()=>{
 const h=new Harness('web','/account/support/');h.mount();await h.settle();const calls=h.calls.length;
 assert.equal(h.component('SupportDrawer'),undefined);
 if(trigger==='help')nodes(h.tree).find(n=>n.type==='button'&&n.props.onClick?.toString().includes('openSupport()')).props.onClick();
 else h.component('BottomNavigation').props.onNavigate('support');
 await h.settle();assert.deepEqual(h.openedTelegram,['https://t.me/safr_bali_bot']);assert.equal(h.calls.length,calls);h.unmount();
});
test('read-only direct Support preview cannot open the independent contact',async()=>{
 const h=new Harness('web','/account/preview/303/support/');h.mount();await h.settle();const calls=h.calls.length;
 h.component('BottomNavigation').props.onNavigate('support');await h.settle();assert.deepEqual(h.openedTelegram,[]);assert.equal(h.calls.length,calls);h.unmount();
});
test('SectionBoundary preserves legacy RUEN render without override and updates a provided fallback',()=>{
 const Current=current.load('react-app/src/components/SectionBoundary.tsx').SectionBoundary,Previous=old.load('react-app/src/components/SectionBoundary.tsx').SectionBoundary;
 for(const locale of ['ru','en'])for(const failed of [false,true]){
  const props={locale,children:React.createElement('p',null,'unchanged')},a=new Current(props),b=new Previous(props);a.state={failed};b.state={failed};assert.equal(renderToStaticMarkup(a.render()),renderToStaticMarkup(b.render()));
 }
 const boundary=new Current({locale:'en',children:null,errorFallback:React.createElement('h2',null,'accepted AR')});boundary.state={failed:true};assert.equal(renderToStaticMarkup(boundary.render()),'<h2>accepted AR</h2>');
 boundary.props={...boundary.props,errorFallback:React.createElement('h2',null,'accepted JA')};assert.equal(renderToStaticMarkup(boundary.render()),'<h2>accepted JA</h2>');
});
