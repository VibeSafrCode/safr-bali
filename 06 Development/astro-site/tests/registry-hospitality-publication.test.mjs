import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import native from '../../shared/content/registry-hospitality-component-build.v1.json' with {type:'json'};
import local from '../../shared/content/registry-hospitality-local-editorial-build.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-hospitality-editorial-public-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {validateHospitalityPublicDerivative,validateHospitalityPublicOriginals,validateHospitalityPublicEntry,buildHospitalityPublicModel} from '../scripts/registry-hospitality-publication.mjs';
import {validateHospitalityLocalOriginal} from '../scripts/registry-hospitality-local-editorial-preview.mjs';
import {publicBuildEntries,publicEntryForRoute,publicTargetHref,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
import {applyPublicHospitalityOwnerIndexing,publicHospitalityApprovedRoutes} from '../src/lib/public-hospitality-owner-indexing.mjs';
import {publicTenLocaleApprovedRoutes} from '../src/lib/public-ten-locale-publication.mjs';
import {publicBankApprovedRoutes} from '../src/lib/public-bank-owner-indexing.mjs';
import {publicVietnamApprovedRoutes} from '../src/lib/public-vietnam-owner-indexing.mjs';
import {publicSkttApprovedRoutes} from '../src/lib/public-sktt-owner-indexing.mjs';
import {publicSiteSourceEntries} from '../src/lib/public-site-source.ts';
import {publicSiteEntries,publicSiteAlternates} from '../src/lib/public-site-publication.ts';
import {verifyEditorialContract} from '../scripts/verify-editorial-contract.mjs';
import {PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE,editorialVerificationContract} from '../scripts/registry-editorial-verification-contract.mjs';
import {registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
const entries=validateHospitalityPublicDerivative(registry),approved=grant.records[0],clock=new Date('2026-10-22T12:00:00Z');
const read=file=>readFileSync(new URL('../../shared/content/'+file,import.meta.url));
const decode=s=>s.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,a,b)=>String.fromCodePoint(parseInt(a??b,a?16:10)))
 .replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));
