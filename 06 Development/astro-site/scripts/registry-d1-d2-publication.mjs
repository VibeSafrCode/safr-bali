// A separate, source-pinned D1/D2 build contract. No weakened legacy-14 gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {d1PageKeys} from './registry-d1-d2-pricing.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const D1_GATE_KEYS=Object.freeze(['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview']);
export function validateD1Build(manifest,registry,{readContent}) {
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.authority.publisher,'Founder');
  assert.equal(manifest.fullPayloadKind,'D1_D2_FULL_JSON_V1');
  assert.ok(['IMPORTED_PENDING_RENDER_QA','LOCAL_READY_NO_DEPLOY'].includes(manifest.stage));
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),Object.keys(d1PageKeys).sort());
  assert.equal(manifest.coveredNotDuplicated.mergeTargetId,'d1_d2');
  assert.equal(manifest.coveredNotDuplicated.automaticRedirect,false);
  assert.equal(manifest.coveredNotDuplicated.automaticDeletion,false);
  assert.equal(sha(readContent(manifest.priceOccurrences.file)),manifest.priceOccurrences.sha256);
  assert.equal(manifest.priceOccurrences.sha256,'5b3bfbeb105ef1543b7c6356e5579a2981fa557be64a6cf389e3434b77881b79');
  assert.deepEqual(Object.keys(manifest.publicationGates).sort(),[...D1_GATE_KEYS].sort());
  for(const value of Object.values(manifest.publicationGates))assert.equal(typeof value,'boolean');
  const ready=D1_GATE_KEYS.every(key=>manifest.publicationGates[key]===true);
  assert.equal(manifest.stage,ready?'LOCAL_READY_NO_DEPLOY':'IMPORTED_PENDING_RENDER_QA');
  if(ready) {
    assert.equal(manifest.renderEvidence.file,'registry-copy/d1d2_render_qa.json');
    const evidenceBytes=readContent(manifest.renderEvidence.file);
    assert.equal(sha(evidenceBytes),manifest.renderEvidence.sha256);
    const evidence=JSON.parse(evidenceBytes);
    assert.equal(evidence.status,'PASS');
    assert.equal(evidence.sourceManifestSha256,manifest.sourceManifestSha256);
    assert.equal(evidence.priceOccurrencesSha256,manifest.priceOccurrences.sha256);
    assert.deepEqual(evidence.passedGates.sort(),[...D1_GATE_KEYS].sort());
    assert.equal(evidence.realSubmissions,false);assert.equal(evidence.personalProfileUsed,false);
  }
  const entries=[];
  for(const approved of manifest.records) {
    const record=registry.records.find(r=>r.contentId===approved.contentId);assert.ok(record);
    assert.equal(record.candidate.revision,approved.sourceRevision);
    assert.equal(record.candidate.ru.status,'owner_approved_semantics');
    assert.equal(approved.canonicalPath,record.candidate.route);
    assert.equal(approved.serviceId,record.serviceId);assert.deepEqual(approved.pricingRef,record.pricingRef);
    assert.equal(approved.publication.indexable,ready,'D1 publication awaits actual gates');
    assert.equal(approved.publication.lastModified,'2026-10-05');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    for(const locale of PUBLIC_LOCALES) {
      const pin=approved.locales[locale],payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
      const language=registry.locales.find(item=>item.code===locale);
      assert.equal(pin.route,record.published?.routes[locale]??language.prefix+approved.canonicalPath);
      assert.equal(pin.direction,language.dir);assert.equal(pin.bodyFile,payload.bodyFile);
      assert.equal(pin.bodySha256,payload.bodySha256);assert.equal(pin.metadataFile,payload.metadataFile);
      assert.equal(pin.metadataSha256,payload.metadataSha256);
      assert.equal(pin.sourceEnvelopeSha256,payload.sourceEnvelopeSha256);
      if(locale!=='ru')assert.ok(payload.complete&&payload.qa==='passed'&&payload.sourceRevision===approved.sourceRevision);
      const body=readContent(pin.bodyFile),metaBytes=readContent(pin.metadataFile),wire=readContent(pin.sourceFile);
      assert.equal(sha(body),pin.bodySha256);assert.equal(sha(metaBytes),pin.metadataSha256);
      assert.equal(sha(wire),pin.sourceFileSha256);
      const supplied=JSON.parse(wire),meta=JSON.parse(metaBytes);
      for(const key of Object.keys(supplied))assert.deepEqual(meta[key],supplied[key],'Full supplied D1 field drift: '+key);
      assert.equal(meta.fullPayloadKind,'D1_D2_FULL_JSON_V1');
      assert.equal(meta.bodyMarkdown,body.toString('utf8'));assert.equal(meta.bodyRevision,'sha256:'+pin.bodySha256);
      assert.equal(meta.sourceRevision,approved.sourceRevision);assert.equal(meta.locale,locale);
      assert.equal(meta.payloadRevision,pin.payloadRevision);assert.equal(meta.h1,supplied.h1);
      for(const value of [meta.h1,meta.seo.title,meta.seo.description,meta.directAnswer,meta.factBlockMarkdown])
        assert.ok(typeof value==='string'&&value.trim());
      assert.ok(Array.isArray(meta.faq)&&meta.faq.length>0&&Array.isArray(meta.cta)&&meta.cta.length>=1&&meta.cta.length<=3);
      entries.push({contentId:record.contentId,locale,dir:language.dir,route:pin.route,
        canonicalPath:approved.canonicalPath,sourceRevision:approved.sourceRevision,
        bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,sourceEnvelopeSha256:pin.sourceEnvelopeSha256,
        serviceId:record.serviceId,pricingRef:record.pricingRef,indexable:ready,lastModified:approved.publication.lastModified,
        title:meta.h1,seoTitle:meta.seo.title,description:meta.seo.description});
    }
  }
  assert.equal(entries.length,60);assert.equal(new Set(entries.map(entry=>entry.route)).size,60);
  return entries;
}
