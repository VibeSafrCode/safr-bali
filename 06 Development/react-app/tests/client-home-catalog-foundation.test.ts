import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import ts from 'typescript';
import {clientCodeComparator} from './fixtures/client-code-comparators';
import {clientActiveDestinations,clientActiveServicesById} from '../src/i18n/client-catalog-destination';
import {clientInsuranceSourceCopy} from '../src/i18n/client-insurance-source';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {CLIENT_RUNTIME_LOCALES} from '../src/i18n/client-runtime';
import {inspectClientCatalogActiveServices} from '../src/i18n/client-catalog-runtime';
import {activeDestinations,activeServices} from '../src/catalog';
import {insuranceCopy,insuranceProviders} from '../../shared/src/insurance';
import {compactPriceLabel,type PricingItem,type PricingProjection} from '../src/pricing/runtime';
const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex'),json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
const app=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(path.join(app,'package.json'));
const catalog=JSON.parse(fs.readFileSync(path.join(app,'../shared/content/client-ui/client-catalog-runtime.v1.json'),'utf8'));
assert.equal(sha(json(catalog)),'36744ab98bb2ed9ee3e151b075c20bafec169a3ccbe74575957b115eb56b8ca4');

for(const locale of CLIENT_RUNTIME_LOCALES)test('one canonical five-destination/active-service graph without RUEN bike reinsertion: '+locale,()=>{
  const rows=clientActiveDestinations(locale);assert.deepEqual(rows.map(d=>d.id),['bali','thailand','uae','nepal','russia']);
  for(const destination of rows){const services=clientActiveServicesById(destination.id,locale);assert.deepEqual(services,inspectClientCatalogActiveServices(destination.id,locale));
    assert.ok(services.every(s=>!s.publiclyHidden));assert.equal(new Set(services.map(s=>s.id)).size,services.length);
    const own=catalog.baseDestinations.find((r:any)=>r.id===destination.id);assert.equal(destination.number,own.number);assert.equal(destination.className,own.className);
    if(destination.id==='bali')assert.equal(services.filter(s=>s.id==='bikes').length,1);
    const compact=(values:readonly any[])=>values.map(s=>({id:s.id,status:s.status,publiclyHidden:s.publiclyHidden,download:s.download?{href:s.download.href,fileName:s.download.fileName,sizeBytes:s.download.sizeBytes,language:s.download.language}:undefined,children:s.children?.map((c:any)=>({id:c.id,status:c.status,publiclyHidden:c.publiclyHidden}))}));
    const legacy=activeServices(activeDestinations('ru').find(d=>d.id===destination.id)!,'ru');assert.deepEqual(compact(services),compact(legacy));
  }
});
const insuranceFields=['luma','safetyWing','price','contact','availability'] as const;
const literal:Record<string,Record<string,string>>=Object.fromEntries(insuranceFields.map(key=>[key,{}]));
for(const locale of CLIENT_RUNTIME_LOCALES)test('all five insurance leaves recompose exact whole accepted body without trims: '+locale,()=>{
  const result=clientInsuranceSourceCopy(createClientUiBindings(locale)),whole=catalog.fields['catalog.bali.insurance.content'].values[locale];
  assert.equal([result.providers[0].name+'\n'+result.providers[0].description,result.providers[1].name+'\n'+result.providers[1].description,result.price,result.contact,result.availability].join('\n\n'),whole);
  assert.equal(result.sourceContent,whole);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.providers)&&result.providers.every(Object.isFrozen));
  assert.deepEqual(result.providers.map(p=>[p.name,p.url]),insuranceProviders.map(p=>[p.name,p.url]));
  for(const country of ['bali','thailand','nepal','uae'])assert.equal(catalog.fields['catalog.'+country+'.insurance.content'].values[locale],whole);
  if(locale==='ru'||locale==='en'){assert.equal(result.price,insuranceCopy[locale].price);assert.equal(result.cta,insuranceCopy[locale].cta);}
  literal.luma[locale]=result.providers[0].description;literal.safetyWing[locale]=result.providers[1].description;literal.price[locale]=result.price;literal.contact[locale]=result.contact;literal.availability[locale]=result.availability;
});
test('every insurance leaf retains independent exact source pin',()=>{
  const expected={luma:'2762a648280423ce7363c2a44df9f7873676dcbf49049261d17d26c3c23cd3ca',safetyWing:'e7b0a969397cac272fd09c32dd5b50373ab9e671ac10cb40f24af8a4c6cf36e4',price:'f9bbedf23b8a11144c2265757175bcfab7966fa82566dece429c3a0c72fd2252',contact:'2bc5659340620829fe56684285370b58a8a06a72506104d8619f4dab68d7c55b',availability:'ece89d346cb2c22353aa8d8d3519d024a9fe47af0851d53b4de30f3a28538bde'};
  for(const field of insuranceFields)assert.equal(sha(json(literal[field])),expected[field]);
});
test('no forged role/unknown locale can enter the insurance or catalog adapter',()=>{
  for(const value of [null,{role:'admin',locale:'en'},{role:'client',locale:'ar'},Object.create(createClientUiBindings('ar'))])assert.throws(()=>clientInsuranceSourceCopy(value as never),/BINDING_ROLE_OR_PROVENANCE/);
  for(const locale of ['fa','zh-cn',null,{},'ar '])assert.throws(()=>clientActiveDestinations(locale));
  for(const id of ['__proto__','other',null,{}])assert.throws(()=>clientActiveServicesById(id,'ar'));
});

