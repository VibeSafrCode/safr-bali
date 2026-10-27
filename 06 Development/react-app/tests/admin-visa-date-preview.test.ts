import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminVisaDatePreview } from "../src/components/AdminVisaDatePreview";

type Item = Parameters<typeof AdminVisaDatePreview>[0]["item"];
const item: Item = { lifecycle_status: "ISSUED_NOT_ACTIVATED", issued_on: "2026-09-01", entered_on: null, entry_deadline: null, stay_end: "2027-09-19", expected_stay_end: null };
const render = (updates: Partial<Item> = {}, locale: "ru" | "en" = "ru") => renderToStaticMarkup(createElement(AdminVisaDatePreview, { item: { ...item, ...updates }, today: "2026-10-10", locale }));

test("saved expiry without entry is previewed next to its date without an invented arc", () => {
  const html = render();
  assert.match(html, /Осталось: 344 дня/);
  assert.match(html, /Разрешено находиться до/);
  assert.match(html, /datetime="2027-09-19"/i);
  assert.match(html, /Просмотр не подтверждает сохранение/);
  assert.doesNotMatch(html, /admin-countdown-arc|Дата уточняется/);
});

test("preview changes immediately with the controlled draft and never writes", () => {
  assert.match(render({ stay_end: "2026-10-20" }), /Осталось: 10 дней/);
  assert.match(render({ stay_end: "2026-10-21" }), /Осталось: 11 дней/);
  assert.equal(item.stay_end, "2027-09-19");
  assert.doesNotMatch(render(), /<form|<input|<button|<a\b/);
});

test("entry deadline precedence is retained before recorded entry", () => {
  const html = render({ entry_deadline: "2026-11-29" }, "en");
  assert.match(html, /Remaining: 50 days/);
  assert.match(html, /Enter by/);
  assert.doesNotMatch(html, /Permitted to stay until/);
});

test("empty and invalid date drafts show no fabricated days", () => {
  for (const stay_end of [null, "2026-02-30", "invalid"]) {
    const html = render({ stay_end });
    assert.match(html, /is-unknown/);
    assert.match(html, /Укажите дату/);
    assert.doesNotMatch(html, /<time|Осталось:/);
  }
});

test("cancelled and refused cases retain a date but no active countdown", () => {
  for (const lifecycle_status of ["CANCELLED", "REFUSED"]) {
    const html = render({ lifecycle_status });
    assert.match(html, /<time/);
    assert.doesNotMatch(html, /admin-service-countdown|Осталось:/);
  }
});

test("expired/future inconsistency is visible without reactivating the countdown", () => {
  const html = render({ lifecycle_status: "EXPIRED" });
  assert.match(html, /Проверьте дату/);
  assert.match(html, /<time/);
  assert.doesNotMatch(html, /Осталось:|admin-countdown-arc/);
});

test("pending estimate is labelled, and live preview is an atomic accessible status", () => {
  const html = render({ stay_end: null, expected_stay_end: "2026-11-10" }, "en");
  assert.match(html, /Estimated\. Remaining: 31 days/);
  assert.match(html, /Estimated stay until/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /role="img"[^>]*aria-label="Estimated\. Remaining: 31 days"/);
  assert.doesNotMatch(html, /Permitted to stay until/);
});
test("unknown countdown has a named semantic image rather than an unnamed generic span", () => {
  assert.match(render({ stay_end: null }), /role="img"[^>]*aria-label="Дата уточняется"/);
});
