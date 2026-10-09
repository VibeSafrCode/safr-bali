import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {validateRegistry} from '../src/service-registry.mjs';
import {canonicalJson,metadataEnvelope} from '../scripts/import-sync-bundle.mjs';
import {planBusinessImport,createBusinessBundleReader,publicBusinessBody,assertBusinessPath,businessPages,businessEvidenceHashes,
  businessSha as sha,BUSINESS_PACK,BUSINESS_HISTORY,BUSINESS_GATES,BUSINESS_QA} from '../scripts/import-business-bundle.mjs';

const contentRoot=new URL('../content/',import.meta.url),read=file=>readFileSync(new URL(file,contentRoot));
// Before application, pass the approved extracted pack via this explicit local
// input. After application, CI uses only the bounded sanitized source archive.
const readBundle=createBusinessBundleReader(process.env.SAFRWAY_BUSINESS_BUNDLE_ROOT??fileURLToPath(new URL(BUSINESS_PACK,contentRoot)));
const manifest=JSON.parse(readBundle('ALL_LOCALES_CONTENT_SEO_MANIFEST.json'));
const approvals=JSON.parse(read('registry-approvals.v1.json'));
const current=JSON.parse(read('service-registry.v1.json'));
let baseline=structuredClone(current);
if(current.records.length===154) {
  const history=JSON.parse(read(BUSINESS_HISTORY));assert.equal(history.sourceRegistryRecordCount,153);
  assert.deepEqual(history.removeAddedContentIds,['knowledge_pt_pma_capital']);
  assert.deepEqual(history.records.map(record=>record.contentId),['business','pma','corporate_changes','liquidation','nib_oss']);
  const old=new Map(history.records.map(record=>[record.contentId,record]));
  baseline.records=baseline.records.filter(record=>!history.removeAddedContentIds.includes(record.contentId)).map(record=>structuredClone(old.get(record.contentId)??record));
  assert.equal(sha(JSON.stringify(baseline,null,2)+'\n'),history.sourceRegistrySha256,'Restore exact pre-Business153, not relaxed current154 replay');
}
assert.equal(baseline.records.length,153);
const plan=(overrides={})=>planBusinessImport({readBundle,registry:baseline,approvals,...overrides});
const result=plan();
const links=text=>[...text.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)].map(match=>match[1]);

