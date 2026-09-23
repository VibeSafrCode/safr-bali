import assert from "node:assert/strict";
import test from "node:test";
import { changeRentalMode } from "../src/components/life-editor";
import { emptyLifeDraft, lifeWriteFields, validateLifeDraft } from "../src/components/lifeServices";
import { queryFor } from "../src/components/AdminUsers";

test("monthly switch clears hidden expiry and keeps total agreed bike price unchanged", () => {
  const draft = { ...emptyLifeDraft("bike"), title: "Honda PCX", start_date: "2026-09-23", end_date: "2026-10-23", quantity: 3, price_amount: "6000000" };
  const monthly = changeRentalMode(draft, "monthly");
  assert.equal(monthly.end_date, "");
  assert.equal(monthly.price_unit, "month");
  assert.deepEqual(validateLifeDraft(monthly, "PUBLISHED", "ru"), {});
  const payload = lifeWriteFields(monthly, "PUBLISHED");
  assert.equal(payload.end_date, null);
  assert.equal(payload.price_amount, "6000000");
  assert.equal(payload.quantity, 3);
  const fixed = changeRentalMode(monthly, "fixed");
  assert.ok(validateLifeDraft(fixed, "PUBLISHED", "ru").end_date);
});

test("bike quantity rejects blank, negative and fractional input", () => {
  for (const quantity of [0, -1, 1.5, NaN]) assert.ok(validateLifeDraft({ ...emptyLifeDraft("bike"), quantity }, "DRAFT", "en").quantity);
});

test("reselecting monthly preserves an existing optional end date and price basis", () => {
  const draft = { ...emptyLifeDraft("housing"), rental_mode: "monthly" as const, end_date: "2027-03-23", price_unit: "period" as const, price_amount: "25000000" };
  assert.equal(changeRentalMode(draft, "monthly"), draft);
  const payload = lifeWriteFields({ ...changeRentalMode(draft, "monthly"), description: "Updated description" }, "DRAFT");
  assert.equal(payload.end_date, "2027-03-23");
  assert.equal(payload.price_unit, "period");
  assert.equal(payload.price_amount, "25000000");
});

test("services filter is sent server-side and excludes no-services", () => {
  const base = { search: "", hasVisas: false, expiry: "" as const, neverDialogued: false, noServices: false, hasServices: false, serviceCategory: "", sort: "joined_desc" as const, page: 1 };
  assert.equal(queryFor({ ...base, hasServices: true }).toString(), "has_services=true");
  assert.equal(queryFor({ ...base, noServices: true }).toString(), "no_services=true");
  assert.equal(queryFor({ ...base, hasServices: true, noServices: true }).toString(), "has_services=true");
  assert.equal(queryFor(base).toString(), "");
});
