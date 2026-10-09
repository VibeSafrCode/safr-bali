// Exact source-backed local publication overlay; never partner authorization,
// public Referral terms, browser/native/legal certification or deployment.
import assert from 'node:assert/strict';
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {canonicalJson,metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {PARTNERS_BATCH,PARTNERS_KIND,PARTNERS_GATES,PARTNERS_PACK,partnersEvidenceHashes,
  publicPartnersBody,readPartnersStructure,partnersSha as sha} from '../../shared/scripts/import-partners-bundle.mjs';
export const PARTNERS_GATE_KEYS=Object.freeze([...PARTNERS_GATES]);
export function validatePartnersBuild(manifest,registry,{readContent}) {
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.version,PARTNERS_BATCH);assert.equal(manifest.fullPayloadKind,PARTNERS_KIND);
  assert.equal(manifest.authority.publisher,'Founder');assert.equal(manifest.authority.decisionDate,'2026-10-09');
  assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].contentId,'partners');assert.equal(manifest.records[0].pageKey,'partners_b2b');
  assert.deepEqual(Object.keys(manifest.publicationGates).sort(),[...PARTNERS_GATES].sort());for(const value of Object.values(manifest.publicationGates))assert.equal(typeof value,'boolean');
  const ready=PARTNERS_GATES.every(g=>manifest.publicationGates[g]);assert.equal(manifest.stage,ready?'LOCAL_READY_NO_DEPLOY':'IMPORTED_PENDING_RENDER_QA');
  assert.deepEqual(manifest.sourceJsonPack,{file:PARTNERS_PACK+'CONTENT_IMPORT_STAGING.json',sha256:partnersEvidenceHashes['CONTENT_IMPORT_STAGING.json']});
  assert.deepEqual(manifest.sourceChecksumManifest,{file:PARTNERS_PACK+'SHA256SUMS.txt',sha256:partnersEvidenceHashes['SHA256SUMS.txt']});
  for(const [file,pin] of Object.entries(partnersEvidenceHashes))assert.equal(sha(readContent(PARTNERS_PACK+file)),pin,'Supplied evidence drift: '+file);
  const supplied=JSON.parse(readContent(manifest.sourceJsonPack.file)),sourceManifest=JSON.parse(readContent(PARTNERS_PACK+'MANIFEST.json'));
  assert.equal(supplied.records.length,10);assert.equal(sourceManifest.recordCount,10);assert.equal(supplied.referralSeparate.stage,'preview_only_not_indexable');assert.equal(sourceManifest.referralStatus,'preview_only_not_indexable');
  const checksums=Object.fromEntries(readContent(manifest.sourceChecksumManifest.file).toString().trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m);return [m[2],m[1]];}));assert.equal(Object.keys(checksums).length,23);
  if(ready){assert.equal(manifest.renderEvidence.file,'registry-copy/partners_b2b_render_qa.json');const bytes=readContent(manifest.renderEvidence.file);assert.equal(sha(bytes),manifest.renderEvidence.sha256);
    const evidence=JSON.parse(bytes);assert.equal(evidence.status,'PASS');assert.equal(evidence.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);assert.deepEqual([...evidence.passedGates].sort(),[...PARTNERS_GATES].sort());
    assert.equal(evidence.realSubmissions,false);assert.equal(evidence.personalProfileUsed,false);assert.equal(evidence.autoplay,false);
  }else assert.ok(!manifest.renderEvidence,'Pending build cannot claim actual ready evidence');
  const approved=manifest.records[0],record=registry.records.find(r=>r.contentId==='partners'),ruRow=supplied.records.find(r=>r.locale==='ru');assert.ok(record);
  assert.equal(record.kind,'trust');assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.published,null);
  assert.equal(approved.serviceId,null);assert.equal(approved.pricingRef,null);assert.equal(approved.canonicalPath,'/partners/');assert.equal(record.candidate.route,'/partners/');
  assert.equal(approved.sourceRevision,'sha256:'+sha(ruRow.bodyMarkdown));assert.equal(approved.sourceRevision,record.candidate.revision);assert.equal(record.candidate.ru.status,'owner_approved_semantics');
  assert.equal(approved.approvedSourceRevision,'sha256:'+ruRow.contentSha256);assert.equal(approved.publication.indexable,ready);assert.equal(approved.publication.lastModified,'2026-10-09');
  assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());const entries=[];
  for(const locale of PUBLIC_LOCALES) {
    const pin=approved.locales[locale],language=registry.locales.find(l=>l.code===locale),payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale],row=supplied.records.find(r=>r.locale===locale);assert.ok(payload&&row);
    assert.equal(pin.route,language.prefix+'/partners/');assert.equal(pin.direction,language.dir);for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(pin[key],payload[key]);
    if(locale!=='ru')assert.ok(payload.complete&&payload.qa==='passed'&&payload.sourceRevision===approved.sourceRevision);
    const body=Buffer.from(readContent(pin.bodyFile)),metaBytes=readContent(pin.metadataFile),wire=readContent(pin.sourceFile),original=Buffer.from(readContent(pin.sourceMarkdownFile));
    assert.equal(sha(body),pin.bodySha256);assert.equal(sha(metaBytes),pin.metadataSha256);assert.equal(sha(wire),pin.sourceFileSha256);assert.equal(sha(original),pin.sourceMarkdownSha256);
    const meta=JSON.parse(metaBytes);assert.deepEqual(JSON.parse(wire),row,'Exact logical supplied JSON record');assert.deepEqual(meta.sourceRecord,row,'All supplied fields preserved, including editorial human revision/CTA object');
    assert.equal(body.toString(),row.bodyMarkdown);assert.equal(publicPartnersBody(original.toString(),row),body.toString(),'Only supplied internal metadata/CTA instruction fields excluded');
    assert.equal(checksums[row.contentFile],row.contentSha256);assert.equal(pin.sourceMarkdownSha256,row.contentSha256);assert.equal(meta.bodyMarkdown,row.bodyMarkdown);assert.equal(meta.fullPayloadKind,PARTNERS_KIND);
    assert.equal(meta.sourceRevision,approved.sourceRevision);assert.equal(meta.editorialSourceRevision,row.sourceRevision);assert.equal(meta.approvedSourceRevision,approved.approvedSourceRevision);
    assert.equal(meta.bodySha256,pin.bodySha256);assert.equal(meta.bodyRevision,'sha256:'+pin.bodySha256);assert.equal(meta.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);assert.equal(meta.sourceJsonPackSha256,manifest.sourceJsonPack.sha256);
    assert.equal(meta.locale,locale);assert.equal(meta.direction,language.dir);assert.equal(meta.resolvedContentId,'partners');assert.equal(meta.resolvedCanonicalPath,'/partners/');assert.equal(meta.h1,row.seo.h1);
    assert.deepEqual(meta.seo,{title:row.seo.title,description:row.seo.description});assert.equal(meta.seoTitle,row.seo.title);assert.equal(meta.metaDescription,row.seo.description);
    const structure=readPartnersStructure(row);for(const key of Object.keys(structure))assert.deepEqual(meta[key],structure[key],'Exact body/FAQ/CTA structure: '+key);
    assert.deepEqual(meta.factBlock,{heading:'',items:[]});assert.equal(meta.bodyIncludesFaq,true);assert.equal(meta.doNotRenderSeparateFaqAgain,true);
    assert.equal(meta.quotePolicy.fixedPriceApproved,false);assert.equal(meta.quotePolicy.businessServiceCreated,false);assert.equal(meta.quotePolicy.referral,'INTERNAL_PREVIEW_ONLY_NO_PUBLIC_LINK');
    assert.equal(meta.approval.status,locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA');assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);
    assert.equal(meta.payloadRevision,pin.payloadRevision);assert.equal(meta.payloadRevision,'sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta,finalCta:meta.finalCta})));
    if(locale==='ru')assert.equal(metadataEnvelope(body,meta),pin.sourceEnvelopeSha256);
    entries.push({contentId:'partners',locale,dir:language.dir,route:pin.route,canonicalPath:'/partners/',sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
      sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:null,pricingRef:null,indexable:ready,lastModified:approved.publication.lastModified,title:meta.h1,seoTitle:meta.seo.title,description:meta.seo.description});
  }
  assert.equal(new Set(entries.map(e=>e.route)).size,10);return entries;
}
