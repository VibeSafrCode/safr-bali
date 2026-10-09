import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {planFamilyImport,applyFamilyPlan,familyPages,FAMILY_PACK,familySha} from '../scripts/import-family-kitas-bundle.mjs';
import {restorePreBusinessRegistry} from './fixtures/pre-business-registry.mjs';
const root=new URL('../content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const authoredCurrent=JSON.parse(read('service-registry.v1.json')),approvals=JSON.parse(read('registry-approvals.v1.json'));
assert.equal(authoredCurrent.records.length,154);
const current=restorePreBusinessRegistry(authoredCurrent);
const partnersHistory=JSON.parse(read('registry-copy/partners_b2b_preimport_registry_records.json'));
// Replay Family against its exact preceding state, restoring only the later
// explicitly authorized Business and Partners deltas; immutable pins remain.
current.records=current.records.map(r=>structuredClone(partnersHistory.records.find(p=>p.contentId===r.contentId)??r));
assert.equal(familySha(JSON.stringify(current,null,2)+'\n'),partnersHistory.sourceRegistrySha256);
const build=JSON.parse(read('registry-family-kitas-build.v1.json')),history=JSON.parse(read('registry-copy/family_kitas_preimport_registry_records.json'));
const source=JSON.parse(read(FAMILY_PACK+'CONTENT_LOCALIZED_IMPORT.json'));
const originalFiles=new Map(source.records.map(row=>{const spec=familyPages[row.content_key_proposed];return [row.source_file,build.records.find(r=>r.contentId===spec.contentId).locales[row.locale].sourceMarkdownFile];}));
const readBundle=file=>originalFiles.has(file)?read(originalFiles.get(file)):read(FAMILY_PACK+file);
const json=value=>JSON.stringify(value,null,2)+'\n';
function historical152() {
  const previous=structuredClone(current),replacements=new Map(history.records.map(r=>[r.contentId,r]));
  previous.records=previous.records.filter(r=>!history.removeAddedContentIds.includes(r.contentId)).map(r=>structuredClone(replacements.get(r.contentId)??r));
  assert.equal(previous.records.length,152);assert.equal(familySha(json(previous)),history.sourceRegistrySha256);return previous;
}
test('exact50 supplied JSON records and original Markdown survive a bounded four-draft+one-Knowledge import',()=>{
  const previous=historical152(),owned=new Set(Object.values(familyPages).map(p=>p.contentId));
  const historicalApprovals=structuredClone(approvals),partnersRevision=JSON.parse(read('registry-partners-build.v1.json')).records[0].sourceRevision;
  assert.equal(historicalApprovals.entries.filter(r=>r.contentId==='partners'&&r.revision===partnersRevision).length,1);
  historicalApprovals.entries=historicalApprovals.entries.filter(r=>!(r.contentId==='partners'&&r.revision===partnersRevision));
  const priorApprovals=structuredClone(historicalApprovals);priorApprovals.entries=priorApprovals.entries.filter(r=>!owned.has(r.contentId));
  const plan=planFamilyImport({readBundle,registry:previous,approvals:priorApprovals});
  assert.deepEqual({...plan.summary,pendingGates:undefined},{records:5,localizedPayloads:50,registryRecords:153,writes:220,newContentRecords:1,newBusinessEntities:0,familyFixedPrices:0,
    faq:270,tables:10,internalLinkOccurrences:210,principalOnlyPriceOccurrences:10,redirects:0,sourceJsonPackSha256:'6a4c90ad5c62c6ccde35b6c59ba6a43ac6021064cf7818a0ca8fea43c5b723fa',pendingGates:undefined});
  assert.deepEqual(plan.registry,current);assert.deepEqual(plan.approvals,historicalApprovals);
  for(const [file,bytes] of plan.writes)assert.equal(file==='service-registry.v1.json'?json(current):file==='registry-approvals.v1.json'?json(historicalApprovals):read(file).toString(),bytes.toString(),'Exact imported artifact: '+file);
  for(const before of previous.records)if(!owned.has(before.contentId))assert.deepEqual(current.records.find(r=>r.contentId===before.contentId),before);
  assert.ok(![...plan.writes.keys()].some(file=>file.includes('CHAT_CONTEXT')),'No private portable chat copied');
  assert.equal(current.records.find(r=>r.contentId==='family_guide').candidate.route,'/bali/knowledge/family-relocation/');
});
test('idempotent replay preserves source/approval bytes and cannot substitute a fixed family tariff or source',()=>{
  const plan=planFamilyImport({readBundle,registry:current,approvals});assert.deepEqual(plan.registry,current);assert.deepEqual(plan.approvals,approvals);
  assert.equal(plan.summary.newContentRecords,0);assert.equal(plan.writes.has('registry-copy/family_kitas_preimport_registry_records.json'),false);
  const beforeRegistry=read('service-registry.v1.json'),beforeApprovals=read('registry-approvals.v1.json');
  assert.throws(()=>applyFamilyPlan(plan,fileURLToPath(root),{expectedRegistrySha256:'0'.repeat(64),expectedApprovalsSha256:familySha(beforeApprovals)}),/Refuse unrelated\/concurrent overwrite/);
  assert.deepEqual(read('service-registry.v1.json'),beforeRegistry);assert.deepEqual(read('registry-approvals.v1.json'),beforeApprovals,'Rejected apply performs no partial writes');
  const badSource=file=>file==='CONTENT_LOCALIZED_IMPORT.json'?Buffer.from(readBundle(file).toString().replace('QUOTE_ONLY_NO_APPROVED_FIXED_FAMILY_RATE','FIXED_12000000')):readBundle(file);
  assert.throws(()=>planFamilyImport({readBundle:badSource,registry:historical152(),approvals}),/evidence drift/);
  const badRegistry=historical152();badRegistry.records.find(r=>r.contentId==='family_spouse').pricingRef={entityType:'VISA',entityKey:'E33G',optionCodes:['standard']};
  assert.throws(()=>planFamilyImport({readBundle,registry:badRegistry,approvals}),/quote-only/);
  const occupied=historical152();occupied.records.find(r=>r.contentId==='family_guide').candidate.route='/bali/knowledge/family-kitas/documents/';
  assert.throws(()=>planFamilyImport({readBundle,registry:occupied,approvals}),/Occupied candidate route/);
  const published=historical152();published.records.find(r=>r.contentId==='family_child').published={source:'legacy_catalog',routes:{ru:'/bali/visas/family-kitas/child/',en:'/en/bali/visas/family-kitas/child/'}};
  assert.throws(()=>planFamilyImport({readBundle,registry:published,approvals}),/Do not replace published content/);
});
test('all family business references stay shared/quote-only, and child/parent reconciliation never creates redirects',()=>{
  for(const [pageKey,spec] of Object.entries(familyPages)) {
    const record=current.records.find(r=>r.contentId===spec.contentId);assert.equal(record.serviceId,spec.oldRoute?'visa':null);assert.equal(record.pricingRef,null);
    assert.equal(record.published,null);assert.equal(record.candidate.route,spec.route);assert.equal(record.release,'not_authorized');
    for(const locale of current.locales) {
      const payload=locale.code==='ru'?record.candidate.ru:record.candidate.translations[locale.code],meta=JSON.parse(read(payload.metadataFile));
      const row=source.records.find(r=>r.content_key_proposed===pageKey&&r.locale===locale.code);for(const key of Object.keys(row))assert.deepEqual(meta[key],row[key]);
      assert.equal(meta.bodyMarkdown,row.body_markdown);assert.equal(meta.approvedSourceRevision,'sha256:'+row.canonical_ru_sha256);
      assert.equal(meta.faq.length,spec.faqCount);assert.equal(meta.cta.length,pageKey==='family-kitas'?2:1);assert.equal(meta.approval.legalVerification,false);
    }
  }
  const reconciliation=JSON.parse(read('registry-copy/family_kitas_source_reconciliation.json'));assert.equal(reconciliation.records.length,5);
  assert.ok(reconciliation.records.every(row=>row.redirectCreated===false&&row.publishedConflict===false));
});
