// Immutable local publication contract; actual readiness requires evidence.
import assert from 'node:assert/strict';
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {canonicalJson,metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {E33G_NEXT_BATCH,E33G_NEXT_KIND,E33G_NEXT_GATES,e33gNextPages,e33gNextEvidenceHashes,
  publicE33GNextBody,readE33GNextStructure,e33gNextPriceOccurrences,e33gNextPriceOperations,e33gNextSha as sha} from '../../shared/scripts/import-e33g-next-bundle.mjs';
export const E33G_NEXT_GATE_KEYS=Object.freeze([...E33G_NEXT_GATES]);
export function validateE33GNextBuild(manifest,registry,{readContent}) {
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.version,E33G_NEXT_BATCH);assert.equal(manifest.fullPayloadKind,E33G_NEXT_KIND);
  assert.equal(manifest.authority.publisher,'Founder');assert.equal(manifest.authority.decisionDate,'2026-10-09');
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),Object.values(e33gNextPages).map(p=>p.contentId).sort());
  assert.equal(new Set(manifest.records.map(r=>r.contentId)).size,4);
  assert.deepEqual(Object.keys(manifest.publicationGates).sort(),[...E33G_NEXT_GATES].sort());for(const gate of Object.values(manifest.publicationGates))assert.equal(typeof gate,'boolean');
  const ready=E33G_NEXT_GATES.every(key=>manifest.publicationGates[key]);assert.equal(manifest.stage,ready?'LOCAL_READY_NO_DEPLOY':'IMPORTED_PENDING_RENDER_QA');
  const pack='registry-copy/e33g_next_source_pack/';
  assert.deepEqual(manifest.sourceManifest,{file:pack+'CONTENT_MANIFEST.json',sha256:e33gNextEvidenceHashes['CONTENT_MANIFEST.json']});
  assert.equal(manifest.sourceManifestSha256,manifest.sourceManifest.sha256);
  assert.deepEqual(manifest.sourceJsonPack,{file:pack+'CONTENT_LOCALIZED_IMPORT.json',sha256:e33gNextEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']});
  for(const [file,pin] of Object.entries(e33gNextEvidenceHashes))assert.equal(sha(readContent(pack+file)),pin,'Supplied evidence drift: '+file);
  const sourceManifest=JSON.parse(readContent(manifest.sourceManifest.file)),supplied=JSON.parse(readContent(manifest.sourceJsonPack.file));assert.equal(supplied.length,40);
  const report=JSON.parse(readContent(pack+'QA/VALIDATION_REPORT.json'));
  assert.equal(manifest.priceOccurrences.file,'registry-copy/e33g_next_price_occurrences.json');
  const occurrenceBytes=readContent(manifest.priceOccurrences.file);assert.equal(sha(occurrenceBytes),manifest.priceOccurrences.sha256);
  const occurrences=JSON.parse(occurrenceBytes),rebuilt=[];assert.equal(occurrences.schemaVersion,1);assert.equal(occurrences.kind,'E33G_NEXT_EXACT_PRICE_OCCURRENCE_MAP');assert.equal(occurrences.batchId,E33G_NEXT_BATCH);
  assert.deepEqual(occurrences.operations,e33gNextPriceOperations);assert.equal(occurrences.sourceManifestSha256,manifest.sourceManifestSha256);assert.equal(occurrences.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);
  if(ready) {
    assert.equal(manifest.renderEvidence.file,'registry-copy/e33g_next_render_qa.json');
    const evidenceBytes=readContent(manifest.renderEvidence.file);assert.equal(sha(evidenceBytes),manifest.renderEvidence.sha256);
    const evidence=JSON.parse(evidenceBytes);assert.equal(evidence.status,'PASS');assert.equal(evidence.sourceManifestSha256,manifest.sourceManifestSha256);
    assert.equal(evidence.priceOccurrencesSha256,manifest.priceOccurrences.sha256);assert.deepEqual([...evidence.passedGates].sort(),[...E33G_NEXT_GATES].sort());
    assert.equal(evidence.realSubmissions,false);assert.equal(evidence.personalProfileUsed,false);assert.equal(evidence.autoplay,false);
  } else assert.ok(!manifest.renderEvidence,'Pending build cannot claim actual ready evidence');
  const entries=[];
  for(const approved of manifest.records) {
    const spec=e33gNextPages[approved.pageKey];assert.ok(spec);assert.equal(approved.contentId,spec.contentId);
    const record=registry.records.find(r=>r.contentId===spec.contentId);assert.ok(record);assert.equal(record.candidate.revision,approved.sourceRevision);
    assert.equal(record.candidate.ru.status,'owner_approved_semantics');assert.equal(record.candidate.route,spec.route);assert.equal(approved.canonicalPath,spec.route);
    assert.equal(approved.serviceId,record.serviceId);assert.deepEqual(approved.pricingRef,record.pricingRef);
    assert.equal(approved.publication.indexable,ready);assert.equal(approved.publication.lastModified,'2026-10-09');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    const sourcePage=sourceManifest.pages.find(p=>p.pageKey===approved.pageKey);assert.ok(sourcePage);assert.equal(sourcePage.contentId,spec.suppliedContentId);assert.equal(approved.approvedSourceRevision,'sha256:'+sourcePage.sourceSHA256);
    for(const locale of PUBLIC_LOCALES) {
      const pin=approved.locales[locale],language=registry.locales.find(l=>l.code===locale),payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];assert.ok(payload);
      assert.equal(pin.route,record.published?.routes[locale]??language.prefix+spec.route);assert.equal(pin.direction,language.dir);
      for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(pin[key],payload[key]);
      if(locale!=='ru')assert.ok(payload.complete&&payload.qa==='passed'&&payload.sourceRevision===approved.sourceRevision);
      const body=Buffer.from(readContent(pin.bodyFile)),metaBytes=readContent(pin.metadataFile),wire=readContent(pin.sourceFile),original=Buffer.from(readContent(pin.sourceMarkdownFile));
      assert.equal(sha(body),pin.bodySha256);assert.equal(sha(metaBytes),pin.metadataSha256);assert.equal(sha(wire),pin.sourceFileSha256);assert.equal(sha(original),pin.sourceMarkdownSha256);
      const meta=JSON.parse(metaBytes),sourceRow=supplied.find(r=>r.contentId===spec.suppliedContentId&&r.locale===locale);assert.ok(sourceRow);
      assert.deepEqual(JSON.parse(wire),sourceRow,'Exact logical JSON source record');for(const key of Object.keys(sourceRow))assert.deepEqual(meta[key],sourceRow[key],'Supplied JSON field lost: '+key);
      assert.equal(publicE33GNextBody(original.toString()),body.toString(),'Only supplied editorial preamble excluded');
      assert.equal(meta.bodyMarkdown,body.toString());assert.equal(meta.bodySha256,pin.bodySha256);assert.equal(meta.bodyRevision,'sha256:'+pin.bodySha256);
      assert.equal(meta.sourceRevision,approved.sourceRevision);assert.equal(meta.approvedSourceRevision,approved.approvedSourceRevision);assert.equal(meta.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
      assert.equal(meta.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);assert.equal(meta.fullPayloadKind,E33G_NEXT_KIND);assert.equal(meta.resolvedContentId,spec.contentId);assert.equal(meta.resolvedCanonicalPath,spec.route);
      assert.equal(meta.locale,locale);assert.equal(meta.direction,language.dir);assert.equal(meta.h1,sourceRow.title);assert.deepEqual(meta.seo,{title:sourceRow.seoTitle,description:sourceRow.metaDescription});
      assert.equal(meta.sourceFile,pin.sourceFile);assert.equal(meta.sourceFileSha256,pin.sourceFileSha256);assert.equal(meta.sourceMarkdownFile,pin.sourceMarkdownFile);assert.equal(meta.sourceMarkdownSha256,pin.sourceMarkdownSha256);
      const sourcePin=locale==='ru'?report.pages[approved.pageKey].ru:report.pages[approved.pageKey].translations[sourceManifest.locale_route_prefix[locale]];
      assert.equal(pin.sourceMarkdownSha256,sourcePin.sha256);assert.equal(meta.originalBundleFile,sourcePin.path);
      assert.equal(meta.bodyIncludesFaq,true);assert.equal(meta.doNotRenderSeparateFaqAgain,true);
      const structure=readE33GNextStructure(meta.bodyMarkdown,spec);for(const key of Object.keys(structure))assert.deepEqual(meta[key],structure[key],'Complete body structure: '+key);
      assert.equal(meta.faq.length,report.pages[approved.pageKey].ru.metrics.faq_count);assert.deepEqual(meta.factBlock,{heading:'',items:[]});assert.equal(meta.factBlockMarkdown,'');
      assert.equal(meta.approval.status,locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA');
      assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);
      assert.equal(meta.payloadRevision,pin.payloadRevision);assert.equal(meta.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta})));
      if(locale==='ru')assert.equal(metadataEnvelope(body,meta),pin.sourceEnvelopeSha256);
      rebuilt.push(...e33gNextPriceOccurrences(meta));
      entries.push({contentId:record.contentId,locale,dir:language.dir,route:pin.route,canonicalPath:spec.route,sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
        sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:record.serviceId,pricingRef:record.pricingRef,indexable:ready,lastModified:approved.publication.lastModified,title:meta.h1,seoTitle:meta.seo.title,description:meta.seo.description});
    }
  }
  assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.route)).size,40);assert.deepEqual(occurrences.occurrences,rebuilt,'Exact commercial pins match supplied full JSON');
  return entries;
}
