import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {planE33GNextImport,applyE33GNextPlan,e33gNextPages,e33gNextEvidenceHashes,e33gNextPriceOccurrences,
  publicE33GNextBody,e33gNextSha as sha} from '../scripts/import-e33g-next-bundle.mjs';
import {restorePreFamilyRegistry,registryBytes} from './fixtures/pre-family-registry.mjs';
const root=new URL('../content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const pack='registry-copy/e33g_next_source_pack/',source=JSON.parse(read(pack+'CONTENT_LOCALIZED_IMPORT.json'));
const registry=JSON.parse(read('service-registry.v1.json')),approvals=JSON.parse(read('registry-approvals.v1.json')),build=JSON.parse(read('registry-e33g-next-build.v1.json'));
const historicalRegistry=restorePreFamilyRegistry(registry);
const report=JSON.parse(read(pack+'QA/VALIDATION_REPORT.json'));
const readBundle=file=>{for(const entry of build.records)for(const [locale,pin] of Object.entries(entry.locales)) {
  const path=locale==='ru'?report.pages[entry.pageKey].ru.path:report.pages[entry.pageKey].translations[locale==='zh-Hans'?'zh-cn':locale].path;
  if(file===path)return read(pin.sourceMarkdownFile);
}return read(pack+file);};
const plan=(overrides={})=>planE33GNextImport({readBundle,registry:historicalRegistry,approvals,...overrides});
const immutableBuild=value=>{const copy=structuredClone(value);delete copy.stage;delete copy.publicationGates;delete copy.renderEvidence;
  for(const r of copy.records){delete r.publication.indexable;delete r.publication.gateStatus;}return copy;};
test('all40 exact JSON fields, original MD and270 FAQ preserve source/approval lineage without duplication',()=>{
  assert.equal(source.length,40);assert.equal(build.records.length,4);assert.equal(registry.records.length,153);
  for(const [file,pin] of Object.entries(e33gNextEvidenceHashes))assert.equal(sha(read(pack+file)),pin);
  let count=0,faq=0,tables=0;
  for(const entry of build.records)for(const [locale,pin] of Object.entries(entry.locales)) {
    const meta=JSON.parse(read(pin.metadataFile)),row=source.find(r=>r.contentId===e33gNextPages[entry.pageKey].suppliedContentId&&r.locale===locale);
    for(const key of Object.keys(row))assert.deepEqual(meta[key],row[key],'Exact supplied JSON field: '+key);
    assert.deepEqual(JSON.parse(read(pin.sourceFile)),row);assert.equal(sha(read(pin.sourceFile)),pin.sourceFileSha256);
    assert.equal(sha(read(pin.sourceMarkdownFile)),row.revisionSHA256);assert.equal(publicE33GNextBody(read(pin.sourceMarkdownFile).toString()),row.bodyMarkdown);
    assert.equal(read(pin.bodyFile).toString(),row.bodyMarkdown);assert.equal(sha(read(pin.bodyFile)),pin.bodySha256);assert.equal(sha(read(pin.metadataFile)),pin.metadataSha256);
    assert.equal(meta.bodyIncludesFaq,true);assert.equal(meta.doNotRenderSeparateFaqAgain,true);assert.equal(meta.faqEmbeddedInBody,true);
    assert.equal(meta.resolvedContentId,entry.contentId);assert.equal(meta.approvedSourceRevision,'sha256:'+row.sourceRevisionSHA256);
    assert.equal(meta.direction,locale==='ar'?'rtl':'ltr');assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);assert.equal(meta.approval.nativeSpeakerReview,false);
    assert.doesNotMatch(row.bodyMarkdown,/^\*\*(?:Статус|contentId \(предложение\)|Предлагаемый маршрут|SEO Title|Meta Description):/m);
    count++;faq+=meta.faq.length;tables+=meta.tables.length;
  }
  assert.equal(count,40);assert.equal(faq,270);assert.equal(tables,40);
});
test('deterministic reimport changes no existing records/services/prices/approvals or prior release artifacts',()=>{
  const before=structuredClone(registry),next=plan();assert.deepEqual(next.registry,historicalRegistry);assert.deepEqual(next.approvals,approvals);
  assert.equal(historicalRegistry.records.length,152);assert.deepEqual(registry,before,'Historical replay never mutates the current Registry');
  assert.throws(()=>plan({registry}),/No new Registry records in this package/);
  for(const [file,bytes] of next.writes)if(file!=='registry-e33g-next-build.v1.json')assert.deepEqual(file==='service-registry.v1.json'?registryBytes(historicalRegistry):read(file),bytes,'Idempotent: '+file);
  assert.deepEqual(immutableBuild(next.build),immutableBuild(build));assert.equal(next.summary.newRegistryRecords,0);assert.equal(next.summary.redirects,0);
  assert.equal(next.summary.localizedPayloads,40);assert.equal(next.build.stage,'IMPORTED_PENDING_RENDER_QA');assert.ok(!Object.values(next.build.publicationGates).some(Boolean));
  const previous=JSON.parse(readFileSync(new URL('./fixtures/next-stage-e33g-preimport.v1.json',import.meta.url)));
  for(const old of previous.records){const current=registry.records.find(r=>r.contentId===old.contentId);assert.equal(current.serviceId,old.serviceId);assert.deepEqual(current.pricingRef,old.pricingRef);assert.equal(current.published,old.published);}
  for(const {contentId} of Object.values(e33gNextPages))assert.equal(approvals.entries.filter(a=>a.contentId===contentId&&a.revision===registry.records.find(r=>r.contentId===contentId).candidate.revision).length,1);
  const reconcile=JSON.parse(read('registry-copy/e33g_next_source_reconciliation.json'));assert.equal(reconcile.records.length,4);
  for(const entry of reconcile.records){const spec=Object.values(e33gNextPages).find(p=>p.contentId===entry.contentId);assert.equal(entry.previousDraftRoute,spec.oldRoute);assert.equal(entry.resolvedCanonicalRoute,spec.route);assert.equal(entry.redirectCreated,false);assert.equal(entry.publishedConflict,false);}
});
test('source JSON/MD/authorization drift and occupied or published routes are rejected without mutation',()=>{
  for(const file of ['CONTENT_LOCALIZED_IMPORT.json','CONTENT_MANIFEST.json','CODEX_PROMPT_RELEASE_ALL_RU.md',report.pages['01_e33g_extension'].translations.ar.path])
    assert.throws(()=>plan({readBundle:requested=>requested===file?Buffer.concat([readBundle(requested),Buffer.from('\nchanged')]):readBundle(requested)}),/drift|strictly equal/);
  for(const [mutate,guard] of [[r=>r.records.find(r=>r.contentId==='e33g_next_term').published={routes:{ru:'/bali/visas/e33g/extension/'}},/Do not replace published content/],
    [r=>r.records.find(r=>r.contentId==='e33g_next_term').candidate.revision='sha256:'+'0'.repeat(64),/Do not overwrite another approved revision/],
    [r=>r.records.find(r=>r.contentId==='e33g_next_term').pricingRef.optionCodes=['invented-service'],/Preserve existing business operation identities/],
    [r=>r.records.find(r=>r.contentId==='business').candidate.route='/bali/visas/e33g/extension/',/Occupied candidate route/]]) {
    const candidate=structuredClone(historicalRegistry);mutate(candidate);const before=structuredClone(candidate);assert.throws(()=>plan({registry:candidate}),guard);assert.deepEqual(candidate,before);
  }
});
test('all680 exact UTF16/UTF8 price pins distinguish same amounts and cover implicit localized currency',()=>{
  const map=JSON.parse(read('registry-copy/e33g_next_price_occurrences.json')),rebuilt=[];assert.equal(map.occurrences.length,680);assert.equal(Object.keys(map.operations).length,8);
  for(const entry of build.records)for(const [locale,pin] of Object.entries(entry.locales)){const meta=JSON.parse(read(pin.metadataFile));rebuilt.push(...e33gNextPriceOccurrences(meta));}
  assert.deepEqual(rebuilt,map.occurrences);
  for(const row of map.occurrences) {
    const meta=JSON.parse(read(build.records.find(r=>r.contentId===row.contentId).locales[row.locale].metadataFile));
    const field=row.fieldProperty.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((value,key)=>value[key],meta),s=row.fieldSpan;
    assert.equal(sha(field),row.fieldSha256);assert.equal(field.slice(s.utf16Start,s.utf16End),s.literal);assert.equal(Buffer.from(field).subarray(s.utf8ByteStart,s.utf8ByteEnd).toString(),s.literal);
    assert.doesNotMatch(s.literal,/USD|60[ ,.\u00a0]000|2[ ,.\u00a0]000(?![ ,.\u00a0]000)/);
  }
  for(const locale of registry.locales.map(l=>l.code)) {
    const body=map.occurrences.filter(r=>r.contentId==='e33g_next_term'&&r.locale===locale&&r.fieldProperty==='bodyMarkdown');
    assert.deepEqual(body.slice(0,4).map(r=>r.operationId),['e33g_extension','e33g_extension','e33g_standard','e33g_express']);
    const dual=map.occurrences.filter(r=>r.contentId==='e33g_conversion'&&r.locale===locale&&r.operationIds);assert.equal(dual.length,2); // body + visible FAQ mirror
    for(const pin of dual)assert.deepEqual(pin.operationIds,['conversion_from_voa','conversion_from_d12']);
  }
  assert.ok(map.occurrences.some(r=>r.fieldSpan.literal==='12'));assert.ok(map.occurrences.some(r=>r.fieldSpan.literal==='17'));
});
test('apply checks all immutable destinations and Registry/approval source hashes before writing anything',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'safr-e33g-next-import-test-'));
  try {
    writeFileSync(join(temporary,'service-registry.v1.json'),'old');writeFileSync(join(temporary,'registry-approvals.v1.json'),'old');
    const proposed={writes:new Map([['service-registry.v1.json',Buffer.from('new')],['registry-approvals.v1.json',Buffer.from('new')]])};
    assert.throws(()=>applyE33GNextPlan(proposed,temporary,{expectedRegistrySha256:sha('old'),expectedApprovalsSha256:sha('concurrent')}),/concurrent overwrite/);
    assert.equal(readFileSync(join(temporary,'service-registry.v1.json'),'utf8'),'old');
    applyE33GNextPlan(proposed,temporary,{expectedRegistrySha256:sha('old'),expectedApprovalsSha256:sha('old')});assert.equal(readFileSync(join(temporary,'service-registry.v1.json'),'utf8'),'new');
    writeFileSync(join(temporary,'unchanged.md'),'user edit');assert.throws(()=>applyE33GNextPlan({writes:new Map([['unchanged.md',Buffer.from('other')]])},temporary),/concurrent overwrite/);
    assert.throws(()=>applyE33GNextPlan({writes:new Map([['../outside.md',Buffer.from('unsafe')]])},temporary));
  }finally{rmSync(temporary,{recursive:true,force:true});}
});
