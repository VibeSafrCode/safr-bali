import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {preReadyEditorialRegistry,publicPreimportHistory,validatePublicPreimportHistory} from './fixtures/pre-ready-editorial-registry.mjs';
import {preWorkingRegistry} from './fixtures/pre-working-registry.mjs';
import {preDocumentsRegistry} from './fixtures/pre-documents-registry.mjs';
import {restorePreWorkingRegistry} from '../scripts/import-working-bundle.mjs';
import {restorePreDocumentsRegistry} from '../scripts/import-documents-bundle.mjs';

const registry=JSON.parse(readFileSync(new URL('../content/service-registry.v1.json',import.meta.url)));
const raw=readFileSync(new URL('./fixtures/public-preimport-history.v1.json',import.meta.url));
const sha=value=>createHash('sha256').update(Buffer.from(JSON.stringify(value,null,2)+'\n')).digest('hex');

test('public history reconstructs exact159/157/154 stages without modifying current162',()=>{
  const original=JSON.stringify(registry);
  for(const [stage,restore,count] of [['ready',preReadyEditorialRegistry,159],['working',preWorkingRegistry,157],['documents',preDocumentsRegistry,154]]){
    const restored=restore(registry),history=publicPreimportHistory(stage);
    assert.equal(restored.records.length,count);
    assert.equal(sha(restored),history.sourceRegistrySha256);
  }
  assert.equal(JSON.stringify(registry),original);
});

test('public fixture provenance and bytes are pinned; changed history is never accepted',()=>{
  const value=validatePublicPreimportHistory(raw);
  assert.equal(value.provenance.path,'06 Development/shared/content/service-registry.v1.json');
  assert.equal(Object.values(value.stages).reduce((n,s)=>n+s.records.length,0),10);
  for(const mutate of [v=>v.schemaVersion=2,v=>v.provenance.gitCommit='0'.repeat(40),v=>v.stages.ready.records[0].title='drift']){
    const copy=structuredClone(value);mutate(copy);
    assert.throws(()=>validatePublicPreimportHistory(Buffer.from(JSON.stringify(copy,null,2)+'\n')),/history bytes drift/);
  }
  assert.throws(()=>validatePublicPreimportHistory(Buffer.from('{broken')),/history bytes drift/);
  assert.throws(()=>publicPreimportHistory('unknown'),/Unknown public test history stage/);
  const copy=publicPreimportHistory('ready');copy.records[0].title='not shared mutable state';
  assert.notEqual(publicPreimportHistory('ready').records[0].title,copy.records[0].title);
});

test('historical restoration rejects partial additions and unrelated or candidate drift',()=>{
  const knowledge='knowledge_student_documents';
  for(const mutate of [
    r=>r.records.splice(r.records.findIndex(x=>x.contentId===knowledge),1),
    r=>r.records.find(x=>x.contentId===knowledge).published={routes:{ru:'/invented/'}},
    r=>r.records.find(x=>x.contentId===knowledge).serviceId='invented',
    r=>r.records.find(x=>x.contentId===knowledge).pricingRef={entityKey:'invented'},
    r=>r.records.find(x=>x.contentId===knowledge).candidate.route='/invented/',
    r=>r.records.find(x=>x.contentId===knowledge).candidate.revision='drift',
    r=>r.records.find(x=>x.contentId===knowledge).candidate.ru.bodySha256='0'.repeat(64),
    r=>r.records.find(x=>x.contentId==='voa').title='unrelated drift',
  ]){const copy=structuredClone(registry);mutate(copy);assert.throws(()=>preReadyEditorialRegistry(copy));}
});

test('product Working and Documents restorers retain original history hash/count guards',()=>{
  const beforeWorking=preReadyEditorialRegistry(registry),beforeDocuments=preWorkingRegistry(registry);
  for(const [stage,input,restore] of [['working',beforeWorking,restorePreWorkingRegistry],['documents',beforeDocuments,restorePreDocumentsRegistry]]){
    for(const mutate of [h=>h.sourceRegistryRecordCount++,h=>h.sourceRegistrySha256='0'.repeat(64),h=>h.removeAddedContentIds=[],h=>h.records[0].title='drift']){
      const history=publicPreimportHistory(stage);mutate(history);assert.throws(()=>restore(input,history));
    }
  }
});
