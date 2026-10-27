import assert from "node:assert/strict";
import test from "node:test";
import { adminStayPeriodPreset, presetAdminStaySelection, e33g365Selection, newAdminStaySelection, prepareAdminStaySelection, readyAdminStayEstimate, savedAdminStayRule, stayDate } from "../src/components/adminVisaStaySelection";

const item = { id: 31, version: 4, country_code: "ID", lifecycle_status: "ACTIVE", visa_type: { id: 2, version: 3, code: "E33G" }, entered_on: "2026-10-02", stay_end: "2027-10-01" };
const chosen = () => ({ ...e33g365Selection(item, "INITIAL")!, acknowledged: true });
const rule = { rule_id: "provisional:" + "a".repeat(64), version: 1, variant_id: "manual-initial-day-365", unit: "day" as const,
  duration: 365, counting_policy: "base_excluded" as const, month_end_policy: "clamp" as const };

test("KEEP sends no command, SELECT is exact type/version-bound and never a confirmed-date patch", () => {
  assert.equal(prepareAdminStaySelection(newAdminStaySelection(item), item), undefined);
  assert.deepEqual(prepareAdminStaySelection(chosen(), item), {
    action: "SELECT", purpose: "INITIAL", visa_type_id: 2, visa_type_version: 3,
    variant_id: "manual-initial-day-365", unit: "day", duration: 365, counting_policy: "base_excluded",
    month_end_policy: "clamp", effective_from: "2026-10-02", effective_until: null,
  });
  assert.equal(item.stay_end, "2027-10-01");
});

test("preset only exists for exact E33G initial, is not acknowledged or selected by default", () => {
  assert.equal(newAdminStaySelection(item).action, "KEEP");
  assert.equal(e33g365Selection(item, "INITIAL")!.acknowledged, false);
  assert.equal(e33g365Selection(item, "EXTENSION"), null);
  assert.equal(e33g365Selection({ ...item, visa_type: { ...item.visa_type, code: "OTHER" } }, "INITIAL"), null);
});

test("all case/type identity changes and missing legacy type identity block a command", () => {
  for (const changed of [
    { ...item, id: 32 }, { ...item, version: 5 },
    { ...item, visa_type: { ...item.visa_type, id: 3 } },
    { ...item, visa_type: { ...item.visa_type, version: 4 } },
    { ...item, country_code: "TH" },
    { ...item, visa_type: { ...item.visa_type, code: "C1" } },
    { ...item, visa_type: { code: "E33G" } },
  ]) assert.throws(() => prepareAdminStaySelection(chosen(), changed), /CONTEXT_REQUIRED/);
});

test("exact Indonesian presets only fill an unacknowledged stage draft, not legal dates", () => {
  for (const [code, days] of [["D12", 180], ["D1/D2", 60], ["C1", 60], ["VOA", 30]] as const) {
    const record = { ...item, visa_type: { ...item.visa_type, code } };
    for (const purpose of ["INITIAL", "EXTENSION"] as const) {
      const draft = presetAdminStaySelection(record, purpose)!;
      assert.equal(adminStayPeriodPreset(record, purpose)?.days, days);
      assert.equal(draft.duration, String(days)); assert.equal(draft.unit, "day");
      assert.equal(draft.acknowledged, false);
      assert.equal(draft.effectiveFrom, purpose === "INITIAL" ? record.entered_on : record.stay_end);
      assert.equal(draft.counting, purpose === "INITIAL" ? "" : "base_excluded");
      assert.throws(() => prepareAdminStaySelection({ ...draft, acknowledged: true, counting: "" }, record), /COUNTING_REQUIRED/);
      assert.throws(() => prepareAdminStaySelection({ ...draft, counting: "base_excluded" }, record), /ACKNOWLEDGEMENT_REQUIRED/);
      const command = prepareAdminStaySelection({ ...draft, counting: "base_excluded", acknowledged: true }, record)!;
      assert.equal(command.action === "SELECT" && command.duration, days);
      assert.equal(Object.hasOwn(command, "stay_end"), false);
    }
    assert.equal(record.entered_on, item.entered_on); assert.equal(record.stay_end, item.stay_end);
    assert.equal(record.lifecycle_status, "ACTIVE");
  }
  assert.equal(presetAdminStaySelection(item, "EXTENSION"), null); // Do not invent E33G extension length.
});

