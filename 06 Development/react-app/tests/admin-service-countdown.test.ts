import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminServiceCountdown } from "../src/components/AdminServiceCountdown";

const render = (props: Partial<Parameters<typeof AdminServiceCountdown>[0]>) => renderToStaticMarkup(createElement(AdminServiceCountdown, { today: "2026-10-05", locale: "ru", end: "2026-11-06", ...props }));
test("admin countdown renders actual remaining days and the correct ring fraction", () => {
  const html = render({ start: "2026-10-01" });
  assert.match(html, /Осталось: 32 дня/);
  assert.match(html, /stroke-dasharray="88\.888/);
});
test("strict warning boundaries match the client cabinet, including today and expiry", () => {
  for (const [end, tone] of [["2026-10-05", "urgent"], ["2026-10-11", "urgent"], ["2026-10-12", "soon"], ["2026-10-19", "soon"], ["2026-10-20", "neutral"], ["2026-10-04", "expired"]]) assert.match(render({ end }), new RegExp(`is-${tone}`));
  assert.match(render({ end: "2026-10-04" }), /Срок истёк: 1 день назад/);
});
test("future dates are not urgent and monthly cycle is never represented as contract expiry", () => {
  const future = render({ start: "2026-10-06", end: "2026-10-10" });
  assert.match(render({ start: "2026-10-06", end: null, monthly: true }), /До начала: 1 день/);
  assert.match(future, /До начала: 1 день/); assert.doesNotMatch(future, /is-urgent/);
  const monthly = render({ start: "2026-09-08", end: null, monthly: true });
  assert.match(monthly, /До конца периода: 3 дня/); assert.doesNotMatch(monthly, /is-urgent/);
  assert.match(monthly, /admin-countdown-marker/);
});
test("missing dates, cancelled visas and invalid dates never fabricate a countdown", () => {
  assert.equal(render({ end: null }), "");
  assert.equal(render({ end: "2026-02-30" }), "");
  assert.equal(render({ terminal: true }), "");
  const withoutStart = render({ start: null });
  assert.match(withoutStart, /<svg/);
  assert.doesNotMatch(withoutStart, /admin-countdown-arc/);
  assert.match(render({ estimated: true }), /Предварительно/);
});
test("optional unknown-date ring has no invented day count or progress", () => {
  const html = render({ end: null, emptyLabel: "Дата уточняется" });
  assert.match(html, /is-unknown/);
  assert.match(html, /aria-label="Дата уточняется"/);
  assert.match(html, /<strong>—<\/strong>/);
  assert.doesNotMatch(html, /admin-countdown-arc|is-urgent|is-soon|Осталось/);
  assert.equal(render({ end: null }), "");
  assert.equal(render({ terminal: true, emptyLabel: "Дата уточняется" }), "");
});
