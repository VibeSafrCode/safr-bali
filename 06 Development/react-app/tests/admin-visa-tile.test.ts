import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminVisaTile } from "../src/components/AdminVisaTile";

type Item = Parameters<typeof AdminVisaTile>[0]["item"];
const item: Item = {
  visa_type: { code: "E33G", name: "E33G" }, lifecycle_status: "ACTIVE",
  publication_status: "PUBLISHED", issued_on: "2026-09-01", entered_on: "2026-09-20",
  stay_end: "2027-09-19", expected_stay_end: null, entry_deadline: "2026-11-29",
};
const render = (updates: Partial<Item> = {}, locale: "ru" | "en" = "ru") => renderToStaticMarkup(createElement(AdminVisaTile, { item: { ...item, ...updates }, today: "2026-10-10", locale, onOpen() {} }));

test("active visa shares the service tile and counts its confirmed stay period", () => {
  const html = render();
  assert.match(html, /admin-life-tile-icon/);
  assert.match(html, /<strong>E33G<\/strong>/);
  assert.match(html, /Осталось: 344 дня/);
  assert.match(html, /admin-countdown-arc/);
  assert.match(html, /<time dateTime="2027-09-19">|<time datetime="2027-09-19">/);
  assert.match(html, /Разрешено находиться до/);
  assert.doesNotMatch(html, /Въехать до/);
});

test("unactivated visa counts the entry deadline and works without an issue date", () => {
  const html = render({ lifecycle_status: "ISSUED_NOT_ACTIVATED", issued_on: null, entered_on: null, stay_end: null }, "en");
  assert.match(html, /Remaining: 50 days/);
  assert.match(html, /Enter by/);
  assert.match(html, /admin-countdown-track/);
  assert.doesNotMatch(html, /admin-countdown-arc|admin-countdown-marker/);
});

test("missing and malformed dates show an unknown ring rather than a fictitious term", () => {
  for (const stay_end of [null, "2026-02-30", "nonsense"]) {
    const html = render({ stay_end, expected_stay_end: null });
    assert.match(html, /is-unknown/);
    assert.match(html, /<strong>—<\/strong>/);
    assert.match(html, /Дата уточняется/);
    assert.doesNotMatch(html, /<time|Осталось:|admin-countdown-arc/);
  }
});

test("expected dates stay explicitly estimated and never become confirmed dates", () => {
  const html = render({ stay_end: null, expected_stay_end: "2026-11-10" });
  assert.match(html, /Предварительно\. Осталось: 31 день/);
  assert.match(html, /Предварительно — находиться до/);
  assert.doesNotMatch(html, /Разрешено находиться до/);
});

test("visa expiry and strict urgency thresholds match the shared service countdown", () => {
  for (const [stay_end, tone] of [["2026-10-09", "expired"], ["2026-10-10", "urgent"], ["2026-10-16", "urgent"], ["2026-10-17", "soon"], ["2026-10-24", "soon"], ["2026-10-25", "neutral"]]) {
    assert.match(render({ stay_end }), new RegExp(`is-${tone}`));
  }
  const expired = render({ lifecycle_status: "EXPIRED", stay_end: "2026-10-09" });
  assert.match(expired, /Срок истёк: 1 день назад/);
  assert.doesNotMatch(expired, /Осталось:/);
});

test("cancelled or refused visas never show an active countdown", () => {
  for (const lifecycle_status of ["CANCELLED", "REFUSED"]) assert.doesNotMatch(render({ lifecycle_status }), /admin-service-countdown/);
});

test("expired status with a today/future date requests review instead of showing an active countdown", () => {
  for (const stay_end of ["2026-10-10", item.stay_end]) {
    const html = render({ lifecycle_status: "EXPIRED", stay_end });
    assert.match(html, /is-unknown/);
    assert.match(html, /Проверьте дату/);
    assert.match(html, /<time/);
    assert.doesNotMatch(html, /Осталось:|admin-countdown-arc|is-neutral/);
  }
  const inconsistentStart = render({ lifecycle_status: "EXPIRED", entered_on: "2026-10-11", stay_end: "2026-10-09" });
  assert.match(inconsistentStart, /Срок истёк: 1 день назад/);
  assert.doesNotMatch(inconsistentStart, /До начала|is-neutral/);
});

test("record text is escaped and rendering never changes its data", () => {
  const record = { ...item, custom_visa_name: '<img src=x onerror="evil()">', next_action_text: "<script>evil()</script>" };
  const before = JSON.stringify(record);
  const html = renderToStaticMarkup(createElement(AdminVisaTile, { item: record, today: "2026-10-10", locale: "ru", onOpen() { throw new Error("Rendering must not invoke the editor"); } }));
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img|<script/);
  assert.equal(JSON.stringify(record), before);
});

test("each tile preserves its exact editor callback without selecting a different record", () => {
  const records = [item, { ...item, custom_visa_name: "Synthetic second visa" }];
  const opened: Item[] = [];
  const buttons = records.map(record => AdminVisaTile({ item: record, today: "2026-10-10", locale: "ru", onOpen: () => opened.push(record) }));
  assert.equal(opened.length, 0);
  assert.equal(buttons[0].props.type, "button");
  buttons[1].props.onClick();
  buttons[0].props.onClick();
  buttons[0].props.onClick();
  assert.equal(opened.length, 3);
  assert.strictEqual(opened[0], records[1]);
  assert.strictEqual(opened[1], records[0]);
  assert.strictEqual(opened[2], records[0]);
});
