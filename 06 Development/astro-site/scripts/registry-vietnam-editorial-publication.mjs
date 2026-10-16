// Version-bound Founder publication overlay. Original source-stage flags stay false.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import publicManifest from '../../shared/content/registry-vietnam-editorial-public-build.v1.json' with {type:'json'};
import {VIETNAM_LOCALES,vietnamSha as sha} from '../../shared/scripts/vietnam-editorial-source.mjs';
import {validateRegistry,PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {validateVietnamEditorialOriginal,validateVietnamEditorialProjection,VIETNAM_PLANNED_RECORD_SHA256} from './registry-vietnam-editorial-preview.mjs';
import {readVietnamEditorialInput,VIETNAM_SOURCE_ANCHOR} from './registry-vietnam-editorial-inputs.mjs';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {publicRegistryContentVersion} from '../src/lib/public-content-version.mjs';
export const VIETNAM_PUBLIC_ANCHOR='d5648322e03e377654b0c75f7c350a5cfb14b7f1cdae8cade0a3d0a739649656';
const encoded=value=>JSON.stringify(value,null,2)+'\n';
function anchors(manifest=sourceManifest,grant=publicManifest){
  assert.equal(sha(encoded(manifest)),VIETNAM_SOURCE_ANCHOR,'Vietnam source manifest drift');
  assert.equal(sha(encoded(grant)),VIETNAM_PUBLIC_ANCHOR,'Vietnam publication overlay drift');
  assert.equal(manifest.records.length,1);assert.ok(Object.values(manifest.publicationGates).every(v=>v===false));
  assert.equal(grant.sourceManifestSha256,VIETNAM_SOURCE_ANCHOR);assert.equal(grant.records.length,1);
  assert.equal(grant.stage,'LOCAL_READY_NO_DEPLOY');assert.equal(grant.authority.publisher,'Founder');
  assert.equal(grant.authority.decisionDate,'2026-10-12');
  assert.equal(grant.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  const entry=manifest.records[0],approved=grant.records[0];
  assert.equal(entry.contentId,'vietnam');assert.equal(approved.contentId,'vietnam');
  assert.equal(approved.sourceCanonicalPath,entry.canonicalPath);assert.equal(approved.sourceCanonicalPath,'/visas/vietnam/');
  assert.equal(approved.canonicalPath,'/vietnam/visas/');assert.equal(approved.sourceRevision,entry.sourceRevision);
  assert.equal(approved.serviceId,null);assert.equal(approved.pricingRef,null);
  return {entry,approved};
}
export function validateVietnamEditorialPublicEntry(record,locale,entry,{manifest=sourceManifest,grant=publicManifest,asOf='2026-10-15'}={}){
  const {entry:source,approved}=anchors(manifest,grant),pin=approved.locales[locale],sourcePin=source.locales[locale];
  assert.ok(pin&&sourcePin&&PUBLIC_LOCALES.includes(locale),'Unapproved Vietnam locale');
  assert.equal(sha(encoded(record)),VIETNAM_PLANNED_RECORD_SHA256,'Vietnam record drift');
  assert.equal(record.candidate.route,approved.sourceCanonicalPath);assert.equal(record.candidate.revision,approved.sourceRevision);
  const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
  for(const k of ['bodySha256','metadataSha256','sourceEnvelopeSha256']){
    assert.equal(pin[k],sourcePin[k]);assert.equal(payload[k],pin[k]);assert.equal(entry?.[k],pin[k]);
  }
  for(const [key,value]of Object.entries({contentId:'vietnam',locale,dir:sourcePin.direction,route:pin.route,
    canonicalPath:approved.canonicalPath,sourceRevision:approved.sourceRevision,serviceId:null,pricingRef:null,
    indexable:true,lastModified:approved.publication.lastModified,ownerApprovedVietnamEditorial:true}))
    assert.deepEqual(entry?.[key],value,'Vietnam public entry '+key+' drift');
  assert.equal(pin.contentVersion,'sha256:'+payload.bodySha256);
  assert.equal(publicRegistryContentVersion(entry),pin.publicSourceVersion,'Vietnam full public source version drift');
  return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',requiresSources:true,
    hasSubstantialContent:true,locale,availableLocales:VIETNAM_LOCALES,contentVersion:pin.contentVersion,
    lastModified:approved.publication.lastModified,ownerApproval:{authority:'founder',approvedAt:grant.authority.decisionDate,
      contentVersion:pin.contentVersion}},{asOf});
}
function build(registry,{manifest=sourceManifest,grant=publicManifest,readContent=readEditorialInput,readSource=readVietnamEditorialInput}={},validator){
  const {entry:source,approved}=anchors(manifest,grant);validateRegistry(registry);
  const matches=registry.records.filter(r=>r.contentId==='vietnam');assert.equal(matches.length,1);const record=matches[0];
  const policy=registry.routingPlan.worldVisas.filter(r=>r.contentId==='vietnam');assert.equal(policy.length,1);
  assert.equal(policy[0].sourceCandidateRoute,approved.sourceCanonicalPath);assert.equal(policy[0].proposedRoute,approved.canonicalPath);
  assert.equal(policy[0].destinationCountryCode,'VN');
  assert.equal(policy[0].migrationMode,'ONE_CANONICAL_NO_DUPLICATE; redirects only if prior URL was actually live');
  assert.deepEqual(Object.keys(approved.locales).sort(),[...VIETNAM_LOCALES].sort());
  const result=VIETNAM_LOCALES.map(locale=>{
    const language=registry.locales.find(l=>l.code===locale),pin=approved.locales[locale],sourcePin=source.locales[locale];
    assert.equal(language.dir,sourcePin.direction);assert.equal(pin.route,language.prefix+approved.canonicalPath);
    const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
    const body=readContent(payload.bodyFile).toString('utf8'),metadata=JSON.parse(readContent(payload.metadataFile).toString('utf8'));
    validator(record,locale,payload,metadata,body,{manifest,readSource});
    const entry={contentId:'vietnam',locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
      sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
      sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:null,pricingRef:null,indexable:true,
      lastModified:approved.publication.lastModified,title:metadata.h1,seoTitle:metadata.seoTitle,
      description:metadata.metaDescription,ownerApprovedVietnamEditorial:true};
    assert.equal(validateVietnamEditorialPublicEntry(record,locale,entry,{manifest,grant}).indexable,true);return entry;
  });
  assert.equal(result.length,10);assert.equal(new Set(result.map(e=>e.route)).size,10);return result;
}
export const validateVietnamEditorialPublicOriginals=(registry,options)=>build(registry,options,validateVietnamEditorialOriginal);
export const validateVietnamEditorialPublicDerivative=(registry,options)=>build(registry,options,validateVietnamEditorialProjection);