test("no prefix/display-name/country/legacy/invalid identity can acquire a preset", () => {
  for (const code of ["FAMILY", "OTHER", "D1", "D2", "D12A", "C12", "C1A", "B1", "e33g", "E33G ", "E33G-extra", "__proto__"]) {
    const record = { ...item, visa_type: { ...item.visa_type, code, name: "ITAS E33G 365 days", initial_stay_days: 365 } };
    assert.equal(adminStayPeriodPreset(record, "INITIAL"), null);
    assert.equal(presetAdminStaySelection(record, "EXTENSION"), null);
  }
  for (const country_code of ["TH", "id", "", undefined])
    assert.equal(presetAdminStaySelection({ ...item, country_code }, "INITIAL"), null);
  for (const version of [0, -1, NaN, 1.5])
    assert.equal(presetAdminStaySelection({ ...item, version }, "INITIAL"), null);
  assert.equal(presetAdminStaySelection({ ...item, visa_type: { ...item.visa_type, id: undefined } }, "INITIAL"), null);
  assert.equal(presetAdminStaySelection({ ...item, visa_type: { ...item.visa_type, version: 0 } }, "INITIAL"), null);
  for (const lifecycle_status of ["EXPIRED", "CANCELLED", "REFUSED"])
    assert.equal(presetAdminStaySelection({ ...item, lifecycle_status }, "INITIAL"), null);
});

test("missing bases are never replaced by today and total limits never become extension amounts", () => {
  const record = { ...item, entered_on: null, stay_end: null, visa_type: { ...item.visa_type, code: "C1" } };
  for (const purpose of ["INITIAL", "EXTENSION"] as const) {
    const draft = presetAdminStaySelection(record, purpose)!;
    assert.equal(draft.effectiveFrom, ""); assert.equal(draft.duration, "60");
    assert.throws(() => prepareAdminStaySelection({ ...draft, counting: "base_excluded", acknowledged: true }, record), /INTERVAL_REQUIRED/);
  }
  const slot = { purpose: "INITIAL" as const, state: "INVALID_SNAPSHOT" as const, estimated: true as const, base: null, estimated_end: null };
  assert.equal(presetAdminStaySelection({ ...item, stay_estimates: { initial: slot, extension: { ...slot, purpose: "EXTENSION" } } }, "INITIAL"), null);
});

test("reject invalid periods, omitted counting/ack and calendar month-end policy", () => {
  for (const duration of ["", "0", "-1", "1.5", "3e2", "0365", "36501", "999999999999999999999"])
    assert.throws(() => prepareAdminStaySelection({ ...chosen(), duration }, item), /PERIOD_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), counting: "" }, item), /COUNTING_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), acknowledged: false }, item), /ACKNOWLEDGEMENT_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), unit: "year", duration: "1", monthEnd: "" }, item), /MONTH_END_REQUIRED/);
  const year = prepareAdminStaySelection({ ...chosen(), unit: "year", duration: "1", monthEnd: "reject" }, item)!;
  assert.equal(year.action === "SELECT" && year.unit, "year");
  assert.equal(year.action === "SELECT" && year.duration, 1);
});

test("strict date-only and effective base interval; no today fallback", () => {
  for (const value of ["2026-02-29", "0000-01-01", "2026-1-01", "2026-10-02T00:00:00Z", "", null]) assert.equal(stayDate(value), false);
  assert.equal(stayDate("2024-02-29"), true);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), effectiveFrom: "" }, item), /INTERVAL_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), effectiveUntil: "2026-10-01" }, item), /INTERVAL_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...chosen(), effectiveFrom: "2026-10-03" }, item), /BASE_REVIEW_REQUIRED/);
  const noEntry = { ...item, entered_on: null };
  const draft = { ...e33g365Selection(noEntry, "INITIAL")!, acknowledged: true };
  assert.equal(draft.effectiveFrom, "");
  assert.throws(() => prepareAdminStaySelection(draft, noEntry), /INTERVAL_REQUIRED/);
  assert.equal(prepareAdminStaySelection({ ...draft, effectiveFrom: "2026-01-01" }, noEntry)?.action, "SELECT");
});

