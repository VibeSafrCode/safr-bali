import assert from 'node:assert/strict';
import history from '../../content/registry-copy/ready_editorial_preimport_registry_records.json' with {type:'json'};
import build from '../../content/registry-ready-editorial-build.v1.json' with {type:'json'};
// Test-only migration ordering; do not relax product import source pins.
export function preReadyEditorialRegistry(current){
  assert.equal(history.schemaVersion,1);assert.equal(history.sourceRecordCount,159);
  const restored=structuredClone(current);
  for(const contentId of history.addedContentIds??[]){
    const record=restored.records.find(r=>r.contentId===contentId);if(!record)continue;
    const pin=build.records.find(r=>r.contentId===contentId);assert.ok(pin);
    assert.equal(record.kind,'knowledge');assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
    assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.candidate.exposure,'preview_only');
    assert.equal(record.candidate.revision,pin.sourceRevision);assert.equal(record.candidate.route,pin.canonicalPath);
    assert.equal(record.candidate.ru.bodySha256,pin.locales.ru.bodySha256);
    restored.records=restored.records.filter(r=>r.contentId!==contentId);
  }
  for(const old of history.records){
    const index=restored.records.findIndex(r=>r.contentId===old.contentId);assert.ok(index>=0);
    const record=restored.records[index];if(JSON.stringify(record)===JSON.stringify(old))continue;
    const pin=build.records.find(r=>r.contentId===record.contentId);assert.ok(pin);
    assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
    assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.candidate.revision,pin.sourceRevision);
    assert.equal(record.candidate.ru.bodySha256,pin.locales.ru.bodySha256);
    restored.records[index]=structuredClone(old);
  }
  return restored;
}