function originalPriceModule(){
  const file=path.join(app,'src/pricing/runtime.tsx');let old=fs.readFileSync(file,'utf8');
  assert.equal(old,clientCodeComparator('pricing283'),'Pricing source unchanged versus frozen current283');
  for(const[from,to]of [
    ['  labels?: Readonly<{ contact: string; from: string }>,\n',''],
    ['      ? labels?.contact ?? (locale === "ru" ? "Цена по запросу" : "Price on request")','      ? locale === "ru" ? "Цена по запросу" : "Price on request"'],
    ['    ? labels?.from ?? (locale === "ru" ? "от " : "from ")','    ? locale === "ru" ? "от " : "from "'],
  ]){assert.equal(old.split(from).length,2);old=old.replace(from,to);}
  // Current283 includes the previously accepted Yoga read-deadline adapter.
  // Rebase the full-file reverse seam to that exact source, not historical152.
  assert.equal(sha(old),'d3a974c223898b53d239c687e567b00d63b0b67f77b694f589b15e5d5cdc6444');
  const compiled=ts.transpileModule(old,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,exports:any={};
  const scoped=(id:string)=>{if(id==='react'||id==='react/jsx-runtime')return require(id);if(id==='../runtime/yoga-mini-app')return{YOGA_MINI_APP:false,yogaReadDeadline(){throw Error('NO_NETWORK_ALLOWED');}};if(id==='../api/client')return{appApiClient(){throw Error('NO_NETWORK_ALLOWED');}};throw Error('Unexpected pricing dependency '+id);};
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:file})(scoped,{exports},exports);
  return exports as {compactPriceLabel:typeof compactPriceLabel};
}
const original=originalPriceModule();
const item=(extra:Partial<PricingItem>={}):PricingItem=>({sku:'synthetic-only',entity_type:'VISA',entity_key:'D12',option_code:'synthetic',label:{ru:'Synthetic',en:'Synthetic'},price_qualifier:'EXACT',amount_idr:'1400000',show_price:true,fee_verification_status:'NEEDS_VERIFICATION',fee_note:{ru:null,en:null},display_usdt:'88',display_usd_approx:'90',sort_order:0,...extra});
function projection(items:PricingItem[],expired=false):PricingProjection{return{projection_id:'synthetic',publication_version:1,catalog_version_id:1,catalog_version:1,fx_snapshot_id:1,formula_version:'preserve',accepted_at:'2026-10-16T00:00:00Z',derived_expires_at:expired?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z',max_refresh_lag_seconds:60,currency:'IDR',fx:{version:1,status:'fresh',ask_idr_per_usdt:'16000',is_manual_override:false},items};}
test('unchanged legacy compact-price calculation and expiry behavior on the entire bounded matrix',()=>{
  const fixtures=[null,projection([]),projection([item({price_qualifier:'CONTACT',amount_idr:null})]),projection([item({show_price:false})]),projection([item()]),projection([item({price_qualifier:'FROM'})]),projection([item(),item({sku:'other',amount_idr:'1300000',display_usd_approx:'85'})]),projection([item()],true),projection([item({display_usd_approx:null})])];
  for(const p of fixtures)for(const locale of ['ru','en'] as const){const before=json(p);assert.equal(compactPriceLabel(p,'VISA','D12',locale),original.compactPriceLabel(p,'VISA','D12',locale));assert.equal(json(p),before);}
});
test('explicit display-label seam changes only existing contact/from strings, never amounts/FX/math',()=>{
  const labels={contact:'SYNTHETIC_CONTACT',from:'SYNTHETIC_FROM '};
  const p=projection([item({price_qualifier:'FROM'})]),before=json(p),old=compactPriceLabel(p,'VISA','D12','ru');assert.ok(old&&old.startsWith('от '));
  assert.equal(compactPriceLabel(p,'VISA','D12','ru',labels),labels.from+old.slice(3));assert.equal(json(p),before);
  assert.equal(compactPriceLabel(projection([item({price_qualifier:'CONTACT',amount_idr:null})]),'VISA','D12','en',labels),labels.contact);
  assert.equal(compactPriceLabel(projection([item()]),'VISA','D12','en',labels),original.compactPriceLabel(projection([item()]),'VISA','D12','en'));
});
