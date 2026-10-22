import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync,rmSync,chmodSync} from 'node:fs';
import currentRegistry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import nativeManifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import localManifest from '../../shared/content/registry-sktt-local-editorial-build.v1.json' with {type:'json'};
import {sha256 as sha} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {encoded,SKTT_LOCALES} from '../../shared/scripts/sktt-editorial-import.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {SKTT_LOCAL_KIND,SKTT_LOCAL_LOCALES,SKTT_NATIVE_MANIFEST_SHA,SKTT_NATIVE_RECORD_SHA,
 parseSkttLocalPage,skttLocalOriginalsFromWire,planSkttLocalEditorialImport} from '../../shared/scripts/sktt-local-editorial-import.mjs';
import {privateEditorialBytePrimitives,createEditorialInputResolver} from '../scripts/registry-private-editorial-inputs.mjs';
import {skttLocalPrivateInventory,preparePrivateSkttLocalEditorialBundle,createSkttLocalEditorialInputResolver} from '../scripts/registry-sktt-local-editorial-inputs.mjs';
import {skttNativeRecordForValidation,validateSkttLocalEditorialProjection,validateSkttLocalEditorialOriginal} from '../scripts/registry-sktt-local-editorial-preview.mjs';
import {validateSkttEditorialOriginal} from '../scripts/registry-sktt-editorial-preview.mjs';
import {validateRegistry} from '../../shared/src/service-registry.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
import {publicBuildEntries,publicTargetHref} from '../scripts/registry-publication.mjs';

// Explicit, exact private original inputs are mandatory. No public-only profile,
// absent-root skip, invented native receipt, source regeneration or network.
const sourceRoot=process.env.SAFR_SKTT_LOCAL_TEST_SOURCE_ROOT;
assert.equal(typeof sourceRoot,'string','SAFR_SKTT_LOCAL_TEST_SOURCE_ROOT required');
const inventory=skttLocalPrivateInventory(),inputsByLocale=new Map(),wires=new Map();
for(const locale of SKTT_LOCAL_LOCALES){
 const pin=localManifest.records[0].locales[locale];
 const bytes=privateEditorialBytePrimitives.readPinned(sourceRoot,pin.sourceFile,{privateRoot:true,expectedSha256:pin.sourceFileSha256}).bytes;
 const wire=JSON.parse(bytes);wires.set(locale,wire);inputsByLocale.set(locale,skttLocalOriginalsFromWire(wire,locale));
}
const nativeRecord=skttNativeRecordForValidation(currentRegistry.records.find(row=>row.contentId==='sktt'));
const before={...currentRegistry,records:currentRegistry.records.map(row=>row.contentId==='sktt'?nativeRecord:row)};
const plan=planSkttLocalEditorialImport(before,inputsByLocale,{metadataEnvelope});
const registry={...before,records:before.records.map(row=>row.contentId==='sktt'?plan.record:row)};
const record=plan.record,files=new Map(plan.files.map(row=>[row.path,row.text]));
const payload=locale=>locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
const contentRoot=new URL('../../shared/content/',import.meta.url);
const read=file=>files.has(file)?files.get(file):readFileSync(new URL(file,contentRoot));
const metadata=locale=>JSON.parse(read(payload(locale).metadataFile));
const prepared=preparePrivateSkttLocalEditorialBundle(sourceRoot),privateReader=createSkttLocalEditorialInputResolver({privateRoot:prepared.root});
after(()=>rmSync(prepared.root,{recursive:true}));
const visible=text=>text.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");

