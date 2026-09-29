import assert from "node:assert/strict";
import test from "node:test";
import {canToggleVisaIssued, toggleVisaIssued, visaWasIssued, visaDatePatch, visaStatusLabel, setMainVisaProcess, mainVisaProcessIndex, isAwaitingVisaIssuance, visaProcessChanges, visaVisibilityPreferences, canNotifyVisaChange, keepVisaDateEditor} from "../src/components/visaEditorState";

test("issuance checkbox never implies activation or rewrites active/terminal states", () => {
  assert.equal(toggleVisaIssued("NOT_ISSUED", true), "ISSUED_NOT_ACTIVATED");
  assert.equal(toggleVisaIssued("ISSUED_NOT_ACTIVATED", false), "NOT_ISSUED");
  for (const status of ["ACTIVE", "EXPIRING", "EXTENSION_PROCESSING", "EXTENDED", "EXPIRED", "CANCELLED", "REFUSED"]) {
    assert.equal(canToggleVisaIssued(status), false);
    assert.equal(toggleVisaIssued(status, false), status);
    assert.equal(toggleVisaIssued(status, true), status);
  }
  assert.equal(visaWasIssued("EXPIRED"), true);
  assert.equal(visaWasIssued("REFUSED"), false);
});

test("unchanged/hidden dates omit PATCH fields and preserve the original source", () => {
  const original = {entry_deadline: "2026-11-01", stay_end: "2027-11-01", date_source: "legacy source"};
  assert.deepEqual(visaDatePatch(original, original), {});
  assert.deepEqual(visaDatePatch({...original, date_source: undefined}, {...original, date_source: ""}), {});
  assert.throws(() => visaDatePatch(original, {...original, stay_end: "2027-11-02", date_source: ""}), /date_source_required/);
  assert.deepEqual(visaDatePatch(original, {...original, stay_end: "2027-11-02"}), {stay_end: "2027-11-02", date_source: "legacy source"});
  assert.deepEqual(visaDatePatch(original, {...original, stay_end: ""}), {stay_end: null});
});

test("awaiting issuance is contextual; client payment does not manufacture a process", () => {
  assert.equal(visaStatusLabel("service", "PROCESSING", "ru"), "В работе");
  assert.equal(visaStatusLabel("external", "PROCESSING", "ru", "EXTENSION"), "На рассмотрении");
  assert.equal(visaStatusLabel("external", "PROCESSING", "ru", "APPLICATION"), "Ожидаем выдачу");
  assert.equal(isAwaitingVisaIssuance("PAID", "NOT_ISSUED"), false);
  assert.deepEqual(setMainVisaProcess([], "UNKNOWN"), []);
  const [process] = setMainVisaProcess([], "PROCESSING");
  assert.equal(isAwaitingVisaIssuance("PAID", "NOT_ISSUED", process), true);
  assert.equal(isAwaitingVisaIssuance("WAITING_PAYMENT", "NOT_ISSUED", process), false);
  assert.equal(isAwaitingVisaIssuance("PAID", "ACTIVE", process), false);
});

test("primary process uses backend order and preserves references, older and removed processes", () => {
  const original = [{id: 2, process_type: "EXTENSION", external_status: "APPROVED", reference: "typed-reference"}, {id: 1, process_type: "APPLICATION", external_status: "PAID"}];
  const edited = setMainVisaProcess(original, "PROCESSING");
  assert.deepEqual(edited[1], original[1]);
  assert.equal(edited[0].process_type, "EXTENSION");
  assert.equal(edited[0].reference, "typed-reference");
  assert.equal(mainVisaProcessIndex([{...edited[0], action: "REMOVE"}, edited[1]]), 1);
  const persisted = [{id: 1, type: "APPLICATION", external_status: "PAID"}];
  assert.deepEqual(visaProcessChanges(persisted, [original[1]]), []);
  assert.equal(visaProcessChanges(persisted, [{...original[1], external_status: "PROCESSING"}]).length, 1);
  assert.equal(visaProcessChanges(persisted, [{...original[1], action: "REMOVE"}]).length, 1);
});

test("payment labels keep service and external-process meanings separate", () => {
  assert.equal(visaStatusLabel("service", "WAITING_PAYMENT", "ru"), "Ожидаем оплату");
  assert.equal(visaStatusLabel("service", "PAID", "ru"), "Оплачено");
  assert.notEqual(visaStatusLabel("external", "PAID", "ru"), visaStatusLabel("service", "PAID", "ru"));
});

test("both hide controls share notification reset and save guard preserves opt-out", () => {
  for (const origin of ["checkbox", "overflow"]) {
    const hidden = visaVisibilityPreferences(false, true);
    assert.deepEqual(hidden, {showToClient: false, notifyClient: false}, origin);
    assert.equal(canNotifyVisaChange(hidden.showToClient, true), false);
    assert.deepEqual(visaVisibilityPreferences(true, hidden.notifyClient), {showToClient: true, notifyClient: false});
  }
  assert.equal(canNotifyVisaChange(true, false), false);
  assert.equal(canNotifyVisaChange(true, true), true);
});

test("clearing the last old or newly entered date never removes its active editor", () => {
  assert.equal(keepVisaDateEditor({entry_deadline: "2026-11-01"}, false, {entry_deadline: ""}), true);
  assert.equal(keepVisaDateEditor({stay_end: "2026-11-01"}, false, {stay_end: ""}), true);
  assert.equal(keepVisaDateEditor({}, true, {entry_deadline: "", stay_end: ""}), true);
  assert.equal(keepVisaDateEditor({}, false, {}), false);
});
