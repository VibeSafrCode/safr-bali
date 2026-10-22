import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-vietnam-editorial-public-build.v1.json' with {type:'json'};
import source from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import {VIETNAM_LOCALES} from '../../shared/scripts/vietnam-editorial-source.mjs';
import {preVietnamRegistry} from '../../shared/tests/fixtures/pre-vietnam-registry.mjs';
import {preBankRegistry} from '../../shared/tests/fixtures/pre-bank-registry.mjs';
import {validateVietnamEditorialPublicOriginals,validateVietnamEditorialPublicDerivative,validateVietnamEditorialPublicEntry} from '../scripts/registry-vietnam-editorial-publication.mjs';
import {publicBuildEntries,publicTargetHref,publicEntryForRoute,publicAlternatesForRoute,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {applyPublicVietnamOwnerIndexing,publicVietnamApprovedRoutes} from '../src/lib/public-vietnam-owner-indexing.mjs';
import {verifyEditorialContract} from '../scripts/verify-editorial-contract.mjs';
import {PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE,editorialVerificationContract} from '../scripts/registry-editorial-verification-contract.mjs';
import {registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
const record=registry.records.find(r=>r.contentId==='vietnam'),entries=validateVietnamEditorialPublicDerivative(registry);
const sha=b=>createHash('sha256').update(b).digest('hex'),clock=new Date('2026-10-15T12:00:00Z');
const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
test('one existing identity gains exactly ten separately version-bound owner-approved public projections',()=>{
  assert.equal(entries.length,10);assert.equal(new Set(entries.map(e=>e.route)).size,10);
  assert.deepEqual(entries.map(e=>e.locale).sort(),[...VIETNAM_LOCALES].sort());
  if(editorialVerificationContract()===PRIVATE_ORIGINALS)assert.deepEqual(validateVietnamEditorialPublicOriginals(registry),entries);
  else assert.throws(()=>validateVietnamEditorialPublicOriginals(registry,{readSource:()=>{throw Error('VIETNAM_ORIGINAL_REQUIRED');}}),/VIETNAM_ORIGINAL_REQUIRED/);
  assert.equal(publicVietnamApprovedRoutes().length,10);
  assert.equal(record.candidate.route,'/visas/vietnam/');assert.equal(grant.records[0].canonicalPath,'/vietnam/visas/');
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');assert.equal(record.bindingStatus,'unresolved');
});
test('one canonical per locale, no old-source duplicate, imaginary redirect or country hub',()=>{
  for(const e of entries){const prefix=registry.locales.find(l=>l.code===e.locale).prefix;
    assert.equal(publicTargetHref('vietnam',e.locale),prefix+'/vietnam/visas/');
    assert.equal(publicEntryForRoute(prefix+'/visas/vietnam/'),null);assert.equal(publicEntryForRoute(prefix+'/vietnam/'),null);
    assert.equal(publicEntryForRoute(e.route).contentId,'vietnam');
    const alts=publicAlternatesForRoute(e.route);assert.equal(alts.length,11);
    assert.equal(alts.find(x=>x.locale==='x-default').href,'/vietnam/visas/');
    assert.equal(alts.filter(x=>x.locale!=='x-default').length,10);
  }
  assert.equal(publicBuildEntries().filter(e=>e.contentId==='vietnam').length,10);
  assert.equal(publicBuildEntries().filter(e=>!['bank','vietnam','sktt','hospitality'].includes(e.contentId)).length,610);
  assert.equal(publicBuildEntries().filter(e=>e.contentId==='bank').length,10);
});
for(const e of entries)test('actual public model: '+e.locale,()=>{
  const model=buildPublicRegistryModel(publicEntryForRoute(e.route)),pin=source.records[0].locales[e.locale],meta=JSON.parse(read(pin.metadataFile));
  assert.equal(model.title,meta.h1);assert.equal(model.seoTitle,meta.seoTitle);assert.equal(model.description,meta.metaDescription);
  assert.equal(model.sections.length,10);assert.equal(model.faqSchema.length,6);assert.equal(model.ctaActions.length,1);assert.equal(model.ctaActions[0].label,meta.cta[0].label);
  assert.equal(model.dir,e.locale==='ar'?'rtl':'ltr');assert.equal(model.alternates.length,11);assert.equal(model.languageChoices.length,10);
  assert.equal(model.indexable,true);assert.equal(model.publication.independentReviewClaim,false);
  for(const k of ['previewNotice','pricingHref','diagnostics'])assert.equal(Object.hasOwn(model,k),false);
  assert.equal(model.pageContext.destinationCountry,'VN');assert.equal(model.pageContext.world,'vietnam');
  assert.equal(model.sourceContext.path,e.route);assert.equal(model.sourceContext.locale,e.locale);
  assert.equal(meta.publicationAuthorized,false);assert.ok(Object.values(meta.approval).filter(x=>typeof x==='boolean').every(x=>x===false));
  if(e.locale!=='ru')assert.equal(record.candidate.translations[e.locale].qa,'not_done');
});
test('public entry and owner indexing reject every source/title/route/identity tamper',()=>{
  const e=entries.find(x=>x.locale==='en');
  for(const alter of [x=>x.route='/en/account/',x=>x.canonicalPath='/visas/vietnam/',x=>x.locale='ru',x=>x.contentId='vietnam-copy',
    x=>x.serviceId='new-service',x=>x.pricingRef={},x=>x.title+=' edited',x=>x.seoTitle+=' edited',x=>x.description+=' edited',
    x=>x.bodySha256='0'.repeat(64),x=>x.metadataSha256='0'.repeat(64),x=>x.sourceEnvelopeSha256='0'.repeat(64)]){
    const copy=structuredClone(e);alter(copy);
    assert.throws(()=>applyPublicVietnamOwnerIndexing('registry',copy,'en',clock));
    assert.throws(()=>validateVietnamEditorialPublicEntry(record,'en',copy));
  }
  assert.throws(()=>applyPublicVietnamOwnerIndexing('legacy',e,'en',clock));
  assert.throws(()=>applyPublicVietnamOwnerIndexing('registry',e,'en','2026-10-11'));
  assert.equal(applyPublicVietnamOwnerIndexing('registry',e,'en',clock).publication.lastmod,'2026-10-06');
});
test('public renderer requires exact separate entry, never a public href or private preview flag alone',()=>{
  const e=entries.find(x=>x.locale==='en');
  const href=(id,locale)=>id==='vietnam'?entries.find(x=>x.locale===locale)?.route??null:null;
  assert.equal(buildRegistryDocument(registry,'vietnam','en',{targetHref:href,editorialPreview:true}),null);
  assert.equal(buildRegistryDocument(registry,'vietnam','en',{targetHref:href,vietnamEditorialPublicEntry:e}).title,e.title);
  assert.throws(()=>buildRegistryDocument(registry,'vietnam','en',{targetHref:href,vietnamEditorialPublicEntry:{...e,description:'different'}}));
});
test('changed grants, route-plan derivatives and private originals fail closed',()=>{
  for(const edit of [g=>g.records[0].locales.ar.route='/ar/account/',g=>g.records[0].sourceCanonicalPath='/vietnam/visas/',g=>g.authority.publisher='Model']){
    const copy=structuredClone(grant);edit(copy);assert.throws(()=>validateVietnamEditorialPublicDerivative(registry,{grant:copy}));
  }
  const copy=structuredClone(registry);copy.routingPlan.worldVisas.find(x=>x.contentId==='vietnam').proposedRoute='/visas/vietnam/';
  assert.throws(()=>validateVietnamEditorialPublicDerivative(copy));
  assert.throws(()=>validateVietnamEditorialPublicOriginals(registry,{readSource:()=>{throw Error('VIETNAM_ORIGINAL_REQUIRED');}}),/VIETNAM_ORIGINAL_REQUIRED/);
});
test('whole exact Vietnam undo then unchanged bank undo preserves all historical anchors',()=>{
  const before=preVietnamRegistry(registry);assert.equal(sha(JSON.stringify(before,null,2)+'\n'),'c2d1fd17ea294887cf81ff35c8b31e968c11753543edc7b56ce7e69ee8854678');
  assert.deepEqual(before.records.filter(x=>x.contentId!=='vietnam'),registry.records.filter(x=>x.contentId!=='vietnam'));
  assert.equal(sha(JSON.stringify(preBankRegistry(registry),null,2)+'\n'),'0d271ed37e0571abc9d0e14317e23200c893fcd25b43d6caf0e0a29a0b168199');
  for(const edit of [r=>r.records.find(x=>x.contentId==='vietnam').title+=' edited',r=>r.records.find(x=>x.contentId==='bank').title+=' edited']){
    const copy=structuredClone(registry);edit(copy);assert.throws(()=>preVietnamRegistry(copy));
  }
});
test('explicit selected contract never conflates public projections and actual base240 AND bank10 AND Vietnam10',()=>{
  const projected=verifyEditorialContract(PUBLIC_DERIVATIVE);
  assert.equal(projected.vietnamEditorial.privateOriginals,'NOT_EXECUTED');
  if(editorialVerificationContract()===PRIVATE_ORIGINALS){
    const strict=verifyEditorialContract(PRIVATE_ORIGINALS);
    assert.equal(strict.privateOriginalCount,240);assert.equal(strict.bankEditorial.privateOriginalCount,10);assert.equal(strict.vietnamEditorial.privateOriginalCount,10);
    assert.equal(strict.vietnamEditorial.publicPrivateProjectionEquality,'VERIFIED');
    assert.equal(strict.vietnamEditorial.publicProjectionSha256,projected.vietnamEditorial.publicProjectionSha256);
    assert.throws(()=>verifyEditorialContract(PRIVATE_ORIGINALS,{readVietnamSource:()=>{throw Error('VIETNAM_ORIGINAL_REQUIRED');}}),/VIETNAM_ORIGINAL_REQUIRED/);
  }else{
    for(const result of [projected,projected.bankEditorial,projected.vietnamEditorial]){
      assert.equal(result.privateOriginals,'NOT_EXECUTED');assert.equal(result.privateOriginalCount,0);
      assert.equal(result.publicPrivateProjectionEquality,'NOT_EXECUTED');
    }
    assert.throws(()=>validateVietnamEditorialPublicOriginals(registry,{readSource:()=>{throw Error('VIETNAM_ORIGINAL_REQUIRED');}}),/VIETNAM_ORIGINAL_REQUIRED/);
  }
});
test('new public overlay manifest is also protected before raw/module import loaders',()=>{
  for(const url of ['/shared/content/registry-vietnam-editorial-public-build.v1.json?raw','/@fs/shared/content/%2572egistry-vietnam-editorial-public-build.v1.json?import']){
    const result={status:0,next:false},res={setHeader:()=>{},end:()=>{}};
    registryPreviewMiddleware()({url,headers:{},socket:{}},res,()=>result.next=true);
    assert.equal(res.statusCode,404);assert.equal(result.next,false);
  }
});
