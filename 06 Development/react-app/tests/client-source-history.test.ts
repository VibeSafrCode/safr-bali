import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {restoreAcceptedSourceHistory,sourceHistoryRows} from './fixtures/client-source-history';

for(const row of sourceHistoryRows){
  const current=fs.readFileSync(new URL('../'+row.file,import.meta.url),'utf8');
  test('accepted history restores fixed whole donor: '+row.id,()=>{
    assert.equal(createHash('sha256').update(restoreAcceptedSourceHistory(row.id,current)).digest('hex'),row.historicalSha256);
  });
  test('accepted history rejects exterior drift: '+row.id,()=>{
    assert.throws(()=>restoreAcceptedSourceHistory(row.id,current+'\n'));
  });
  test('accepted history rejects missing accepted span: '+row.id,()=>{
    assert.ok(current.includes(row.hunks[0].accepted));
    assert.throws(()=>restoreAcceptedSourceHistory(row.id,current.replace(row.hunks[0].accepted,'')));
  });
  test('accepted history rejects duplicate accepted span: '+row.id,()=>{
    assert.throws(()=>restoreAcceptedSourceHistory(row.id,current+row.hunks[0].accepted));
  });
}