test('six exact source pages × ten locales preserve all supplied bytes, SEO, CTA,360 FAQ and links without staging leakage',()=>{
  assert.equal(result.summary.localizedPayloads,60);assert.equal(result.summary.faq,360);assert.equal(result.summary.translatedFaq,324);
  const directions=new Map(baseline.locales.map(language=>[language.code,language.dir]));let faq=0,translations=0,internal=0;
  for(const row of manifest.records) {
    const record=result.registry.records.find(record=>record.contentId===businessPages[row.pageKey].contentId);
    const payload=row.locale==='ru'?record.candidate.ru:record.candidate.translations[row.locale],body=result.writes.get(payload.bodyFile),metadataBytes=result.writes.get(payload.metadataFile),meta=JSON.parse(metadataBytes);
    const original=readBundle(row.file),wire=result.writes.get(meta.sourceFile);
    assert.deepEqual(result.writes.get(meta.sourceMarkdownFile),original,'Byte-exact supplied MD: '+row.file);
    assert.equal(sha(original),row.locale==='ru'?row.sourceSha256:row.translationSha256);
    assert.deepEqual(JSON.parse(wire),row);assert.deepEqual(meta.sourceRecord,row);
    assert.equal(meta.sourceFileSha256,sha(wire));assert.equal(meta.sourceMarkdownSha256,sha(original));
    assert.equal(body.toString(),publicBusinessBody(original.toString(),row));assert.equal(meta.bodyMarkdown,body.toString());
    assert.equal(sha(body),payload.bodySha256);assert.equal(sha(metadataBytes),payload.metadataSha256);
    assert.deepEqual(meta.seo,row.seo);assert.equal(meta.h1,row.seo.h1);assert.equal(meta.cta[0].label,row.seo.cta);
    assert.equal(meta.seoTitle,row.seo.title);assert.equal(meta.metaDescription,row.seo.description);
    assert.deepEqual(links(body.toString()),links(original.toString()),'All supplied internal and official URLs remain exact');
    assert.deepEqual(meta.links,links(body.toString()));assert.equal(meta.faq.length,row.faqCount);assert.ok(meta.faq.every(item=>item.question&&item.answerMarkdown));
    assert.equal(meta.direction,directions.get(row.locale));assert.equal(meta.direction,row.locale==='ar'?'rtl':'ltr');
    assert.equal(meta.editorialSourceRevision,row.sourceRevision);assert.equal(meta.editorialSourceSha256,row.sourceSha256);
    assert.equal(meta.sourceRevision,record.candidate.revision);assert.equal(payload.sourceEnvelopeSha256,record.candidate.ru.sourceEnvelopeSha256);
    if(row.locale==='ru')assert.equal(metadataEnvelope(body,meta),payload.sourceEnvelopeSha256);
    assert.doesNotMatch(body.toString(),/<!--|EDITORIAL STAGING|sourceSha256:|sourceRevision:|\*\*(?:SEO Title|Meta Description|CTA):\*\*/);
    assert.equal(meta.bodyIncludesFaq,true);assert.equal(meta.doNotRenderSeparateFaqAgain,true);
    assert.deepEqual(meta.quotePolicy,{fixedPriceApproved:false,businessServiceCreated:false,commercialTerms:'INDIVIDUAL_QUOTE_NOT_APPROVED'});
    assert.doesNotMatch(body.toString(),/CATALOG_PRICE|\{\{USD|\$\d/);
    assert.equal(meta.approval.nativeSpeakerReview,false);assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.legalVerification,false);
    if(row.locale==='ru'){assert.equal(payload.status,'draft');assert.equal(payload.approvalEvidence,null);assert.equal(payload.approvalRevision,null);assert.equal(meta.approval.status,'RU_REVIEW');}
    else {assert.equal(payload.status,'translated');assert.equal(payload.complete,true);assert.equal(payload.qa,'not_done');assert.equal(payload.qaMethod,'supplied_model_semantic');assert.equal(payload.qaFile,BUSINESS_QA);assert.equal(meta.approval.status,'MODEL_TRANSLATED_PENDING_RENDER_QA');translations++;}
    faq+=meta.faq.length;internal+=meta.links.filter(link=>link.startsWith('/')).length;
  }
  assert.equal(faq,360);assert.equal(translations,54);assert.equal(internal,120);
  for(const [file,pin] of Object.entries(businessEvidenceHashes))assert.equal(sha(result.writes.get(BUSINESS_PACK+file)),pin);
});

test('five existing identities/current routes and one editorial Knowledge preserve every unrelated record, approval, service, price and merge suggestion',()=>{
  assert.deepEqual(validateRegistry(result.registry),{records:154,publishedBindings:44,previewOnly:154});
  const owned=new Set(Object.values(businessPages).map(page=>page.contentId));
  for(const original of baseline.records) {
    const next=result.registry.records.find(record=>record.contentId===original.contentId);
    if(!owned.has(original.contentId))assert.deepEqual(next,original,'Unrelated identity: '+original.contentId);
    else for(const key of ['serviceId','pricingRef','published','parentId','kind','bindingStatus','availability','bindingEvidence','reuseRoutes','mergeTargetId','duplicateRisk','release'])assert.deepEqual(next[key],original[key],original.contentId+' '+key);
    assert.equal(next.candidate.route,original.candidate.route,'Never rename an existing canonical route');
  }
  const added=result.registry.records.filter(record=>!baseline.records.some(old=>old.contentId===record.contentId));assert.equal(added.length,1);
  assert.equal(added[0].contentId,'knowledge_pt_pma_capital');assert.equal(added[0].kind,'knowledge');assert.equal(added[0].parentId,'business');
  assert.equal(added[0].serviceId,null);assert.equal(added[0].pricingRef,null);assert.equal(added[0].published,null);
  for(const id of owned){const record=result.registry.records.find(record=>record.contentId===id);assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.candidate.exposure,'preview_only');}
  assert.deepEqual(result.approvals,approvals);assert.ok(!result.writes.has('registry-approvals.v1.json'));
  assert.ok(!result.writes.has('registry-public-build.v1.json'));assert.ok(!result.writes.has('registry-presentation-approvals.v1.json'));
  assert.equal(result.summary.newBusinessEntities,0);assert.equal(result.summary.newPricingOperations,0);assert.equal(result.summary.redirects,0);assert.equal(result.summary.publication,false);
  assert.deepEqual(result.build.publicationGates,Object.fromEntries(BUSINESS_GATES.map(gate=>[gate,false])));
  assert.ok(result.build.records.every(record=>record.publication.indexable===false));
  const files=[...result.writes.keys()];assert.ok(!files.some(file=>/CHAT_CONTEXT|COMPETITOR|PRIVATE|catalog|pricing|fx|backend/i.test(file)));
  assert.equal(result.registry.records.find(record=>record.contentId==='liquidation').mergeTargetId,'corporate_changes');
  assert.ok(result.blockers.some(blocker=>blocker.code==='LIQUIDATION_HISTORICAL_MERGE_SUGGESTION'));
});

