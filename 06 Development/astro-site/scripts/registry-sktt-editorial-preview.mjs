// Full source acceptance in the existing renderer, not public authorization.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import {sha256 as sha,SKTT_PACKETS,SKTT_SPANS,parseSkttDraftPage} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {SKTT_KIND,SKTT_SOURCE_MODE,SKTT_LOCALES,encoded} from '../../shared/scripts/sktt-editorial-import.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {readSkttEditorialInput,SKTT_SOURCE_ANCHOR} from './registry-sktt-editorial-inputs.mjs';
import {skttNativeRecordForValidation} from './registry-sktt-local-editorial-preview.mjs';
function anchor(manifest){
  assert.equal(sha(encoded(manifest)),SKTT_SOURCE_ANCHOR,'SKTT manifest anchor drift');
  assert.equal(manifest.fullPayloadKind,SKTT_KIND);assert.equal(manifest.sourceMode,SKTT_SOURCE_MODE);
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'sktt');
  assert.deepEqual(manifest.receivedLocales,SKTT_LOCALES);assert.deepEqual(manifest.missingLocales,['hi','ar']);
  assert.equal(manifest.fullTenLocaleSourceComplete,false);assert.ok(Object.values(manifest.publicationGates).every(v=>v===false));
  return manifest.records[0];
}
export const isSkttEditorialDraft=record=>record?.contentId==='sktt';
export function validateSkttEditorialProjection(record,locale,payload,metadata,source,{manifest=sourceManifest}={}){
  const entry=anchor(manifest),pin=entry.locales[locale];assert.ok(SKTT_LOCALES.includes(locale)&&pin,'Unreceived SKTT locale');
  assert.equal(sha(encoded(skttNativeRecordForValidation(record))),entry.plannedRecordSha256,'Version-bound SKTT record drift');
  assert.equal(record.contentId,'sktt');assert.equal(record.kind,'document');assert.equal(record.parentId,'documents');
  for(const k of ['serviceId','pricingRef','published'])assert.equal(record[k],null);
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.candidate.route,entry.canonicalPath);
  assert.equal(record.candidate.revision,entry.sourceRevision);assert.equal(record.candidate.ru.status,'draft');
  assert.equal(record.candidate.ru.approvalEvidence,null);assert.equal(record.candidate.ru.approvalRevision,null);
  if(locale!=='ru'){assert.equal(payload.status,'translated');assert.equal(payload.complete,true);assert.equal(payload.qa,'not_done');assert.equal(payload.sourceRevision,entry.sourceRevision);}
  for(const k of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(payload[k],pin[k],'SKTT payload '+k+' drift');
  assert.equal(sha(source),pin.bodySha256);assert.equal(sha(encoded(metadata)),pin.metadataSha256);
  assert.equal(metadata.fullPayloadKind,SKTT_KIND);assert.equal(metadata.sourceMode,SKTT_SOURCE_MODE);
  assert.equal(metadata.resolvedContentId,'sktt');assert.equal(metadata.resolvedCanonicalPath,entry.canonicalPath);
  assert.equal(metadata.locale,locale);assert.equal(metadata.direction,pin.direction);
  assert.equal(metadata.sourceRevision,entry.sourceRevision);assert.equal(metadata.sourceRuBodySha256,entry.ruBodySha256);
  assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,pin.bodySha256);
  assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256);assert.equal(metadata.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
  assert.equal(metadata.sourceFile,pin.sourceFile);assert.equal(metadata.sourceFileSha256,pin.sourceFileSha256);
  assert.equal(metadata.serviceId,null);assert.equal(metadata.pricingRef,null);assert.equal(metadata.pricingMode,'individual_quote');
  assert.equal(metadata.publicationAuthorized,false);assert.equal(metadata.factBlock,null);assert.equal(metadata.directAnswer,'');
  assert.equal(metadata.faqHeading,null);assert.equal(metadata.faq.length,2);assert.equal(metadata.tables.length,0);assert.equal(metadata.cta.length,1);
  assert.equal(metadata.bodyIncludesFaq,true);assert.equal(metadata.doNotRenderSeparateFaqAgain,true);
  assert.equal(metadata.seoTitle,metadata.seo.title);assert.equal(metadata.metaDescription,metadata.seo.description);
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  for(const k of ['legalVerification','fulfillmentVerified','nativeSpeakerReview','browserReview'])assert.equal(metadata.approval[k],false);
  for(const k of ['archive','rawArchives','privateEditorialNotes'])assert.equal(Object.hasOwn(metadata,k),false);
  return metadata;
}
export function validateSkttEditorialOriginal(record,locale,payload,metadata,source,{readSource=readSkttEditorialInput,...options}={}){
  validateSkttEditorialProjection(record,locale,payload,metadata,source,options);
  const pin=(options.manifest??sourceManifest).records[0].locales[locale],bytes=Buffer.from(readSource(pin.sourceFile));
  assert.equal(sha(bytes),pin.sourceFileSha256,'SKTT private source bytes drift');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),wire=JSON.parse(text);
  assert.equal(text,encoded(wire));assert.equal(wire.schemaVersion,1);assert.equal(wire.sourceMode,SKTT_SOURCE_MODE);
  assert.deepEqual(wire.provenance,metadata.sourceProvenance);
  const scope=SKTT_SPANS.find(p=>p.locale===locale),packet=SKTT_PACKETS.find(p=>p.task===scope.task),raw=Buffer.from(wire.archive);
  assert.equal(raw.length,packet.bytes);assert.equal(sha(raw),packet.sha256,'SKTT original packet drift');
  const lines=wire.archive.split('\n');assert.equal(lines.at(-2),packet.end);assert.equal(lines.at(-1),'');
  const parsed=parseSkttDraftPage(lines.slice(scope.seoLine-1,scope.seoLine+1),lines.slice(scope.bodyLine-1,scope.bodyLine+26),{locale});
  for(const k of Object.keys(parsed))assert.deepEqual(metadata[k],parsed[k],'Lost literal SKTT '+k);
  return metadata;
}
