import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {planD12E28AImport,applyD12E28APlan,publicD12E28ABody,d12E28APages,d12E28AEvidenceHashes,
  d12E28APriceOccurrences,d12E28ASha as sha} from '../scripts/import-d12-e28a-bundle.mjs';
import {metadataEnvelope} from '../scripts/import-sync-bundle.mjs';
import {restorePreFamilyRegistry,registryBytes} from './fixtures/pre-family-registry.mjs';

const contentRoot=new URL('../content/',import.meta.url),read=file=>readFileSync(new URL(file,contentRoot));
const sourcePack='registry-copy/d12e28a_source_pack/';
const manifest=JSON.parse(read(sourcePack+'ALL_LOCALES_CONTENT_SEO_MANIFEST.json'));
const registry=JSON.parse(read('service-registry.v1.json')),approvals=JSON.parse(read('registry-approvals.v1.json'));
const historicalRegistry=restorePreFamilyRegistry(registry);
const build=JSON.parse(read('registry-d12-e28a-build.v1.json'));
const getLocale=(key,locale)=>build.records.find(r=>r.pageKey===key).locales[locale];
const readBundle=file=>{
  for(const page of manifest.pages)for(const [locale,pin] of Object.entries(page.locales))if(pin.file===file)return read(getLocale(page.key,locale).sourceFile);
  return read(sourcePack+file);
};
const plan=(overrides={})=>planD12E28AImport({readBundle,registry:historicalRegistry,approvals,...overrides});
const get=(object,path)=>path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((value,key)=>value[key],object);
const immutableBuild=value=>{const copy=structuredClone(value);delete copy.stage;delete copy.publicationGates;delete copy.renderEvidence;
  for(const record of copy.records){delete record.publication.indexable;delete record.publication.gateStatus;}return copy;};

test('all seventy exact supplied originals and every customer section/FAQ/table/link retain approval lineage',()=>{
  assert.equal(build.records.length,7);assert.equal(registry.records.length,154);
  for(const [file,hash] of Object.entries(d12E28AEvidenceHashes))assert.equal(sha(read(sourcePack+file)),hash);
  let originalCount=0,faqCount=0,tableRows=0;
  for(const page of manifest.pages)for(const [locale,pin] of Object.entries(page.locales)) {
    const current=getLocale(page.key,locale),source=read(current.sourceFile),body=read(current.bodyFile),metadataBytes=read(current.metadataFile);
    const meta=JSON.parse(metadataBytes);assert.equal(sha(source),pin.sha256);assert.equal(sha(body),current.bodySha256);
    assert.equal(sha(metadataBytes),current.metadataSha256);assert.equal(meta.bodyMarkdown,body.toString());
    assert.equal(publicD12E28ABody(source.toString()).body,body.toString());
    assert.equal(meta.seo.title,pin.title);assert.equal(meta.seo.description,pin.description);assert.equal(meta.h1,pin.h1);
    assert.equal(meta.approvedSourceRevision,'sha256:'+page.source_ru_revision);assert.equal(meta.direction,locale==='ar'?'rtl':'ltr');
    assert.equal(meta.sourceRevision,build.records.find(r=>r.pageKey===page.key).sourceRevision);
    assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.legalVerification,false);
    assert.doesNotMatch(body.toString(),/^\*\*(?:Status|Source revision|Editorial verification|URL candidate):/m);
    if(locale==='ru')assert.equal(metadataEnvelope(body,meta),current.sourceEnvelopeSha256);
    const ruMeta=JSON.parse(read(getLocale(page.key,'ru').metadataFile));assert.equal(current.sourceEnvelopeSha256,ruMeta.sourceEnvelopeSha256);
    originalCount++;faqCount+=meta.faq.length;tableRows+=meta.tables.reduce((n,t)=>n+t.rows,0);
  }
  assert.equal(originalCount,70);assert.equal(faqCount,430);assert.equal(tableRows,50);
  assert.equal(read(getLocale('d12_main','ru').sourceFile).toString(),read(getLocale('d12_main','ru').bodyFile).toString());
  assert.equal(read(getLocale('e28a_main','ru').sourceFile).toString(),read(getLocale('e28a_main','ru').bodyFile).toString());
});

test('reimport is deterministic and preserves existing routes/services/approvals and prior batches',()=>{
  const before=structuredClone(registry),next=plan();assert.deepEqual(next.registry,historicalRegistry);assert.deepEqual(next.approvals,approvals);
  assert.equal(historicalRegistry.records.length,152);assert.deepEqual(registry,before,'Historical replay never mutates the current Registry');
  for(const [file,bytes] of next.writes)if(file!=='registry-d12-e28a-build.v1.json')assert.deepEqual(file==='service-registry.v1.json'?registryBytes(historicalRegistry):read(file),bytes,'Idempotent: '+file);
  assert.deepEqual(immutableBuild(next.build),immutableBuild(build));
  assert.equal(next.summary.translationsAuthored,0);assert.equal(next.summary.publication,false);
  assert.equal(next.build.stage,'IMPORTED_PENDING_RENDER_QA');assert(!Object.values(next.build.publicationGates).some(Boolean));
  assert(next.build.records.every(r=>r.publication.indexable===false));
  const owned=new Set(Object.values(d12E28APages).map(p=>p.contentId));
  for(const old of historicalRegistry.records)if(!owned.has(old.contentId))assert.deepEqual(next.registry.records.find(r=>r.contentId===old.contentId),old);
  assert.equal(registry.records.filter(r=>r.published).length,22);
  assert.deepEqual(registry.records.find(r=>r.contentId==='d12').published.routes,{ru:'/bali/visas/d12/',en:'/en/bali/visas/d12/'});
  assert.deepEqual(registry.records.find(r=>r.contentId==='investor').pricingRef,{entityType:'VISA',entityKey:'E28A',optionCodes:['two-year-standard']});
  assert.equal(registry.records.find(r=>r.contentId==='knowledge_e28a_extension').pricingRef,null);
  for(const {contentId} of Object.values(d12E28APages)) {
    const record=registry.records.find(r=>r.contentId===contentId),matching=approvals.entries.filter(a=>a.contentId===contentId&&a.revision===record.candidate.revision);
    assert.equal(matching.length,1);assert.equal(matching[0].public_content_sha256,record.candidate.ru.bodySha256);
    assert.equal(Object.keys(record.candidate.translations).length,9);
  }
});