test('exact finite plan adds only two payloads; current eight and161 records remain unchanged',()=>{
 validateRegistry(registry);assert.deepEqual(plan.manifest,localManifest);assert.equal(plan.files.length,6);
 assert.equal(sha(encoded(nativeRecord)),SKTT_NATIVE_RECORD_SHA);assert.equal(sha(encoded(nativeManifest)),SKTT_NATIVE_MANIFEST_SHA);
 assert.deepEqual(skttNativeRecordForValidation(record),nativeRecord);
 assert.deepEqual(record.candidate.ru,nativeRecord.candidate.ru);
 for(const locale of SKTT_LOCALES.filter(code=>code!=='ru'))assert.deepEqual(record.candidate.translations[locale],nativeRecord.candidate.translations[locale]);
 assert.deepEqual(registry.records.filter(row=>row.contentId!=='sktt'),currentRegistry.records.filter(row=>row.contentId!=='sktt'));
 assert.equal(sha(JSON.stringify(registry.records.filter(row=>row.contentId!=='sktt'))),'f6714f64f7f407bfca1aeaa73fd6608eb3d29e120df9a827de77e707e485577f');
 assert.equal(plan.manifest.fullTenLocaleSourceComplete,true);assert.deepEqual(plan.manifest.nativeReceivedLocales,SKTT_LOCALES);
 assert.deepEqual(plan.manifest.localModelLocales,['hi','ar']);assert.deepEqual(plan.manifest.missingLocales,[]);
 assert.ok(Object.values(plan.manifest.publicationGates).every(value=>value===false));
});
for(const locale of SKTT_LOCAL_LOCALES)test('new local '+locale+' exact whole original + actual structured renderer',()=>{
 const body=read(payload(locale).bodyFile).toString(),meta=metadata(locale);
 validateSkttLocalEditorialOriginal(record,locale,payload(locale),meta,body,{readSource:privateReader});
 assert.equal(meta.fullPayloadKind,SKTT_LOCAL_KIND);assert.equal(meta.sourceProvenance.kind,'LOCAL_MODEL_TRANSLATION_DRAFT');
 assert.equal(meta.sourceProvenance.nativeReceipt,null);assert.equal(meta.sourceProvenance.nativeSpeakerReview,false);
 assert.equal(meta.approval.legalVerification,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.publicationAuthorized,false);
 assert.equal(body,inputsByLocale.get(locale).get(locale+'.md').toString());
 const model=buildRegistryDocument(registry,'sktt',locale,{editorialPreview:true,readBody:read,readMetadata:read,readSkttLocalSource:privateReader});
 assert.equal(model.dir,locale==='ar'?'rtl':'ltr');assert.equal(model.title,meta.h1);assert.equal(model.seoTitle,meta.seo.title);
 assert.equal(model.description,meta.seo.description);assert.equal(model.sections.length,3);assert.equal(model.faqSchema.length,2);
 assert.equal(model.managerLabel,meta.cta[0].label);assert.equal(model.ctaActions.length,1);assert.equal(model.price,null);assert.equal(model.pricingHref,null);
 assert.equal(model.diagnostics.qaMethod,'local_model_semantic_ack_pending_render');assert.equal(model.languages.filter(row=>row.href).length,10);
 const html=[model.introHtml,...model.sections.map(row=>row.html)].join('\n'),text=visible(html);
 for(const line of body.split('\n').filter(row=>row.trim()&&!row.startsWith('#')))assert.ok(text.includes(line.replaceAll('**','').trimEnd()));
 for(const faq of meta.faq){assert.equal(text.split(faq.question).length-1,1);assert.equal(text.split(faq.answerMarkdown).length-1,1);}
 assert.doesNotMatch(html,/LOCAL_MODEL|ROOT_ACCEPTANCE|PEER_REVIEW|CONTENT_DRAFTS|DEV4_|\/Users\//);
});
test('all eight native models retain body/SEO/CTA/pricing/diagnostics; only language links expand',()=>{
 for(const locale of SKTT_LOCALES){
  const prior=buildRegistryDocument(before,'sktt',locale,{editorialPreview:true});
  const next=buildRegistryDocument(registry,'sktt',locale,{editorialPreview:true});
  assert.equal(next.languages.filter(row=>row.href).length,10);
  const {languages:a,...priorRest}=prior,{languages:b,...nextRest}=next;assert.deepEqual(nextRest,priorRest);
 }
});
test('all40 bank/Vietnam models remain identical',()=>{
 const entries=publicBuildEntries();
 for(const id of ['bank','vietnam'])for(const {code:locale} of registry.locales){
  const entry=entries.find(row=>row.contentId===id&&row.locale===locale);assert.ok(entry);
  const publicOption=id==='bank'?{bankEditorialPublicEntry:entry}:{vietnamEditorialPublicEntry:entry};
  for(const options of [{editorialPreview:true},{...publicOption,targetHref:publicTargetHref}])
   assert.deepEqual(buildRegistryDocument(registry,id,locale,options),buildRegistryDocument(before,id,locale,options));
 }
});
test('all10 candidate flags remain preview-only; additive public grant is separate from source QA',()=>{
 assert.equal(record.published,null);assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
 assert.equal(record.release,'not_authorized');assert.equal(record.candidate.exposure,'preview_only');
 assert.equal(publicBuildEntries().filter(row=>row.contentId==='sktt').length,10);
 assert.equal(publicBuildEntries().filter(row=>!['sktt','hospitality'].includes(row.contentId)).length,630);
 assert.equal(publicBuildEntries().filter(row=>row.contentId==='hospitality').length,10,'Separate exact two-component grant, not SKTT source-QA promotion');
 for(const {code:locale} of registry.locales){
  assert.equal(publicTargetHref('sktt',locale),registry.locales.find(row=>row.code===locale).prefix+record.candidate.route);
  assert.equal(buildRegistryDocument(registry,'sktt',locale),null);
  assert.equal(buildRegistryDocument(registry,'sktt',locale,{editorialPreview:true,targetHref:()=>'/public/'}),null);
 }
});
test('unknown locale has no body reads/RU fallback',()=>{
 let reads=0;assert.equal(buildRegistryDocument(registry,'sktt','xx',{editorialPreview:true,readBody:()=>{reads++;throw Error('NO_READ');}}),null);assert.equal(reads,0);
 for(const locale of ['ru','en','xx'])assert.throws(()=>parseSkttLocalPage(locale,inputsByLocale.get('hi')));
});
test('local two cannot be rebranded as native eight or consume native locale',()=>{
 assert.throws(()=>validateSkttEditorialOriginal(record,'hi',payload('hi'),metadata('hi'),read(payload('hi').bodyFile),{readSource:privateReader}));
 assert.throws(()=>validateSkttLocalEditorialOriginal(record,'en',payload('en'),metadata('en'),read(payload('en').bodyFile),{readSource:privateReader}));
 const meta=structuredClone(metadata('hi'));meta.fullPayloadKind='SKTT_NATIVE_RECEIVED_EIGHT_V1';
 assert.throws(()=>validateSkttLocalEditorialProjection(record,'hi',payload('hi'),meta,read(payload('hi').bodyFile)));
});
test('original byte pins reject body/fields/peer/Root/README drift and missing Root receipt',()=>{
 const original=inputsByLocale.get('hi');
 for(const file of original.keys()){
  const copy=new Map(original);copy.set(file,Buffer.concat([copy.get(file),Buffer.from(' ')]));assert.throws(()=>parseSkttLocalPage('hi',copy));
 }
 const missing=new Map(original);missing.delete('ROOT_ACCEPTANCE.json');assert.throws(()=>parseSkttLocalPage('hi',missing));
 const extra=new Map(original);extra.set('NATIVE_RECEIPT.json',Buffer.from('{}'));assert.throws(()=>parseSkttLocalPage('hi',extra));
});
test('unknown private wire/mode/locale and fake native IDs are rejected',()=>{
 for(const mutate of [w=>w.sourceMode='SKTT_NATIVE_RECEIVED_20261003',w=>w.locale='ar',w=>w.contentId='bank',w=>w.nativeReceipt='FAKE']){
  const wire=structuredClone(wires.get('hi'));mutate(wire);assert.throws(()=>skttLocalOriginalsFromWire(wire,'hi'));
 }
});
for(const [name,mutate] of [
 ['body',x=>x.body+=' changed'],['metadata',x=>x.meta.seo.title+=' changed'],
 ['identity',x=>x.record.contentId='other'],['price',x=>x.record.pricingRef={}],
 ['service',x=>x.record.serviceId='new'],['publication',x=>x.meta.publicationAuthorized=true],
 ['fake native QA',x=>x.meta.approval.nativeSpeakerReview=true],['fake legal QA',x=>x.meta.approval.legalVerification=true],
 ['direction',x=>x.meta.direction='ltr'],['mode',x=>x.meta.sourceMode='unknown'],
 ['retained native payload',x=>x.record.candidate.translations.en.bodySha256='0'.repeat(64)],
])test('exact composite pin refuses '+name,()=>{
 const x={record:structuredClone(record),meta:metadata('ar'),body:read(payload('ar').bodyFile).toString()};mutate(x);
 assert.throws(()=>validateSkttLocalEditorialProjection(x.record,'ar',x.record.candidate.translations.ar,x.meta,x.body));
});
test('missing/wrong private root and file modes never fall back to projections/base/native',()=>{
 assert.equal(skttLocalPrivateInventory().files.length,2);
 assert.throws(()=>createSkttLocalEditorialInputResolver({privateRoot:null}),/SKTT_LOCAL_PRIVATE_ROOT_REQUIRED/);
 assert.throws(()=>createSkttLocalEditorialInputResolver({privateRoot:'/no-such-sktt-local-bundle'}));
 assert.throws(()=>privateReader('registry-copy/sktt_en_native_20261003.source.json'),/UNBOUND_SKTT_LOCAL_PRIVATE_INPUT/);
 const base=createEditorialInputResolver();
 for(const pin of inventory.files)assert.throws(()=>base(pin.file),error=>error.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
 const file=prepared.root+'/files/'+inventory.files[0].file;chmodSync(file,0o644);
 try{assert.throws(()=>createSkttLocalEditorialInputResolver({privateRoot:prepared.root}));}finally{chmodSync(file,0o600);}
});
test('public verification profile does not replace mandatory local original',()=>{
 assert.throws(()=>buildRegistryDocument(registry,'sktt','hi',{editorialPreview:true,readBody:read,readMetadata:read,readSkttLocalSource:()=>{throw Error('LOCAL_ORIGINAL_REQUIRED');}}),/LOCAL_ORIGINAL_REQUIRED/);
});
test('new manifest denied before auth/raw/import loaders, including encoded/uppercase forms',async()=>{
 for(const url of ['/shared/content/registry-sktt-local-editorial-build.v1.json?raw','/@fs/shared/content/registry-sktt-local-editorial-build.v1.json?import','/shared/content/%2572egistry-sktt-local-editorial-build.v1.json','/SHARED/CONTENT/REGISTRY-SKTT-LOCAL-EDITORIAL-BUILD.V1.JSON']){
  const result={headers:{},next:false},res={setHeader:(key,value)=>result.headers[key]=value,end:()=>{}};
  await registryPreviewMiddleware()({url,method:'GET',headers:{},socket:{}},res,()=>{result.next=true;});
  assert.equal(res.statusCode,404);assert.equal(result.next,false);assert.equal(result.headers['Cache-Control'],'no-store');
 }
});
