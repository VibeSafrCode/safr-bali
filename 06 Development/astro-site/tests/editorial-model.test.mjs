import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { visaEditorial } from "../src/content/visa-editorial.mjs";
import { applyPublication, editorialVersion } from "../src/lib/public-publication.ts";
import { getPublicPages } from "../src/lib/public-catalog.ts";

const clock = new Date("2026-09-09T12:00:00Z");
const page = getPublicPages().find((p) => p.route === "/bali/visas/c1/");
const record = visaEditorial[page.route];

test("reviewed real bilingual content hashes bind copy, provenance, dates and price reference", () => {
  for (const [route, value] of Object.entries(visaEditorial)) for (const locale of ["ru", "en"]) {
    const raw = getPublicPages().find((p) => p.route === route);
    const result = applyPublication({ ...raw, route: locale === "en" ? `/en${route}` : route }, locale, clock);
    assert.equal(result.indexable, value.reviewStatus === "verified", `${route}:${locale}`);
    if (value.reviewStatus !== "verified") continue;
    assert.equal(editorialVersion(value, locale), value.reviewedVersion[locale]);
    for (const mutate of [
      (r) => { r.locales[locale].blocks[0].items[0].text += " edited"; },
      (r) => { r.sources[0].section += " edited"; },
      (r) => { r.reviewExpiresAt = "2027-09-09"; },
      (r) => { r.lastModified = "2026-09-08"; },
      (r) => { r.priceReference = { type: "VISA", key: "DIFFERENT" }; },
    ]) {
      const changed = structuredClone(value);
      mutate(changed);
      assert.notEqual(editorialVersion(changed, locale), value.reviewedVersion[locale]);
    }
  }
});

test("real publication expires and a body edit closes only its own locale and hub card claims", () => {
  assert.equal(applyPublication(page, "ru", new Date("2026-10-10")).publication.reason, "review_expired");
  const original = record.locales.ru.lead;
  try {
    record.locales.ru.lead = "Unreviewed replacement";
    assert.equal(applyPublication(page, "ru", clock).publication.reason, "content_changed_since_review");
    assert.equal(applyPublication({ ...page, route: `/en${page.route}` }, "en", clock).indexable, true);
    const hub = getPublicPages().find((p) => p.route === "/bali/visas/");
    assert.doesNotMatch(JSON.stringify(applyPublication(hub, "ru", clock).cards), /Unreviewed replacement/);
  } finally { record.locales.ru.lead = original; }
});

test("typed public visa content retains every block and separates legal thresholds from commercial prices", async () => {
  for (const [route, value] of Object.entries(visaEditorial)) for (const locale of ["ru", "en"]) {
    const prefix = locale === "en" ? "en/" : "";
    const html = await readFile(new URL(`../dist/${prefix}${route.slice(1)}index.html`, import.meta.url), "utf8");
    for (const block of value.locales[locale].blocks) {
      assert.ok(html.includes(`id="fact-${block.id}"`), `${route}: first and subsequent blocks survive`);
      for (const item of block.items) for (const id of item.sourceIds) {
        assert.ok(html.includes(`href="#source-${id}"`));
        assert.ok(html.includes(`id="source-${id}"`));
      }
    }
    const text = JSON.stringify(value.locales[locale]);
    assert.doesNotMatch(text, /(?:\d[\d., ]*)\s*IDR|(?:Rp\.?\s*)\d|2\.500\.000|13\.000\.000/);
    assert.ok(html.includes("<noscript>"));
    if (value.priceReference) {
      assert.ok(html.includes(`data-entity-key="${value.priceReference.key}"`));
    }
  }
  assert.match(JSON.stringify(record.locales), /2[ ,]000/);
  assert.match(JSON.stringify(visaEditorial["/bali/visas/e33g/"].locales), /60[ ,]000/);
});

test("a real available but thin route and missing ordinary locale fail closed", () => {
  const raw = getPublicPages().find((p) => p.route === "/bali/");
  assert.equal(applyPublication(raw, "en", clock, false).publication.reason, "locale_unavailable");
  const stub = getPublicPages().find((p) => p.route === "/nepal/transfer/");
  assert.equal(applyPublication(stub, "ru", clock).publication.reason, "insufficient_content");
});
