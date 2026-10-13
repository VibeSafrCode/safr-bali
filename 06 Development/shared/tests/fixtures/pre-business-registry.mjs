import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateCatalogRoutingPlan} from '../../src/catalog-country-routing.mjs';
import {preDocumentsRegistry} from './pre-documents-registry.mjs';

const contentRoot=new URL('../../content/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=registry=>Buffer.from(JSON.stringify(registry,null,2)+'\n');
// The bounded Business plan added one editorial Knowledge ID and replaced
// five draft payloads, never a service or a published route. Older importers
// must replay exact preceding bytes rather than accepting the new count.
export function restorePreBusinessRegistry(current) {
  // The new optional planning section did not exist in historical releases.
  // Validate it first, then remove ONLY that extension. All frozen legacy
  // bytes/hashes below remain exact; no drift in records can be hidden here.
  validateCatalogRoutingPlan(current);
  current=preDocumentsRegistry(current);
  delete current.routingPlan;
  assert.equal(current.records.length,154);
  assert.equal(sha(bytes(current)),'5ca10b34e8f5aad70eda240e2af55e02f51dfe330f2e184006f0d459a3870634',
    'Only the exact authorized replacements/addition may differ from frozen Business154');
  const source=readFileSync(new URL('registry-copy/business_preimport_registry_records.json',contentRoot));
  assert.equal(sha(source),'28c0274ca215fc3e429933a0d2b99c6de75777dd46f426d5166abbe33f7071ed','Exact pre-Business history fixture');
  const history=JSON.parse(source);
  assert.equal(history.schemaVersion,1);assert.equal(history.sourceRegistryRecordCount,153);
  assert.equal(history.sourceRegistrySha256,'a0f9616e056c607a433ff56fc1d31c44e2668ee05c07afa7c4bcd38044ebef90');
  assert.deepEqual(history.removeAddedContentIds,['knowledge_pt_pma_capital']);
  assert.deepEqual(history.records.map(record=>record.contentId),['business','pma','corporate_changes','liquidation','nib_oss']);
  const previous=structuredClone(current),replacements=new Map(history.records.map(record=>[record.contentId,record]));
  previous.records=previous.records.filter(record=>!history.removeAddedContentIds.includes(record.contentId))
    .map(record=>structuredClone(replacements.get(record.contentId)??record));
  assert.equal(previous.records.length,153);
  assert.equal(sha(bytes(previous)),history.sourceRegistrySha256,'Restore exact pre-Business153; no unrelated drift');
  return previous;
}
