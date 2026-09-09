import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePublication } from "../src/lib/publication-policy.mjs";

const asOf = "2026-09-09T12:00:00Z";
const article = {
  publicationStatus: "published",
  reviewStatus: "not_required",
  requiresSources: false,
  hasSubstantialContent: true,
  locale: "ru",
  availableLocales: ["ru", "en"],
};
const reviewedArticle = {
  ...article,
  reviewStatus: "verified",
  requiresSources: true,
  reviewedAt: "2026-09-09",
  reviewExpiresAt: "2026-10-09",
  contentVersion: "sha256:actual-localized-body",
  reviewedVersion: "sha256:actual-localized-body",
  sources: [{ url: "https://www.imigrasi.go.id/wna/daftar-visa-indonesia/C1" }],
};
const evaluate = (changes = {}, base = reviewedArticle, clock = asOf) => evaluatePublication({ ...base, ...changes }, { asOf: clock });

test("publication is independent of review and availability", () => {
  assert.equal(evaluate().indexable, true);
  for (const publicationStatus of ["draft", "hidden", "archived", "unknown"]) {
    assert.equal(evaluate({ publicationStatus }).reason, "not_published");
  }
  assert.equal(evaluate({ availability: "soon" }).indexable, true);
  assert.equal(evaluate({ availability: "available", hasSubstantialContent: false }).reason, "insufficient_content");
});

test("both supported locales need their own available content, never a fallback", () => {
  for (const locale of ["ru", "en"]) {
    assert.equal(evaluate({ locale }).indexable, true);
    assert.equal(evaluate({ locale, availableLocales: [] }).reason, "locale_unavailable");
  }
  assert.equal(evaluate({ locale: "en", availableLocales: ["ru"] }).indexable, false);
  assert.equal(evaluate({ locale: "de", availableLocales: ["de"] }).indexable, false);
});

test("sensitive evidence cannot be bypassed with not_required or stale legacy status", () => {
  for (const reviewStatus of ["not_required", "legacy_needs_sources", "needs_review", "unknown"]) {
    assert.equal(evaluate({ reviewStatus }).reason, "review_required");
  }
  assert.equal(evaluate({}, article).indexable, true);
  assert.equal(evaluate({ requiresSources: undefined }, article).reason, "invalid_review_policy");
  assert.equal(evaluate({ reviewStatus: "needs_review" }, article).indexable, false);
});

test("all source URLs must be noncredential HTTPS URLs", () => {
  for (const url of ["http://example.com", "javascript:alert(1)", "//example.com", "https://user:secret@example.com", "https://user@example.com", "https://", " https://example.com", "https://example.com/\npath"]) {
    assert.equal(evaluate({ sources: [{ url }] }).reason, "invalid_sources", url);
  }
  assert.equal(evaluate({ sources: [] }).reason, "invalid_sources");
  assert.equal(evaluate({ sources: undefined }).reason, "invalid_sources");
  assert.equal(evaluate({ sources: [...reviewedArticle.sources, { url: "http://bad.example" }] }).indexable, false);
});

test("review dates are calendar-valid, ordered, present and not in the future", () => {
  for (const invalid of [undefined, "", "2026-02-30", "2026-13-01", "2026-09-09T25:00:00Z", "2026-09-09junk", "09/09/2026", "2026-09-09T12:00:00+00:00"]) {
    assert.equal(evaluate({ reviewedAt: invalid }).reason, "invalid_review_dates", String(invalid));
    assert.equal(evaluate({ reviewExpiresAt: invalid }).reason, "invalid_review_dates", String(invalid));
  }
  assert.equal(evaluate({ reviewedAt: "2026-09-10" }).reason, "review_in_future");
  assert.equal(evaluate({ reviewExpiresAt: "2026-09-08" }).reason, "invalid_review_dates");
  assert.equal(evaluate({ reviewedAt: "2024-02-29", reviewExpiresAt: "2026-10-09" }).indexable, true);
});

test("freshness boundaries are inclusive, with explicit UTC end-of-day expiry", () => {
  assert.equal(evaluate({ reviewExpiresAt: "2026-09-09" }).indexable, true);
  assert.equal(evaluate({ reviewExpiresAt: "2026-09-09" }, reviewedArticle, "2026-09-09T23:59:59.999Z").indexable, true);
  assert.equal(evaluate({ reviewExpiresAt: "2026-09-09" }, reviewedArticle, "2026-09-10").reason, "review_expired");
  assert.equal(evaluate({ reviewExpiresAt: asOf }).indexable, true);
  assert.equal(evaluate({ reviewExpiresAt: "2026-09-09T11:59:59.999Z" }).reason, "review_expired");
  assert.equal(evaluate({ reviewedAt: asOf }).indexable, true);
});

test("reviewed content version must equal the actual nonempty localized version", () => {
  for (const changes of [{ contentVersion: undefined }, { contentVersion: "" }, { contentVersion: " " }, { reviewedVersion: undefined }, { contentVersion: "sha256:edited" }, { contentVersion: "en-body", reviewedVersion: "ru-body" }]) {
    assert.equal(evaluate(changes).reason, "content_changed_since_review");
  }
});

test("lastmod is preserved only from a valid nonfuture content date", () => {
  for (const lastModified of ["2026-09-08", "2026-09-09T11:59:59.100Z"]) {
    assert.equal(evaluate({ lastModified }).lastmod, lastModified);
  }
  for (const lastModified of [undefined, "", "2026-02-30", "2026-09-10", "2026-09-09T12:00:00.001Z"]) {
    const result = evaluate({ lastModified });
    assert.equal(result.indexable, true);
    assert.equal(Object.hasOwn(result, "lastmod"), false);
  }
  assert.equal(Object.hasOwn(evaluate(), "lastmod"), false);
});

test("the evaluator requires an explicit valid clock and has no ambient time dependency", () => {
  for (const clock of [undefined, "2026-02-30", "invalid", new Date("invalid")]) {
    assert.equal(evaluatePublication(article, { asOf: clock }).reason, "invalid_evaluation_date");
  }
  assert.equal(evaluatePublication(article).indexable, false);
  assert.deepEqual(evaluate({}, reviewedArticle, new Date(asOf)), evaluate());
  assert.equal(evaluatePublication(null, { asOf }).reason, "not_published");
});
