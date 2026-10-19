import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup,renderToPipeableStream} from 'react-dom/server';
import ts from 'typescript';
import * as bindings from '../src/i18n/client-ui-bindings';
import {ApiError} from '../src/api/client';

const app=fileURLToPath(new URL('../',import.meta.url)),dev=path.resolve(app,'..'),require=createRequire(path.join(app,'package.json'));
const before=process.env.SAFR_TEST_SPLIT_BASE;assert.ok(before&&path.isAbsolute(before),'Exact previous283 source required');
const locales=bindings.CLIENT_UI_LANGUAGE_OPTIONS.map(o=>o.code),ids=['e33g','d12','d1-d2','c1','voa'];
const digest=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const equal=(a:unknown,b:unknown,label:string)=>assert.equal(digest(a),digest(b),label);
const sourceRaw=fs.readFileSync(dev+'/shared/content/client-ui/client-catalog-runtime.v1.json'),source=JSON.parse(sourceRaw.toString('utf8'));
type Gate=(file:string,read:()=>any)=>Promise<any>;
function loader(root:string,gate?:Gate,yoga=false){
 const cache=new Map<string,any>(),requests:string[]=[];
 function load(relative:string):any{
  const full=path.resolve(root,relative);assert.ok(full.startsWith(root+'/'));if(cache.has(full))return cache.get(full);
  if(full.endsWith('/src/i18n/client-ui-bindings.ts'))return bindings;
  if(full.endsWith('/src/api/client.ts'))return{ApiError,appApiClient(){throw Error('NO_TEST_NETWORK');}};
  if(full.endsWith('/src/ui/client-brand.ts'))return{isYogaBrand:yoga,clientBrand:{id:yoga?'yoga':'safrway',name:yoga?'Yoga Ganster':'SAFRWAY'}};
  if(full.endsWith('.json')){const data=JSON.parse(fs.readFileSync(full,'utf8'));cache.set(full,data);return data;}
  if(full.endsWith('.css'))return{};if(full.endsWith('.mjs'))return require(full);
  const result={exports:{} as any};cache.set(full,result.exports);
  const transformer:ts.TransformerFactory<ts.SourceFile>=context=>file=>ts.visitNode(file,function visit(node:ts.Node):ts.VisitResult<ts.Node>{
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)return ts.factory.updateCallExpression(node,ts.factory.createIdentifier('__testImport'),node.typeArguments,node.arguments);
   return ts.visitEachChild(node,visit,context);
  }) as ts.SourceFile;
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},transformers:{before:[transformer]}}).outputText;
  const resolve=(id:string)=>{assert.ok(id.startsWith('.'),id);const stem=path.resolve(path.dirname(full),id),found=['','.ts','.tsx','.json'].map(ext=>stem+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert.ok(found,id);return found;};
  const scoped=(id:string):any=>{if(id==='react'||id==='react/jsx-runtime')return require(id);if(id.endsWith('.css'))return{};return load(path.relative(root,resolve(id)));};
  const dynamic=(id:string)=>{const target=resolve(id);requests.push(path.relative(root,target));const read=()=>({default:load(path.relative(root,target))});return gate?gate(target,read):Promise.resolve().then(read);};
  const win={location:{pathname:'/account/'},localStorage:{getItem:()=>null},matchMedia:()=>({matches:false})};
  vm.runInThisContext('(function(require,module,exports,window,matchMedia,__YOGA_MINI_APP__,__testImport){'+code+'\n})',{filename:full})(scoped,result,result.exports,win,win.matchMedia,yoga,dynamic);
  cache.set(full,result.exports);return result.exports;
 }return{load,cache,requests};
}
const current=loader(dev),old=loader(path.join(before,'06 Development'));
const full=current.load('react-app/src/i18n/client-catalog-runtime.ts'),oldFull=old.load('react-app/src/i18n/client-catalog-runtime.ts');
const cards=current.load('react-app/src/i18n/client-card-runtime.ts'),pack=current.load('react-app/src/i18n/client-visa-packs.ts');
function normalize(value:any):any{
 if(Array.isArray(value))return value.map(normalize);if(!value||typeof value!=='object')return value;
 const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
 if(value.articleRef){delete result.articleRef;delete result.content;}
 else if(ids.includes(value.id)&&Object.hasOwn(value,'content'))delete result.content;
 return result;
}
function element(l:ReturnType<typeof loader>,locale:string,visaId?:string){
 const Provider=l.load('react-app/src/i18n/runtime.tsx').I18nProvider,Component=l.load('react-app/src/components/'+(visaId?'CatalogView':'HomeView')+'.tsx')[visaId?'CatalogView':'HomeView'];
 return React.createElement(Provider,{locale:'en'},React.createElement(Component,{ui:bindings.createClientUiBindings(locale),segments:['services','bali','visas',visaId],navigate(){},onManager(){},pointsBalance:0}));
}
async function resolved(element:React.ReactNode){return new Promise<string>((resolve,reject)=>{
 const chunks:Buffer[]=[],sink=new Writable({write(chunk,_enc,done){chunks.push(Buffer.from(chunk));done();}});sink.on('finish',()=>resolve(Buffer.concat(chunks).toString('utf8')));sink.on('error',reject);
 const stream=renderToPipeableStream(element,{onAllReady(){stream.pipe(sink);},onError:reject,onShellError:reject});
});}
test('original 1863767-byte canonical source unchanged; generated index removes only five bodies',()=>{
 assert.equal(sourceRaw.length,1863767);assert.equal(digest(sourceRaw.toString('utf8')),'36744ab98bb2ed9ee3e151b075c20bafec169a3ccbe74575957b115eb56b8ca4');
 const index=JSON.parse(fs.readFileSync(dev+'/shared/content/generated/client-catalog/cards.v1.json','utf8'));
 assert.equal(Object.keys(index.fields).length,140);assert.equal(Object.keys(index.articleRefs).length,5);assert.equal(index.articles,undefined);
 for(const[key,row]of Object.entries(source.fields)){if((row as any).recipe==='registry_full_body')assert.equal(index.fields[key],undefined);else equal(index.fields[key],row,key);}
 equal(normalize(index.baseDestinations),normalize(source.baseDestinations),'only five leaf bodies removed');equal(index.bikes,source.bikes,'bikes unchanged');
});
for(const locale of locales)test('shared projection preserves full compatibility and card contracts: '+locale,()=>{
 equal(full.inspectClientCatalogProjection(locale),oldFull.inspectClientCatalogProjection(locale),'full inspect exact');
 equal(normalize(cards.clientCardDestinations(locale)),normalize(full.clientCatalogDestinations(locale)),'cards exact except five refs/body omissions');
 for(const id of ['bali','thailand','uae','nepal','russia']){
  equal(full.inspectClientCatalogActiveServices(id,locale),oldFull.inspectClientCatalogActiveServices(id,locale),'old active exact');
  equal(normalize(cards.clientCardActiveServices(id,locale)),normalize(full.inspectClientCatalogActiveServices(id,locale)),'card active exact');
 }
 const adapter=current.load('react-app/src/i18n/client-card-destination.ts');assert.deepEqual(adapter.clientActiveDestinations(locale).map((d:any)=>d.id),['bali','thailand','uae','nepal','russia']);
 assert.equal(adapter.clientActiveServicesById('bali',locale).filter((s:any)=>s.id==='bikes').length,1);
 assert.equal(renderToStaticMarkup(element(current,locale)),renderToStaticMarkup(element(old,locale)),'whole Home SSR exact');
});
for(const id of ids)test('whole ten-locale pack equals all original article objects and rejects byte/identity drift: '+id,()=>{
 const raw=fs.readFileSync(dev+'/shared/content/generated/client-catalog/'+id+'.v1.json','utf8'),lookup=pack.createClientVisaPackLookup(raw,id),parsed=JSON.parse(raw);
 for(const locale of locales){const article=lookup.article(locale);equal(article,full.clientCatalogVisaArticle(id,locale),'whole article exact');assert.ok(Object.isFrozen(article));assert.ok(Object.isFrozen(article.sections));}
 assert.equal(parsed.articles.length,10);assert.throws(()=>lookup.article('RU'),/UNKNOWN_LOCALE/);
 for(const invalid of [null,{},Object.create(null),raw+' ',new Uint8Array(1),raw.replace('client-visa-pack','client-visa-pacK')])assert.throws(()=>pack.createClientVisaPackLookup(invalid,id),/CLIENT_DERIVATIVE_/);
 const wrong=ids.find(i=>i!==id)!;assert.throws(()=>pack.createClientVisaPackLookup(raw,wrong),/CLIENT_DERIVATIVE_/);
});
for(const locale of locales)test('resolved actual Catalog H1 and every full body/FAQ/table fragment are exact: '+locale,async()=>{
 for(const id of ids){const html=await resolved(element(current,locale,id)),prior=renderToStaticMarkup(element(old,locale,id));assert.equal(digest(html),digest(prior),id+'/'+locale+' full SSR');
  const a=full.clientCatalogVisaArticle(id,locale);assert.equal((html.match(/<h1>/g)??[]).length,1);let offset=-1;
  for(const fragment of [a.directHtml,a.introHtml,a.factHtml,...a.sections.flatMap((s:any)=>[s.html])].filter(Boolean)){const at=html.indexOf(fragment,offset+1);assert.ok(at>offset,id+'/'+locale+' ordered fragment');offset=at;}
  assert.equal((html.match(/data-registry-section=/g)??[]).length,a.sections.length);
 }
});
test('cold Home and card catalog do not import any visa pack; chosen visa requests exactly its pack once',async()=>{
 const l=loader(dev);renderToStaticMarkup(element(l,'ar'));assert.deepEqual(l.requests,[]);
 await resolved(element(l,'ar','d1-d2'));assert.equal(l.requests.length,1);assert.match(l.requests[0],/\/d1-d2\.v1\.json$/);
 await resolved(element(l,'ja','d1-d2'));assert.equal(l.requests.length,1);
 assert.ok(![...l.cache.keys()].some(f=>f.endsWith('/client-catalog-runtime.ts')||f.endsWith('/client-ui/client-catalog-runtime.v1.json')));
});
test('delayed A does not overwrite B, and locale changes reuse one validated ten-language pack',async()=>{
 const releases=new Map<string,()=>void>();const l=loader(dev,(file,read)=>new Promise(resolve=>{releases.set(path.basename(file),()=>resolve(read()));}));
 const a=resolved(element(l,'ar','d12'));await new Promise(resolve=>setImmediate(resolve));
 const b=resolved(element(l,'ja','voa'));await new Promise(resolve=>setImmediate(resolve));
 releases.get('voa.v1.json')!();const htmlB=await b;releases.get('d12.v1.json')!();await a;
 assert.equal(digest(await resolved(element(l,'ja','voa'))),digest(htmlB),'late A cannot mutate B selector');
 const en=await resolved(element(l,'en','voa'));assert.notEqual(digest(en),digest(htmlB));assert.equal(l.requests.filter(f=>f.endsWith('/voa.v1.json')).length,1);
});
test('rejected chunk does not retry implicitly; a fresh module/reload can recover',async()=>{
 let calls=0;const l=loader(dev,()=>{calls++;return Promise.reject(Error('TEST_CHUNK_FAILURE'));});
 await assert.rejects(resolved(element(l,'ar','e33g')),/TEST_CHUNK_FAILURE/);await assert.rejects(resolved(element(l,'en','e33g')),/TEST_CHUNK_FAILURE/);assert.equal(calls,1);
 const fresh=loader(dev);assert.ok((await resolved(element(fresh,'ar','e33g'))).includes('data-content-id="e33g"'));
});
test('unknown refs, unverified objects and a Yoga Main consumer fail explicitly',()=>{
 for(const id of ['__proto__','constructor','other-visa','D12',{},null])assert.throws(()=>pack.requireClientVisaId(id),/UNKNOWN_VISA/);
 for(const value of [null,{},Object.create(bindings.createClientUiBindings('ar'))])assert.throws(()=>renderToStaticMarkup(React.createElement(current.load('react-app/src/components/ClientVisaDetail.tsx').ClientVisaDetail,{visaId:'voa',ui:value,destinationName:'',price:null,preparing:false})),/BINDING_ROLE_OR_PROVENANCE/);
 const yoga=loader(dev,undefined,true);assert.throws(()=>yoga.load('react-app/src/i18n/client-card-runtime.ts').clientCardDestinations('ru'),/MAIN_BUILD_ONLY/);
});
