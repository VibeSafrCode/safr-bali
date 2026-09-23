import assert from "node:assert/strict";
import test from "node:test";
import { emptyLifeDraft, validateLifeDraft, lifeWriteFields, lifeRentalSummary, lifeCardDate } from "../src/components/lifeServices";

test("monthly rentals publish without a return date but require a start", () => {
  for (const kind of ["housing", "bike"] as const) {
    const draft = { ...emptyLifeDraft(kind), title: "Rental", rental_mode: "monthly" as const, price_unit: "month" as const, start_date: "2026-09-23" };
    assert.deepEqual(validateLifeDraft(draft, "PUBLISHED", "ru"), {});
    assert.equal(lifeWriteFields(draft, "PUBLISHED").end_date, null);
    assert.equal(lifeWriteFields(draft, "PUBLISHED").price_unit, "month");
    assert.ok(validateLifeDraft({ ...draft, start_date: "" }, "PUBLISHED", "ru").start_date);
    assert.equal(lifeCardDate({ start_date: draft.start_date, end_date: null }, "2026-09-22").date, null);
  }
});

test("fixed rentals and insurance retain expiry validation; quantity is a positive integer", () => {
  assert.ok(validateLifeDraft({ ...emptyLifeDraft("bike"), title: "Bike" }, "PUBLISHED", "en").end_date);
  assert.ok(validateLifeDraft({ ...emptyLifeDraft("insurance"), rental_mode: "monthly" }, "PUBLISHED", "en").rental_mode);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) assert.ok(validateLifeDraft({ ...emptyLifeDraft("bike"), quantity }, "DRAFT", "en").quantity);
});

test("bike quantity does not multiply an agreed price; housing type survives the payload", () => {
  const bike = lifeWriteFields({ ...emptyLifeDraft("bike"), quantity: 3, price_amount: "2500000.00" }, "DRAFT");
  assert.equal(bike.quantity, 3);
  assert.equal(bike.price_amount, "2500000.00");
  assert.equal(lifeWriteFields({ ...emptyLifeDraft(), housing_type: "guesthouse" }, "DRAFT").housing_type, "guesthouse");
});
