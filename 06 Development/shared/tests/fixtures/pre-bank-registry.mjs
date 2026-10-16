import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {preVietnamRegistry} from './pre-vietnam-registry.mjs';

// Exact test-only undo of the one bank record; no historical gate is repinned.
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(new URL('./public-pre-bank-history.v1.json',import.meta.url));
assert.equal(sha(raw),'a2b4dcfa409db3c296484c284a1d1f95898668489b3aae68a4c8d54857acb840');
const history=JSON.parse(raw);
assert.equal(history.kind,'PUBLIC_PRE_BANK_TEST_HISTORY');
assert.equal(history.sourceCommit,'f964d641563ef2c0b096f99ae5aa72c94d11104f');
assert.equal(sha(JSON.stringify(history.record)),history.oldBankRecordSha256);
export function preBankRegistry(current){
  current=preVietnamRegistry(current);
  const next=structuredClone(current),matches=next.records.filter(r=>r.contentId==='bank');
  assert.equal(matches.length,1,'Exact existing bank identity required');
  const hash=sha(JSON.stringify(matches[0]));
  // Already-reversed older history is allowed, but never an unknown bank delta.
  if(hash===history.oldBankRecordSha256)return next;
  assert.equal(hash,history.newBankRecordSha256,'Unknown bank delta cannot be reversed');
  next.records[next.records.findIndex(r=>r.contentId==='bank')]=structuredClone(history.record);
  assert.equal(sha(JSON.stringify(next,null,2)+'\n'),history.preBankRegistrySha256,'Other Registry drift before bank history reversal');
  return next;
}
