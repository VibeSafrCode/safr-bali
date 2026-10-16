import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import manifest from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import {VIETNAM_LOCALES,vietnamSha as sha,DE_CORRECTED_FAQ6} from '../../shared/scripts/vietnam-editorial-source.mjs';
import {validateRegistry} from '../../shared/src/service-registry.mjs';
import {vietnamPrivateInventory,createVietnamEditorialInputResolver} from '../scripts/registry-vietnam-editorial-inputs.mjs';
import {createEditorialInputResolver} from '../scripts/registry-private-editorial-inputs.mjs';
import {createBankEditorialInputResolver} from '../scripts/registry-bank-editorial-inputs.mjs';
import {validateVietnamEditorialOriginal,validateVietnamEditorialProjection} from '../scripts/registry-vietnam-editorial-preview.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {renderRegistryPreview,registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
import {PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE,editorialVerificationContract,editorialValidator} from '../scripts/registry-editorial-verification-contract.mjs';
const selectedContract=editorialVerificationContract();
const root=new URL('../../shared/content/',import.meta.url),read=f=>readFileSync(new URL(f,root));
const record=registry.records.find(r=>r.contentId==='vietnam'),payload=l=>l==='ru'?record.candidate.ru:record.candidate.translations[l];
const metadata=l=>JSON.parse(read(payload(l).metadataFile));
const contract=(value,action)=>{const old=process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT;
  try{process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT=value;return action();}
  finally{if(old===undefined)delete process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT;else process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT=old;}};
