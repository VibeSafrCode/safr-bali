import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const sha=(source:string|Uint8Array)=>createHash('sha256').update(source).digest('hex');
const raw=fs.readFileSync(new URL('./client-source-history.json',import.meta.url));
assert.equal(sha(raw),'5c161a57cb8c4737a6055859f74ee472a0db8aa1bb3941591abe0b7d11e8786a');
type Row=Readonly<{id:string;file:string;historicalSha256:string;acceptedSha256:string;
  hunks:readonly Readonly<{accepted:string;historical:string}>[]}>;
const data=JSON.parse(raw.toString('utf8')) as {schemaVersion:number;acceptedParentTuple:string;rows:Row[]};
assert.equal(data.schemaVersion,1);
assert.equal(data.acceptedParentTuple,'8a03ed4a33a68beef01dec6769f14da8db3f9a9c1c631054447e50b64b5e136b');
assert.equal(data.rows.length,18);
export const sourceHistoryRows:readonly Row[]=Object.freeze(data.rows.map(row=>Object.freeze({
  ...row,hunks:Object.freeze(row.hunks.map(hunk=>Object.freeze({...hunk}))),
})));
assert.equal(new Set(sourceHistoryRows.map(row=>row.id)).size,18);

// Portable test-only explicit reversals: fixed independent historical donors
// and the independently accepted immutable parent, never arbitrary active bytes.
// This asserts source provenance, not behavioral/auth/session/rendered QA.
export function restoreAcceptedSourceHistory(id:string,source:string):string{
  const row=sourceHistoryRows.find(row=>row.id===id);assert.ok(row,'Known source-history identity');
  assert.equal(typeof source,'string');
  assert.equal(sha(source),row.acceptedSha256,'Exact accepted parent source before reversal');
  for(const hunk of [...row.hunks].reverse()){
    assert.ok(hunk.accepted.length>0);
    assert.equal(source.split(hunk.accepted).length,2,'Exact unique accepted source span');
    source=source.replace(hunk.accepted,hunk.historical);
  }
  assert.equal(sha(source),row.historicalSha256,'Entire independently fixed historical source');
  return source;
}
