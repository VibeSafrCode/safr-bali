import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {sourceHistoryRows,restoreAcceptedSourceHistory} from './fixtures/client-source-history';
import {restoreChildTestBeforeYogaImports} from './fixtures/client-child-test-history';
import {
 reviewedCurrentHistoryQualifications,normalizeReviewedCurrentHistorySource,
 restoreCurrentAcceptedSourceHistory,restoreCurrentChildTestBeforeYogaImports,
} from './fixtures/client-current-history-qualification';

const sha=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
const read=(file:string)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('original18-row donor history and both original helpers remain independently fixed',()=>{
 for(const [file,pin]of [
  ['tests/fixtures/client-source-history.ts','8d88ea40faadb4139334b1830ccdc1d58f475c6eb9afbabde6490aa2d48996cc'],
  ['tests/fixtures/client-source-history.json','5c161a57cb8c4737a6055859f74ee472a0db8aa1bb3941591abe0b7d11e8786a'],
  ['tests/fixtures/client-child-test-history.ts','2210c071ecc1ea7fe238f7412629db3ad8e87ada002ec0cc35ff17ef25a2a770'],
 ])assert.equal(sha(read(file)),pin,file);
 assert.equal(sourceHistoryRows.length,18);
});

for(const rule of reviewedCurrentHistoryQualifications){
 const source=read(rule.file);
 test(rule.id+': only exact literal reversal reaches the full earlier accepted source',()=>{
  assert.equal(sha(source),rule.currentSha256);
  assert.equal(sha(normalizeReviewedCurrentHistorySource(rule.id,source)),rule.acceptedSha256);
  assert.notEqual(rule.currentSha256,rule.acceptedSha256);
 });
 test(rule.id+': earlier accepted endpoint cannot masquerade as current reviewed source',()=>{
  const normalized=normalizeReviewedCurrentHistorySource(rule.id,source);
  assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,normalized));
 });
 for(const [i,hunk]of rule.hunks.entries()){
  test(rule.id+': missing reviewed literal '+i+' is refused',()=>{
   assert.equal(source.split(hunk.current).length,2);
   assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,source.replace(hunk.current,'')));
  });
  test(rule.id+': duplicated reviewed literal '+i+' is refused',()=>{
   assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,source.replace(hunk.current,hunk.current+hunk.current)));
  });
  test(rule.id+': altered reviewed literal '+i+' is refused',()=>{
   assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,source.replace(hunk.current,'!'+hunk.current.slice(1))));
  });
 }
 test(rule.id+': exterior byte drift and wrong rule/source pairing are refused',()=>{
  assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,source+'\n'));
  assert.throws(()=>normalizeReviewedCurrentHistorySource(rule.id,source.slice(1)));
  const other=reviewedCurrentHistoryQualifications.find(row=>row.id!==rule.id)!;
  assert.throws(()=>normalizeReviewedCurrentHistorySource(other.id,source));
 });
 for(const id of rule.historyIds)test(rule.id+': unchanged original donor chain remains exact for '+id,()=>{
  const row=sourceHistoryRows.find(item=>item.id===id)!;
  assert.equal(row.file,rule.file);assert.equal(row.acceptedSha256,rule.acceptedSha256);
  assert.throws(()=>restoreAcceptedSourceHistory(id,source),'Original helper must not accept later current bytes');
  const normalized=normalizeReviewedCurrentHistorySource(rule.id,source);
  assert.equal(sha(restoreAcceptedSourceHistory(id,normalized)),row.historicalSha256);
  assert.equal(sha(restoreCurrentAcceptedSourceHistory(id,source)),row.historicalSha256);
 });
}

test('qualified child focus assertion still goes through all four unchanged loader reversals',()=>{
 const source=read('tests/client-account-children-ten-locale.test.tsx');
 assert.throws(()=>restoreChildTestBeforeYogaImports(source));
 assert.equal(sha(restoreCurrentChildTestBeforeYogaImports(source)),'d16310c10824bb17bbff9393a232e739451b3eba6d0cbd9043711da0214e205e');
 for(const changed of [
  source.replace('data-support-trigger="true"','data-support-trigger="false"'),
  source.replace('return yogaRuntime;','return {};'),
  source.replace('All3430 child baseline values reconstructed exactly','altered baseline assertion'),
 ]){assert.notEqual(changed,source);assert.throws(()=>restoreCurrentChildTestBeforeYogaImports(changed));}
});

test('unrelated original identities still use their exact unchanged donor checks',()=>{
 const qualifiedIds=new Set(reviewedCurrentHistoryQualifications.flatMap(row=>row.historyIds));
 for(const row of sourceHistoryRows.filter(item=>!qualifiedIds.has(item.id))){
  const current=read(row.file);
  assert.equal(sha(restoreCurrentAcceptedSourceHistory(row.id,current)),row.historicalSha256);
  assert.throws(()=>restoreCurrentAcceptedSourceHistory(row.id,current+'\n'));
 }
});

test('adjacent protected existing API fields and CSS cannot be erased by qualification',()=>{
 const types=read('src/api/types.ts');
 for(const token of ['client_ui_preference','referral_payload']){
  assert.ok(types.includes(token));assert.throws(()=>normalizeReviewedCurrentHistorySource('reviewed-visa-stay-types',types.replace(token,token+'_altered')));
 }
 const css=read('src/styles.css');assert.ok(css.includes('.visa-mutation-status'));
 assert.throws(()=>normalizeReviewedCurrentHistorySource('reviewed-visa-stay-css',css.replace('.visa-mutation-status','.visa-mutation-status-altered')));
});

test('unknown identities and non-string inputs are refused without coercion',()=>{
 let coerced=0;
 const values=[undefined,null,0,{},[],new String('source'),new Uint8Array(),{toString(){coerced++;return 'source';}}];
 for(const value of values){
  assert.throws(()=>normalizeReviewedCurrentHistorySource('reviewed-mini-section-fallback',value as never));
  assert.throws(()=>restoreCurrentAcceptedSourceHistory('legacyMini',value as never));
  assert.throws(()=>restoreCurrentChildTestBeforeYogaImports(value as never));
  assert.throws(()=>normalizeReviewedCurrentHistorySource(value as never,'source'));
 }
 assert.throws(()=>normalizeReviewedCurrentHistorySource('not-reviewed','source'));
 assert.throws(()=>restoreCurrentAcceptedSourceHistory('not-historical','source'));
 assert.equal(coerced,0);
});

test('finite qualification specifications are deeply frozen, not mutable donor input',()=>{
 assert.ok(Object.isFrozen(reviewedCurrentHistoryQualifications));
 for(const row of reviewedCurrentHistoryQualifications){
  assert.ok(Object.isFrozen(row));assert.ok(Object.isFrozen(row.historyIds));assert.ok(Object.isFrozen(row.hunks));
  for(const hunk of row.hunks){assert.ok(Object.isFrozen(hunk));assert.throws(()=>{(hunk as any).current='changed';});}
 }
});
