import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {planPartnersImport,applyPartnersPlan,partnersSha as sha,PARTNERS_PACK,PARTNERS_HISTORY,publicPartnersBody} from '../scripts/import-partners-bundle.mjs';
import {restorePreBusinessRegistry} from './fixtures/pre-business-registry.mjs';
const root=new URL('../content/',import.meta.url),read=file=>readFileSync(new URL(file,root)),json=value=>JSON.stringify(value,null,2)+'\n';
const authoredCurrent=JSON.parse(read('service-registry.v1.json')),approvals=JSON.parse(read('registry-approvals.v1.json')),history=JSON.parse(read(PARTNERS_HISTORY));
assert.equal(authoredCurrent.records.length,154);
const current=restorePreBusinessRegistry(authoredCurrent);
assert.equal(sha(read(PARTNERS_HISTORY)),'6d320f72d7eb5ad816d01e0d95913ba3d1663a3d377566b8556bc3ac99151e9c');
assert.equal(history.sourceRegistryRecordCount,153);assert.equal(history.sourceRegistrySha256,'c688e475b29bbcca02bb56d34b4732d368580d5928c4cc19f12916e8d7d829f3');
assert.deepEqual(history.removeAddedContentIds,[]);assert.deepEqual(history.records.map(record=>record.contentId),['partners']);
const build=JSON.parse(read('registry-partners-build.v1.json')),source=JSON.parse(read(PARTNERS_PACK+'CONTENT_IMPORT_STAGING.json'));
const originalFiles=new Map(source.records.map(row=>[row.contentFile,build.records[0].locales[row.locale].sourceMarkdownFile]));
const readBundle=file=>originalFiles.has(file)?read(originalFiles.get(file)):read(PARTNERS_PACK+file);
function previous153(){const previous=structuredClone(current);previous.records=previous.records.map(r=>structuredClone(history.records.find(old=>old.contentId===r.contentId)??r));assert.equal(sha(json(previous)),history.sourceRegistrySha256);return previous;}
test('exact ten supplied records replace only existing partners draft, preserving historical identity,90FAQs and every unrelated approval/record',()=>{
  const previous=previous153(),priorApprovals=structuredClone(approvals);priorApprovals.entries=priorApprovals.entries.filter(r=>r.contentId!=='partners');
  const plan=planPartnersImport({readBundle,registry:previous,approvals:priorApprovals});assert.deepEqual(plan.registry,current);assert.deepEqual(plan.approvals,approvals);
  assert.equal(plan.summary.writes,59);assert.equal(plan.summary.localizedPayloads,10);assert.equal(plan.summary.faq,90);assert.equal(plan.summary.registryRecords,153);
  for(const key of ['newContentRecords','newBusinessEntities','newPricingOperations','publicReferralRecords','redirects'])assert.equal(plan.summary[key],0);
  for(const [file,bytes] of plan.writes)assert.deepEqual(file==='service-registry.v1.json'?Buffer.from(json(current)):read(file),bytes,'Exact generated artifact: '+file);
  for(const r of previous.records)if(r.contentId!=='partners')assert.deepEqual(current.records.find(n=>n.contentId===r.contentId),r);
  assert.ok(![...plan.writes.keys()].some(file=>/CHAT_CONTEXT|REFERRAL_RU_PREVIEW_ONLY/.test(file)),'Private chat and unapproved Referral draft remain outside repository');
  for(const row of source.records){const pin=build.records[0].locales[row.locale],meta=JSON.parse(read(pin.metadataFile));assert.deepEqual(meta.sourceRecord,row);assert.deepEqual(JSON.parse(read(pin.sourceFile)),row);
    assert.equal(read(pin.bodyFile).toString(),row.bodyMarkdown);assert.equal(publicPartnersBody(read(pin.sourceMarkdownFile).toString(),row),row.bodyMarkdown);assert.equal(meta.faq.length,9);assert.equal(meta.editorialSourceRevision,row.sourceRevision);}
});
test('replay is idempotent and source, published identity, foreign tariff, route collision and concurrent apply all fail closed',()=>{
  const plan=planPartnersImport({readBundle,registry:current,approvals});assert.deepEqual(plan.registry,current);assert.deepEqual(plan.approvals,approvals);assert.equal(plan.writes.has(PARTNERS_HISTORY),false);
  const registryBytes=read('service-registry.v1.json'),approvalBytes=read('registry-approvals.v1.json');
  assert.throws(()=>applyPartnersPlan(plan,fileURLToPath(root),{expectedRegistrySha256:'0'.repeat(64),expectedApprovalsSha256:sha(approvalBytes)}),/Refuse unrelated\/concurrent overwrite/);
  assert.deepEqual(read('service-registry.v1.json'),registryBytes);assert.deepEqual(read('registry-approvals.v1.json'),approvalBytes,'Rejected apply performs no partial writes');
  assert.throws(()=>planPartnersImport({readBundle:file=>file==='CONTENT_IMPORT_STAGING.json'?Buffer.from(readBundle(file).toString()+'drift'):readBundle(file),registry:previous153(),approvals}),/evidence drift/);
  const paid=previous153();paid.records.find(r=>r.contentId==='partners').pricingRef={entityType:'VISA',entityKey:'E33G',optionCodes:['standard']};assert.throws(()=>planPartnersImport({readBundle,registry:paid,approvals}));
  const published=previous153();published.records.find(r=>r.contentId==='partners').published={routes:{ru:'/partners/'}};assert.throws(()=>planPartnersImport({readBundle,registry:published,approvals}),/Do not replace published/);
  const occupied=previous153();occupied.records.find(r=>r.contentId==='business').candidate.route='/partners/';assert.throws(()=>planPartnersImport({readBundle,registry:occupied,approvals}),/Occupied candidate route/);
});
