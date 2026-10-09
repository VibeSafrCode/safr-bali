// A source-pinned local D12/E28A build contract. No deploy or legal attestation.
import assert from 'node:assert/strict';
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {metadataEnvelope,canonicalJson} from '../../shared/scripts/import-sync-bundle.mjs';
import {D12_E28A_BATCH,D12_E28A_KIND,D12_E28A_GATES,d12E28APages,d12E28AEvidenceHashes,
  publicD12E28ABody,readD12E28AStructure,d12E28ASha as sha,d12E28APriceOccurrences,d12E28APriceOperations} from '../../shared/scripts/import-d12-e28a-bundle.mjs';

export const D12_E28A_GATE_KEYS=Object.freeze([...D12_E28A_GATES]);
export function validateD12E28ABuild(manifest,registry,{readContent}) {
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.version,D12_E28A_BATCH);
  assert.equal(manifest.fullPayloadKind,D12_E28A_KIND);assert.equal(manifest.authority.publisher,'Founder');
  assert.equal(manifest.authority.decisionDate,'2026-10-09');
  const expectedIds=Object.values(d12E28APages).map(p=>p.contentId);
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),expectedIds.sort());
  assert.equal(new Set(manifest.records.map(r=>r.contentId)).size,7);
  assert.deepEqual(Object.keys(manifest.publicationGates).sort(),[...D12_E28A_GATES].sort());
  for(const gate of Object.values(manifest.publicationGates))assert.equal(typeof gate,'boolean');
  const ready=D12_E28A_GATES.every(key=>manifest.publicationGates[key]);
  assert.equal(manifest.stage,ready?'LOCAL_READY_NO_DEPLOY':'IMPORTED_PENDING_RENDER_QA');
  const sourcePack='registry-copy/d12e28a_source_pack/';
  assert.equal(manifest.sourceManifest.file,sourcePack+'ALL_LOCALES_CONTENT_SEO_MANIFEST.json');
  assert.equal(manifest.sourceManifest.sha256,manifest.sourceManifestSha256);
  assert.equal(manifest.sourceManifest.sha256,d12E28AEvidenceHashes['ALL_LOCALES_CONTENT_SEO_MANIFEST.json']);
  const sourceBytes=readContent(manifest.sourceManifest.file);assert.equal(sha(sourceBytes),manifest.sourceManifestSha256);
  const source=JSON.parse(sourceBytes);
  assert.equal(manifest.approvalEvidence.file,sourcePack+'RU_APPROVAL_MANIFEST.json');
  assert.equal(manifest.approvalEvidence.sha256,d12E28AEvidenceHashes['RU_APPROVAL_MANIFEST.json']);
  assert.equal(sha(readContent(manifest.approvalEvidence.file)),manifest.approvalEvidence.sha256);
  assert.equal(manifest.approvalEvidence.translationAuthorizationFile,sourcePack+'PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md');
  assert.equal(manifest.approvalEvidence.translationAuthorizationSha256,d12E28AEvidenceHashes['PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md']);
  assert.equal(sha(readContent(manifest.approvalEvidence.translationAuthorizationFile)),manifest.approvalEvidence.translationAuthorizationSha256);
  assert.equal(manifest.priceOccurrences.file,'registry-copy/d12e28a_price_occurrences.json');
  const occurrenceBytes=readContent(manifest.priceOccurrences.file);assert.equal(sha(occurrenceBytes),manifest.priceOccurrences.sha256);
  const occurrences=JSON.parse(occurrenceBytes),rebuiltOccurrences=[];
  assert.equal(occurrences.schemaVersion,1);assert.equal(occurrences.batchId,D12_E28A_BATCH);
  assert.equal(occurrences.kind,'D12_E28A_EXACT_PRICE_OCCURRENCE_MAP');
  assert.deepEqual(occurrences.operations,d12E28APriceOperations,'Canonical operation identity drift');
  assert.equal(occurrences.sourceManifestSha256,manifest.sourceManifestSha256);
  if(ready) {
    assert.equal(manifest.renderEvidence.file,'registry-copy/d12e28a_render_qa.json');
    const evidenceBytes=readContent(manifest.renderEvidence.file);assert.equal(sha(evidenceBytes),manifest.renderEvidence.sha256);
    const evidence=JSON.parse(evidenceBytes);assert.equal(evidence.status,'PASS');
    assert.equal(evidence.sourceManifestSha256,manifest.sourceManifestSha256);
    assert.equal(evidence.priceOccurrencesSha256,manifest.priceOccurrences.sha256);
    assert.deepEqual([...evidence.passedGates].sort(),[...D12_E28A_GATES].sort());
    assert.equal(evidence.realSubmissions,false);assert.equal(evidence.personalProfileUsed,false);assert.equal(evidence.autoplay,false);
  } else assert.ok(!manifest.renderEvidence,'Pending build cannot claim actual ready evidence');
  const entries=[];
  for(const approved of manifest.records) {
    const spec=d12E28APages[approved.pageKey];assert.ok(spec);assert.equal(spec.contentId,approved.contentId);
    const record=registry.records.find(r=>r.contentId===approved.contentId);assert.ok(record);
    assert.equal(record.candidate.revision,approved.sourceRevision);assert.equal(record.candidate.ru.status,'owner_approved_semantics');
    assert.equal(approved.canonicalPath,spec.route);assert.equal(record.candidate.route,spec.route);
    assert.equal(approved.serviceId,record.serviceId);assert.deepEqual(approved.pricingRef,record.pricingRef);
    assert.equal(approved.publication.indexable,ready);assert.equal(approved.publication.lastModified,'2026-10-09');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    const sourcePage=source.pages.find(p=>p.key===approved.pageKey);assert.ok(sourcePage);
    assert.equal(approved.approvedSourceRevision,'sha256:'+sourcePage.source_ru_revision);
    for(const locale of PUBLIC_LOCALES) {
      const pin=approved.locales[locale],payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
      const language=registry.locales.find(l=>l.code===locale),sourcePin=sourcePage.locales[locale];assert.ok(payload);
      assert.equal(pin.route,record.published?.routes[locale]??language.prefix+approved.canonicalPath);
      assert.equal(pin.direction,language.dir);assert.equal(pin.bodyFile,payload.bodyFile);assert.equal(pin.bodySha256,payload.bodySha256);
      assert.equal(pin.metadataFile,payload.metadataFile);assert.equal(pin.metadataSha256,payload.metadataSha256);
      assert.equal(pin.sourceEnvelopeSha256,payload.sourceEnvelopeSha256);
      if(locale!=='ru')assert.ok(payload.complete&&payload.qa==='passed'&&payload.sourceRevision===approved.sourceRevision);
      const body=readContent(pin.bodyFile),metaBytes=readContent(pin.metadataFile),original=readContent(pin.sourceFile);
      assert.equal(sha(body),pin.bodySha256);assert.equal(sha(metaBytes),pin.metadataSha256);assert.equal(sha(original),pin.sourceFileSha256);
      assert.equal(pin.sourceFileSha256,sourcePin.sha256);
      const meta=JSON.parse(metaBytes),extracted=publicD12E28ABody(original.toString('utf8'));
      assert.equal(extracted.body,body.toString('utf8'),'Only editorial metadata prefix can be removed');
      assert.equal(meta.archivalEditorialMetadata,extracted.archivalMetadata);assert.deepEqual(meta.archivalEditorialFields,extracted.fields);
      assert.equal(meta.fullPayloadKind,D12_E28A_KIND);assert.equal(meta.resolvedContentId,record.contentId);
      assert.equal(meta.bodyMarkdown,body.toString('utf8'));assert.equal(meta.bodyRevision,'sha256:'+pin.bodySha256);
      assert.equal(meta.bodySha256,pin.bodySha256);assert.equal(meta.sourceRevision,approved.sourceRevision);
      assert.equal(meta.approvedSourceRevision,approved.approvedSourceRevision);assert.equal(meta.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
      assert.equal(meta.locale,locale);assert.equal(meta.direction,language.dir);
      assert.equal(meta.sourceFile,pin.sourceFile);assert.equal(meta.sourceFileSha256,pin.sourceFileSha256);
      assert.equal(meta.payloadRevision,pin.payloadRevision);
      assert.equal(meta.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta})));
      assert.equal(meta.h1,sourcePin.h1);assert.equal(meta.seo.title,sourcePin.title);assert.equal(meta.seo.description,sourcePin.description);
      assert.equal(meta.seoTitle,sourcePin.title);assert.equal(meta.metaDescription,sourcePin.description);
      const intro=meta.bodyMarkdown.slice(meta.bodyMarkdown.indexOf('\n')+1,meta.bodyMarkdown.indexOf('\n## ')).trim();
      const firstSection=meta.bodyMarkdown.match(/^## [^\n]+\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
      assert.equal(meta.directAnswer,intro||firstSection[1].trim(),'Direct answer must be supplied visible prose');
      assert.deepEqual(meta.factBlock,{heading:'',items:[]});assert.equal(meta.factBlockMarkdown,'');
      const structure=readD12E28AStructure(meta.bodyMarkdown,{faqSectionIndex:meta.faqSectionIndex});
      for(const key of Object.keys(structure))assert.deepEqual(meta[key],structure[key],'Complete structure: '+key);
      assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);
      assert.equal(meta.approval.status,locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA');
      if(locale==='ru')assert.equal(metadataEnvelope(body,meta),pin.sourceEnvelopeSha256);
      rebuiltOccurrences.push(...d12E28APriceOccurrences(meta));
      entries.push({contentId:record.contentId,locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
        sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
        sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:record.serviceId,pricingRef:record.pricingRef,
        indexable:ready,lastModified:approved.publication.lastModified,title:meta.h1,seoTitle:meta.seo.title,description:meta.seo.description});
    }
  }
  assert.equal(entries.length,70);assert.equal(new Set(entries.map(entry=>entry.route)).size,70);
  assert.deepEqual(occurrences.occurrences,rebuiltOccurrences,'Exact price mapping must match approved fields');
  return entries;
}
