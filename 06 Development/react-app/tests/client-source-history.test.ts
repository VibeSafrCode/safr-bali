import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {sourceHistoryRows} from './fixtures/client-source-history';
import {restoreCurrentAcceptedSourceHistory as restoreAcceptedSourceHistory} from './fixtures/client-current-history-qualification';

for(const row of sourceHistoryRows){
  // Account's five byte-history identities use the independently pinned public
  // 6adadff baseline; this is not a replacement for current runtime QA.
  const current=fs.readFileSync(new URL(row.file==='src/surfaces/AccountApp.tsx'
    ? './fixtures/accepted-6adadff/AccountApp.tsx.txt' : row.file==='src/api/types.ts'
    ? './fixtures/accepted-6adadff/types.ts.txt' : '../'+row.file,import.meta.url),'utf8');
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
