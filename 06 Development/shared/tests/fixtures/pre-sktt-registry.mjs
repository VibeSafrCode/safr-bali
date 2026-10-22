import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Test-only exact undo of the accepted SKTT8 rebase over public HEAD9759.
// No historical expected hash is repinned and no other Registry drift is hidden.
const sha=value=>createHash('sha256').update(value).digest('hex');
const oldSha='ef2363b04cb2aa7e8d2b4db2a165c2a8772abf0e4e868eb55e07baa02578adb5';
const newSha='6d1863592dc107dfbc20893abe0ce5b9ddc6c29db1cde9c58e9e6efdde7a03be';
// Exact mixed10 stage: reverse only the separately reviewed local HI/AR append.
// Keep both historical native8 and pre-SKTT hashes unchanged.
const mixedSha='26c9aac5c2678987b6820e8da8c80ea9c5c8bc9d8fe195371a2ddc6db8eaadda';
const preSkttRegistrySha='60c2af4d4c643947858b19939d58bfafe6c79423cc33658613f39d9723e36f1d';
const oldRecord={
  contentId:'sktt',kind:'document',title:'Сопровождение оформления SKTT',parentId:'documents',relatedContentIds:[],
  serviceId:null,pricingRef:null,bindingStatus:'unresolved',availability:'not_verified',bindingEvidence:[],published:null,
  candidate:{route:'/bali/documents/sktt/',exposure:'preview_only',revision:'SYNC-2:sktt:draft1',
    ru:{status:'missing',bodyFile:null,bodySha256:null,approvalEvidence:null,approvalRevision:null},translations:{}},
  reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[],
};
assert.equal(sha(JSON.stringify(oldRecord)),oldSha,'Pre-SKTT source record drift');
export function preSkttRegistry(current){
  const next=structuredClone(current),matches=next.records.filter(row=>row.contentId==='sktt');
  assert.equal(matches.length,1,'Exact existing SKTT identity required');
  let hash=sha(JSON.stringify(matches[0]));
  if(hash===oldSha)return next; // Existing older frozen histories remain valid.
  if(hash===mixedSha){
    delete matches[0].candidate.translations.hi;
    delete matches[0].candidate.translations.ar;
    hash=sha(JSON.stringify(matches[0]));
  }
  assert.equal(hash,newSha,'Unknown SKTT delta cannot be reversed');
  next.records[next.records.findIndex(row=>row.contentId==='sktt')]=structuredClone(oldRecord);
  assert.equal(sha(JSON.stringify(next,null,2)+'\n'),preSkttRegistrySha,'Other Registry drift before SKTT history reversal');
  return next;
}
