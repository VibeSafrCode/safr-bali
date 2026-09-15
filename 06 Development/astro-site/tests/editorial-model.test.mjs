import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { visaEditorial } from "../src/content/visa-editorial.mjs";
import { applyPublication, editorialVersion } from "../src/lib/public-publication.ts";
import { getPublicPages } from "../src/lib/public-catalog.ts";
import { localizedPage } from "../src/lib/public-i18n.ts";

const clock = new Date("2026-09-15T12:00:00Z");
const page = localizedPage(getPublicPages().find((p) => p.route === "/bali/visas/"), "ru");
const record = visaEditorial[page.route];

test("archived review hashes remain verifiable but cannot override Founder-approved publication", () => {
  for (const [route, value] of Object.entries(visaEditorial)) for (const locale of ["ru", "en"]) {
    const raw = getPublicPages().find((p) => p.route === route);
    const result = applyPublication(localizedPage(raw, locale), locale, clock);
    assert.equal(result.indexable, true, `${route}:${locale}`);
    assert.equal(result.publication.reason, "eligible_owner_approved");
    assert.equal(result.editorial, undefined);
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

test("archived audit expiry and edits cannot replace the catalog or close indexing", () => {
  assert.equal(applyPublication(page, "ru", new Date("2026-10-10")).publication.reason, "eligible_owner_approved");
  const original = record.locales.ru.lead;
  try {
    record.locales.ru.lead = "Unreviewed replacement";
    assert.equal(applyPublication(page, "ru", clock).publication.reason, "eligible_owner_approved");
    const hub = getPublicPages().find((p) => p.route === "/bali/visas/");
    assert.equal(applyPublication(localizedPage(hub, "en"), "en", clock).indexable, true);
    assert.doesNotMatch(JSON.stringify(applyPublication(localizedPage(hub, "ru"), "ru", clock).cards), /Unreviewed replacement/);
  } finally { record.locales.ru.lead = original; }
});

test("all client routes exclude audit panels while retaining approved visa copy", async () => {
  for (const { route } of getPublicPages()) for (const locale of ["ru", "en"]) {
    const prefix = locale === "en" ? "en/" : "";
    const html = await readFile(new URL(`../dist/${prefix}${route.slice(1)}index.html`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /data-editorial-content|data-source-review|editorial-provenance|source-review-notice/, `${route}:${locale}`);
    assert.doesNotMatch(html, /Что проверено|Источники и ограничения|Другие категории ожидают проверки|Сравните первоначальное пребывание/, `${route}:${locale}`);
  }
  assert.match(JSON.stringify(visaEditorial["/bali/visas/c1/"].locales), /2[ ,]000/);
  assert.match(JSON.stringify(visaEditorial["/bali/visas/e33g/"].locales), /60[ ,]000/);
});

test("a real available but thin route and missing ordinary locale fail closed", () => {
  const raw = getPublicPages().find((p) => p.route === "/bali/");
  assert.equal(applyPublication(raw, "en", clock, false).publication.reason, "locale_unavailable");
  const stub = getPublicPages().find((p) => p.route === "/nepal/transfer/");
  assert.equal(applyPublication(stub, "ru", clock).publication.reason, "insufficient_content");
});

test("unproven Founder-copy changes stop a candidate instead of shipping a noindex replacement", () => {
  const raw = getPublicPages().find((p) => p.route === "/bali/visas/e33g/");
  assert.throws(() => applyPublication(raw, "ru", new Date("2026-09-14")), /Founder-approved visa publication drift.*approval_in_future/);
  assert.throws(() => applyPublication(raw, "ru", clock, false), /Founder-approved visa publication drift.*locale_unavailable/);
  assert.equal(applyPublication(raw, "ru", clock).indexable, true);
  assert.throws(() => applyPublication({ ...page, lead: "Unexpected replacement" }, "ru", clock), /Founder-approved visa publication drift/);
});
