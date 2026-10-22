import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import registry from '../content/service-registry.v1.json' with {type:'json'};
import {preSkttRegistry} from './fixtures/pre-sktt-registry.mjs';
const sha=value=>createHash('sha256').update(JSON.stringify(value,null,2)+'\n').digest('hex');

test('exact mixed-ten reversal preserves the historical full Registry and caller input',()=>{
  const before=JSON.stringify(registry),history=preSkttRegistry(registry);
  assert.equal(sha(history),'60c2af4d4c643947858b19939d58bfafe6c79423cc33658613f39d9723e36f1d');
  assert.equal(JSON.stringify(registry),before);
  assert.deepEqual(preSkttRegistry(history),history);
});
test('mixed-ten history reversal refuses either appended translation drift',()=>{
  for(const locale of ['hi','ar']){
    const changed=structuredClone(registry);
    changed.records.find(row=>row.contentId==='sktt').candidate.translations[locale].bodySha256='0'.repeat(64);
    assert.throws(()=>preSkttRegistry(changed),/Unknown SKTT delta/);
  }
});
test('exact mixed-ten reversal never hides unrelated record drift',()=>{
  const changed=structuredClone(registry);
  changed.records.find(row=>row.contentId==='bank').title+=' changed';
  assert.throws(()=>preSkttRegistry(changed),/Other Registry drift/);
});