test('all source route hints reconcile to canonical identities without rewriting exact source links or introducing redirects',()=>{
  const aliases=result.blockers.filter(blocker=>blocker.code==='SUPPLIED_LINK_ALIAS_ADAPTER_PENDING');assert.equal(aliases.length,4);
  for(const mapping of result.reconciliation) {
    const spec=businessPages[mapping.pageKey];assert.equal(mapping.contentId,spec.contentId);assert.equal(mapping.suppliedRouteHint,spec.hint);assert.equal(mapping.resolvedCanonicalRoute,spec.route);
    assert.equal(mapping.redirectCreated,false);assert.equal(mapping.publishedConflict,false);assert.equal(mapping.newBusinessEntity,false);
    const record=result.registry.records.find(record=>record.contentId===spec.contentId);
    for(const pin of mapping.inlineLinks) {
      assert.equal(pin.status,'resolved_content_id');assert.ok(pin.contentId);assert.match(pin.resolvedCanonicalRoute,/^\/(?:[a-z0-9-]+\/)*$/);
      assert.ok(record.inlineLinkTargets.some(link=>link.contentId===pin.contentId&&link.sourceRoute===pin.resolvedCanonicalRoute&&link.status==='resolved_content_id'));
    }
    for(const language of result.registry.locales) {
      const built=result.build.records.find(record=>record.contentId===spec.contentId).locales[language.code];
      assert.equal(built.route,language.prefix+spec.route);assert.equal(built.suppliedRouteHint,language.prefix+spec.hint);
      const meta=JSON.parse(result.writes.get(built.metadataFile));assert.deepEqual(meta.inlineLinkReconciliation.map(link=>link.contentId),mapping.inlineLinks.map(link=>link.contentId));
    }
  }
});

test('pure plan/replay is idempotent and keeps an exact pre-import153 five-record/addition history without mutating inputs',()=>{
  const originalRegistry=structuredClone(baseline),originalApprovals=structuredClone(approvals),again=plan({registry:result.registry,approvals:result.approvals});
  assert.deepEqual(baseline,originalRegistry);assert.deepEqual(approvals,originalApprovals);assert.deepEqual(again.registry,result.registry);assert.deepEqual(again.build,result.build);assert.deepEqual(again.approvals,approvals);
  assert.equal(again.summary.newContentRecords,0);assert.ok(!again.writes.has(BUSINESS_HISTORY));
  for(const [file,bytes] of result.writes)if(file!==BUSINESS_HISTORY)assert.deepEqual(again.writes.get(file),bytes,'Replay exact bytes: '+file);
  const history=JSON.parse(result.writes.get(BUSINESS_HISTORY));assert.equal(history.schemaVersion,1);assert.equal(history.sourceRegistryRecordCount,153);
  assert.equal(history.sourceRegistrySha256,sha(JSON.stringify(baseline,null,2)+'\n'));assert.deepEqual(history.removeAddedContentIds,['knowledge_pt_pma_capital']);
  assert.deepEqual(history.records,baseline.records.filter(record=>Object.values(businessPages).some(page=>page.oldRevision&&page.contentId===record.contentId)));
  const restored=structuredClone(result.registry),old=new Map(history.records.map(record=>[record.contentId,record]));
  restored.records=restored.records.filter(record=>!history.removeAddedContentIds.includes(record.contentId)).map(record=>structuredClone(old.get(record.contentId)??record));assert.deepEqual(restored,baseline);
  assert.equal(sha(JSON.stringify(restored,null,2)+'\n'),history.sourceRegistrySha256);
});

test('all60 source hashes and every metadata/authorization pin reject corruption before any writes',()=>{
  const before=canonicalJson(baseline);
  for(const file of [...manifest.records.map(row=>row.file),...Object.keys(businessEvidenceHashes)])
    assert.throws(()=>plan({readBundle:requested=>requested===file?Buffer.concat([readBundle(requested),Buffer.from('\nmodified')]):readBundle(requested)}),/Source Markdown drift|Supplied evidence drift/);
  assert.equal(canonicalJson(baseline),before);
  const row=manifest.records.find(row=>row.locale==='en'&&row.pageKey==='pt_pma'),source=readBundle(row.file).toString();
  assert.throws(()=>publicBusinessBody(source.replace('**CTA:** '+row.seo.cta,'**CTA:** invented CTA'),row),/Manifest CTA drift/);
  assert.throws(()=>publicBusinessBody(source.replace('servicePrice: INDIVIDUAL_QUOTE_NOT_APPROVED','servicePrice: FREE'),row),/Staging field drift/);
  assert.throws(()=>publicBusinessBody(source.replace('# '+row.seo.h1,'# Altered heading'),row),/Customer H1 drift/);
});

