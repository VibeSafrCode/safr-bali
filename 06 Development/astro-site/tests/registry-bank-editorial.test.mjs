import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import sourceManifest from '../../shared/content/registry-bank-editorial-build.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-bank-editorial-public-build.v1.json' with {type:'json'};
import {BANK_LOCALES} from '../../shared/scripts/bank-editorial-source.mjs';
import {preBankRegistry} from '../../shared/tests/fixtures/pre-bank-registry.mjs';
import {preVietnamRegistry} from '../../shared/tests/fixtures/pre-vietnam-registry.mjs';
import {bankPrivateInventory,createBankEditorialInputResolver} from '../scripts/registry-bank-editorial-inputs.mjs';
import {createEditorialInputResolver} from '../scripts/registry-private-editorial-inputs.mjs';
import {validateBankEditorialProjection,validateBankEditorialPublicDerivative,validateBankEditorialPublicOriginals,
  validateBankEditorialPublicEntry} from '../scripts/registry-bank-editorial-publication.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {applyPublicBankOwnerIndexing,publicBankApprovedRoutes} from '../src/lib/public-bank-owner-indexing.mjs';
import {editorialVerificationContract,PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE} from '../scripts/registry-editorial-verification-contract.mjs';

const content=new URL('../../shared/content/',import.meta.url);
const read=file=>readFileSync(new URL(file,content));
const sha=value=>createHash('sha256').update(value).digest('hex');
const record=registry.records.find(r=>r.contentId==='bank');
const payload=locale=>locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
const metadata=locale=>JSON.parse(read(payload(locale).metadataFile));
const entries=validateBankEditorialPublicDerivative(registry);
const clock=new Date('2026-10-15T12:00:00Z');
const withContract=(contract,action)=>{
  const old=process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT;
  try{process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT=contract;return action();}
  finally{if(old===undefined)delete process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT;else process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT=old;}
};

test('bank adds exactly one existing identity and ten complete indexable locale projections',()=>{
  assert.equal(entries.length,10);assert.equal(new Set(entries.map(e=>e.route)).size,10);
  assert.deepEqual(entries.map(e=>e.locale).sort(),[...BANK_LOCALES].sort());
  assert.ok(entries.every(e=>e.contentId==='bank'&&e.serviceId===null&&e.pricingRef===null&&e.indexable));
  assert.equal(entries.find(e=>e.locale==='zh-Hans').route,'/zh-cn/bali/documents/bank-account/');
  assert.equal(entries.find(e=>e.locale==='ar').dir,'rtl');
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');
  for(const l of BANK_LOCALES){const m=metadata(l);assert.equal(m.publicationAuthorized,false);
    assert.ok(Object.values(m.approval).filter(v=>typeof v==='boolean').every(v=>v===false));
    if(l!=='ru')assert.equal(payload(l).qa,'not_done');}
});

test('ten originals AND historical240 are separate gates; public derivative never claims original proof',()=>{
  assert.equal(bankPrivateInventory().files.length,10);
  if(editorialVerificationContract()===PRIVATE_ORIGINALS){
    assert.equal(typeof process.env.SAFR_PRIVATE_BANK_EDITORIAL_INPUT_ROOT,'string','Strict run needs actual bank10 private bundle');
    assert.deepEqual(validateBankEditorialPublicOriginals(registry),entries);
  }else{
    assert.throws(()=>validateBankEditorialPublicOriginals(registry,{readSource:()=>{throw Error('NO_ORIGINAL_SOURCE');}}),/NO_ORIGINAL_SOURCE/);
  }
});

test('bank private source has no missing-root or foreign-selector fallback',()=>{
  assert.throws(()=>createBankEditorialInputResolver({privateRoot:null}),/BANK_PRIVATE_ROOT_REQUIRED/);
  assert.throws(()=>createBankEditorialInputResolver({privateRoot:'/definitely-not-a-bank-bundle'}));
  if(process.env.SAFR_PRIVATE_BANK_EDITORIAL_INPUT_ROOT){
    const reader=createBankEditorialInputResolver();
    assert.throws(()=>reader('registry-copy/student_ru_native.source.json'),/UNBOUND_BANK_PRIVATE_INPUT/);
    for(const row of bankPrivateInventory().files)assert.equal(sha(reader(row.file)),row.sha256);
  }
});

