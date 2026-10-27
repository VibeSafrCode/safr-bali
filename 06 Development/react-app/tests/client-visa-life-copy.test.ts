import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createClientUiBindings} from '../src/i18n/client-ui-bindings';
import {CLIENT_VISA_LIFE_KEYS,clientVisaLifeText,type ClientVisaLifeKey} from '../src/i18n/client-visa-life-copy';
import {visaStatusLabel} from '../src/components/visaEditorState';
import {correctedVisaHelpValues,visaActivationCopyCorrection} from './fixtures/visa-activation-copy-correction';
const plan=process.env.SAFR_VISA_LIFE_SOURCE_PLAN;
assert.ok(plan,'Explicit private source-plan fixture path is required; no network/source generation');
const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const retainedPacks=new Map([
 ['fb04c0c323ab8fc0b490c34022236b8cbd90218af52ba6cfb9170f17413a4a2c','CLIENT_VISA_CABINET_EIGHT_8_DEV5_007_20261016_RECEIVED_CUSTOMER_PACK.json'],
 ['5840722cdb586b31b3a50c0c2a65f3cfce143c61944f0b36510cfbce636990e5','CLIENT_VISA_CABINET_EIGHT_SPECIFIC_LABELS_8_DEV5_009_20261016_RECEIVED_CUSTOMER_PACK.json'],
]);
const load=(file:string,hash:string)=>{
 let resolved=file;
 // Only two immutable nested packs outlived their original temporary location.
 // No directory search, hash change, source rewriting or general fallback.
 if(!fs.existsSync(file)&&retainedPacks.get(hash)===path.basename(file)){
  const directory=process.env.SAFR_VISA_LEGACY_PACK_DIR;
  assert.ok(directory,'Explicit retained native-pack directory required');
  assert.equal(fs.realpathSync(directory),path.resolve(directory));
  assert.ok(fs.lstatSync(directory).isDirectory());
  resolved=path.join(directory,path.basename(file));
  assert.ok(fs.lstatSync(resolved).isFile()&&!fs.lstatSync(resolved).isSymbolicLink());
 }
 const b=fs.readFileSync(resolved);assert.equal(sha(b),hash);return JSON.parse(b.toString('utf8'));
};
const life=load(path.join(plan,'LIFE_UI10_REUSE_INVENTORY_20261016.json'),'d32809e86f5c7de70edef17c3827e4246f718210dcb35e3d2638374572841365');
const visa=load(path.join(plan,'VISA_UI10_REUSE_INVENTORY_20261016.json'),'b67a9966ab5ac3071e475012260e8d0fbc1e13880508e703950fce6da9b0fc96');
type Values=Record<string,string>;
const expected=new Map<string,Values>();
for(const row of life.readyMappings)expected.set(row.targetIdentity,{...row.translations,...row.targetRuEn});
const classes=['RECEIVED_ACCEPTED_FULL8_NOT_RUNTIME','EXACT_FULL8_READY_SOURCE','EXPLICIT_EXISTING_SEMANTIC_REUSE_FULL8'];
for(const row of visa.targets.filter((r:{classification:string})=>classes.includes(r.classification))){
 const data=load(row.source.path,row.source.sha256);
 const values=data.entries?.[row.source.key]??data.rows?.find((r:{key:string})=>r.key===row.source.key)?.values;
 assert.ok(values);expected.set('source:06 Development/react-app/src/components/VisaCabinet.tsx#'+row.id,{...values,ru:row.ru,en:row.en});
}
const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
const prefix='source:06 Development/react-app/src/components/';
// The old75 snapshot had an exact waitingPayment alias. Current workflow RU
// changed, so the historical source stays archived but is not current-ready.
const staleWaiting=(prefix+'VisaCabinet.tsx#service.WAITING_PAYMENT');
assert.equal(expected.size,82);assert.equal(expected.get(staleWaiting)?.ru,'Ожидает оплаты');
assert.notEqual(visaStatusLabel('service','WAITING_PAYMENT','ru'),expected.get(staleWaiting)?.ru);
assert.equal(visaStatusLabel('service','WAITING_PAYMENT','en'),expected.get(staleWaiting)?.en);
expected.delete(staleWaiting);
assert.equal(expected.size,81);
const scalarSource=process.env.SAFR_VISA_LIFE_SCALAR_SOURCE;
assert.ok(scalarSource,'Explicit private native scalar19 pack is required');
const scalar19=load(scalarSource,'37e54630fb5166594690432354d2ced7c046b594f9bab7ffdcdc72b38ef3c687');
assert.equal(scalar19.rows.length,19);assert.equal(scalar19.scalarForeignValues,152);
for(const row of scalar19.rows){assert.ok(!expected.has(row.key));expected.set(row.key,row.values);}
const helpSource=process.env.SAFR_VISA_HELP12_SOURCE;
assert.ok(helpSource,'Explicit private current-help12 source pack is required');
const help12=load(helpSource,'edb7feea05fa280326b0d33f79ea5318d58eb25b614b9c498fe28ff1d347ab14');
assert.equal(help12.rows.length,12);assert.equal(help12.foreignValues,96);
for(const row of help12.rows){assert.ok(!expected.has(row.key));expected.set(row.key,row.values);}
const statusSource=process.env.SAFR_VISA_STATUS_COUNTS_SOURCE;
assert.ok(statusSource,'Explicit private labels28/counts4 source pack required');
const status28=load(statusSource,'1057f900b9725888769bf0981aff66b4ae00ae8a205dcc57ebb5186f4aa9ab57');
assert.equal(status28.labelRows.length,28);assert.equal(status28.labelsForeignValues,224);
for(const row of status28.labelRows){assert.ok(!expected.has(row.key));expected.set(row.key,row.values);}
const externalSource=process.env.SAFR_VISA_EXTERNAL38_SOURCE;
assert.ok(externalSource,'Explicit private current external38 source pack required');
const external38=load(externalSource,'24cc715048756128cbf04724f76da5241d3d5563c756e2684c75981c6a869d55');
assert.equal(external38.rows.length,38);
for(const row of external38.rows){assert.ok(!expected.has(row.key));expected.set(row.key,row.values);}
// Complete immutable source reconstruction precedes the single explicit fix.
const historicalExpected=new Map(expected);
assert.equal(expected.size,178);
expected.set(visaActivationCopyCorrection.identity,correctedVisaHelpValues(visaActivationCopyCorrection.identity,expected.get(visaActivationCopyCorrection.identity)!));
test('one explicit application-copy correction preserves historical source and other177 identities',()=>{
 assert.equal(visaActivationCopyCorrection.historicalHelpPackSha256,sha(fs.readFileSync(helpSource)));
 assert.deepEqual(historicalExpected.get(visaActivationCopyCorrection.identity),visaActivationCopyCorrection.before);
 assert.deepEqual(expected.get(visaActivationCopyCorrection.identity),visaActivationCopyCorrection.after);
 for(const[key,values]of historicalExpected)if(key!==visaActivationCopyCorrection.identity)assert.strictEqual(expected.get(key),values);
 assert.throws(()=>correctedVisaHelpValues(visaActivationCopyCorrection.identity,{...visaActivationCopyCorrection.before,en:'unexpected drift'}));
});
test('finite178 identities preserve140 and add38 current external/help labels; stale identities remain rejected',()=>{
 assert.equal(expected.size,178);assert.equal(CLIENT_VISA_LIFE_KEYS.length,178);assert.ok(Object.isFrozen(CLIENT_VISA_LIFE_KEYS));
 assert.deepEqual([...CLIENT_VISA_LIFE_KEYS].sort(),[...expected.keys()].sort());
 assert.equal(CLIENT_VISA_LIFE_KEYS.filter(k=>k.startsWith(prefix+'VisaCabinet.tsx#')).length,39);
});
for(const locale of locales)test('actual adapter literal whole-source replay178 in '+locale,()=>{
 const ui=createClientUiBindings(locale);assert.equal(ui.locale,locale);
 for(const[identity,values]of expected)assert.equal(clientVisaLifeText(ui,identity as ClientVisaLifeKey),values[locale],identity);
});
for(const fake of [null,{}, {role:'admin',locale:'en'}, {role:'client',locale:'en',text:()=> 'fake'},
 {...createClientUiBindings('en')},Object.create(createClientUiBindings('en'))]){
 test('forged/missing/preview binding rejected '+String(fake===null?'null':Object.keys(fake).join(',')),()=>{
  assert.throws(()=>clientVisaLifeText(fake as never,CLIENT_VISA_LIFE_KEYS[0]),/CLIENT_UI_BINDING_ROLE_OR_PROVENANCE/);
 });
}
for(const key of ['life.countdown.future','life.termDays',
 prefix+'VisaCabinet.tsx#service.PAID',staleWaiting,'__proto__','constructor','inline:AdminLifeServices.tsx#private']){
 test('uncovered or internal key is explicit gap, not RUEN fallback: '+key,()=>{
  assert.throws(()=>clientVisaLifeText(createClientUiBindings('fr'),key as never),/CLIENT_VISA_LIFE_SOURCE_GAP/);
 });
}
test('two semantic aliases preserve target RUEN, not donor copy',()=>{
 const history=(prefix+'VisaCabinet.tsx#copy.history') as ClientVisaLifeKey;
 const open=(prefix+'lifeServices.ts#lifeCopy.visaOpen') as ClientVisaLifeKey;
 assert.equal(clientVisaLifeText(createClientUiBindings('en'),history),'Timeline');
 for(const key of [history,open])for(const locale of ['ru','en'] as const)
  assert.equal(clientVisaLifeText(createClientUiBindings(locale),key),expected.get(key)![locale]);
});
test('existing whole templates use unchanged runtime placeholder validation, no new plural claim',()=>{
 const templates=[...expected].filter(([,v])=>/\{[A-Za-z][A-Za-z0-9_]*\}/.test(v.ru));
 assert.equal(templates.length,3);
 for(const[identity,values]of templates)for(const locale of locales){
  const variables=Object.fromEntries([...values[locale].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(m=>[m[1],3]));
  const expectedText=values[locale].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_m,k:string)=>String(variables[k]));
  const key=identity as ClientVisaLifeKey,ui=createClientUiBindings(locale);
  assert.equal(clientVisaLifeText(ui,key,variables),expectedText);
  assert.throws(()=>clientVisaLifeText(ui,key,{...variables,unexpected:9}),/CLIENT_(?:RUNTIME|VISA_LIFE)_VARIABLE_IDENTITY/);
 }
});
test('static received/journey/legacy aliases do not accept interpolation data',()=>{
 for(const key of [(prefix+'VisaCabinet.tsx#copy.title'),(prefix+'lifeServices.ts#lifeCopy.visaOpen')]){
  for(const locale of ['ru','fr'] as const)assert.throws(()=>clientVisaLifeText(createClientUiBindings(locale),key as ClientVisaLifeKey,{}),/CLIENT_VISA_LIFE_STATIC_VARIABLES/);
 }
});
test('received113 rows preserve75 and add exact current external38; no historical source leaks',()=>{
 const full=path.resolve(import.meta.dirname,'../../shared/content/client-ui/client-visa-life-supplement.v1.json');
 const data=JSON.parse(fs.readFileSync(full,'utf8'));assert.deepEqual(Object.keys(data),['schemaVersion','domain','locales','entries']);
 assert.equal(data.domain,'client-visa-life-copy');assert.deepEqual(data.locales,locales);assert.equal(Object.keys(data.entries).length,113);
 for(const receipt of visa.acceptedReceipts){
  const pack=load(receipt.packPath,receipt.packSha256);assert.equal(pack.rows.length,8);
  for(const row of pack.rows){assert.deepEqual(data.entries[row.key],row.values);assert.deepEqual(Object.keys(row.values),locales);}
 }
 for(const row of scalar19.rows)assert.deepEqual(data.entries[row.key],row.values);
 for(const row of help12.rows)assert.deepEqual(data.entries[row.key],correctedVisaHelpValues(row.key,row.values));
 for(const row of status28.labelRows)assert.deepEqual(data.entries[row.key],row.values);
 for(const row of external38.rows)assert.deepEqual(data.entries[row.key],row.values);
 assert.equal(help12.excludedPreparedIdentities,11);assert.equal(help12.excludedPreparedValues,88);
 assert.equal(Object.keys(data.entries).filter(key=>/#help\.external\./.test(key)&&!key.endsWith('.fallback')).length,18);
 assert.ok(Object.hasOwn(data.entries,'source:06 Development/react-app/src/components/visaEditorState.ts#help.external.fallback'));
 assert.equal(scalar19.held.wholeCountRuntimeImported,false);
 assert.equal(Object.keys(data.entries).some(key=>scalar19.held.keys.includes(key)),false);
});
test('language lookup neither mutates binding nor changes contact/referral/business data',()=>{
 const ui=createClientUiBindings('ar'),before=Object.getOwnPropertyDescriptors(ui);
 for(const key of CLIENT_VISA_LIFE_KEYS)clientVisaLifeText(ui,key);
 assert.deepEqual(Object.getOwnPropertyDescriptors(ui),before);assert.equal(ui.dir,'rtl');
});