const visible=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
test('single existing world_visa identity, ten source-stage locales, unchanged commercial and approval status',()=>{
  validateRegistry(registry);assert.equal(registry.records.filter(r=>r.contentId==='vietnam').length,1);assert.equal(record.kind,'world_visa');
  for(const k of ['serviceId','pricingRef','published'])assert.equal(record[k],null);
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.exposure,'preview_only');assert.ok(Object.values(manifest.publicationGates).every(v=>v===false));
  for(const l of VIETNAM_LOCALES){assert.equal(metadata(l).publicationAuthorized,false);if(l!=='ru')assert.equal(payload(l).qa,'not_done');}
});
for(const l of VIETNAM_LOCALES)test(selectedContract+' actual shared renderer preserves complete '+l,()=>{
  const p=payload(l),m=metadata(l),body=read(p.bodyFile).toString('utf8');
  editorialValidator(validateVietnamEditorialOriginal,validateVietnamEditorialProjection,selectedContract)(record,l,p,m,body);
  const model=buildRegistryDocument(registry,'vietnam',l,{editorialPreview:true});
  assert.equal(model.title,m.h1);assert.equal(model.seoTitle,m.seo.title);assert.equal(model.description,m.seo.description);assert.equal(model.dir,l==='ar'?'rtl':'ltr');
  assert.equal(model.sections.length,10);assert.equal(model.sections.filter(s=>s.faq).length,1);assert.equal(model.sections.find(s=>s.faq).heading,m.faqHeading);
  const html=[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join('\n'),text=visible(html);
  assert.equal((html.match(/<table>/g)||[]).length,1);assert.equal((html.match(/<tr>/g)||[]).length,5);assert.equal((html.match(/<li>/g)||[]).length,5);
  assert.equal(model.faqSchema.length,6);assert.equal(model.ctaActions.length,1);assert.equal(model.managerLabel,m.cta[0].label);assert.equal(model.languages.filter(x=>x.href).length,10);
  assert.equal(model.diagnostics.editorialPreview,true);assert.equal(model.diagnostics.qaMethod,l==='ru'?'supplied_ru_review_pending':'supplied_model_pending_render');
  assert.equal(model.price,null);assert.equal(model.pricingHref,null);
  for(const line of body.split('\n').filter(x=>x.trim()&&!/^(?:#|\||- )/.test(x)))assert.ok(text.includes(line.replace(/\*\*/g,'').replace(/\x60/g,'')),'Missing customer paragraph '+l);
  assert.doesNotMatch(html,/DEV4_|RU_REVIEW|SAFRWAY_VIETNAM_MAIN_RU|NATIVE_LF_ARCHIVE|Editorial notes/);
  for(let i=0;i<6;i++)assert.equal(model.faqSchema[i].question,m.faq[i].question);
});
test('DE FAQ6 uses only actual received correction',()=>{assert.equal(metadata('de').faq[5].answerMarkdown,DE_CORRECTED_FAQ6);});
test('private opt-in never becomes public authority and unsupported locale stays closed',()=>{
  for(const l of VIETNAM_LOCALES){assert.equal(buildRegistryDocument(registry,'vietnam',l),null);assert.equal(buildRegistryDocument(registry,'vietnam',l,{editorialPreview:true,targetHref:()=>'/public/'}),null);}
  assert.equal(buildRegistryDocument(registry,'vietnam','xx',{editorialPreview:true}),null);
});
test('explicit derivative never supplies proof of missing originals',()=>contract(PUBLIC_DERIVATIVE,()=>{
  assert.equal(buildRegistryDocument(registry,'vietnam','en',{editorialPreview:true,readVietnamSource:()=>{throw Error('NO_ORIGINAL');}}).faqSchema.length,6);
  assert.throws(()=>validateVietnamEditorialOriginal(record,'en',payload('en'),metadata('en'),read(payload('en').bodyFile).toString('utf8'),{readSource:()=>{throw Error('NO_ORIGINAL');}}),/NO_ORIGINAL/);
}));
test(selectedContract+' ten-input inventory; absent roots never fall back to projections',()=>{
  assert.equal(vietnamPrivateInventory().files.length,10);assert.throws(()=>createVietnamEditorialInputResolver({privateRoot:null}),/VIETNAM_PRIVATE_ROOT_REQUIRED/);
  assert.throws(()=>createVietnamEditorialInputResolver({privateRoot:'/no-vietnam-bundle'}));
  if(selectedContract===PRIVATE_ORIGINALS){
    const reader=createVietnamEditorialInputResolver();
    assert.throws(()=>reader('registry-copy/student_ru_native.source.json'),/UNBOUND_VIETNAM_PRIVATE_INPUT/);
    for(const pin of vietnamPrivateInventory().files)assert.equal(sha(reader(pin.file)),pin.sha256);
  }else for(const l of VIETNAM_LOCALES){
    assert.throws(()=>validateVietnamEditorialOriginal(record,l,payload(l),metadata(l),read(payload(l).bodyFile).toString('utf8'),
      {readSource:()=>{throw Error('VIETNAM_ORIGINAL_REQUIRED');}}),/VIETNAM_ORIGINAL_REQUIRED/);
  }
});
test(selectedContract+' base240 denies Vietnam selectors; bank originals are a separate strict gate',()=>{
  const base=createEditorialInputResolver();
  for(const pin of vietnamPrivateInventory().files)assert.throws(()=>base(pin.file),e=>e.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
  if(selectedContract===PRIVATE_ORIGINALS){
    const bank=createBankEditorialInputResolver();
    for(const pin of vietnamPrivateInventory().files)assert.throws(()=>bank(pin.file),/UNBOUND_BANK_PRIVATE_INPUT/);
  }else assert.throws(()=>createBankEditorialInputResolver({privateRoot:null}),/BANK_PRIVATE_ROOT_REQUIRED/);
});
for(const [name,edit] of [
  ['body',x=>x.body+='\nEdited'],['SEO',x=>x.meta.seo.title+=' Edited'],['fake QA',x=>x.meta.approval.legalVerification=true],['locale',x=>x.meta.locale='ru'],
  ['direction',x=>x.meta.direction='rtl'],['CTA',x=>x.meta.cta=[]],['table',x=>x.meta.tables[0].dataRows=3],['FAQ',x=>x.meta.faq.pop()],
  ['notes',x=>x.meta.privateEditorialNotes='leak'],['identity',x=>x.rec.contentId='vietnam-copy'],['Service',x=>x.rec.serviceId='new-service'],
  ['price',x=>x.rec.pricingRef={}],['availability',x=>x.rec.availability='available'],
])test('version-bound rejection: '+name,()=>{const x={rec:structuredClone(record),meta:metadata('en'),body:read(payload('en').bodyFile).toString('utf8')};edit(x);assert.throws(()=>validateVietnamEditorialProjection(x.rec,'en',x.rec.candidate.translations.en,x.meta,x.body));});
test('missing source bytes and foreign source manifests fail closed',()=>{
  assert.throws(()=>validateVietnamEditorialOriginal(record,'en',payload('en'),metadata('en'),read(payload('en').bodyFile).toString('utf8'),{readSource:()=>Buffer.from('{}')}),/private source bytes drift/);
  for(const edit of [m=>m.records[0].contentId='copy',m=>m.publicationGates.legalVerification=true,m=>m.records[0].locales.en.sourceFileSha256='0'.repeat(64)]){
    const changed=structuredClone(manifest);edit(changed);assert.throws(()=>validateVietnamEditorialProjection(record,'en',payload('en'),metadata('en'),read(payload('en').bodyFile).toString('utf8'),{manifest:changed}));
  }
});
test('legacy preview never reads Vietnam raw body through a source-gate bypass',()=>{
  let reads=0;const copy=structuredClone(registry),r=copy.records.find(x=>x.contentId==='vietnam');
  r.candidate.ru.metadataFile=null;r.candidate.ru.bodyFile='POISONED_RU_BODY.md';
  const html=renderRegistryPreview(copy,'vietnam','ru',()=>{reads++;return 'POISONED_CUSTOMER_SENTINEL';});
  assert.equal(reads,0);assert.doesNotMatch(html,/POISONED_CUSTOMER_SENTINEL|<pre>/);
});
const token='SYNTHETIC_PREVIEW_TEST_ONLY_0123456789';
async function middlewareProbe({url='/_registry/vietnam/?locale=ru',renderer}={}){
  const poisoned=structuredClone(registry),r=poisoned.records.find(x=>x.contentId==='vietnam');
  r.candidate.ru.metadataFile=null;r.candidate.ru.bodyFile='POISONED_RU_BODY.md';
  const req={url,method:'GET',socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost',authorization:'Basic '+Buffer.from('preview:'+token).toString('base64')}};
  const result={headers:{},body:null,next:false},res={setHeader:(k,v)=>result.headers[k]=v,end:value=>{result.body=value;}};
  await registryPreviewMiddleware({token,load:()=>poisoned,validate:()=>{},renderer})(req,res,()=>{result.next=true;});
  return {...result,status:res.statusCode};
}
test('missing and null preview renderers deny Vietnam instead of using raw fallback',async()=>{
  for(const renderer of [undefined,()=>null,async()=>null]){
    const result=await middlewareProbe({renderer});assert.equal(result.status,404);assert.equal(result.body,'Not found');assert.equal(result.next,false);
  }
});
test('failed structured renderer stays failed, never silently falls back to raw body',async()=>{
  const result=await middlewareProbe({renderer:()=>{throw Error('POISONED_PRIVATE_SOURCE');}});
  assert.equal(result.status,503);assert.doesNotMatch(result.body,/POISONED_PRIVATE_SOURCE|POISONED_RU_BODY/);
});
test('Vietnam source manifest is denied before raw/module import loaders',async()=>{
  for(const url of ['/shared/content/registry-vietnam-editorial-build.v1.json?raw','/@fs/shared/content/registry-vietnam-editorial-build.v1.json?import','/shared/content/%2572egistry-vietnam-editorial-build.v1.json']){
    const result=await middlewareProbe({url});assert.equal(result.status,404);assert.equal(result.next,false);assert.equal(result.headers['Cache-Control'],'no-store');
  }
});
