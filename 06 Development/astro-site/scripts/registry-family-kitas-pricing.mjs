// Only the explicitly excluded principal E33G comparison is catalog-bound.
// Family stays individual quote-only, even if an unrelated numeric catalog
// item appears in a future projection. No fixed-price family operation exists.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import build from '../../shared/content/registry-family-kitas-build.v1.json' with {type:'json'};
import occurrences from '../../shared/content/registry-copy/family_kitas_price_occurrences.json' with {type:'json'};
import {familyPriceOccurrences} from '../../shared/scripts/import-family-kitas-bundle.mjs';
export function bindFamilyPayload(metadata,{contentId,locale}) {
  assert.equal(metadata.fullPayloadKind,'FAMILY_KITAS_FULL_JSON_V1');assert.equal(metadata.resolvedContentId,contentId);assert.equal(metadata.locale,locale);
  assert.equal(metadata.quotePolicy.familyFixedPriceApproved,false);assert.equal(metadata.quotePolicy.familyRate,'INDIVIDUAL_PER_APPLICANT');
  const approved=build.records.find(row=>row.contentId===contentId),pin=approved?.locales[locale];assert.ok(pin,'Unknown Family payload');
  assert.equal(metadata.sourceRevision,approved.sourceRevision,'Family source revision drift');
  assert.equal(createHash('sha256').update(metadata.bodyMarkdown).digest('hex'),pin.bodySha256,'Family body drift');
  assert.equal(metadata.bodySha256,pin.bodySha256,'Family body pin drift');
  const selected=occurrences.occurrences.filter(row=>row.contentId===contentId&&row.locale===locale);
  assert.deepEqual(selected,familyPriceOccurrences(metadata),'Family principal reference/source drift');
  const bound=structuredClone(metadata);
  for(const pin of [...selected].sort((a,b)=>b.fieldSpan.utf16Start-a.fieldSpan.utf16Start)) {
    assert.deepEqual(pin.operationIds,['e33g_standard','e33g_express']);assert.equal(pin.meaning,'PRINCIPAL_E33G_REFERENCE_NOT_DEPENDENT_PRICE');
    const value=pin.operationIds.map(operation=>'{{CATALOG_PRICE:'+operation+'}}').join(' / '),span=pin.fieldSpan;
    bound.bodyMarkdown=bound.bodyMarkdown.slice(0,span.utf16Start)+value+bound.bodyMarkdown.slice(span.utf16End);
  }
  return bound;
}
