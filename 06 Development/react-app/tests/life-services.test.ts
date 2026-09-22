import assert from "node:assert/strict";
import test from "node:test";
import { baliToday, emptyLifeDraft, formatLifeDate, formatLifePrice, lifeGroup, lifeStatus, lifeWriteFields, safeLifeUrl, validateLifeDraft } from "../src/components/lifeServices";

test("Bali calendar date changes at UTC 16:00 regardless of device timezone", () => {
  assert.equal(baliToday(new Date("2026-09-22T15:59:59Z")), "2026-09-22");
  assert.equal(baliToday(new Date("2026-09-22T16:00:00Z")), "2026-09-23");
  assert.match(formatLifeDate("2026-09-23", "en"), /23 September 2026/);
});

test("end date today stays in current dates and has an explicit return label", () => {
  const bike = { kind: "bike" as const, start_date: "2026-09-01", end_date: "2026-09-22" };
  assert.equal(lifeGroup(bike, "2026-09-22"), "current");
  assert.equal(lifeStatus(bike, "2026-09-22", "ru"), "Возврат сегодня");
  assert.equal(lifeGroup(bike, "2026-09-23"), "history");
  assert.equal(lifeGroup({ start_date: "2026-09-23", end_date: "2026-10-23" }, "2026-09-22"), "future");
});

test("insurance without a known start never claims coverage is active", () => {
  assert.equal(lifeStatus({ kind: "insurance", start_date: null, end_date: "2027-01-01" }, "2026-09-22", "en"), "Policy end date");
});

test("prices retain exact decimals and distinguish empty price from zero", () => {
  const price = { price_amount: null, price_currency: "IDR" as const, price_unit: "month" as const };
  assert.equal(formatLifePrice(price, "en"), null);
  assert.equal(formatLifePrice({ ...price, price_amount: "0.00" }, "en"), "Rp 0.00 per month");
  assert.equal(formatLifePrice({ ...price, price_amount: "99999999999999.99" }, "en"), "Rp 99,999,999,999,999.99 per month");
  assert.equal(lifeWriteFields(emptyLifeDraft(), "DRAFT").price_amount, null);
});

test("external links accept only absolute credential-free http(s)", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "//example.com", "https://user:pass@example.com", "https://example.com\\evil", "https://example.com/ a", "https:\n//example.com"]) assert.equal(safeLifeUrl(value), null, value);
  assert.equal(safeLifeUrl("https://example.com/villa?x=1"), "https://example.com/villa?x=1");
});

test("partial drafts save while publishing identifies every required field", () => {
  const draft = emptyLifeDraft();
  assert.deepEqual(validateLifeDraft(draft, "DRAFT", "en"), {});
  assert.deepEqual(Object.keys(validateLifeDraft(draft, "PUBLISHED", "en")).sort(), ["end_date", "start_date", "title"]);
  assert.deepEqual(Object.keys(validateLifeDraft(emptyLifeDraft("insurance"), "PUBLISHED", "en")).sort(), ["end_date", "title"]);
  assert.ok(validateLifeDraft({ ...draft, start_date: "2026-10-01", end_date: "2026-09-01" }, "DRAFT", "en").end_date);
  assert.ok(validateLifeDraft({ ...draft, price_amount: "100.001" }, "DRAFT", "en").price_amount);
});
