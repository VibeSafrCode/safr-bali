import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import build from '../../content/registry-ready-editorial-build.v1.json' with {type:'json'};
import {preBankRegistry} from './pre-bank-registry.mjs';

// Test-only history extracted from an already-public Registry154 Git blob.
// It is not a copy of, or evidence for reading, the private preimport files.
const historySha='6b7ac07447c031d41e3ed5a25c7b7ce3760251560991c8ffc7ca20380a002206';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validatePublicPreimportHistory(bytes){
  assert.equal(sha(bytes),historySha,'Public test history bytes drift');
  const value=JSON.parse(bytes);
  assert.equal(value.schemaVersion,1);
  assert.equal(value.provenance.kind,'PUBLIC_REGISTRY_DERIVED_TEST_HISTORY');
  assert.equal(value.provenance.gitCommit,'67e293919781923b9606eedc925b07be977bc513');
  assert.equal(value.provenance.sourceRecordCount,154);
  assert.deepEqual(Object.keys(value.stages),['ready','working','documents']);
  return value;
}
const publicHistory=validatePublicPreimportHistory(readFileSync(new URL('./public-preimport-history.v1.json',import.meta.url)));
export function publicPreimportHistory(stage){
  assert.ok(Object.hasOwn(publicHistory.stages,stage),'Unknown public test history stage');
  return structuredClone(publicHistory.stages[stage]);
}
const history=publicPreimportHistory('ready');
// Test-only migration ordering; do not relax product import source pins.
export function preReadyEditorialRegistry(current){
  current=preBankRegistry(current);
  assert.equal(history.schemaVersion,1);assert.equal(history.sourceRecordCount,159);
  const present=history.addedContentIds.filter(id=>current.records.some(r=>r.contentId===id));
  assert.ok(present.length===0||present.length===history.addedContentIds.length,'Partial ready editorial history');
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
  if(present.length){
    assert.equal(restored.records.length,history.sourceRecordCount);
    assert.equal(sha(Buffer.from(JSON.stringify(restored,null,2)+'\n')),history.sourceRegistrySha256,'Exact pre-ready Registry restoration drift');
  }
  return restored;
}
