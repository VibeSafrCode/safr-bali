// Supplied Documents copy is opt-in protected editorial preview. This validator
// confers no publication, legal/native/browser QA, Service or price approval.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import documentsBuild from '../../shared/content/registry-documents-build.v1.json' with {type:'json'};
import {canonicalJson,metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';

export const documentsDraftIds=Object.freeze(['documents','translations','apostille','legalization','corporate_docs','knowledge_apostille_vs_legalization']);
export const isDocumentsDraft=record=>documentsDraftIds.includes(record?.contentId);
const sha=value=>createHash('sha256').update(value).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const documentsOfficialSourceHosts=Object.freeze(['peraturan.bpk.go.id','layanan.ahu.go.id','www.hcch.net','legalisasi.kemlu.go.id','portal.ahu.go.id','oss.go.id']);
// The caller must validate metadata first. Membership in exact supplied URLs
// and the bounded official-host set is required; hostname suffixes never pass.
export function isDocumentsOfficialSourceUrl(href,metadata) {
  try {
    const url=new URL(href);
    return metadata?.fullPayloadKind==='DOCUMENTS_STAGE1_FULL_JSON_V1'&&url.protocol==='https:'&&!url.username&&!url.password&&
      documentsOfficialSourceHosts.includes(url.hostname)&&metadata.links.includes(href);
  } catch {return false;}
}

export function validateDocumentsPreviewPayload(record,locale,payload,metadata,source,{build=documentsBuild}={}) {
  assert.ok(isDocumentsDraft(record),'Unknown Documents draft identity');
  assert.equal(build.fullPayloadKind,'DOCUMENTS_STAGE1_FULL_JSON_V1');assert.equal(build.records.length,6);
  assert.ok(Object.values(build.publicationGates).every(flag=>flag===false),'Documents release gate drift');
  const approved=build.records.find(row=>row.contentId===record.contentId),pin=approved?.locales[locale];
  assert.ok(pin,'Unknown supplied Documents preview');
  assert.equal(record.published,null,'Documents draft cannot replace a published adapter');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.ru.status,'draft');assert.equal(record.candidate.ru.approvalEvidence,null);assert.equal(record.candidate.ru.approvalRevision,null);
  assert.equal(record.candidate.revision,approved.sourceRevision);assert.equal(record.candidate.route,approved.canonicalPath);
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(approved.serviceId,null);assert.equal(approved.pricingRef,null);
  assert.equal(approved.publication.indexable,false);
  if(locale==='ru')assert.equal(payload.status,'draft');
  else {
    assert.equal(payload.complete,true);assert.equal(payload.sourceRevision,record.candidate.revision);assert.equal(payload.status,'translated');
    assert.equal(payload.qa,'not_done','Preview never promotes a machine check to release QA');assert.equal(payload.qaMethod,'supplied_model_semantic');
  }
  for(const field of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])
    assert.equal(payload[field],pin[field],'Documents '+field+' drift');
  assert.equal(sha(source),pin.bodySha256,'Documents immutable body drift');
  assert.equal(sha(jsonBytes(metadata)),pin.metadataSha256,'Documents immutable metadata drift');
  assert.equal(metadata.fullPayloadKind,'DOCUMENTS_STAGE1_FULL_JSON_V1');
  assert.equal(metadata.resolvedContentId,record.contentId);assert.equal(metadata.locale,locale);assert.equal(metadata.direction,pin.direction);
  assert.equal(metadata.resolvedCanonicalPath,record.candidate.route);assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,payload.bodySha256);
  assert.equal(metadata.sourceRevision,record.candidate.revision);assert.equal(metadata.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
  assert.equal(metadata.editorialSourceRevision,approved.editorialSourceRevision);assert.equal(metadata.editorialSourceSha256,approved.sourceMarkdownSha256);
  for(const field of ['sourceFile','sourceFileSha256','sourceMarkdownFile','sourceMarkdownSha256','payloadRevision'])
    assert.equal(metadata[field],pin[field],'Documents '+field+' drift');
  assert.equal(metadata.sourceManifestSha256,build.sourceManifest.sha256);assert.equal(metadata.routeReconciliationSha256,build.routeReconciliation.sha256);
  assert.equal(sha(metadata.sourceRecord.fullTextMarkdown),pin.sourceMarkdownSha256,'Documents original Markdown envelope drift');
  assert.equal(metadata.sourceRecord.sourceSha256,approved.sourceMarkdownSha256);
  assert.equal(metadata.h1,metadata.sourceRecord.seo.h1);assert.equal(metadata.seo.title,metadata.sourceRecord.seo.title);
  assert.equal(metadata.seo.description,metadata.sourceRecord.seo.metaDescription);assert.equal(metadata.seoTitle,metadata.seo.title);assert.equal(metadata.metaDescription,metadata.seo.description);
  assert.equal(metadata.quotePolicy.fixedPriceApproved,false);assert.equal(metadata.quotePolicy.businessServiceCreated,false);
  assert.equal(metadata.pricingMode,record.kind==='knowledge'?'information_only':'individual_quote');
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  assert.equal(metadata.approval.nativeSpeakerReview,false);assert.equal(metadata.approval.browserReview,false);assert.equal(metadata.approval.legalVerification,false);
  assert.equal(metadata.faq.length,6);assert.equal(metadata.cta.length,1);assert.equal(metadata.cta[0].label,metadata.sourceRecord.cta);
  assert.equal(metadata.cta[0].actionIntent,'existing_contact_flow');assert.equal(metadata.bodyIncludesFaq,true);assert.equal(metadata.doNotRenderSeparateFaqAgain,true);
  assert.ok(!/<!--|-->|EDITORIAL STAGING|sourceSha256:|sourceRevision:|routeCandidate:|\*\*(?:SEO Title|Meta Description|CTA):\*\*/.test(source),'Documents staging leakage');
  assert.equal(metadata.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:metadata.bodyMarkdown,seo:metadata.seo,h1:metadata.h1,faq:metadata.faq,cta:metadata.cta,inlineLinkReconciliation:metadata.inlineLinkReconciliation})));
  if(locale==='ru')assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256,'Documents RU envelope drift');
  return metadata;
}
