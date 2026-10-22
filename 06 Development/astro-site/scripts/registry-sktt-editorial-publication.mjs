// Additive publisher overlay only. Exact existing native8 and explicit local2
// sources/QA remain unchanged; this does not create Service/price/availability.
import assert from 'node:assert/strict';
import nativeManifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import localManifest from '../../shared/content/registry-sktt-local-editorial-build.v1.json' with {type:'json'};
import publicManifest from '../../shared/content/registry-sktt-editorial-public-build.v1.json' with {type:'json'};
import {sha256 as sha} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {encoded,SKTT_LOCALES} from '../../shared/scripts/sktt-editorial-import.mjs';
import {SKTT_LOCAL_LOCALES,SKTT_NATIVE_RECORD_SHA,SKTT_NATIVE_MANIFEST_SHA} from '../../shared/scripts/sktt-local-editorial-import.mjs';
import {validateRegistry,PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {publicRegistryContentVersion} from '../src/lib/public-content-version.mjs';
import {validateSkttEditorialOriginal,validateSkttEditorialProjection} from './registry-sktt-editorial-preview.mjs';
import {validateSkttLocalEditorialOriginal,validateSkttLocalEditorialProjection,skttNativeRecordForValidation} from './registry-sktt-local-editorial-preview.mjs';
import {SKTT_LOCAL_SOURCE_ANCHOR} from './registry-sktt-local-editorial-inputs.mjs';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import {readSkttEditorialInput} from './registry-sktt-editorial-inputs.mjs';
import {readSkttLocalEditorialInput} from './registry-sktt-local-editorial-inputs.mjs';
export const SKTT_PUBLIC_ANCHOR='72933c5d1a96f638d43587c388b27b4361fe1a3b7fe32b6bf32fce914484b033';
function anchors({native=nativeManifest,local=localManifest,grant=publicManifest}={}){
 assert.equal(sha(encoded(native)),SKTT_NATIVE_MANIFEST_SHA,'SKTT native source manifest drift');
 assert.equal(sha(encoded(local)),SKTT_LOCAL_SOURCE_ANCHOR,'SKTT local source manifest drift');
 assert.equal(sha(encoded(grant)),SKTT_PUBLIC_ANCHOR,'SKTT publication grant drift');
 assert.equal(grant.schemaVersion,1);assert.equal(grant.stage,'LOCAL_READY_NO_DEPLOY');
 assert.equal(grant.authority.publisher,'Founder');assert.equal(grant.authority.decisionDate,'2026-10-22');
 assert.equal(grant.authority.scope,'PUBLIC_SKTT_EXISTING_IDENTITY_TEN_LOCALES_INDEXABLE_NO_QA_PROMOTION');
 assert.deepEqual(grant.sourceManifestSha256,{nativeEight:SKTT_NATIVE_MANIFEST_SHA,localTwo:SKTT_LOCAL_SOURCE_ANCHOR});
 assert.equal(grant.mixedRecordSha256,local.records[0].plannedRecordSha256);
 assert.ok(Object.values(native.publicationGates).every(value=>value===false));
 assert.ok(Object.values(local.publicationGates).every(value=>value===false));
 assert.equal(grant.records.length,1);const approved=grant.records[0];
 assert.equal(approved.contentId,'sktt');assert.equal(approved.canonicalPath,'/bali/documents/sktt/');
 assert.equal(approved.sourceRevision,local.sourceRevision);
 assert.equal(approved.serviceId,null);assert.equal(approved.pricingRef,null);
 assert.deepEqual(Object.keys(approved.locales),PUBLIC_LOCALES);
 assert.deepEqual([...SKTT_LOCALES,...SKTT_LOCAL_LOCALES].sort(),[...PUBLIC_LOCALES].sort());
 return {native,local,grant,approved};
}
const sourcePin=(locale,native,local)=>SKTT_LOCAL_LOCALES.includes(locale)?local.records[0].locales[locale]:native.records[0].locales[locale];
export function ownerApprovedSkttRoute(contentId,locale){
 const {approved}=anchors();return contentId==='sktt'?approved.locales[locale]?.route??null:null;
}
export function validateSkttEditorialPublicEntry(record,locale,entry,{asOf='2026-10-22',...options}={}){
 const {native,local,grant,approved}=anchors(options),pin=approved.locales[locale],source=sourcePin(locale,native,local);
 assert.ok(PUBLIC_LOCALES.includes(locale)&&pin&&source,'Unapproved SKTT identity/locale');
 assert.equal(sha(encoded(record)),grant.mixedRecordSha256,'SKTT mixed record drift');
 assert.equal(sha(encoded(skttNativeRecordForValidation(record))),SKTT_NATIVE_RECORD_SHA);
 const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];assert.ok(payload);
 for(const key of ['bodySha256','metadataSha256','sourceEnvelopeSha256']){
  assert.equal(pin[key],source[key]);assert.equal(payload[key],pin[key]);assert.equal(entry?.[key],pin[key],'SKTT public '+key+' drift');
 }
 assert.equal(pin.contentVersion,'sha256:'+payload.bodySha256);
 for(const [key,value] of Object.entries({contentId:'sktt',locale,dir:source.direction,route:pin.route,
  canonicalPath:approved.canonicalPath,sourceRevision:approved.sourceRevision,serviceId:null,pricingRef:null,
  indexable:true,lastModified:approved.publication.lastModified,ownerApprovedSkttEditorial:true}))
  assert.deepEqual(entry?.[key],value,'SKTT public entry '+key+' drift');
 assert.equal(publicRegistryContentVersion(entry),pin.publicSourceVersion,'SKTT public source version drift');
 return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',requiresSources:true,
  hasSubstantialContent:true,locale,availableLocales:PUBLIC_LOCALES,contentVersion:pin.contentVersion,
  lastModified:approved.publication.lastModified,ownerApproval:{authority:'founder',
   approvedAt:grant.authority.decisionDate,contentVersion:pin.contentVersion}},{asOf});
}
function validateBuild(registry,{readContent=readEditorialInput,readNativeSource=readSkttEditorialInput,
 readLocalSource=readSkttLocalEditorialInput,...options}={},originals){
 const {native,local,grant,approved}=anchors(options);validateRegistry(registry);
 const matches=registry.records.filter(row=>row.contentId==='sktt');assert.equal(matches.length,1);const record=matches[0];
 assert.equal(sha(encoded(record)),grant.mixedRecordSha256,'SKTT mixed record drift');
 const entries=PUBLIC_LOCALES.map(locale=>{
  const language=registry.locales.find(row=>row.code===locale),pin=approved.locales[locale],source=sourcePin(locale,native,local);
  assert.equal(pin.route,language.prefix+approved.canonicalPath);assert.equal(source.direction,language.dir);
  const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
  const bodyBytes=Buffer.from(readContent(payload.bodyFile)),metadataBytes=Buffer.from(readContent(payload.metadataFile));
  assert.equal(sha(bodyBytes),pin.bodySha256,'SKTT public body bytes drift');
  assert.equal(sha(metadataBytes),pin.metadataSha256,'SKTT public metadata bytes drift');
  const body=new TextDecoder('utf-8',{fatal:true}).decode(bodyBytes),metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metadataBytes));
  const localSource=SKTT_LOCAL_LOCALES.includes(locale);
  const validator=localSource?(originals?validateSkttLocalEditorialOriginal:validateSkttLocalEditorialProjection):
   (originals?validateSkttEditorialOriginal:validateSkttEditorialProjection);
  validator(record,locale,payload,metadata,body,originals?{readSource:localSource?readLocalSource:readNativeSource}:{});
  const entry={contentId:'sktt',locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
   sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
   sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:null,pricingRef:null,indexable:true,
   lastModified:approved.publication.lastModified,title:metadata.h1,seoTitle:metadata.seoTitle,
   description:metadata.metaDescription,ownerApprovedSkttEditorial:true};
  assert.equal(validateSkttEditorialPublicEntry(record,locale,entry,options).indexable,true);return entry;
 });
 assert.equal(entries.length,10);assert.equal(new Set(entries.map(row=>row.route)).size,10);return entries;
}
export const validateSkttEditorialPublicOriginals=(registry,options)=>validateBuild(registry,options,true);
export const validateSkttEditorialPublicDerivative=(registry,options)=>validateBuild(registry,options,false);
