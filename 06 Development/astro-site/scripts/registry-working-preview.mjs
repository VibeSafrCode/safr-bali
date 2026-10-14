// G01 is opt-in protected editorial preview, never a publication adapter.
import assert from 'node:assert/strict';
import workingBuild from '../../shared/content/registry-working-build.v1.json' with {type:'json'};
import {metadataEnvelope,canonicalJson} from '../../shared/scripts/import-sync-bundle.mjs';
import {workingPages,workingSha as sha,WORKING_KIND,workingEvidenceHashes} from '../../shared/scripts/import-working-bundle.mjs';
export const isWorkingDraft=record=>Object.hasOwn(workingPages,record?.contentId??'');
export function validateWorkingPreviewPayload(record,locale,payload,metadata,source,{build=workingBuild}={}) {
  assert.ok(isWorkingDraft(record),'Unknown G01 identity');assert.equal(build.fullPayloadKind,WORKING_KIND);assert.equal(build.records.length,6);
  assert.ok(Object.values(build.publicationGates).every(v=>v===false),'G01 release gate drift');
  const entry=build.records.find(r=>r.contentId===record.contentId),pin=entry?.locales[locale];assert.ok(pin,'Unknown supplied G01 preview');
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');assert.equal(record.candidate.exposure,'preview_only');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(entry.serviceId,null);assert.equal(entry.pricingRef,null);
  assert.equal(record.candidate.route,entry.canonicalPath);assert.equal(record.candidate.revision,entry.sourceRevision);assert.equal(entry.publication.indexable,false);
  assert.equal(record.candidate.ru.status,'draft');assert.equal(record.candidate.ru.approvalEvidence,null);assert.equal(record.candidate.ru.approvalRevision,null);
  if(locale==='ru')assert.equal(payload.status,'draft');
  else {assert.equal(payload.status,'translated');assert.equal(payload.complete,true);assert.equal(payload.qa,'not_done');assert.equal(payload.qaMethod,'supplied_model_semantic');assert.equal(payload.sourceRevision,record.candidate.revision);}
  for(const f of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(payload[f],pin[f],'G01 '+f+' drift');
  assert.equal(sha(source),pin.bodySha256);assert.equal(sha(JSON.stringify(metadata,null,2)+'\n'),pin.metadataSha256);
  assert.equal(metadata.fullPayloadKind,WORKING_KIND);assert.equal(metadata.resolvedContentId,record.contentId);assert.equal(metadata.locale,locale);assert.equal(metadata.direction,pin.direction);
  assert.equal(metadata.resolvedCanonicalPath,record.candidate.route);assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,payload.bodySha256);
  assert.equal(metadata.sourceRevision,entry.sourceRevision);assert.equal(metadata.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
  assert.equal(metadata.editorialSourceRevision,entry.editorialSourceRevision);assert.equal(metadata.editorialSourceSha256,entry.ruSourceSha256);
  for(const f of ['sourceMarkdownFile','sourceMarkdownSha256','sourceFile','sourceFileSha256','payloadRevision'])assert.equal(metadata[f],pin[f]);
  assert.equal(metadata.sourceManifestSha256,workingEvidenceHashes['DATA/CONTENT_IMPORT_STAGING_ALL_10.json']);
  assert.equal(metadata.sourceRecord.sourceRuSha256,entry.ruSourceSha256);assert.equal(metadata.h1,metadata.sourceRecord.body.match(/^# (.+)$/m)?.[1]);
  assert.equal(metadata.seo.title,metadata.sourceRecord.seo.title);assert.equal(metadata.seo.description,metadata.sourceRecord.seo.description);
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  for(const key of ['nativeSpeakerReview','browserReview','legalVerification','fulfillmentVerified'])assert.equal(metadata.approval[key],false);
  assert.equal(metadata.quotePolicy.fixedPriceApproved,false);assert.equal(metadata.quotePolicy.businessServiceCreated,false);
  assert.equal(metadata.pricingMode,record.kind==='knowledge'?'information_only':'individual_quote');
  assert.equal(metadata.faq.length,6);assert.equal(metadata.cta.length,1);assert.equal(metadata.bodyIncludesFaq,true);assert.equal(metadata.doNotRenderSeparateFaqAgain,true);
  assert.equal(metadata.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:source,seo:metadata.seo,h1:metadata.h1,faq:metadata.faq,cta:metadata.cta,inlineLinkReconciliation:metadata.inlineLinkReconciliation})));
  if(locale==='ru')assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256);
  return metadata;
}