test("extension has its own base and cannot count current expiry twice", () => {
  const draft = { ...newAdminStaySelection(item, "EXTENSION"), action: "SELECT" as const,
    duration: "60", counting: "base_excluded" as const, acknowledged: true };
  assert.equal(draft.effectiveFrom, item.stay_end);
  assert.equal(prepareAdminStaySelection(draft, item)?.purpose, "EXTENSION");
  assert.throws(() => prepareAdminStaySelection({ ...draft, counting: "base_included" }, item), /COUNTING_REQUIRED/);
  assert.throws(() => prepareAdminStaySelection({ ...draft, effectiveFrom: "2027-10-02" }, item), /BASE_REVIEW_REQUIRED/);
});

test("CLEAR serializes only action and purpose; malformed/type-changed saved slots fail closed", () => {
  const draft = { ...chosen(), action: "CLEAR" as const };
  assert.deepEqual(prepareAdminStaySelection(draft, item), { action: "CLEAR", purpose: "INITIAL" });
  for (const state of ["INVALID_SNAPSHOT", "REVIEW_REQUIRED"] as const) {
    const slot = { purpose: "INITIAL" as const, state, estimated: true as const, base: null, estimated_end: null };
    const changed = { ...item, stay_estimates: { initial: slot, extension: { ...slot, purpose: "EXTENSION" as const } } };
    assert.throws(() => prepareAdminStaySelection(draft, changed), /SAVED_REVIEW_REQUIRED/);
  }
  assert.throws(() => prepareAdminStaySelection(chosen(), { ...item, lifecycle_status: "EXPIRED" }), /CASE_REVIEW_REQUIRED/);
  const terminalSlot = { purpose: "INITIAL" as const, state: "REVIEW_REQUIRED" as const, review_reason: "TERMINAL_CASE" as const, estimated: true as const, base: "2026-10-02", estimated_end: null };
  const terminal = { ...item, lifecycle_status: "EXPIRED", stay_estimates: { initial: terminalSlot, extension: { ...terminalSlot, purpose: "EXTENSION" as const } } };
  assert.deepEqual(prepareAdminStaySelection(draft, terminal), { action: "CLEAR", purpose: "INITIAL" });
  assert.equal(prepareAdminStaySelection(chosen(), { ...terminal, lifecycle_status: "ACTIVE" })?.action, "SELECT");
});

test("countdown only trusts a READY provisional projection with the exact purpose and valid dates", () => {
  const slot = { purpose: "INITIAL" as const, state: "READY" as const, estimated: true as const, base: "2026-10-02", estimated_end: "2027-10-02",
    provenance: "administrator_provisional" as const, confirmation_required: true, rule };
  assert.deepEqual(readyAdminStayEstimate(slot, "INITIAL"), { base: slot.base, end: slot.estimated_end });
  for (const changed of [{ ...slot, state: "RECALC_REQUIRED" as const }, { ...slot, confirmation_required: false },
    { ...slot, provenance: undefined }, { ...slot, base: "2028-01-01" }, { ...slot, estimated_end: "2027-02-29" }])
    assert.equal(readyAdminStayEstimate(changed, "INITIAL"), null);
  assert.equal(readyAdminStayEstimate(slot, "EXTENSION"), null);
  assert.equal(readyAdminStayEstimate({ ...slot, rule: undefined }, "INITIAL"), null);
  assert.equal(savedAdminStayRule({ ...slot, state: "BASE_REQUIRED", base: null, estimated_end: null }, "INITIAL")?.duration, 365);
  assert.equal(savedAdminStayRule({ ...slot, rule: { ...rule, rule_id: "unverified" } }, "INITIAL"), null);
});
