import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(new URL('./public-pre-vietnam-history.v1.json',import.meta.url));
assert.equal(sha(raw),'dc669d5d3a8bdf361f2504a824bbf7a90734e2f10ae5e85e4588791994895758');
const history=JSON.parse(raw);
assert.equal(history.kind,'PUBLIC_PRE_VIETNAM_TEST_HISTORY');
assert.equal(history.sourceCommit,'f964d641563ef2c0b096f99ae5aa72c94d11104f');
assert.equal(sha(JSON.stringify(history.record)),history.oldVietnamRecordSha256);
// Only the exact new record can be reversed; no historical baseline is repinned.
export function preVietnamRegistry(current){
  const next=structuredClone(current),matches=next.records.filter(r=>r.contentId==='vietnam');
  assert.equal(matches.length,1);const hash=sha(JSON.stringify(matches[0]));
  if(hash===history.oldVietnamRecordSha256)return next;
  assert.equal(hash,history.newVietnamRecordSha256,'Unknown Vietnam delta cannot be reversed');
  next.records[next.records.findIndex(r=>r.contentId==='vietnam')]=structuredClone(history.record);
  assert.equal(sha(JSON.stringify(next,null,2)+'\n'),history.preVietnamRegistrySha256,'Other Registry drift before Vietnam history reversal');
  return next;
}