test('historical240 resolver cannot read bank wires through its generic public fallback',()=>{
  const baseReader=createEditorialInputResolver();
  for(const pin of bankPrivateInventory().files)
    assert.throws(()=>baseReader(pin.file),error=>error.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
});

test('all ten actual shared-renderer models preserve FAQ, CTA, local title and pending diagnostics',()=>{
  for(const locale of BANK_LOCALES){
    const model=buildRegistryDocument(registry,'bank',locale,{editorialPreview:true}),m=metadata(locale);
    assert.equal(model.title,m.h1);assert.equal(model.seoTitle,m.seo.title);assert.equal(model.description,m.seo.description);
    assert.equal(model.dir,locale==='ar'?'rtl':'ltr');assert.equal(model.sections.length,3);
    assert.equal(model.faqSchema.length,1);assert.equal(model.faqSchema[0].question,m.faq[0].question);
    assert.equal(model.ctaActions.length,1);assert.equal(model.ctaActions[0].label,m.cta[0].label);
    assert.equal(model.diagnostics.editorialPreview,true);
    assert.equal(model.diagnostics.qaMethod,locale==='ru'?'supplied_ru_review_pending':'supplied_model_pending_render');
    assert.notEqual(model.diagnostics.qaMethod,'founder_approved');
    assert.equal(model.languages.filter(l=>l.href).length,10);
    assert.doesNotMatch(JSON.stringify(model.sections),/DEV4_|QA \/|CONTENT_DRAFTS|Перед публикацией|SKTT/);
  }
});

test('unapproved render selection and unknown languages remain closed',()=>{
  assert.equal(buildRegistryDocument(registry,'bank','ru'),null);
  assert.equal(buildRegistryDocument(registry,'bank','en'),null);
  assert.equal(buildRegistryDocument(registry,'bank','xx',{editorialPreview:true}),null);
  const copy=structuredClone(registry);delete copy.records.find(r=>r.contentId==='bank').candidate.translations.fr.metadataFile;
  assert.throws(()=>buildRegistryDocument(copy,'bank','fr',{editorialPreview:true}),/Missing immutable bank/);
});

test('public structured render requires the exact separate version-bound entry',()=>withContract(PUBLIC_DERIVATIVE,()=>{
  const href=(id,locale)=>id==='bank'?entries.find(e=>e.locale===locale)?.route??null:null;
  for(const entry of entries){
    const model=buildRegistryDocument(registry,'bank',entry.locale,{targetHref:href,bankEditorialPublicEntry:entry});
    assert.equal(model.title,entry.title);assert.equal(model.ctaActions.length,1);
    assert.throws(()=>buildRegistryDocument(registry,'bank',entry.locale,{targetHref:href,bankEditorialPublicEntry:{...entry,route:'/account/'}}));
  }
}));

for(const [name,mutate]of [
  ['body',x=>{x.body+='\nEdited';}],
  ['metadata',x=>{x.meta.seo.title+=' Edited';}],
  ['locale',x=>{x.meta.locale='ru';}],
  ['direction',x=>{x.meta.direction='rtl';}],
  ['fake legal QA',x=>{x.meta.approval.legalVerification=true;}],
  ['commercial identity',x=>{x.rec.serviceId='new-bank-service';}],
  ['commercial availability',x=>{x.rec.availability='available';}],
])test('bank source projection rejects '+name+' drift',()=>{
  const x={rec:structuredClone(record),meta:metadata('de'),body:read(payload('de').bodyFile).toString('utf8')};mutate(x);
  assert.throws(()=>validateBankEditorialProjection(x.rec,'de',x.rec.candidate.translations.de,x.meta,x.body));
});

test('rehashed or foreign source/public manifests cannot become a new trusted authority',()=>{
  for(const modify of [m=>m.records[0].contentId='npwp',m=>m.publicationGates.legalVerification=true,m=>m.records[0].locales.ar.sourceFileSha256='0'.repeat(64)]){
    const manifest=structuredClone(sourceManifest);modify(manifest);
    assert.throws(()=>validateBankEditorialPublicDerivative(registry,{manifest}));
  }
  const changed=structuredClone(grant);changed.records[0].locales.en.route='/en/account/';
  assert.throws(()=>validateBankEditorialPublicDerivative(registry,{grant:changed}));
});

test('bank index overlay is confined to exact ten routes and full public source versions',()=>{
  assert.equal(publicBankApprovedRoutes().length,10);
  for(const entry of entries){
    const result=applyPublicBankOwnerIndexing('registry',entry,entry.locale,clock);
    assert.equal(result.indexable,true);assert.equal(result.publication.independentReviewClaim,false);
    assert.equal(result.publication.lastmod,'2026-10-03');
    assert.equal(validateBankEditorialPublicEntry(record,entry.locale,entry).indexable,true);
    for(const change of [e=>e.route='/account/',e=>e.title+=' edited',e=>e.seoTitle+=' edited',e=>e.description+=' edited',e=>e.contentId='npwp',e=>e.serviceId='new-bank-service']){
      const edited=structuredClone(entry);change(edited);assert.throws(()=>applyPublicBankOwnerIndexing('registry',edited,entry.locale,clock));
    }
    assert.throws(()=>applyPublicBankOwnerIndexing('legacy',entry,entry.locale,clock));
    assert.throws(()=>applyPublicBankOwnerIndexing('registry',entry,entry.locale,'2026-10-11'));
  }
});

test('exact known Vietnam undo then bank-only undo restores f964 before prior history gates',()=>{
  const before=preBankRegistry(registry);
  assert.equal(sha(JSON.stringify(before,null,2)+'\n'),'0d271ed37e0571abc9d0e14317e23200c893fcd25b43d6caf0e0a29a0b168199');
  assert.deepEqual(before.records.filter(r=>r.contentId!=='bank'),preVietnamRegistry(registry).records.filter(r=>r.contentId!=='bank'));
  for(const mutate of [r=>r.records.find(x=>x.contentId==='bank').title+=' changed',r=>r.records.find(x=>x.contentId!=='bank').title+=' changed',r=>r.records.push(structuredClone(record))]){
    const changed=structuredClone(registry);mutate(changed);assert.throws(()=>preBankRegistry(changed));
  }
});
