import assert from "node:assert/strict";
import test from "node:test";
import { emptyLifeDraft, lifeCardDate, lifeDateLabel, lifeWriteFields, validateLifeDraft } from "../src/components/lifeServices";
import { clientServiceTypes } from "../src/components/lifeServiceTypes";

test("generic published service has a name, optional dates, and retains total and quantity", () => {
  const draft = { ...emptyLifeDraft("other"), title: "Airport assistance", quantity: 3, price_amount: "250000.00" };
  assert.deepEqual(validateLifeDraft(draft, "PUBLISHED", "en"), {});
  assert.ok(validateLifeDraft({ ...draft, title: " " }, "PUBLISHED", "en").title);
  const body = lifeWriteFields(draft, "PUBLISHED");
  assert.equal(body.quantity, 3);
  assert.equal(body.price_amount, "250000.00");
  assert.equal(body.start_date, null);
  assert.equal(body.end_date, null);
  assert.equal(lifeCardDate(body, "2026-09-29").date, null);
});

test("generic dates and monthly mode do not acquire insurance copy or an invented deadline", () => {
  const draft = { ...emptyLifeDraft("other"), title: "Monthly assistance", rental_mode: "monthly" as const, price_unit: "month" as const };
  assert.deepEqual(validateLifeDraft(draft, "PUBLISHED", "en"), {});
  assert.equal(lifeWriteFields(draft, "PUBLISHED").end_date, null);
  assert.equal(lifeDateLabel("other", "start", "en"), "Service starts");
  assert.equal(lifeDateLabel("other", "end", "ru"), "Окончание услуги");
  assert.ok(validateLifeDraft({ ...draft, start_date: "2026-10-01", end_date: "2026-09-30" }, "PUBLISHED", "en").end_date);
  assert.ok(validateLifeDraft({ ...draft, quantity: 0 }, "PUBLISHED", "en").quantity);
});

test("every add-menu type is explicitly supported and has an icon", () => {
  assert.deepEqual(clientServiceTypes.map(({kind}) => kind).sort(), ["bike", "housing", "insurance", "other"]);
  for (const {kind, icon} of clientServiceTypes) {
    assert.equal(emptyLifeDraft(kind).kind, kind);
    assert.ok(icon);
  }
});