test('final source SHA and authorization pins reject body, SEO/manifest, approval and permission drift',()=>{
  for(const file of [manifest.pages[0].locales.ar.file,'ALL_LOCALES_CONTENT_SEO_MANIFEST.json','RU_APPROVAL_MANIFEST.json',
    'PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md','PROVENANCE/BATCH1_CONTENT_SEO_MANIFEST.json']) {
    assert.throws(()=>plan({readBundle:requested=>requested===file?Buffer.concat([readBundle(requested),Buffer.from('\nmodified')]):readBundle(requested)}),/drift|Markdown/);
  }
  const conflict=structuredClone(historicalRegistry);conflict.records.find(r=>r.contentId==='d12').candidate.revision='sha256:'+'0'.repeat(64);
  assert.throws(()=>plan({registry:conflict}),/conflicting approved candidate/);
  assert.throws(()=>publicD12E28ABody('# Example\n\n**Status:** approved\nCustomer sentence must not be lost.\n\n## Body\nContent\n'),/customer text/);
});

test('all exact localized price/FAQ/SEO spans map only commercial operations, excluding statutory thresholds',()=>{
  const map=JSON.parse(read('registry-copy/d12e28a_price_occurrences.json')),rebuilt=[];
  assert.equal(map.occurrences.length,374);assert.equal(Object.keys(map.operations).length,7);
  const locales=new Set(),operationIds=new Set();
  for(const row of map.occurrences) {
    const meta=JSON.parse(read(getLocale(row.pageKey,row.locale).metadataFile));const field=get(meta,row.fieldProperty);
    assert.equal(sha(field),row.fieldSha256);assert.equal(meta.sourceRevision,row.sourceRevision);assert.equal(meta.bodySha256,row.bodySha256);
    for(const s of [row.fieldSpan,row.usdWrapper].filter(Boolean)) {
      assert.equal(field.slice(s.utf16Start,s.utf16End),s.literal);
      assert.equal(Buffer.from(field).subarray(s.utf8ByteStart,s.utf8ByteEnd).toString(),s.literal);
    }
    assert.ok(Object.hasOwn(map.operations,row.operationId));assert.ok(map.operations[row.operationId].sourceSnapshotIdr<10000000000);
    assert.doesNotMatch(row.fieldSpan.literal,/10[ ,.\u00a0]000[ ,.\u00a0]000[ ,.\u00a0]000|10\s*(?:млрд|billion)|[25][ ,.\u00a0]000\s*USD/);
    locales.add(row.locale);operationIds.add(row.operationId);
  }
  for(const entry of build.records)for(const locale of registry.locales.map(l=>l.code))rebuilt.push(...d12E28APriceOccurrences(JSON.parse(read(entry.locales[locale].metadataFile))));
  assert.deepEqual(rebuilt,map.occurrences);assert.equal(locales.size,10);
  assert.deepEqual([...operationIds].sort(),['d12-one-year-standard','d12-one-year-express','d12-two-year-standard','d12-two-year-express','d12_extension','e28a-two-year-standard'].sort());
  assert(map.occurrences.some(r=>r.fieldProperty==='seo.description'));
  assert(map.occurrences.some(r=>r.fieldProperty.startsWith('faq[')));
});

test('apply preflights every destination before writes, refusing dirty immutable files or concurrent Registry',()=>{
  const temporary=mkdtempSync(join(tmpdir(),'safr-d12-import-test-'));
  try {
    writeFileSync(join(temporary,'service-registry.v1.json'),'old registry');writeFileSync(join(temporary,'registry-approvals.v1.json'),'old approvals');
    const proposed={writes:new Map([['service-registry.v1.json',Buffer.from('new registry')],['registry-approvals.v1.json',Buffer.from('new approvals')]])};
    assert.throws(()=>applyD12E28APlan(proposed,temporary,{expectedRegistrySha256:sha('old registry'),expectedApprovalsSha256:sha('concurrent approvals')}),/concurrent overwrite/);
    assert.equal(readFileSync(join(temporary,'service-registry.v1.json'),'utf8'),'old registry');
    applyD12E28APlan(proposed,temporary,{expectedRegistrySha256:sha('old registry'),expectedApprovalsSha256:sha('old approvals')});
    assert.equal(readFileSync(join(temporary,'service-registry.v1.json'),'utf8'),'new registry');
    writeFileSync(join(temporary,'immutable.md'),'user content');
    assert.throws(()=>applyD12E28APlan({writes:new Map([['immutable.md',Buffer.from('different content')]])},temporary),/concurrent overwrite/);
    assert.equal(readFileSync(join(temporary,'immutable.md'),'utf8'),'user content');
    assert.throws(()=>applyD12E28APlan({writes:new Map([['../outside.md',Buffer.from('unsafe')]])},temporary));
  } finally {rmSync(temporary,{recursive:true,force:true});}
});