test('existing bindings are preserved as an explicit blocking empty plan; published/occupied/approved and replay drift fail closed',()=>{
  for(const change of [record=>record.serviceId='consultation',record=>{record.serviceId='visa';record.pricingRef={entityType:'VISA',entityKey:'E33G',optionCodes:['standard']};}]) {
    const candidate=structuredClone(baseline);change(candidate.records.find(record=>record.contentId==='pma'));const before=structuredClone(candidate);
    const blocked=plan({registry:candidate});assert.equal(blocked.summary.blocked,true);assert.equal(blocked.writes.size,0);assert.equal(blocked.build,null);assert.deepEqual(blocked.registry,before);assert.deepEqual(candidate,before);
    assert.equal(blocked.blockers[0].code,'EXISTING_BUSINESS_BINDING_CONFLICT');assert.deepEqual(blocked.blockers[0].pricingRef,before.records.find(record=>record.contentId==='pma').pricingRef);
  }
  for(const [mutate,guard] of [
    [registry=>registry.records.find(record=>record.contentId==='pma').published={routes:{ru:'/bali/business/company-registration/',en:'/en/bali/business/company-registration/'}},/Do not replace published content/],
    [registry=>registry.records.find(record=>record.contentId==='pma').candidate.route='/bali/business/new-pma/',/Preserve existing candidate canonical route/],
    [registry=>registry.records.find(record=>record.contentId==='pma').candidate.ru.status='owner_approved_semantics',/Do not replace approved copy/],
    [registry=>registry.records.find(record=>record.contentId==='pma').title='Concurrent draft change',/Existing draft baseline drift/],
    [registry=>registry.records.find(record=>record.contentId==='business_forms').candidate.route=businessPages.capital.route,/Occupied candidate route/],
  ]) {const candidate=structuredClone(baseline);mutate(candidate);const before=structuredClone(candidate);assert.throws(()=>plan({registry:candidate}),guard);assert.deepEqual(candidate,before);}
  for(const [mutate,guard] of [
    [registry=>registry.records.find(record=>record.contentId==='knowledge_pt_pma_capital').serviceId='visa',/Knowledge immutable identity drift/],
    [registry=>registry.records.find(record=>record.contentId==='pma').candidate.translations.ar.qa='passed',/Replay candidate drift/],
    [registry=>registry.records.find(record=>record.contentId==='knowledge_pt_pma_capital').candidate.ru.approvalEvidence='invented approval',/Replay Knowledge identity drift/],
  ]) {const candidate=structuredClone(result.registry);mutate(candidate);const before=structuredClone(candidate);assert.throws(()=>plan({registry:candidate}),guard);assert.deepEqual(candidate,before);}
});

test('filesystem reader is source-allowlisted, rejects traversal and root/member symlinks; module exposes no writer/CLI',()=>{
  for(const file of ['/CONTENT/a.md','../a.md','CONTENT/../a.md','CONTENT\\a.md','CONTENT//a.md','./a.md','CONTENT/a.md?x'])assert.throws(()=>assertBusinessPath(file),/Unsafe package path/);
  for(const file of ['RESEARCH/COMPETITOR_BENCHMARK_PRIVATE_RU.md','SAFRWAY_CHAT_CONTEXT_CURRENT_v73.md','config.py'])assert.throws(()=>readBundle(file),/Not an allowed Business source/);
  const temporary=mkdtempSync(join(realpathSync(tmpdir()),'safr-business-reader-test-'));
  try {
    const root=join(temporary,'bundle');mkdirSync(root);writeFileSync(join(root,'START_HERE_RU.md'),'synthetic source');
    const safe=createBusinessBundleReader(root);assert.equal(safe('START_HERE_RU.md').toString(),'synthetic source');
    symlinkSync(root,join(temporary,'linked-root'));assert.throws(()=>createBusinessBundleReader(join(temporary,'linked-root')),/symlink bundle root/);
    symlinkSync(join(root,'START_HERE_RU.md'),join(root,'CODEX_HANDOFF_RU.md'));assert.throws(()=>safe('CODEX_HANDOFF_RU.md'),/symlink bundle member/);
    const content=join(temporary,'content');mkdirSync(content);symlinkSync(content,join(root,'CONTENT'));
    assert.throws(()=>safe('CONTENT/RU/PT_PMA_RU_v1_REVIEW.md'),/symlink bundle member/);
  } finally {rmSync(temporary,{recursive:true,force:true});}
  const module=readFileSync(new URL('../scripts/import-business-bundle.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(module,/writeFile|mkdirSync|spawnSync|--apply|process\.argv|fetch\(/);
});
