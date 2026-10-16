// First-class source contract in the existing renderer. No public authority.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import {VIETNAM_KIND,VIETNAM_SOURCE_MODE,VIETNAM_PACKETS,VIETNAM_SPANS,VIETNAM_LOCALES,
  DE_ORIGINAL_FAQ6,DE_CORRECTED_FAQ6,vietnamSha as sha,parseVietnamDraftPage} from '../../shared/scripts/vietnam-editorial-source.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {readVietnamEditorialInput,VIETNAM_SOURCE_ANCHOR} from './registry-vietnam-editorial-inputs.mjs';

export const VIETNAM_PLANNED_RECORD_SHA256='1321b4ba5367f6aa99cf62c58d85fe63746e80ee0b47b096094a5a81c272d3c6';
const encoded=value=>JSON.stringify(value,null,2)+'\n';
function anchor(manifest){
  assert.equal(sha(encoded(manifest)),VIETNAM_SOURCE_ANCHOR,'Vietnam source anchor drift');
  assert.equal(manifest.fullPayloadKind,VIETNAM_KIND);assert.equal(manifest.sourceMode,VIETNAM_SOURCE_MODE);
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'vietnam');
  assert.ok(Object.values(manifest.publicationGates).every(value=>value===false));
  assert.deepEqual(manifest.sourcePackets,VIETNAM_PACKETS.map(p=>({...p})));
  return manifest.records[0];
}
export const isVietnamEditorialDraft=record=>record?.contentId==='vietnam';
export function validateVietnamEditorialProjection(record,locale,payload,metadata,source,{manifest=sourceManifest}={}){
  const entry=anchor(manifest),pin=entry.locales[locale];
  assert.ok(VIETNAM_LOCALES.includes(locale)&&pin,'Unreceived Vietnam locale');
  assert.equal(sha(encoded(record)),VIETNAM_PLANNED_RECORD_SHA256,'Version-bound Vietnam record drift');
  assert.equal(record.contentId,'vietnam');assert.equal(record.kind,'world_visa');assert.equal(record.parentId,'world_visas');
  for(const key of ['serviceId','pricingRef','published'])assert.equal(record[key],null);
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.candidate.route,entry.canonicalPath);
  assert.equal(record.candidate.revision,entry.sourceRevision);assert.equal(record.candidate.ru.status,'draft');
  assert.equal(record.candidate.ru.approvalEvidence,null);assert.equal(record.candidate.ru.approvalRevision,null);
  if(locale!=='ru'){assert.equal(payload.status,'translated');assert.equal(payload.complete,true);assert.equal(payload.qa,'not_done');assert.equal(payload.qaMethod,'supplied_model_semantic');assert.equal(payload.sourceRevision,entry.sourceRevision);}
  for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(payload[key],pin[key],'Vietnam payload '+key+' drift');
  assert.equal(sha(source),pin.bodySha256);assert.equal(sha(encoded(metadata)),pin.metadataSha256);
  assert.equal(metadata.fullPayloadKind,VIETNAM_KIND);assert.equal(metadata.sourceMode,VIETNAM_SOURCE_MODE);
  assert.equal(metadata.resolvedContentId,'vietnam');assert.equal(metadata.locale,locale);assert.equal(metadata.direction,pin.direction);
  assert.equal(metadata.resolvedCanonicalPath,entry.canonicalPath);assert.equal(metadata.sourceRevision,entry.sourceRevision);
  assert.equal(metadata.editorialSourceRevision,entry.editorialSourceRevision);assert.equal(metadata.sourceRuBodySha256,entry.ruBodySha256);
  assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,pin.bodySha256);
  assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256);assert.equal(metadata.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
  assert.equal(metadata.sourceFile,pin.sourceFile);assert.equal(metadata.sourceFileSha256,pin.sourceFileSha256);
  assert.equal(metadata.serviceId,null);assert.equal(metadata.pricingRef,null);assert.equal(metadata.pricingMode,'individual_quote');
  assert.equal(metadata.publicationAuthorized,false);assert.equal(metadata.factBlock,null);assert.equal(metadata.directAnswer,'');
  assert.equal(typeof metadata.faqHeading,'string');assert.equal(metadata.faq.length,6);assert.equal(metadata.cta.length,1);
  assert.equal(metadata.tables.length,1);assert.equal(metadata.tables[0].dataRows,4);assert.equal(metadata.tables[0].columns,2);
  assert.equal(metadata.bodyIncludesFaq,true);assert.equal(metadata.doNotRenderSeparateFaqAgain,true);assert.equal(metadata.sourceNotesPrivate,true);
  assert.equal(metadata.seoTitle,metadata.seo.title);assert.equal(metadata.metaDescription,metadata.seo.description);
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  for(const flag of ['legalVerification','fulfillmentVerified','nativeSpeakerReview','browserReview'])assert.equal(metadata.approval[flag],false);
  assert.equal(Object.hasOwn(metadata,'privateEditorialNotes'),false);assert.equal(Object.hasOwn(metadata,'rawArchives'),false);
  return metadata;
}
export function validateVietnamEditorialOriginal(record,locale,payload,metadata,source,{readSource=readVietnamEditorialInput,...options}={}){
  validateVietnamEditorialProjection(record,locale,payload,metadata,source,options);
  const pin=(options.manifest??sourceManifest).records[0].locales[locale],raw=Buffer.from(readSource(pin.sourceFile));
  assert.equal(sha(raw),pin.sourceFileSha256,'Vietnam private source bytes drift');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),wire=JSON.parse(text);
  assert.equal(text,encoded(wire));assert.equal(wire.schemaVersion,1);assert.equal(wire.sourceMode,VIETNAM_SOURCE_MODE);
  assert.deepEqual(wire.provenance,metadata.sourceProvenance);
  const scope=VIETNAM_SPANS.find(row=>row.locale===locale),keys=scope.locale==='de'?['de','fr']:[scope.packet];
  assert.deepEqual(Object.keys(wire.archives).sort(),[...keys].sort());
  assert.deepEqual(wire.provenance.components,keys.map(key=>({...VIETNAM_PACKETS.find(p=>p.key===key)})));
  for(const key of keys){const packet=VIETNAM_PACKETS.find(p=>p.key===key),bytes=Buffer.from(wire.archives[key],'utf8');assert.equal(bytes.length,packet.bytes);assert.equal(sha(bytes),packet.sha256,'Vietnam original packet drift');}
  const lines=wire.archives[scope.packet].split('\n'),body=lines.slice(scope.bodyLine-1,scope.bodyLine+113),notes=lines.slice(scope.bodyLine+116,scope.bodyLine+127);
  if(locale==='de'){
    const replacement=wire.archives.fr.split('\n')[16];assert.equal(replacement,DE_CORRECTED_FAQ6);assert.equal(body[107],DE_ORIGINAL_FAQ6);body[107]=replacement;
    const reverse=[...body];reverse[107]=DE_ORIGINAL_FAQ6;assert.deepEqual(reverse,lines.slice(scope.bodyLine-1,scope.bodyLine+113));
  }
  const parsed=parseVietnamDraftPage([lines[scope.seoLine-1],lines[scope.seoLine+1]],body,{locale,notesLines:notes});
  assert.equal(wire.privateEditorialNotes,parsed.privateEditorialNotes);assert.equal(sha(parsed.privateEditorialNotes),metadata.sourceNotesSha256);
  for(const key of ['bodyMarkdown','h1','seo','directAnswer','factBlock','faq','faqHeading','tables','cta','bodyIncludesFaq','doNotRenderSeparateFaqAgain','sourceEntryCount','sourceUrls'])assert.deepEqual(metadata[key],parsed[key],'Lost literal Vietnam '+key);
  return metadata;
}
