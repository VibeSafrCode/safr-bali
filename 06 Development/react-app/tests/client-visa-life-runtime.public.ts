// Public customer-literal/runtime contract, NOT native receipt/source proof.
// Three private source-replay modules, including the explicit one-identity
// application-copy correction, are mandatory on the same release tuple.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import test from 'node:test';
import {publicClientProjection as pack} from './fixtures/client-public-projection';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {CLIENT_VISA_LIFE_KEYS,clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import {clientLifeCountParts,clientLifeCountText,clientLifeCountNumber,type ClientLifeCountKey} from '../src/i18n/client-life-counts';
import {clientLifePrice,clientLifeText} from '../src/i18n/client-life-presentation';
import {clientVisaDatePresentation} from '../src/i18n/client-visa-presentation';
import {formatLifePrice} from '../src/components/lifeServices';
import {compactLifePrice} from '../src/components/lifePriceDisplay';
import {visaDatePresentation} from '../src/components/visaDatePresentation';
import {visaStatusLabel} from '../src/components/visaEditorState';
assert.equal(process.env.SAFR_CLIENT_TEST_CONTRACT,'PUBLIC_DERIVATIVE');
const expected=new Map(Object.entries(pack.visaLifeEntries));
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const,foreign=locales.slice(2);
const prefix='source:06 Development/react-app/src/components/';
const staleWaiting=pack.staleWaiting.key;
test('public projection retains178 identities,39 VisaCabinet leaves and rejects stale waiting-payment meaning',()=>{
 assert.equal(expected.size,178);assert.equal(CLIENT_VISA_LIFE_KEYS.length,178);assert.ok(Object.isFrozen(CLIENT_VISA_LIFE_KEYS));
 assert.deepEqual([...CLIENT_VISA_LIFE_KEYS].sort(),[...expected.keys()].sort());
 assert.equal(CLIENT_VISA_LIFE_KEYS.filter(k=>k.startsWith(prefix+'VisaCabinet.tsx#')).length,39);
 assert.equal(pack.staleWaiting.values.ru,'Ожидает оплаты');
 assert.notEqual(visaStatusLabel('service','WAITING_PAYMENT','ru'),pack.staleWaiting.values.ru);
 assert.equal(visaStatusLabel('service','WAITING_PAYMENT','en'),pack.staleWaiting.values.en);
});
for(const locale of locales)test('independent accepted public literals replay178 in '+locale,()=>{
 const ui=createClientUiBindings(locale);assert.equal(ui.locale,locale);
 for(const[identity,values]of expected)assert.equal(clientVisaLifeText(ui,identity as ClientVisaLifeKey),values[locale],identity);
});
for(const fake of [null,{}, {role:'admin',locale:'en'}, {role:'client',locale:'en',text:()=> 'fake'},
 {...createClientUiBindings('en')},Object.create(createClientUiBindings('en'))])test('public forged-binding rejection '+String(fake===null?'null':Object.keys(fake).join(',')),()=>{
 assert.throws(()=>clientVisaLifeText(fake as never,CLIENT_VISA_LIFE_KEYS[0]),/CLIENT_UI_BINDING_ROLE_OR_PROVENANCE/);
});
for(const key of ['life.countdown.future','life.termDays',prefix+'VisaCabinet.tsx#service.PAID',staleWaiting,'__proto__','constructor','inline:AdminLifeServices.tsx#private'])test('public unsupported identity has no RUEN fallback: '+key,()=>{
 assert.throws(()=>clientVisaLifeText(createClientUiBindings('fr'),key as never),/CLIENT_VISA_LIFE_SOURCE_GAP/);
});
test('semantic aliases preserve exact target RUEN rather than donor wording',()=>{
 const history=(prefix+'VisaCabinet.tsx#copy.history') as ClientVisaLifeKey,open=(prefix+'lifeServices.ts#lifeCopy.visaOpen') as ClientVisaLifeKey;
 assert.equal(clientVisaLifeText(createClientUiBindings('en'),history),'Timeline');
 assert.equal(clientVisaLifeText(createClientUiBindings('en'),open),'Open visas');
 for(const key of [history,open])for(const locale of ['ru','en'] as const)assert.equal(clientVisaLifeText(createClientUiBindings(locale),key),expected.get(key)![locale]);
});
test('all three whole templates retain exact substitutions and variable-identity rejection in ten locales',()=>{
 const templates=[...expected].filter(([,v])=>/\{[A-Za-z][A-Za-z0-9_]*\}/.test(v.ru));assert.equal(templates.length,3);
 for(const[identity,values]of templates)for(const locale of locales){
  const variables=Object.fromEntries([...values[locale].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m=>[m[1],3]));
  const text=values[locale].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_m,k:string)=>String(variables[k]));
  const key=identity as ClientVisaLifeKey,ui=createClientUiBindings(locale);assert.equal(clientVisaLifeText(ui,key,variables),text);
  assert.throws(()=>clientVisaLifeText(ui,key,{...variables,unexpected:9}),/CLIENT_(?:RUNTIME|VISA_LIFE)_VARIABLE_IDENTITY/);
 }
});
test('static received and semantic alias text rejects interpolation objects',()=>{
 for(const key of [prefix+'VisaCabinet.tsx#copy.title',prefix+'lifeServices.ts#lifeCopy.visaOpen'])for(const locale of ['ru','fr'] as const)
  assert.throws(()=>clientVisaLifeText(createClientUiBindings(locale),key as ClientVisaLifeKey,{}),/CLIENT_VISA_LIFE_STATIC_VARIABLES/);
});
test('public supplement113 retains exact schema,locales,inventory and all independent literal values',()=>{
 const data=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../../shared/content/client-ui/client-visa-life-supplement.v1.json'),'utf8'));
 assert.deepEqual(Object.keys(data),['schemaVersion','domain','locales','entries']);assert.equal(data.domain,'client-visa-life-copy');assert.deepEqual(data.locales,locales);
 assert.deepEqual(Object.keys(data.entries).sort(),[...pack.supplementKeys].sort());assert.equal(Object.keys(data.entries).length,113);
 for(const key of pack.supplementKeys){assert.deepEqual(data.entries[key],expected.get(key));assert.deepEqual(Object.keys(data.entries[key]),locales);}
 assert.equal(Object.keys(data.entries).filter(key=>/#help\.external\./.test(key)&&!key.endsWith('.fallback')).length,18);
 assert.ok(Object.hasOwn(data.entries,prefix+'visaEditorState.ts#help.external.fallback'));
 for(const row of pack.countRows)assert.ok(!Object.hasOwn(data.entries,row.key),'Whole counts must not leak into scalar lookup');
});
test('public current external38 strings retain protected tokens without claiming native replay',()=>{
 assert.equal(pack.externalKeys.length,38);
 for(const key of pack.externalKeys)for(const locale of foreign)for(const token of ['SAFRWAY','In Progress','Pending','Decision']){
  const values=expected.get(key)!;
  assert.equal(clientVisaLifeText(createClientUiBindings(locale),key as ClientVisaLifeKey).split(token).length,values.en.split(token).length);
 }
});
const counts=[0,1,2,3,4,5,7,11,15,21,22,99,100,101,102,1000,1_000_000,Number.MAX_SAFE_INTEGER];
test('public count dictionary has only the exact four approved whole-form schemas',()=>{
 const dict=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../../shared/content/client-ui/client-life-counts.v1.json'),'utf8'));
 assert.deepEqual(Object.keys(dict),['schemaVersion','domain','locales','entries']);assert.equal(dict.schemaVersion,1);
 assert.equal(dict.domain,'client-life-counts');assert.deepEqual(dict.locales,foreign);
 assert.deepEqual(Object.keys(dict.entries).sort(),pack.countRows.map(row=>row.key).sort());
 for(const row of pack.countRows)assert.deepEqual(dict.entries[row.key],row.values);
});
for(const locale of foreign)test('public four count contracts retain exact plural grammar and number order: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const row of pack.countRows)for(const count of counts){
  const key=row.key as ClientLifeCountKey;
  if(count===0&&(key==='life.countdown.expired'||key==='life.termDays')){assert.throws(()=>clientLifeCountParts(ui,key,count),/COUNT_DOMAIN/);continue;}
  const category=new Intl.PluralRules(locale).select(count),expected=row.values[locale][category];assert.equal(typeof expected,'string');
  const number=new Intl.NumberFormat(locale,{useGrouping:false,maximumFractionDigits:0}).format(count),parts=clientLifeCountParts(ui,key,count);
  assert.ok(Object.isFrozen(parts));assert.equal(parts.category,category);assert.equal(parts.number,number);
  assert.equal(parts.before+parts.number+parts.after,expected.replace(row.placeholder,number));assert.equal(clientLifeCountText(ui,key,count),parts.text);assert.equal(/[{}]/.test(parts.text),false);
 }
});
test('public count domain/key/binding boundary never coerces foreign input',()=>{
 const ui=createClientUiBindings('ar');let called=0;
 for(const value of [-1,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'2',{valueOf(){called++;return 2;}}])assert.throws(()=>clientLifeCountText(ui,'life.countdown.remaining',value as never),/COUNT_DOMAIN/);
 for(const key of ['__proto__','constructor','prototype','life.countdown.other'])assert.throws(()=>clientLifeCountText(ui,key as never,2),/COUNT_KEY/);
 for(const fake of [{},{...ui},Object.create(ui)])assert.throws(()=>clientLifeCountText(fake as never,'life.termDays',2),/BINDING_ROLE_OR_PROVENANCE/);
 for(const locale of ['ru','en'] as const)assert.throws(()=>clientLifeCountText(createClientUiBindings(locale),'life.termDays',2),/FOREIGN_ONLY/);
 assert.equal(called,0);assert.equal(clientLifeCountNumber(ui,-0),clientLifeCountNumber(ui,0));
});
for(const locale of locales)test('public price matrix preserves canonical arithmetic and replaces only units: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const price_currency of ['IDR','USD','USDT','RUB'] as const)for(const price_unit of ['period','month','day','policy'] as const)for(const price_amount of [null,'invalid','0','0.00001','1000.50','999999999999999999999999.00100'])for(const compact of [false,true]){
  const item={price_currency,price_unit,price_amount},legacyLocale=locale==='ru'||locale==='en'?locale:'en';
  const canonical=(compact?compactLifePrice:formatLifePrice)(item,legacyLocale),actual=clientLifePrice(item,ui,compact);
  if(canonical===null||locale==='ru'||locale==='en')assert.equal(actual,canonical);
  else{const unit=clientLifeText(createClientUiBindings('en'),price_unit);assert.equal(actual,canonical.slice(0,-unit.length)+clientLifeText(ui,price_unit));}
 }
});
for(const locale of locales)test('public visa date matrix retains core precedence,value and estimated state: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 for(const entered_on of [null,'2026-10-01'])for(const entry_deadline of [null,'2026-11-01'])for(const stay_end of [null,'2026-12-01'])for(const expected_stay_end of [null,'2027-01-01']){
  const item={entered_on,entry_deadline,stay_end,expected_stay_end},core=visaDatePresentation(item,locale==='ru'?'ru':'en'),actual=clientVisaDatePresentation(item,ui);
  if(!core){assert.equal(actual,null);continue;}assert.equal(actual!.value,core.value);assert.equal(actual!.estimated,core.estimated);
  const id=core.estimated?'estimatedStayUntil':(!entered_on&&entry_deadline)?'enterBy':'permittedStayUntil';
  assert.equal(actual!.label,clientVisaLifeText(ui,(prefix+'visaDatePresentation.ts#dates.'+id) as ClientVisaLifeKey));
 }
});
for(const locale of locales)test('public confirmed expiry without recorded entry stays visible: '+locale,()=>{
 const ui=createClientUiBindings(locale);
 const actual=clientVisaDatePresentation({entered_on:null,entry_deadline:null,stay_end:'2026-12-01',expected_stay_end:'2027-01-01'},ui);
 assert.deepEqual(actual,{label:clientVisaLifeText(ui,(prefix+'visaDatePresentation.ts#dates.permittedStayUntil') as ClientVisaLifeKey),value:'2026-12-01',estimated:false});
});
test('public lookup preserves binding descriptors and Arabic RTL',()=>{
 const ui=createClientUiBindings('ar'),before=Object.getOwnPropertyDescriptors(ui);for(const key of CLIENT_VISA_LIFE_KEYS)clientVisaLifeText(ui,key);
 assert.deepEqual(Object.getOwnPropertyDescriptors(ui),before);assert.equal(ui.dir,'rtl');
});
