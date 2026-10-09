import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {nextStageRoutes,nextStageIdentityBindings,planNextStageDraftImport} from "../scripts/import-next-stage-drafts.mjs";
import {validateAuthoredRegistry,readRegistry} from "../scripts/validate-service-registry.mjs";
import {bindAuthoredPrices} from "../../astro-site/scripts/registry-price-bindings.mjs";
import {parseEditorial} from "../../astro-site/scripts/registry-document.mjs";
const contentRoot=new URL("../content/",import.meta.url);
const readSource=file=>readFileSync(new URL(file,contentRoot));
const manifest=JSON.parse(readSource("next-stage-decisions.v1.json"));
const registry=readRegistry();
const history=JSON.parse(readFileSync(new URL("./fixtures/next-stage-146.superseded.v1.json",import.meta.url)));
const d12History=JSON.parse(readFileSync(new URL('./fixtures/next-stage-d12-e28a-preimport.v1.json',import.meta.url)));
const e33gHistory=JSON.parse(readFileSync(new URL('./fixtures/next-stage-e33g-preimport.v1.json',import.meta.url)));
// The five replaced records are copied from the exact preceding release,
// not manufactured by resetting approvals on the current content. Keep the
// compact snapshot in Git: CI must not depend on local/deep Git history.
function historical146() {
  assert.equal(history.schemaVersion,1);
  assert.equal(history.sourceRegistryRecordCount,146);
  assert.equal(registry.records.length,152);
  assert.equal(d12History.sourceRegistryRecordCount,149);
  assert.equal(d12History.sourceRegistrySha256,'f9d0feb8cf1d3f0c0cc5cf65b8877c0ad437edec6e5253d09c670634f4180fe0');
  assert.deepEqual(d12History.removeAddedContentIds,['d12_extension','knowledge_e28a_requirements','knowledge_e28a_extension']);
  assert.deepEqual(d12History.records.map(r=>r.contentId),['d12','investor','knowledge_d12_documents','knowledge_d12_180']);
  assert.deepEqual(history.removeAddedContentIds,["d1_d2_extension","knowledge_d1_d2_extension","knowledge_d1_d2_documents"]);
  assert.deepEqual(history.records.map(r=>r.contentId),["d1","d2","d1_d2","d1_extension","d2_extension"]);
  assert.equal(e33gHistory.sourceRegistryRecordCount,152);
  assert.equal(e33gHistory.sourceRegistrySha256,'3ecbaf57b48cd2b455da94093769b7f5358bcec8f616c3e3581e94cef772e3ff');
  assert.deepEqual(e33gHistory.records.map(r=>r.contentId),['e33g_next_term','knowledge_e33g_extension','e33g_conversion','employment_review']);
  const previous=structuredClone(registry),e33gReplacements=new Map(e33gHistory.records.map(r=>[r.contentId,r]));
  previous.records=previous.records.map(r=>structuredClone(e33gReplacements.get(r.contentId)??r));
  assert.equal(createHash('sha256').update(JSON.stringify(previous,null,2)+'\n').digest('hex'),e33gHistory.sourceRegistrySha256,
    'Only the four authorized E33G draft replacements may differ from exact pre-import152');
  const d12Replacements=new Map(d12History.records.map(r=>[r.contentId,r]));
  previous.records=previous.records.filter(r=>!d12History.removeAddedContentIds.includes(r.contentId))
    .map(r=>structuredClone(d12Replacements.get(r.contentId)??r));
  assert.equal(previous.records.length,149);
  assert.equal(createHash('sha256').update(JSON.stringify(previous,null,2)+'\n').digest('hex'),d12History.sourceRegistrySha256,
    'Pre-D12/E28A149 must reproduce verified HEAD bytes before historical146 replay');
  const replacements=new Map(history.records.map(r=>[r.contentId,r]));
  previous.records=previous.records.filter(r=>!history.removeAddedContentIds.includes(r.contentId))
    .map(r=>structuredClone(replacements.get(r.contentId)??r));
  assert.equal(previous.records.length,146);
  const bytes=JSON.stringify(previous,null,2)+"\n";
  assert.equal(history.sourceRegistrySha256,"c750f08eeabedab277d34d2ae3a2ed61facc763b57cf25917217e19631a38232");
  assert.equal(createHash("sha256").update(bytes).digest("hex"),history.sourceRegistrySha256,
    "Historical146 must reproduce exact preceding release bytes, not a permissive current replay");
  return previous;
}

