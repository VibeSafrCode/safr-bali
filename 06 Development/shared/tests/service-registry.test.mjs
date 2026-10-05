import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRegistry, preservePublishedPages, publishedTargets, markTranslationsStale } from "../src/service-registry.mjs";
import { readRegistry, validateAuthoredRegistry } from "../scripts/validate-service-registry.mjs";

const registry = readRegistry();
test("all SYNC-2 records/source mappings resolve; exact body hashes and existing pricing refs validate", () => {
  assert.deepEqual(validateAuthoredRegistry(), {records:146, publishedBindings:44, previewOnly:146});
  assert.equal(registry.traceability.originalIds.length, 102);
  assert.equal(registry.traceability.products.length, 68);
  assert.equal(registry.traceability.capabilities.length, 81);
  assert.equal(registry.traceability.additional.length, 8);
  assert.equal(registry.traceability.knowledgeTopics.length, 50);
  assert.equal(new Set(registry.traceability.knowledgeTopics.map(x => x.contentId)).size, 48);
});
test("T1 is fail-closed for malformed IDs, publication flags and internal price fields", () => {
  for (const mutate of [
    r => r.records.push(r.records[0]),
    r => {r.records[0].candidate.route = "/%2e%2e/private/"},
    r => {r.records[0].relatedContentIds = ["not_real"]},
    r => {r.records[0].candidate.exposure = "public_indexable"},
    r => {r.records[0].published.routes.de = "/de/"},
    r => {r.records[0].amount_idr = 100},
    r => {r.records.find(x => x.contentId === "voa").pricingRef.formula = "new formula"},
    r => {r.records[0].candidate.ru.bodyFile = "../private.md"},
    r => {r.records[0].availability = "available"},
    r => {r.records[0].release = "published"},
  ]) {const copy = structuredClone(registry); mutate(copy); assert.throws(() => validateRegistry(copy));}
});
test("a second business ID or an invented subtype option is rejected by repository evidence", () => {
  const prices = JSON.parse(readFileSync(new URL("../../backend/app/data/catalog_price_seed.v1.json", import.meta.url))).items;
  const copy = structuredClone(registry);
  copy.records.find(x => x.contentId === "voa").pricingRef.optionCodes = ["invented-extension"];
  assert.throws(() => validateRegistry(copy, {prices}));
  const copy2 = structuredClone(registry);
  copy2.records.find(x => x.contentId === "voa").serviceId = "voa-page-created-operation";
  assert.throws(() => validateRegistry(copy2, {serviceSlugs:["visa","housing","bike","transfer","visa-extension"]}));
});
test("extension approval is separate from subtype pricing, release and availability", () => {
  for (const id of ["voa_extension", "c1_extension"]) {
    const r = registry.records.find(x => x.contentId === id);
    assert.equal(r.serviceId, "visa-extension");
    assert.deepEqual(r.pricingRef, {
      entityType: "SERVICE", entityKey: "visa-extension",
      optionCodes: [id === "voa_extension" ? "voa-extension" : "c1-extension"],
    });
    assert.equal(r.published, null); assert.equal(r.candidate.exposure, "preview_only");
  }
  assert.equal(registry.records.find(x=>x.contentId==="voa_extension").candidate.ru.status, "owner_approved_semantics");
  assert.equal(registry.records.find(x=>x.contentId==="c1_extension").candidate.ru.status, "owner_approved_semantics");
  assert.equal(registry.records.find(x=>x.contentId==="knowledge_c1_overview").candidate.ru.status, "owner_approved_semantics");
});
test("approved C1 delta stays a candidate; inline links use IDs, unmapped KITAS is not a public route", () => {
  const c1 = registry.records.find(r => r.contentId === "c1");
  assert.equal(c1.candidate.ru.status, "owner_approved_semantics");
  assert.equal(c1.candidate.exposure,"preview_only");
  assert.equal(c1.published.routes.ru,"/bali/visas/c1/");
  assert.equal(c1.pricingRef.entityKey,"C1");
  const pending = c1.inlineLinkTargets.find(x => x.status === "planned_unmapped");
  assert.equal(pending.contentId,null);
  assert.equal(pending.sourceRoute,"/bali/knowledge/kitas-indonesia/");
  assert.deepEqual(publishedTargets(registry,c1.relatedContentIds,"ru",()=>true).map(x=>x.contentId),["d12","e33g"]);
});
test("drafts cannot enter related/nav/sitemap/hreflang projection; existing targets require current policy", () => {
  assert.deepEqual(publishedTargets(registry, ["voa", "voa_extension", "knowledge_c1_overview"], "en", () => true),
    [{contentId:"voa", route:"/en/bali/visas/voa/", locale:"en"}]);
  assert.deepEqual(publishedTargets(registry, ["voa"], "ar"), []);
  assert.deepEqual(publishedTargets(registry, ["voa"], "ru", () => false), []);
  assert.deepEqual(publishedTargets(registry, ["privacy", "all_indonesia", "voa"], "ru"), []);
});
test("editing approved body/hash/revision cannot inherit old semantic approval or translation QA", () => {
  const copy = structuredClone(registry);
  const r = copy.records.find(x => x.contentId === "voa_extension");
  r.candidate.ru.bodySha256 = "a".repeat(64);
  r.candidate.revision = "sha256:" + r.candidate.ru.bodySha256;
  r.candidate.ru.approvalRevision = r.candidate.revision;
  assert.throws(() => validateRegistry(copy));
  const copy2 = structuredClone(registry);
  copy2.records[0].candidate.translations.en = {
    sourceRevision:"previous-ru-revision", status:"translated", complete:true, qa:"not_done",
  };
  assert.throws(() => validateRegistry(copy2));
});
test("RU revision invalidates only dependent drafts, never replaces or downgrades live binding", () => {
  const r = structuredClone(registry.records.find(x => x.contentId === "voa"));
  r.candidate.translations.en = {sourceRevision:r.candidate.revision, status:"translated", complete:true, qa:"passed"};
  const next = markTranslationsStale(r, "new-ru-revision");
  assert.equal(next.candidate.translations.en.status, "stale");
  assert.equal(next.candidate.translations.en.qa, "not_done");
  assert.equal(r.candidate.translations.en.status, "translated");
  assert.deepEqual(next.published, r.published);
  assert.deepEqual(next.pricingRef, r.pricingRef);
  const pages = registry.records.filter(x=>x.published).map(x=>({route:x.published.routes.ru, body:"unchanged"}));
  assert.equal(preservePublishedPages({...registry, records:registry.records.map(x=>x.contentId==="voa"?next:x)}, pages, "ru"), pages);
});
