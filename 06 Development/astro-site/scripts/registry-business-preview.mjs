// Exact supplied Business drafts may be rendered only in protected editorial
// tooling. This is not a publication approval, a service or a price binding.
import assert from 'node:assert/strict';
import build from '../../shared/content/registry-business-build.v1.json' with {type:'json'};

export const businessDraftIds=Object.freeze(['business','pma','nib_oss','corporate_changes','liquidation','knowledge_pt_pma_capital']);
export const isBusinessDraft=record=>businessDraftIds.includes(record?.contentId);

export function validateBusinessPreviewPayload(record,locale,payload,metadata,source) {
  const approved=build.records.find(row=>row.contentId===record.contentId),pin=approved?.locales[locale];
  assert.ok(pin,'Unknown supplied Business preview');
  assert.equal(record.published,null,'Business draft cannot replace a published adapter');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.ru.status,'draft');
  assert.equal(record.candidate.revision,approved.sourceRevision);
  assert.equal(record.candidate.route,approved.canonicalPath);
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.equal(approved.publication.indexable,false);
  if(locale!=='ru') {
    assert.equal(payload.complete,true);assert.equal(payload.sourceRevision,record.candidate.revision);
    assert.equal(payload.qa,'not_done','Preview never promotes a machine check to release QA');
  }
  for(const field of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])
    assert.equal(payload[field],pin[field],'Business '+field+' drift');
  assert.equal(metadata.fullPayloadKind,'BUSINESS_STAGE1_FULL_MD_V1');
  assert.equal(metadata.resolvedContentId,record.contentId);assert.equal(metadata.locale,locale);
  assert.equal(metadata.resolvedCanonicalPath,record.candidate.route);
  assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,payload.bodySha256);
  assert.equal(metadata.sourceRevision,record.candidate.revision);
  assert.equal(metadata.quotePolicy.fixedPriceApproved,false);assert.equal(metadata.quotePolicy.businessServiceCreated,false);
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  assert.equal(metadata.approval.nativeSpeakerReview,false);
  assert.equal(metadata.approval.browserReview,false);assert.equal(metadata.approval.legalVerification,false);
  assert.equal(metadata.faq.length,6);assert.equal(metadata.cta.length,1);
  assert.equal(metadata.cta[0].actionIntent,'existing_contact_flow');
  return metadata;
}
