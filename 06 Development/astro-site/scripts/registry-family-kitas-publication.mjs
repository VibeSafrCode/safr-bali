// Full-source publication validation. Publisher approval is not browser,
// native/legal certification, deployment or proof of search indexing.
import assert from 'node:assert/strict';
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {canonicalJson,metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {FAMILY_BATCH,FAMILY_KIND,FAMILY_GATES,FAMILY_PACK,FAMILY_OCCURRENCES,familyPages,familyEvidenceHashes,
  publicFamilyBody,readFamilyStructure,familyPriceOccurrences,familyPriceOperations,familySha as sha} from '../../shared/scripts/import-family-kitas-bundle.mjs';
export const FAMILY_GATE_KEYS=Object.freeze([...FAMILY_GATES]);
export function validateFamilyBuild(manifest,registry,{readContent}) {
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.version,FAMILY_BATCH);assert.equal(manifest.fullPayloadKind,FAMILY_KIND);
  assert.equal(manifest.authority.publisher,'Founder');assert.equal(manifest.authority.decisionDate,'2026-10-09');
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),Object.values(familyPages).map(p=>p.contentId).sort());
  assert.equal(new Set(manifest.records.map(r=>r.contentId)).size,5);
  assert.deepEqual(Object.keys(manifest.publicationGates).sort(),[...FAMILY_GATES].sort());for(const value of Object.values(manifest.publicationGates))assert.equal(typeof value,'boolean');
  const ready=FAMILY_GATES.every(key=>manifest.publicationGates[key]);assert.equal(manifest.stage,ready?'LOCAL_READY_NO_DEPLOY':'IMPORTED_PENDING_RENDER_QA');
  assert.deepEqual(manifest.sourceJsonPack,{file:FAMILY_PACK+'CONTENT_LOCALIZED_IMPORT.json',sha256:familyEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']});
  assert.deepEqual(manifest.sourceChecksumManifest,{file:FAMILY_PACK+'SHA256SUMS.txt',sha256:familyEvidenceHashes['SHA256SUMS.txt']});
  for(const [file,pin] of Object.entries(familyEvidenceHashes))assert.equal(sha(readContent(FAMILY_PACK+file)),pin,'Supplied evidence drift: '+file);
  const source=JSON.parse(readContent(manifest.sourceJsonPack.file));assert.equal(source.records.length,50);assert.equal(source.bundle_id,'safrway-family-kitas-all-10-locales-2026-10-09');
  const checksumEntries=Object.fromEntries(readContent(manifest.sourceChecksumManifest.file).toString().trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m);return [m[2],m[1]];}));
  assert.equal(Object.keys(checksumEntries).length,63);
  assert.equal(manifest.priceOccurrences.file,FAMILY_OCCURRENCES);const occurrenceBytes=readContent(manifest.priceOccurrences.file);assert.equal(sha(occurrenceBytes),manifest.priceOccurrences.sha256);
  const occurrences=JSON.parse(occurrenceBytes);assert.equal(occurrences.schemaVersion,1);assert.equal(occurrences.batchId,FAMILY_BATCH);assert.equal(occurrences.kind,'FAMILY_KITAS_PRINCIPAL_ONLY_EXACT_PRICE_OCCURRENCE_MAP');
  assert.equal(occurrences.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);assert.deepEqual(occurrences.operations,familyPriceOperations);
  if(ready) {
    assert.equal(manifest.renderEvidence.file,'registry-copy/family_kitas_render_qa.json');const bytes=readContent(manifest.renderEvidence.file);assert.equal(sha(bytes),manifest.renderEvidence.sha256);
    const evidence=JSON.parse(bytes);assert.equal(evidence.status,'PASS');assert.equal(evidence.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);
    assert.equal(evidence.priceOccurrencesSha256,manifest.priceOccurrences.sha256);assert.deepEqual([...evidence.passedGates].sort(),[...FAMILY_GATES].sort());
    assert.equal(evidence.realSubmissions,false);assert.equal(evidence.personalProfileUsed,false);assert.equal(evidence.autoplay,false);
  } else assert.ok(!manifest.renderEvidence,'Pending build cannot claim actual ready evidence');
  const entries=[],rebuilt=[];
  for(const approved of manifest.records) {
    const spec=familyPages[approved.pageKey];assert.ok(spec);assert.equal(approved.contentId,spec.contentId);assert.equal(approved.canonicalPath,spec.route);
    const record=registry.records.find(r=>r.contentId===spec.contentId);assert.ok(record);assert.equal(record.candidate.route,spec.route);assert.equal(record.candidate.revision,approved.sourceRevision);
    assert.equal(record.candidate.ru.status,'owner_approved_semantics');assert.equal(record.serviceId,spec.oldRoute?'visa':null);assert.equal(approved.serviceId,record.serviceId);
    assert.equal(record.pricingRef,null);assert.equal(approved.pricingRef,null);assert.equal(approved.quoteOnly,true);
    assert.equal(approved.publication.indexable,ready);assert.equal(approved.publication.lastModified,'2026-10-09');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    const ruRow=source.records.find(r=>r.content_key_proposed===approved.pageKey&&r.locale==='ru');assert.ok(ruRow);assert.equal(approved.approvedSourceRevision,'sha256:'+ruRow.source_file_sha256);
    for(const locale of PUBLIC_LOCALES) {
      const pin=approved.locales[locale],language=registry.locales.find(l=>l.code===locale),payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];assert.ok(payload);
      assert.equal(pin.route,language.prefix+spec.route);assert.equal(pin.direction,language.dir);for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(pin[key],payload[key]);
      if(locale!=='ru')assert.ok(payload.complete&&payload.qa==='passed'&&payload.sourceRevision===approved.sourceRevision);
      const body=Buffer.from(readContent(pin.bodyFile)),metaBytes=readContent(pin.metadataFile),wire=readContent(pin.sourceFile),original=Buffer.from(readContent(pin.sourceMarkdownFile));
      assert.equal(sha(body),pin.bodySha256);assert.equal(sha(metaBytes),pin.metadataSha256);assert.equal(sha(wire),pin.sourceFileSha256);assert.equal(sha(original),pin.sourceMarkdownSha256);
      const meta=JSON.parse(metaBytes),row=source.records.find(r=>r.content_key_proposed===approved.pageKey&&r.locale===locale);assert.ok(row);
      assert.deepEqual(JSON.parse(wire),row,'Exact logical supplied JSON record');for(const key of Object.keys(row))assert.deepEqual(meta[key],row[key],'Supplied field lost: '+key);
      assert.equal(body.toString(),row.body_markdown);assert.equal(publicFamilyBody(original.toString()),body.toString(),'Only supplied editorial preamble excluded');
      assert.equal(meta.bodyMarkdown,row.body_markdown);assert.equal(meta.bodySha256,pin.bodySha256);assert.equal(meta.bodyRevision,'sha256:'+pin.bodySha256);assert.equal(row.body_sha256,pin.bodySha256);
      assert.equal(meta.sourceRevision,approved.sourceRevision);assert.equal(meta.approvedSourceRevision,approved.approvedSourceRevision);assert.equal(meta.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
      assert.equal(meta.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);assert.equal(meta.fullPayloadKind,FAMILY_KIND);assert.equal(meta.resolvedContentId,spec.contentId);assert.equal(meta.resolvedCanonicalPath,spec.route);
      assert.equal(meta.locale,locale);assert.equal(meta.direction,language.dir);assert.equal(meta.h1,row.h1);assert.deepEqual(meta.seo,{title:row.seo_title,description:row.seo_description});
      assert.equal(meta.sourceFile,pin.sourceFile);assert.equal(meta.sourceFileSha256,pin.sourceFileSha256);assert.equal(meta.sourceMarkdownFile,pin.sourceMarkdownFile);assert.equal(meta.sourceMarkdownSha256,pin.sourceMarkdownSha256);
      assert.equal(checksumEntries[row.source_file],row.source_file_sha256);assert.equal(pin.sourceMarkdownSha256,row.source_file_sha256);assert.equal(row.canonical_ru_sha256,ruRow.source_file_sha256);
      assert.equal(row.pricing_ref,'QUOTE_ONLY_NO_APPROVED_FIXED_FAMILY_RATE');assert.equal(row.pricing_display,'INDIVIDUAL_QUOTE_EACH_DEPENDENT_NO_NUMERIC_ZERO');assert.equal(meta.quotePolicy.familyFixedPriceApproved,false);
      assert.equal(meta.quotePolicy.familyRate,'INDIVIDUAL_PER_APPLICANT');assert.equal(meta.quotePolicy.knowledgeCreatesOperation,false);
      assert.equal(meta.bodyIncludesFaq,true);assert.equal(meta.doNotRenderSeparateFaqAgain,true);assert.equal(row.body_contains_metadata,false);
      const structure=readFamilyStructure(meta.bodyMarkdown,spec);for(const key of Object.keys(structure))assert.deepEqual(meta[key],structure[key],'Complete source structure: '+key);
      assert.deepEqual(meta.factBlock,{heading:'',items:[]});assert.equal(meta.factBlockMarkdown,'');
      assert.equal(meta.approval.status,locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA');assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);
      assert.equal(meta.payloadRevision,pin.payloadRevision);assert.equal(meta.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta})));
      if(locale==='ru')assert.equal(metadataEnvelope(body,meta),pin.sourceEnvelopeSha256);rebuilt.push(...familyPriceOccurrences(meta));
      entries.push({contentId:record.contentId,locale,dir:language.dir,route:pin.route,canonicalPath:spec.route,sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
        sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:record.serviceId,pricingRef:null,indexable:ready,lastModified:approved.publication.lastModified,title:meta.h1,seoTitle:meta.seo.title,description:meta.seo.description});
    }
  }
  assert.equal(entries.length,50);assert.equal(new Set(entries.map(e=>e.route)).size,50);assert.deepEqual(occurrences.occurrences,rebuilt,'Exact principal-only source pins');return entries;
}
