import assert from "node:assert/strict";
import test from "node:test";
import { visaDatePresentation } from "../src/components/VisaCabinet";
import type { VisaStayEstimateSlot } from "../src/api/types";

const entrySlot: VisaStayEstimateSlot = { purpose: "INITIAL", state: "READY", estimated: true, provenance: "administrator_provisional", confirmation_required: true,
  base: "2026-10-10", estimated_end: "2027-10-10", base_provenance: "client_report", calculated_from_entry_report: true,
  rule: { rule_id: "provisional:" + "a".repeat(64), version: 1, variant_id: "manual-initial-day-365", unit: "day", duration: 365, counting_policy: "base_excluded", month_end_policy: "clamp" } };
const enteredEstimate = { entered_on: "2026-10-10", entry_deadline: "2026-11-01", stay_end: null, expected_stay_end: null, lifecycle_status: "ISSUED_NOT_ACTIVATED",
  stay_estimates: { initial: entrySlot, extension: { purpose: "EXTENSION", state: "NOT_SELECTED", estimated: true, base: null, estimated_end: null } as VisaStayEstimateSlot } };

test("entered visa uses the confirmed stay end only", () => {
  assert.deepEqual(visaDatePresentation({ entered_on: "2026-08-20", entry_deadline: "2026-08-10", stay_end: "2026-09-20", expected_stay_end: "2026-09-18" }, "ru"), {
    label: "Разрешено находиться до",
    value: "2026-09-20",
    estimated: false,
  });
});

test("visa not entered uses the confirmed entry deadline", () => {
  assert.deepEqual(visaDatePresentation({ entered_on: null, entry_deadline: "2026-10-05", stay_end: null, expected_stay_end: "2026-11-04" }, "en"), {
    label: "Enter by",
    value: "2026-10-05",
    estimated: false,
  });
});

test("saved confirmed stay end stays visible when entry has not been recorded", () => {
  const item = { entered_on: null, entry_deadline: null, stay_end: "2027-09-19", expected_stay_end: null };
  const before = JSON.stringify(item);
  assert.deepEqual(visaDatePresentation(item, "ru"), {
    label: "Разрешено находиться до", value: "2027-09-19", estimated: false,
  });
  assert.equal(JSON.stringify(item), before, "Presentation must not invent an entry date");
});

test("an extension forecast does not hide a saved confirmed stay end without entry", () => {
  assert.deepEqual(visaDatePresentation({ entered_on: null, entry_deadline: null, stay_end: "2026-10-05", expected_stay_end: "2027-10-05" }, "en"), {
    label: "Permitted to stay until", value: "2026-10-05", estimated: false,
  });
});

test("expected stay end is explicit and never presented as confirmed", () => {
  assert.deepEqual(visaDatePresentation({ entered_on: "2026-08-20", entry_deadline: null, stay_end: null, expected_stay_end: "2026-09-19" }, "ru"), {
    label: "Предварительно — находиться до",
    value: "2026-09-19",
    estimated: true,
  });
  assert.equal(visaDatePresentation({ entered_on: null, entry_deadline: null, stay_end: null, expected_stay_end: null }, "en"), null);
});

test("the saved INITIAL rule gives an explicitly estimated entry-based date, without requiring legal activation", () => {
  assert.deepEqual(visaDatePresentation(enteredEstimate, "en"), { label: "Estimated stay until", value: "2027-10-10", estimated: true, basis: "entry_estimate" });
  assert.deepEqual(visaDatePresentation({ ...enteredEstimate, stay_end: "2027-10-09" }, "en"), { label: "Permitted to stay until", value: "2027-10-09", estimated: false });
  assert.equal(visaDatePresentation({ ...enteredEstimate, entered_on: null }, "en")?.value, "2026-11-01");
});

test("stale base, malformed or unconfirmed slot and terminal lifecycle cannot provide an entry estimate", () => {
  for (const changed of [{ ...enteredEstimate, entered_on: "2026-10-11" }, { ...enteredEstimate, lifecycle_status: "EXPIRED" },
    { ...enteredEstimate, lifecycle_status: "CANCELLED" },
    { ...enteredEstimate, stay_estimates: { ...enteredEstimate.stay_estimates, initial: { ...entrySlot, state: "RECALC_REQUIRED" as const } } },
    { ...enteredEstimate, stay_estimates: { ...enteredEstimate.stay_estimates, initial: { ...entrySlot, confirmation_required: false } } },
    { ...enteredEstimate, stay_estimates: { ...enteredEstimate.stay_estimates, initial: { ...entrySlot, rule: null } } }])
    assert.equal(visaDatePresentation(changed, "en"), null);
});