test("historical146/15 content-addressed drafts reuse exact IDs/routes and recognized catalog tokens",()=>{
  const previous=historical146();
  const plan=planNextStageDraftImport(previous,manifest,readSource);
  assert.equal(plan.summary.importedDrafts,15);
  assert.equal(plan.registry.records.length,146);
  assert.equal(nextStageIdentityBindings(manifest).length,22);
  for(const entry of manifest.entries){
    const r=plan.registry.records.find(r=>r.contentId===entry.contentId),body=readSource(entry.bodyFile).toString();
    assert.equal(r.candidate.route,nextStageRoutes[entry.contentId]);
    assert.equal(r.candidate.revision,"sha256:"+entry.bodySha256);
    assert.equal(r.candidate.ru.status,"draft");assert.equal(r.candidate.exposure,"preview_only");
    const parsed=parseEditorial(body,{commercial:r.kind!=="knowledge"});
    assert(parsed.title&&parsed.seoTitle&&parsed.description&&parsed.direct&&parsed.fact.text);
    assert.doesNotThrow(()=>bindAuthoredPrices(body,{contentId:r.contentId}));
  }
  validateAuthoredRegistry(plan.registry);
  assert.deepEqual(planNextStageDraftImport(plan.registry,manifest,readSource).registry,plan.registry,"Idempotent import");
});
test("accepted content/public bindings preserved; business/documents have null Service IDs",()=>{
  const previous=historical146();
  const {registry:next}=planNextStageDraftImport(previous,manifest,readSource);
  const owned=new Set([...Object.keys(nextStageRoutes),"knowledge_e33g_requirements"]);
  for(const r of previous.records){
    const nextRecord=next.records.find(n=>n.contentId===r.contentId);
    assert.deepEqual(nextRecord.published,r.published,"Historical published bindings preserved");
    if(!owned.has(r.contentId))assert.deepEqual(nextRecord,r);
  }
  for(const id of ["business","documents"]){
    const r=next.records.find(r=>r.contentId===id);assert.equal(r.serviceId,null);assert.equal(r.pricingRef,null);
  }
  const duplicate=next.records.find(r=>r.contentId==="knowledge_e33g_requirements");
  assert.equal(duplicate.mergeTargetId,"knowledge_e33g_overview");
  assert.equal(duplicate.candidate.ru.bodyFile,null);assert.equal(duplicate.published,null);
  const partners=next.records.find(r=>r.contentId==="partners");
  assert(!partners.reuseRoutes.some(r=>r.startsWith("/account/")));
  assert.equal(manifest.deferredConcepts.privateReferral.status,"SHELL_APPROVED_TERMS_PENDING");
});
test("source changes invalidate translation QA without fabricating or rewriting artifacts",()=>{
  const previous=historical146(),withOld=structuredClone(previous),r=withOld.records.find(r=>r.contentId==="d1");
  r.candidate.translations.en={sourceRevision:"sha256:"+"1".repeat(64),status:"translated",complete:true,qa:"passed"};
  const {registry:next}=planNextStageDraftImport(withOld,manifest,readSource);
  assert.deepEqual(next.records.find(r=>r.contentId==="d1").candidate.translations.en,
    {sourceRevision:"sha256:"+"1".repeat(64),status:"stale",complete:false,qa:"not_done"});
  const wrong=structuredClone(manifest);wrong.entries[0].route="/bali/visas/another/";
  assert.throws(()=>planNextStageDraftImport(previous,wrong,readSource),error=>error.code==="ERR_ASSERTION" &&
    error.actual===wrong.entries[0].route && error.expected===nextStageRoutes[wrong.entries[0].contentId]);
  const badHash=structuredClone(manifest);badHash.entries[0].bodySha256="0".repeat(64);
  assert.throws(()=>planNextStageDraftImport(previous,badHash,readSource),/hash drift/);
  const badIdentity=structuredClone(manifest);badIdentity.pricingOperations.d1_extension.optionCodes=["new-unapproved"];
  assert.throws(()=>nextStageIdentityBindings(badIdentity),/Unapproved option identity/);
});

test("historical importer rejects current152 and independently rejects accepted D1/D2 even with146 count",()=>{
  const currentBefore=structuredClone(registry);
  assert.throws(()=>planNextStageDraftImport(registry,manifest,readSource),
    error=>error.code==="ERR_ASSERTION" && error.actual===152 && error.expected===146);
  assert.deepEqual(registry,currentBefore,"A failed current replay never edits input");
  for(const id of ["d1","d2"]){
    const previous=historical146(),r=previous.records.find(r=>r.contentId===id),accepted=registry.records.find(r=>r.contentId===id);
    assert.equal(accepted.candidate.ru.status,"owner_approved_semantics");
    r.candidate=structuredClone(accepted.candidate);
    const before=structuredClone(previous);
    assert.throws(()=>planNextStageDraftImport(previous,manifest,readSource),/Do not replace accepted copy with a draft/);
    assert.deepEqual(previous,before,"Accepted source/translation/approval pins stay intact on rejected replay");
  }
});
