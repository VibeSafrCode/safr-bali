import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import native from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import local from '../../shared/content/registry-sktt-local-editorial-build.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-sktt-editorial-public-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {validateSkttEditorialPublicOriginals,validateSkttEditorialPublicDerivative,validateSkttEditorialPublicEntry,ownerApprovedSkttRoute} from '../scripts/registry-sktt-editorial-publication.mjs';
import {validateSkttLocalEditorialOriginal} from '../scripts/registry-sktt-local-editorial-preview.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {publicBuildEntries,publicEntryForRoute,publicTargetHref,publicAlternatesForRoute,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
import {applyPublicSkttOwnerIndexing,publicSkttApprovedRoutes} from '../src/lib/public-sktt-owner-indexing.mjs';
import {publicTenLocaleApprovedRoutes} from '../src/lib/public-ten-locale-publication.mjs';
import {publicBankApprovedRoutes} from '../src/lib/public-bank-owner-indexing.mjs';
import {publicVietnamApprovedRoutes} from '../src/lib/public-vietnam-owner-indexing.mjs';
import {publicSiteSourceEntries} from '../src/lib/public-site-source.ts';
import {publicSiteEntries,publicSiteAlternates} from '../src/lib/public-site-publication.ts';
import {PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE,editorialVerificationContract} from '../scripts/registry-editorial-verification-contract.mjs';
import {verifyEditorialContract} from '../scripts/verify-editorial-contract.mjs';
import {registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
const record=registry.records.find(row=>row.contentId==='sktt'),entries=validateSkttEditorialPublicDerivative(registry);
const content=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,content));
const payload=locale=>locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
const meta=locale=>JSON.parse(read(payload(locale).metadataFile));
const clock=new Date('2026-10-22T12:00:00Z');
test('one existing source-complete identity adds exactly ten publisher-approved entries, not QA/services/prices',()=>{
 assert.equal(entries.length,10);assert.equal(publicSkttApprovedRoutes().length,10);
 assert.deepEqual(entries.map(row=>row.locale),PUBLIC_LOCALES);assert.equal(new Set(entries.map(row=>row.route)).size,10);
 assert.equal(record.published,null);assert.equal(record.release,'not_authorized');assert.equal(record.candidate.exposure,'preview_only');
 assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.availability,'not_verified');
 assert.equal(native.fullPayloadKind,'SKTT_NATIVE_RECEIVED_EIGHT_V1');assert.equal(native.fullTenLocaleSourceComplete,false);
 assert.equal(local.fullTenLocaleSourceComplete,true);assert.deepEqual(local.localModelLocales,['hi','ar']);
 assert.ok(Object.values(native.publicationGates).every(flag=>flag===false));assert.ok(Object.values(local.publicationGates).every(flag=>flag===false));
 for(const locale of PUBLIC_LOCALES){const m=meta(locale);assert.equal(m.publicationAuthorized,false);
  assert.equal(m.approval.nativeSpeakerReview,false);assert.equal(m.approval.legalVerification,false);assert.equal(m.approval.browserReview,false);
  if(locale!=='ru')assert.equal(payload(locale).qa,'not_done');
 }
 if(editorialVerificationContract()===PRIVATE_ORIGINALS)assert.deepEqual(validateSkttEditorialPublicOriginals(registry),entries);
});
test('public derivative never requests native/local private inputs and cannot attest their validation',()=>{
 let nativeReads=0,localReads=0;
 const projected=validateSkttEditorialPublicDerivative(registry,{readNativeSource:()=>{nativeReads++;throw Error('PRIVATE_NATIVE');},readLocalSource:()=>{localReads++;throw Error('PRIVATE_LOCAL');}});
 assert.deepEqual(projected,entries);assert.equal(nativeReads,0);assert.equal(localReads,0);
 const receipt=verifyEditorialContract(PUBLIC_DERIVATIVE);
 assert.equal(receipt.skttEditorial.publicEntries,10);assert.equal(receipt.skttEditorial.privateOriginals,'NOT_EXECUTED');
 assert.equal(receipt.skttEditorial.privateOriginalCount,0);assert.equal(receipt.skttEditorial.publicPrivateProjectionEquality,'NOT_EXECUTED');
 assert.equal(receipt.skttEditorial.nativeSpeakerLegalRenderedClaim,false);assert.equal(receipt.production,'NOT_EXECUTED');
});
test('mandatory originals and private preview remain mandatory under either selected build contract',()=>{
 assert.throws(()=>validateSkttEditorialPublicOriginals(registry,{readNativeSource:()=>{throw Error('NATIVE_ORIGINAL_REQUIRED');}}),/NATIVE_ORIGINAL_REQUIRED/);
 assert.throws(()=>validateSkttEditorialPublicOriginals(registry,{readNativeSource:()=>Buffer.from('{}')}),/SKTT private source bytes drift/);
 const p=payload('hi'),m=meta('hi'),body=read(p.bodyFile).toString('utf8');
 assert.throws(()=>validateSkttLocalEditorialOriginal(record,'hi',p,m,body,{readSource:()=>{throw Error('LOCAL_ORIGINAL_REQUIRED');}}),/LOCAL_ORIGINAL_REQUIRED/);
 assert.throws(()=>validateSkttLocalEditorialOriginal(record,'hi',p,m,body,{readSource:()=>Buffer.from('{}')}),/Local SKTT private source drift/);
 for(const [locale,key,message]of [['en','readSkttSource','NATIVE_PREVIEW_REQUIRED'],['ar','readSkttLocalSource','LOCAL_PREVIEW_REQUIRED']])
  assert.throws(()=>buildRegistryDocument(registry,'sktt',locale,{editorialPreview:true,[key]:()=>{throw Error(message);}}),new RegExp(message));
});
for(const entry of entries)test('actual public model and SEO/native-or-local source binding: '+entry.locale,()=>{
 const m=meta(entry.locale),model=buildPublicRegistryModel(publicEntryForRoute(entry.route));
 assert.equal(model.title,m.h1);assert.equal(model.seoTitle,m.seoTitle);assert.equal(model.description,m.metaDescription);
 assert.equal(model.dir,entry.locale==='ar'?'rtl':'ltr');assert.equal(model.sections.length,3);assert.equal(model.faqSchema.length,2);
 assert.equal(model.ctaActions.length,1);assert.equal(model.ctaActions[0].label,m.cta[0].label);assert.equal(model.price,null);
 assert.equal(model.indexable,true);assert.equal(model.publication.independentReviewClaim,false);
 assert.equal(model.alternates.length,11);assert.equal(model.languageChoices.length,10);
 assert.equal(publicSiteAlternates(entry.route).length,11);assert.equal(publicAlternatesForRoute(entry.route).find(row=>row.locale==='x-default').href,'/bali/documents/sktt/');
 assert.equal(ownerApprovedSkttRoute('sktt',entry.locale),entry.route);assert.equal(publicTargetHref('sktt',entry.locale),entry.route);
 for(const key of ['previewNotice','pricingHref','diagnostics'])assert.equal(Object.hasOwn(model,key),false);
 const html=[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(row=>row.html)].join('');
 assert.doesNotMatch(html,/ROOT_ACCEPTANCE|PEER_REVIEW|LOCAL_MODEL|NATIVE_RECEIVED|DEV4_|\/_registry\/|\.source\.json|\/Users\//);
 assert.equal(model.pageContext.section,'documents');assert.equal(model.sourceContext.path,entry.route);assert.equal(model.sourceContext.locale,entry.locale);
});
test('unchanged1090 source versions and SKTT10 remain distinct from later two-component hospitality10',()=>{
 const prior=[...publicTenLocaleApprovedRoutes(),...publicBankApprovedRoutes(),...publicVietnamApprovedRoutes()];
 assert.equal(prior.length,1090);
 const vector=row=>({kind:row.kind,locale:row.locale,route:row.route,contentVersion:row.contentVersion});
 const sort=rows=>rows.map(vector).sort((a,b)=>a.route.localeCompare(b.route,'en'));
 const sources=publicSiteSourceEntries(),old=sources.filter(row=>!['sktt','hospitality'].includes(row.page.contentId));
 assert.deepEqual(sort(old),sort(prior));assert.equal(sources.length,1110);
 assert.equal(sources.filter(row=>row.kind==='registry'&&row.page.contentId==='sktt').length,10);
 assert.equal(publicSiteEntries().length,1110);assert.equal(publicBuildEntries().filter(row=>!['sktt','hospitality'].includes(row.contentId)).length,630);
 assert.equal(publicBuildEntries().filter(row=>row.contentId==='hospitality').length,10,'Only the separate two-component hospitality10 grant supplies these entries');
});
test('public renderer needs the separate exact grant, not a preview flag/public href alone',()=>{
 const entry=entries.find(row=>row.locale==='ar'),href=(id,locale)=>ownerApprovedSkttRoute(id,locale);
 assert.equal(buildRegistryDocument(registry,'sktt','ar',{editorialPreview:true,targetHref:href}),null);
 const rendered=buildRegistryDocument(registry,'sktt','ar',{targetHref:href,skttEditorialPublicEntry:entry});
 assert.equal(rendered.title,entry.title);
 assert.throws(()=>buildRegistryDocument(registry,'sktt','ar',{targetHref:href,skttEditorialPublicEntry:{...entry,title:'changed'}}));
});
test('scope, grant, source manifests, record, body and metadata drift refuse rather than self-regrant',()=>{
 for(const mutate of [g=>g.authority.publisher='Model',g=>g.authority.decisionDate='2026-10-21',g=>g.records.push(structuredClone(g.records[0])),
  g=>g.records[0].locales.hi.route='/hi/private/',g=>delete g.records[0].locales.en,g=>g.mixedRecordSha256='0'.repeat(64)]){
  const changed=structuredClone(grant);mutate(changed);assert.throws(()=>validateSkttEditorialPublicDerivative(registry,{grant:changed}));
 }
 for(const source of ['native','local']){
  const changed=structuredClone(source==='native'?native:local);changed.sourceMode='unrecognized';
  assert.throws(()=>validateSkttEditorialPublicDerivative(registry,{[source]:changed}));
 }
 for(const mutate of [r=>r.candidate.translations.ar.qa='passed',r=>r.serviceId='invented',r=>r.pricingRef={},r=>r.candidate.route='/new/',r=>r.candidate.translations.en.sourceRevision='old']){
  const changed=structuredClone(registry);mutate(changed.records.find(row=>row.contentId==='sktt'));assert.throws(()=>validateSkttEditorialPublicDerivative(changed));
 }
 for(const locale of PUBLIC_LOCALES)for(const [field,message]of [['bodyFile','SKTT public body bytes drift'],['metadataFile','SKTT public metadata bytes drift']]){
  const file=payload(locale)[field];
  assert.throws(()=>validateSkttEditorialPublicDerivative(registry,{readContent:name=>name===file?Buffer.concat([read(name),Buffer.from(' ')]):read(name)}),new RegExp(message));
 }
});
test('owner indexing and entry validation bind identity/locale/route/title/body/metadata/price and exact clock',()=>{
 const entry=entries.find(row=>row.locale==='hi');
 for(const change of [x=>x.contentId='bank',x=>x.locale='ru',x=>x.route='/hi/private/',x=>x.title+=' changed',x=>x.seoTitle+=' changed',
  x=>x.description+=' changed',x=>x.serviceId='new',x=>x.pricingRef={},x=>x.bodySha256='0'.repeat(64),x=>x.metadataSha256='0'.repeat(64)]){
  const copy=structuredClone(entry);change(copy);
  assert.throws(()=>validateSkttEditorialPublicEntry(record,'hi',copy));assert.throws(()=>applyPublicSkttOwnerIndexing('registry',copy,'hi',clock));
 }
 assert.throws(()=>applyPublicSkttOwnerIndexing('legacy',entry,'hi',clock));
 assert.throws(()=>applyPublicSkttOwnerIndexing('registry',entry,'xx',clock));
 assert.throws(()=>applyPublicSkttOwnerIndexing('registry',entry,'hi','2026-10-21'));
 assert.throws(()=>applyPublicSkttOwnerIndexing('registry',entry,'hi','2026-11-31'));
 assert.equal(validateSkttEditorialPublicEntry(record,'hi',entry,{asOf:'2026-10-21'}).indexable,false);
 assert.equal(applyPublicSkttOwnerIndexing('registry',entry,'hi',clock).publication.lastmod,'2026-10-22');
});
test('new grant denied before unauthenticated raw/module import loaders',()=>{
 for(const url of ['/shared/content/registry-sktt-editorial-public-build.v1.json?raw','/@fs/shared/content/%2572egistry-sktt-editorial-public-build.v1.json?import']){
  const result={next:false},res={setHeader:()=>{},end:()=>{}};registryPreviewMiddleware()({url,headers:{},socket:{}},res,()=>result.next=true);
  assert.equal(res.statusCode,404);assert.equal(result.next,false);
 }
});
