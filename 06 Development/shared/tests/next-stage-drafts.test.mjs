import assert from "node:assert/strict";
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

test("15 content-addressed drafts reuse exact IDs/routes and recognized catalog tokens",()=>{
  const plan=planNextStageDraftImport(registry,manifest,readSource);
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
  const {registry:next}=planNextStageDraftImport(registry,manifest,readSource);
  const owned=new Set([...Object.keys(nextStageRoutes),"knowledge_e33g_requirements"]);
  for(const r of registry.records)if(!owned.has(r.contentId))assert.deepEqual(next.records.find(n=>n.contentId===r.contentId),r);
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
  const withOld=structuredClone(registry),r=withOld.records.find(r=>r.contentId==="d1");
  r.candidate.translations.en={sourceRevision:"sha256:"+"1".repeat(64),status:"translated",complete:true,qa:"passed"};
  const {registry:next}=planNextStageDraftImport(withOld,manifest,readSource);
  assert.deepEqual(next.records.find(r=>r.contentId==="d1").candidate.translations.en,
    {sourceRevision:"sha256:"+"1".repeat(64),status:"stale",complete:false,qa:"not_done"});
  const wrong=structuredClone(manifest);wrong.entries[0].route="/bali/visas/another/";
  assert.throws(()=>planNextStageDraftImport(registry,wrong,readSource));
  const badHash=structuredClone(manifest);badHash.entries[0].bodySha256="0".repeat(64);
  assert.throws(()=>planNextStageDraftImport(registry,badHash,readSource),/hash drift/);
  const badIdentity=structuredClone(manifest);badIdentity.pricingOperations.d1_extension.optionCodes=["new-unapproved"];
  assert.throws(()=>nextStageIdentityBindings(badIdentity),/Unapproved option identity/);
});
