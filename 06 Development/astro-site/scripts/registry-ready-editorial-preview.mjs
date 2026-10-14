// Received editorial source is opt-in local preview, not publication approval.
import assert from 'node:assert/strict';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import build from '../../shared/content/registry-ready-editorial-build.v1.json' with {type:'json'};
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {READY_EDITORIAL_KIND,READY_COUNTRY_CORRECTION_KIND,READY_CITIZENSHIP_CORRECTION_KIND,editorialSha as sha,parseReadyPage,selectReadyPage,assertCompleteReadyRussianSource,parseReadyCountryCorrection,parseReadyCitizenshipCorrection} from '../../shared/scripts/ready-editorial-text.mjs';
export const isReadyEditorialDraft = record => build.records.some(r => r.contentId === record?.contentId);

export function validateReadyEditorialPreview(record, locale, payload, metadata, source, {manifest=build,readSource=file=>readEditorialInput(file).toString('utf8')}={}) {
  assert.equal(manifest.fullPayloadKind, READY_EDITORIAL_KIND);
  assert.ok(Object.values(manifest.publicationGates).every(v=>v===false));
  const entry = manifest.records.find(r=>r.contentId===record.contentId), pin = entry?.locales[locale];
  assert.ok(pin, 'Unreceived editorial locale');
  assert.equal(record.published, null); assert.equal(record.release, 'not_authorized');
  assert.equal(record.serviceId, null); assert.equal(record.pricingRef, null);
  assert.equal(record.candidate.exposure, 'preview_only'); assert.equal(record.candidate.revision, entry.sourceRevision);
  assert.equal(record.candidate.route, entry.canonicalPath);
  assert.equal(record.candidate.ru.status, 'draft'); assert.equal(record.candidate.ru.approvalEvidence, null); assert.equal(record.candidate.ru.approvalRevision, null);
  if (locale !== 'ru') {
    assert.equal(payload.status, 'translated'); assert.equal(payload.complete, true);
    assert.equal(payload.qa, 'not_done'); assert.equal(payload.qaMethod, 'supplied_model_semantic');
    assert.equal(payload.sourceRevision, entry.sourceRevision);
  }
  for (const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256']) assert.equal(payload[key], pin[key], 'Editorial ' + key + ' drift');
  assert.equal(sha(source), pin.bodySha256); assert.equal(sha(JSON.stringify(metadata,null,2)+'\n'), pin.metadataSha256);
  assert.equal(metadata.fullPayloadKind, READY_EDITORIAL_KIND); assert.equal(metadata.resolvedContentId, record.contentId);
  assert.equal(metadata.locale, locale); assert.equal(metadata.direction, pin.direction);
  assert.equal(metadata.resolvedCanonicalPath, entry.canonicalPath); assert.equal(metadata.sourceRevision, entry.sourceRevision);
  assert.equal(metadata.editorialSourceRevision, entry.editorialSourceRevision);
  assert.equal(metadata.sourceRuBodySha256, entry.ruBodySha256); assert.equal(metadata.bodyMarkdown, source);
  assert.equal(metadata.bodySha256, pin.bodySha256); assert.equal(metadata.sourceEnvelopeSha256, pin.sourceEnvelopeSha256);
  assert.equal(metadata.publicationAuthorized, false); assert.equal(metadata.serviceId, null); assert.equal(metadata.pricingRef, null);
  assert.equal(metadata.pricingMode, 'individual_quote'); assert.equal(metadata.factBlock, null);
  assert.equal(metadata.approval.status, locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  for (const flag of ['legalVerification','fulfillmentVerified','nativeSpeakerReview','browserReview']) assert.equal(metadata.approval[flag], false);
  assert.match(metadata.sourceFile, /^registry-copy\/[a-z0-9_-]+\.source\.json$/);
  assert.equal(metadata.sourceFile, pin.sourceFile); const wire = readSource(pin.sourceFile);
  assert.equal(sha(wire), pin.sourceFileSha256); assert.equal(metadata.sourceFileSha256, pin.sourceFileSha256);
  const input = JSON.parse(wire);
  if (locale === 'ru') {
    assert.equal(input.bodyMarkdown, source); assert.equal(metadata.h1, input.h1); assert.deepEqual(metadata.seo, input.seo);
    assert.equal(metadata.directAnswer, input.shortAnswerMarkdown); assert.deepEqual(metadata.faq, input.faqs);
    assert.equal(metadata.cta[0].label, input.cta.label); assert.equal(metadataEnvelope(source,metadata), pin.sourceEnvelopeSha256);
    if(input.sourceMode==='ORDINARY_ASSISTANT_TEXT'){
      assert.equal(input.assistantMessageId,pin.assistantMessageId);assert.equal(sha(input.assistantText),pin.assistantTextSha256);
      const page=assertCompleteReadyRussianSource({readProof:input.readProof,turns:[{items:[{type:'agentMessage',text:input.assistantText}]}]},record.contentId);
      const parsed=parseReadyPage(page,entry.sourceShape);
      for(const key of ['bodyMarkdown','h1','seo','directAnswer','factBlock','faq','faqHeading','cta','bodyIncludesFaq','doNotRenderSeparateFaqAgain'])
        assert.deepEqual(metadata[key],parsed[key],'Lost received RU '+key);
    }
  } else {
    assert.equal(input.assistantMessageId, pin.assistantMessageId); assert.equal(sha(input.assistantText), pin.assistantTextSha256);
    assert.equal(metadata.assistantTextSha256, pin.assistantTextSha256);
    const corrected=[READY_COUNTRY_CORRECTION_KIND,READY_CITIZENSHIP_CORRECTION_KIND].includes(input.sourceMode);
    if(corrected){
      assert.equal(record.contentId,'second_home');assert.equal(locale,input.sourceMode===READY_COUNTRY_CORRECTION_KIND?'en':'fr');assert.equal(metadata.sourceMode,input.sourceMode);
      assert.equal(metadata.correctionBaseBodySha256,input.baseBodySha256);
      assert.equal(metadata.correctionAssistantMessageId,input.correction.assistantMessageId);assert.equal(pin.correctionAssistantMessageId,input.correction.assistantMessageId);
      assert.equal(metadata.correctionAssistantTextSha256,sha(input.correction.assistantText));assert.equal(pin.correctionAssistantTextSha256,metadata.correctionAssistantTextSha256);
    }
    const parsed = corrected ? (input.sourceMode===READY_COUNTRY_CORRECTION_KIND?parseReadyCountryCorrection:parseReadyCitizenshipCorrection)(input,entry.sourceShape) : parseReadyPage(selectReadyPage(input.assistantText, locale),entry.sourceShape);
    for (const key of ['bodyMarkdown','h1','seo','directAnswer','factBlock','faq','faqHeading','cta','bodyIncludesFaq','doNotRenderSeparateFaqAgain']) assert.deepEqual(metadata[key], parsed[key], 'Lost received ' + key);
  }
  assert.equal(metadata.seoTitle, metadata.seo.title); assert.equal(metadata.metaDescription, metadata.seo.description);
  assert.equal(metadata.faq.length,6); assert.equal(metadata.cta.length,1);
  assert.equal(metadata.bodyIncludesFaq,true); assert.equal(metadata.doNotRenderSeparateFaqAgain,true);
  return metadata;
}
