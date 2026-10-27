import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminVisaStayPeriod } from "../src/components/AdminVisaStayPeriod";
import { e33g365Selection, newAdminStaySelection } from "../src/components/adminVisaStaySelection";

const item = { id: 31, version: 2, country_code: "ID", lifecycle_status: "ACTIVE", visa_type: { id: 2, version: 3, code: "E33G" }, entered_on: "2026-10-02", stay_end: "2027-10-01" };
const rule = { rule_id: "provisional:" + "a".repeat(64), version: 1, variant_id: "manual-initial-day-365", unit: "day" as const,
  duration: 365, counting_policy: "base_excluded" as const, month_end_policy: "clamp" as const };
for (const locale of ["ru", "en"] as const) test("period editor and both projections render with explicit provisional labels: " + locale, () => {
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={item} draft={newAdminStaySelection(item)} today="2026-10-23" locale={locale} disabled={false} onChange={() => {}} />);
  assert.match(html, /fieldset/); assert.match(html, /legend/); assert.match(html, /365/);
  assert.match(html, locale === "ru" ? /Предварительный расчёт — не подтверждённый срок пребывания/ : /A provisional estimate is not a confirmed stay period/);
  assert.match(html, locale === "ru" ? /Без изменений/ : /Keep saved estimate/);
  assert.doesNotMatch(html, /type="number"/); assert.equal((html.match(/crm-date-preview"/g) ?? []).length, 2);
});
test("selected rule has native labeled controls and acknowledgement, never a hidden default approval", () => {
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={item} draft={e33g365Selection(item, "INITIAL")!} today="2026-10-23" locale="ru" disabled={false} onChange={() => {}} />);
  assert.match(html, /value="365"/); assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /Календарный год не приравнивается к 365 дням/);
  assert.match(html, /Добавлять срок после даты въезда/);
});

for (const locale of ["ru", "en"] as const) test("exact-code stage hints remain provisional with document and eligibility caveats: " + locale, () => {
  for (const [code, days] of [["C1", 60], ["D1/D2", 60], ["D12", 180], ["VOA", 30]] as const) {
    const record = { ...item, visa_type: { ...item.visa_type, code } };
    for (const purpose of ["INITIAL", "EXTENSION"] as const) {
      const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record, purpose)} today="2026-10-23" locale={locale} disabled={false} onChange={() => {}} />);
      const body = html.replace(/<[^>]*>/g, "");
      assert.ok(body.includes(code + ": " + days));
      assert.match(body, locale === "ru" ? /право на продление и оставшийся общий лимит/ : /extension eligibility and remaining total limit/);
      assert.doesNotMatch(html, /type="number"/);
    }
  }
});

test("no quick hint is shown for foreign/missing country or an unbound alias", () => {
  for (const record of [{ ...item, country_code: "TH" }, { ...item, country_code: undefined }, { ...item, visa_type: { ...item.visa_type, code: "D1" } }]) {
    const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record)} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
    assert.doesNotMatch(html, /days · provisional<\/button>/);
    assert.match(html, /Keep saved estimate/);
  }
});
test("saved READY initial stays separate from changed extension and confirmed document date", () => {
  const slot = { purpose: "INITIAL" as const, state: "READY" as const, estimated: true as const, base: "2026-10-02", estimated_end: "2027-10-02",
    provenance: "administrator_provisional" as const, confirmation_required: true, rule };
  const record = { ...item, stay_estimates: { initial: slot, extension: { ...slot, purpose: "EXTENSION" as const, state: "RECALC_REQUIRED" as const, estimated_end: null } } };
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record)} today="2026-10-23" locale="ru" disabled={false} onChange={() => {}} />);
  assert.match(html, /dateTime="2027-10-02"/); assert.match(html, /Базовая дата изменилась/);
  assert.doesNotMatch(html, /dateTime="2027-10-01"/);
  assert.match(html.replace(/<[^>]*>/g, ""), /Сохранённый период: 365/);
});
test("BASE_REQUIRED still shows the persisted period, never an invented end date", () => {
  const slot = { purpose: "INITIAL" as const, state: "BASE_REQUIRED" as const, estimated: true as const, base: null, estimated_end: null,
    provenance: "administrator_provisional" as const, confirmation_required: true, rule };
  const record = { ...item, entered_on: null, stay_estimates: { initial: slot, extension: { ...slot, purpose: "EXTENSION" as const, state: "NOT_SELECTED" as const, rule: null } } };
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record)} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
  assert.match(html.replace(/<[^>]*>/g, ""), /Saved period: 365/); assert.match(html, /Entry or current expiry date is required first/); assert.doesNotMatch(html, /dateTime=/);
});
test("unknown type cannot gain E33G preset or editable rule binding from its display name", () => {
  const other = { ...item, visa_type: { code: "OTHER" } };
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={other} draft={newAdminStaySelection(other)} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
  assert.match(html, /fieldset disabled=""/); assert.doesNotMatch(html, /E33G: 365/); assert.match(html, /exact visa-type version is missing/);
});

test("stale binding offers a same-purpose rebind instead of a full editor reset", () => {
  const html = renderToStaticMarkup(<AdminVisaStayPeriod item={{ ...item, version: 3 }} draft={newAdminStaySelection(item)} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
  assert.match(html, /Reselect period for the current case/); assert.doesNotMatch(html, /E33G: 365/);
});

test("unsaved base or terminal lifecycle hides the stale predicted date while retaining period facts", () => {
  const slot = { purpose: "EXTENSION" as const, state: "READY" as const, estimated: true as const, base: "2027-10-01", estimated_end: "2028-09-30",
    provenance: "administrator_provisional" as const, confirmation_required: true, rule };
  const estimates = { initial: { ...slot, purpose: "INITIAL" as const, state: "NOT_SELECTED" as const, rule: null }, extension: slot };
  for (const record of [{ ...item, stay_end: "2027-11-01", stay_estimates: estimates }, { ...item, lifecycle_status: "EXPIRED", stay_estimates: estimates }]) {
    const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record, "EXTENSION")} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
    assert.doesNotMatch(html, /dateTime="2028-09-30"/); assert.match(html.replace(/<[^>]*>/g, ""), /Saved period: 365/);
  }
});

test("terminal review allows CLEAR but type drift disables destructive estimate commands", () => {
  for (const reason of ["TERMINAL_CASE", "TYPE_CHANGED"] as const) {
    const slot = { purpose: "INITIAL" as const, state: "REVIEW_REQUIRED" as const, review_reason: reason, estimated: true as const, base: null, estimated_end: null, rule };
    const record = { ...item, lifecycle_status: "EXPIRED", stay_estimates: { initial: slot, extension: { ...slot, purpose: "EXTENSION" as const } } };
    const html = renderToStaticMarkup(<AdminVisaStayPeriod item={record} draft={newAdminStaySelection(record)} today="2026-10-23" locale="en" disabled={false} onChange={() => {}} />);
    assert.match(html, /value="SELECT" disabled=""/);
    assert.match(html, reason === "TYPE_CHANGED" ? /value="CLEAR" disabled=""/ : /value="CLEAR">/);
  }
});
