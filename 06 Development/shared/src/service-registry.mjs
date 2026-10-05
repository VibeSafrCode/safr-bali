// Content identities and visibility only. Pricing and live copy stay in their
// existing adapters. This module never creates business services or URLs.
import assert from "node:assert/strict";
import approvals from "../content/registry-approvals.v1.json" with {type: "json"};

export const PUBLIC_LOCALES = ["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"];
const exposures = ["preview_only", "public_noindex", "public_indexable"];
const pathPattern = /^\/(?:[a-z0-9-]+\/)*$/;
const fields = ["contentId", "kind", "title", "parentId", "relatedContentIds", "serviceId",
  "pricingRef", "bindingStatus", "availability", "bindingEvidence", "published",
  "candidate", "reuseRoutes", "mergeTargetId", "duplicateRisk", "release", "inlineLinkTargets"];
const text = (v) => typeof v === "string" && v.length > 0;
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label);

export function validateRegistry(registry, { prices = null, serviceSlugs = null } = {}) {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.serviceIdNamespace, "Service.slug");
  assert.deepEqual(registry.locales.map(x => x.code), PUBLIC_LOCALES);
  unique(registry.locales.map(x => x.prefix), "locale prefixes");
  assert.equal(registry.locales[0].prefix, "");
  assert.equal(registry.locales[1].prefix, "/en");
  assert.equal(registry.locales.find(x => x.code === "ar").dir, "rtl");
  assert.ok(registry.experimentalLocales.every(x => x.enabled === false));
  assert.ok(Array.isArray(registry.records));
  unique(registry.records.map(x => x.contentId), "content IDs");
  unique(registry.records.map(x => x.candidate.route), "candidate routes");
  const ids = new Set(registry.records.map(x => x.contentId));
  const reference = id => assert.ok(id === null || ids.has(id), `Unknown content ID: ${id}`);
  const publishedRoutes = [];
  for (const r of registry.records) {
    assert.deepEqual(Object.keys(r).sort(), [...fields].sort(), `record fields: ${r.contentId}`);
    assert.match(r.contentId, /^[a-z][a-z0-9_]*$/);
    assert.ok(text(r.title) && text(r.kind));
    reference(r.parentId); reference(r.mergeTargetId);
    assert.ok(Array.isArray(r.relatedContentIds));
    r.relatedContentIds.forEach(reference);
    assert.ok(Array.isArray(r.inlineLinkTargets));
    for (const target of r.inlineLinkTargets) {
      assert.deepEqual(Object.keys(target).sort(), ["contentId", "sourceRoute", "status"]);
      assert.match(target.sourceRoute, pathPattern);
      reference(target.contentId);
      if (target.contentId === null) assert.equal(target.status, "planned_unmapped");
      else {
        assert.equal(target.status, "resolved_content_id");
        assert.equal(registry.records.find(x => x.contentId === target.contentId).candidate.route, target.sourceRoute);
      }
    }
    assert.ok(r.serviceId === null || text(r.serviceId));
    if (r.serviceId && serviceSlugs) assert.ok(serviceSlugs.includes(r.serviceId), r.serviceId);
    assert.ok(["seed_confirmed", "unresolved", "not_applicable"].includes(r.bindingStatus));
    assert.equal(r.availability, "not_verified"); // seed is not live availability evidence
    assert.ok(Array.isArray(r.bindingEvidence) && r.bindingEvidence.every(text));
    assert.equal(r.release, "not_authorized");
    assert.ok(r.duplicateRisk === null || text(r.duplicateRisk));
    assert.ok(Array.isArray(r.reuseRoutes) && r.reuseRoutes.every(text));
    if (r.pricingRef) {
      assert.deepEqual(Object.keys(r.pricingRef).sort(), ["entityKey", "entityType", "optionCodes"]);
      assert.ok(["VISA", "SERVICE"].includes(r.pricingRef.entityType));
      assert.ok(r.serviceId && text(r.pricingRef.entityKey));
      assert.ok(r.pricingRef.optionCodes.length > 0);
      unique(r.pricingRef.optionCodes, "price variants");
      if (prices) for (const option of r.pricingRef.optionCodes) {
        assert.ok(prices.some(p => p.entity_type === r.pricingRef.entityType &&
          p.entity_key === r.pricingRef.entityKey && p.option_code === option), `Unresolved pricingRef: ${r.contentId}`);
      }
    }
    if (r.published) {
      assert.equal(r.published.source, "legacy_catalog");
      assert.deepEqual(Object.keys(r.published.routes).sort(), ["en", "ru"]);
      for (const route of Object.values(r.published.routes)) {
        assert.match(route, pathPattern); publishedRoutes.push(route);
      }
    }
    const c = r.candidate;
    assert.deepEqual(Object.keys(c).sort(), ["exposure", "revision", "route", "ru", "translations"]);
    assert.match(c.route, pathPattern);
    assert.ok(text(c.revision));
    assert.ok(exposures.includes(c.exposure));
    // T1 has no release authorization, regardless of editorial approval.
    assert.equal(c.exposure, "preview_only");
    const metadataFields = payload => Object.hasOwn(payload,"metadataFile") ? ["metadataFile","metadataSha256","sourceEnvelopeSha256"] : [];
    const checkMetadata = payload => {
      if(!Object.hasOwn(payload,"metadataFile"))return;
      assert.match(payload.metadataFile,/^registry-copy\/[a-z0-9_-]+\.meta\.json$/);
      assert.match(payload.metadataSha256,/^[a-f0-9]{64}$/);
      assert.match(payload.sourceEnvelopeSha256,/^[a-f0-9]{64}$/);
    };
    assert.deepEqual(Object.keys(c.ru).sort(), ["approvalEvidence", "approvalRevision", "bodyFile", "bodySha256", "status",...metadataFields(c.ru)].sort());
    checkMetadata(c.ru);
    assert.ok(["missing", "draft", "owner_approved_semantics", "legacy_preserved"].includes(c.ru.status));
    if (c.ru.bodyFile !== null) {
      assert.match(c.ru.bodyFile, /^registry-copy\/[a-z0-9_-]+\.md$/);
      assert.match(c.ru.bodySha256, /^[a-f0-9]{64}$/);
      assert.equal(c.revision, "sha256:" + c.ru.bodySha256, "RU revision must be content-addressed");
    } else assert.equal(c.ru.bodySha256, null);
    if (c.ru.status === "owner_approved_semantics") {
      assert.ok(text(c.ru.approvalEvidence));
      assert.equal(c.ru.approvalRevision, c.revision);
      assert.ok(approvals.entries.some(a => a.contentId === r.contentId && a.revision === c.revision &&
        a.public_content_sha256 === c.ru.bodySha256), "New RU content requires matching approval evidence");
    } else {
      assert.equal(c.ru.approvalEvidence, null); assert.equal(c.ru.approvalRevision, null);
    }
    for (const [locale, t] of Object.entries(c.translations)) {
      assert.ok(PUBLIC_LOCALES.includes(locale) && locale !== "ru");
      const payloadFields = ["bodyFile", "bodySha256", "qaEvidence", "qaMethod"];
      assert.deepEqual(Object.keys(t).sort(), ["complete", "qa", "sourceRevision", "status",
        ...(Object.hasOwn(t, "bodyFile") ? payloadFields : []),
        ...(Object.hasOwn(t, "qaFile") ? ["qaFile", "qaPage"] : []),...metadataFields(t)].sort());
      checkMetadata(t);
      if (Object.hasOwn(t, "bodyFile")) {
        assert.match(t.bodyFile, /^registry-copy\/[a-z0-9_-]+\.md$/);
        assert.match(t.bodySha256, /^[a-f0-9]{64}$/);
        assert.equal(t.qaMethod, "supplied_model_semantic");
        assert.ok(text(t.qaEvidence));
      }
      if (Object.hasOwn(t, "qaFile")) {
        assert.match(t.qaFile, /^registry-copy\/[a-z0-9_-]+\.json$/);
        assert.match(t.qaPage, /^[a-z0-9-]+\.md$/);
      }
      assert.ok(["missing", "translated", "stale"].includes(t.status));
      assert.ok(["not_done", "passed", "failed"].includes(t.qa));
      assert.equal(typeof t.complete, "boolean");
      assert.ok(text(t.sourceRevision));
      if (t.sourceRevision !== c.revision) {
        assert.equal(t.status, "stale"); assert.equal(t.qa, "not_done");
      }
      if (t.qa === "passed") {
        assert.equal(t.complete, true); assert.equal(t.sourceRevision, c.revision);
        assert.equal(t.status, "translated");
      }
    }
  }
  unique(publishedRoutes, "published route binding");
  unique(registry.traceability.originalIds, "original plan IDs");
  registry.traceability.originalIds.forEach(reference);
  for (const name of ["products", "capabilities", "additional"]) {
    unique(registry.traceability[name].map(x => x.id), name);
    registry.traceability[name].forEach(x => reference(x.contentId));
  }
  unique(registry.traceability.knowledgeTopics.map(x => x.number), "Knowledge topic numbers");
  registry.traceability.knowledgeTopics.forEach(x => reference(x.contentId));
  return { records: ids.size, publishedBindings: publishedRoutes.length, previewOnly: registry.records.length };
}

/** Preservation boundary: return original page objects, with no new routes,
 * copy, metadata, layout, price attributes or lead context. Candidate approval
 * cannot replace or downgrade an existing published version. */
export function preservePublishedPages(registry, pages, locale) {
  const routes = new Set(pages.map(p => p.route));
  for (const r of registry.records) {
    const route = r.published?.routes[locale];
    if (route) assert.ok(routes.has(route), `Missing legacy route: ${route}`);
  }
  return pages;
}

export function publishedTargets(registry, contentIds, locale, isIndexable = () => false) {
  // No candidate route fallback: future SEO/nav/related consumers share this gate.
  return contentIds.flatMap(id => {
    const route = registry.records.find(r => r.contentId === id)?.published?.routes[locale];
    return route && isIndexable(route) ? [{ contentId: id, route, locale }] : [];
  });
}

export function markTranslationsStale(record, nextRuRevision) {
  assert.ok(text(nextRuRevision));
  return { ...record, candidate: { ...record.candidate, revision: nextRuRevision,
    translations: Object.fromEntries(Object.entries(record.candidate.translations).map(([locale, t]) =>
      [locale, t.sourceRevision === nextRuRevision ? t : { ...t, status: "stale", qa: "not_done" }])) } };
}
