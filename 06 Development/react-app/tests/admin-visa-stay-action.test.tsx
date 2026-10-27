import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminVisaStayAction } from "../src/components/AdminVisaStayAction";
import { assertStaffStayCompatibility, newStaffStayDraft, prepareStaffStayAction, reviewStaffStayDraft, type StaffStayCase } from "../src/components/adminVisaStayActionDraft";

const item: StaffStayCase = { id: 7, version: 2, lifecycle_status: "ACTIVE", publication_status: "PUBLISHED",
  issued_on: "2026-10-01", entered_on: null, entry_deadline: "2026-11-01", stay_end: "2027-10-01", extensions_used: 0,
  processes: [{ id: 9, type: "EXTENSION", external_status: "ISSUED" }] };
const ready = (kind: "CONFIRM_ENTRY" | "CONFIRM_EXTENSION") => ({ ...newStaffStayDraft(item, kind), enteredOn: "2026-10-23",
  documentEnd: "2028-10-01", source: " Synthetic document ", reason: " Reviewed evidence ", acknowledged: true });
test("staff action is explicit, scoped and does not carry actor/count/status/date patches", () => {
  assert.equal(prepareStaffStayAction(newStaffStayDraft(item), item, "2026-10-23"), undefined);
  assert.deepEqual(prepareStaffStayAction(ready("CONFIRM_ENTRY"), item, "2026-10-23"),
    { kind: "CONFIRM_ENTRY", entered_on: "2026-10-23", source_reference: "Synthetic document" });
  assert.deepEqual(prepareStaffStayAction(ready("CONFIRM_EXTENSION"), item, "2026-10-23"),
    { kind: "CONFIRM_EXTENSION", process_id: 9, document_stay_end: "2028-10-01", source_reference: "Synthetic document", clear_expected_stay_end: false });
});
for (const patch of [{ caseId: 8 }, { version: 3 }, { acknowledged: false }, { source: " " }, { reason: " " },
  { enteredOn: "2026-02-29" }, { enteredOn: "2026-10-24" }, { enteredOn: "2026-09-30" }]) test("staff entry rejects invalid draft " + JSON.stringify(patch), () => {
  assert.throws(() => prepareStaffStayAction({ ...ready("CONFIRM_ENTRY"), ...patch }, item, "2026-10-23"));
});
for (const status of ["NOT_ISSUED", "EXPIRED", "CANCELLED", "REFUSED"]) test("no staff quick revival " + status, () => {
  assert.throws(() => prepareStaffStayAction(ready("CONFIRM_ENTRY"), { ...item, lifecycle_status: status }, "2026-10-23"));
});
test("extension binds case-owned process, later document date and explicit forecast removal", () => {
  const draft = ready("CONFIRM_EXTENSION");
  assert.throws(() => prepareStaffStayAction({ ...draft, processId: "99" }, item, "2026-10-23"));
  assert.throws(() => prepareStaffStayAction({ ...draft, documentEnd: "2027-10-01" }, item, "2026-10-23"));
  const forecast = { ...item, expected_stay_end: "2028-10-01" };
  assert.throws(() => prepareStaffStayAction(draft, forecast, "2026-10-23"));
  assert.equal(prepareStaffStayAction({ ...draft, clearExpected: true }, forecast, "2026-10-23")?.kind, "CONFIRM_EXTENSION");
  assert.equal(newStaffStayDraft({ ...item, processes: [...item.processes!, { id: 10, type: "EXTENSION", external_status: "UNKNOWN" }] }, "CONFIRM_EXTENSION").processId, "");
});
for (const locale of ["ru", "en"] as const) test("named adjacent staff actions and explicit evidence inputs " + locale, () => {
  const html = renderToStaticMarkup(<AdminVisaStayAction item={item} draft={ready("CONFIRM_EXTENSION")} today="2026-10-23" locale={locale} disabled={false} onChange={() => {}} />);
  assert.ok(html.includes('aria-pressed="true"')); assert.ok(html.includes("<fieldset>")); assert.ok(html.includes('type="date"'));
  assert.ok(html.includes("EXTENSION #9")); assert.ok(html.includes('maxLength="2000"')); assert.equal(html.includes('name="extensions_used"'), false);
});
test("clicking the selected staff action never erases its draft", () => {
  const draft = ready("CONFIRM_EXTENSION"), changes: unknown[] = [];
  const tree = AdminVisaStayAction({ item, draft, today: "2026-10-23", locale: "en", disabled: false, onChange: value => changes.push(value) });
  const walk = (value: any): any[] => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
  walk(tree).find(n => n.type === "button" && n.props["aria-pressed"] === true).props.onClick();
  assert.equal(changes.length, 0);
});

test("reviewing a refreshed draft is explicit and preserves fields but clears acknowledgement", () => {
  const draft = ready("CONFIRM_ENTRY"), refreshed = { ...item, version: 3 };
  assert.throws(() => prepareStaffStayAction(draft, refreshed, "2026-10-23"));
  const reviewed = reviewStaffStayDraft(draft, refreshed);
  assert.deepEqual(reviewed, { ...draft, version: 3, acknowledged: false });
  assert.throws(() => reviewStaffStayDraft(draft, { ...refreshed, id: 8 }));
});
test("staff command rejects incompatible period/process commands before transport", () => {
  const entry = prepareStaffStayAction(ready("CONFIRM_ENTRY"), item, "2026-10-23")!;
  const extension = prepareStaffStayAction(ready("CONFIRM_EXTENSION"), item, "2026-10-23")!;
  assert.throws(() => assertStaffStayCompatibility(entry, { action: "CLEAR", purpose: "INITIAL" }, []));
  assert.throws(() => assertStaffStayCompatibility(entry, { action: "SELECT", purpose: "EXTENSION" }, []));
  assert.throws(() => assertStaffStayCompatibility(extension, { action: "SELECT", purpose: "INITIAL" }, []));
  assert.throws(() => assertStaffStayCompatibility(extension, undefined, [{ id: 9 }]));
  assertStaffStayCompatibility(extension, { action: "CLEAR", purpose: "EXTENSION" }, [{ id: 10 }]);
});