const plain=s=>decode(s.replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim();
const bodyLine=s=>s.replace(/^#{1,3} /,'').replace(/^- |^\d+\. /,'').replaceAll('**','').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/gu,' ').trim();
test('only two supplied components add hospitality10, never a broad hub, service, price or source-QA claim',()=>{
 assert.equal(entries.length,10);assert.equal(publicHospitalityApprovedRoutes().length,10);assert.deepEqual(entries.map(row=>row.locale),PUBLIC_LOCALES);
 const record=registry.records.find(row=>row.contentId==='hospitality');assert.equal(record.published,null);assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
 assert.equal(record.release,'not_authorized');assert.equal(record.candidate.exposure,'preview_only');
 assert.equal(native.variants.length,4);assert.equal(local.variants.length,16);assert.equal(native.publicationAuthorized,false);assert.equal(local.publicationAuthorized,false);
 assert.equal(grant.sourceScope.completeBroadTourismSpaIntent,false);assert.equal(grant.sourceScope.sourceQaPromoted,false);
 assert.deepEqual(grant.sourceScope.components,['accommodation','restaurant']);
 for(const row of entries){assert.equal(row.completeBroadIntent,false);assert.deepEqual(row.componentScope,['accommodation','restaurant']);}
 if(editorialVerificationContract()===PRIVATE_ORIGINALS)assert.deepEqual(validateHospitalityPublicOriginals(registry),entries);
});
test('PUBLIC_DERIVATIVE never asks for native/local originals or asserts their release verification',()=>{
 let reads=0;const deny=()=>{reads++;throw Error('PRIVATE_READ');};
 assert.deepEqual(validateHospitalityPublicDerivative(registry,{readNativeSource:deny,readLocalSource:deny}),entries);assert.equal(reads,0);
 const receipt=verifyEditorialContract(PUBLIC_DERIVATIVE);assert.equal(receipt.hospitalityEditorial.publicEntries,10);
 assert.equal(receipt.hospitalityEditorial.privateOriginals,'NOT_EXECUTED');assert.equal(receipt.hospitalityEditorial.privateOriginalCount,0);
 assert.equal(receipt.hospitalityEditorial.publicPrivateProjectionEquality,'NOT_EXECUTED');assert.equal(receipt.hospitalityEditorial.completeBroadIntent,false);
 assert.equal(receipt.hospitalityEditorial.nativeSpeakerLegalRenderedClaim,false);
});
test('native3 and local16 original admissions remain explicit strict gates, never public fallback',()=>{
 assert.throws(()=>validateHospitalityPublicOriginals(registry,{readNativeSource:()=>{throw Error('NATIVE_ORIGINAL_REQUIRED');}}),/NATIVE_ORIGINAL_REQUIRED/);
 assert.throws(()=>validateHospitalityPublicOriginals(registry,{readNativeSource:()=>Buffer.from('{}')}),/Hospitality native private bytes drift/);
 const pin=local.variants.find(row=>row.component==='restaurant'&&row.locale==='ar');
 assert.throws(()=>validateHospitalityLocalOriginal(registry,'restaurant','ar',JSON.parse(read(pin.metadataFile)),read(pin.bodyFile).toString('utf8'),
  {readSource:()=>{throw Error('LOCAL_ORIGINAL_REQUIRED');}}),/LOCAL_ORIGINAL_REQUIRED/);
 assert.throws(()=>buildHospitalityPublicModel(registry,entries[0],{targetHref:publicTargetHref,contract:PRIVATE_ORIGINALS,
  readNativeSource:()=>{throw Error('NATIVE_MODEL_REQUIRED');}}),/NATIVE_MODEL_REQUIRED/);
});
for(const entry of entries)test('whole two-component public model, literal fields, support and locale binding: '+entry.locale,()=>{
 const p=approved.locales[entry.locale],model=buildPublicRegistryModel(publicEntryForRoute(entry.route));
 assert.equal(model.title,p.title);assert.equal(model.seoTitle,p.seoTitle);assert.equal(model.description,p.description);
 assert.equal(model.dir,entry.locale==='ar'?'rtl':'ltr');assert.equal(model.sections.length,2);assert.equal(model.faqSchema.length,14);
 assert.equal(model.ctaActions.length,2);assert.equal(model.price,null);assert.equal(model.commercial,false);
 assert.equal(model.alternates.length,11);assert.equal(model.languageChoices.length,10);assert.equal(publicSiteAlternates(entry.route).length,11);
 assert.equal(model.pageContext.section,'business');assert.equal(model.pageContext.serviceSlug,null);
 assert.equal(model.sourceContext.content_id,'hospitality');assert.equal(model.sourceContext.path,entry.route);assert.equal(model.sourceContext.locale,entry.locale);
 assert.equal(model.completeBroadIntent,false);assert.equal(model.publication.independentReviewClaim,false);
 for(let i=0;i<2;i++){
  const pin=p.components[i],meta=JSON.parse(read(pin.metadataFile)),body=read(pin.bodyFile).toString('utf8'),section=model.sections[i];
  assert.equal(section.id,'hospitality-'+pin.component);assert.equal(section.heading,meta.title);assert.equal(model.ctaActions[i].label,meta.ctaLabelLiteral);
  assert.equal(model.ctaActions[i].manager,true);assert.equal(model.ctaActions[i].href,null);assert.equal(model.ctaActions[i].intent,'manager_inquiry');
  const visible=plain(section.html);assert.equal((section.html.match(/<h3>/g)||[]).length,9);assert.equal((section.html.match(/<h4>/g)||[]).length,7);
  for(const line of body.split('\n').slice(1).filter(line=>line.trim()))assert.ok(visible.includes(bodyLine(line)),'Missing whole customer line '+entry.locale+' '+pin.component);
  assert.doesNotMatch(section.html,/<h1|<h2|ROOT_ACCEPTANCE|PEER_REVIEW|DEV3_|LOCAL_MODEL|source\.json|\/_registry\/|\/Users\//);
  if(pin.component==='restaurant')assert.ok(section.html.includes('href="'+publicTargetHref('nib_oss',entry.locale)+'"'));
 }
 for(const key of ['diagnostics','previewNotice','pricingHref'])assert.equal(Object.hasOwn(model,key),false);
 assert.equal(publicTargetHref('hospitality',entry.locale),entry.route);
 assert.equal(publicTargetHref('accommodation',entry.locale),null);assert.equal(publicTargetHref('restaurant',entry.locale),null);
});
test('all1100 prior source-version vectors remain exact; only ten existing-canonical hospitality entries append',()=>{
 const prior=[...publicTenLocaleApprovedRoutes(),...publicBankApprovedRoutes(),...publicVietnamApprovedRoutes(),...publicSkttApprovedRoutes()];
 assert.equal(prior.length,1100);const vector=row=>({kind:row.kind,locale:row.locale,route:row.route,contentVersion:row.contentVersion});
 const sort=rows=>rows.map(vector).sort((a,b)=>a.route.localeCompare(b.route,'en')),all=publicSiteSourceEntries();
 assert.deepEqual(sort(all.filter(row=>row.page.contentId!=='hospitality')),sort(prior));assert.equal(all.length,1110);
 assert.equal(publicSiteEntries().length,1110);assert.equal(publicBuildEntries().length,650);
 assert.equal(all.filter(row=>row.kind==='registry'&&row.page.contentId==='hospitality').length,10);
});
test('changed grants/manifests/identity/intent/body/metadata refuse without regrant or raw-byte normalization',()=>{
 for(const mutate of [g=>g.authority.publisher='Model',g=>g.authority.decisionDate='2026-10-21',g=>g.records.push(structuredClone(g.records[0])),
  g=>g.records[0].locales.ar.route='/ar/new/',g=>delete g.records[0].locales.en,g=>g.sourceScope.completeBroadTourismSpaIntent=true]){
  const changed=structuredClone(grant);mutate(changed);assert.throws(()=>validateHospitalityPublicDerivative(registry,{publicGrant:changed}));
 }
 for(const key of ['native','local']){const changed=structuredClone(key==='native'?native:local);changed.publicationAuthorized=true;assert.throws(()=>validateHospitalityPublicDerivative(registry,{[key]:changed}));}
 for(const mutate of [r=>r.records.find(x=>x.contentId==='hospitality').candidate.route='/new/',r=>r.records.find(x=>x.contentId==='hospitality').serviceId='invented',
  r=>r.records.find(x=>x.contentId==='hospitality').pricingRef={},r=>r.routingPlan.bali.find(x=>x.key==='id_food').representation='page']){
  const changed=structuredClone(registry);mutate(changed);assert.throws(()=>validateHospitalityPublicDerivative(changed));
 }
 for(const p of Object.values(approved.locales))for(const pin of p.components)for(const [field,message]of [['bodyFile','Hospitality public body bytes drift'],['metadataFile','Hospitality public metadata bytes drift']]){
  const file=pin[field];assert.throws(()=>validateHospitalityPublicDerivative(registry,{readContent:name=>name===file?Buffer.concat([read(name),Buffer.from(' ')]):read(name)}),new RegExp(message));
 }
});
test('exact entry/version/route/clock are mandatory before rendering and owner indexing',()=>{
 const entry=entries.find(row=>row.locale==='ar');
 for(const mutate of [x=>x.contentId='bank',x=>x.route='/ar/new/',x=>x.title+='changed',x=>x.description+='changed',
  x=>x.componentScope=['accommodation'],x=>x.bodySha256='0'.repeat(64),x=>x.pricingRef={}]){const changed=structuredClone(entry);mutate(changed);
  assert.throws(()=>validateHospitalityPublicEntry(registry,'ar',changed));assert.throws(()=>buildHospitalityPublicModel(registry,changed,{targetHref:publicTargetHref,contract:PUBLIC_DERIVATIVE}));
 }
 assert.throws(()=>applyPublicHospitalityOwnerIndexing('legacy',entry,'ar',clock));
 assert.throws(()=>applyPublicHospitalityOwnerIndexing('registry',entry,'ar','2026-11-31'));
 assert.throws(()=>applyPublicHospitalityOwnerIndexing('registry',entry,'xx',clock));
 assert.equal(validateHospitalityPublicEntry(registry,'ar',entry,{asOf:'2026-10-21'}).indexable,false);
 assert.equal(applyPublicHospitalityOwnerIndexing('registry',entry,'ar',clock).publication.lastmod,'2026-10-22');
 assert.throws(()=>buildHospitalityPublicModel(registry,{...entry,ownerApprovedHospitalityEditorial:false},{targetHref:publicTargetHref,contract:PUBLIC_DERIVATIVE}));
});
test('public grant/raw bodies remain denied before loader/auth/Registry lookup',()=>{
 for(const url of ['/shared/content/registry-hospitality-editorial-public-build.v1.json?raw','/@fs/shared/content/%2572egistry-hospitality-editorial-public-build.v1.json?import',
  '/shared/content/registry-copy/hospitality_accommodation_ru_native_customer_projection_20261022.md?raw']){
  const result={next:false},res={setHeader:()=>{},end:()=>{}};registryPreviewMiddleware()({url,headers:{},socket:{}},res,()=>result.next=true);assert.equal(res.statusCode,404);assert.equal(result.next,false);
 }
});
