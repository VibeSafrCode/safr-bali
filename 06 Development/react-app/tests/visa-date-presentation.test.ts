import assert from "node:assert/strict";
import test from "node:test";
import { visaDatePresentation } from "../src/components/VisaCabinet";

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

test("expected stay end is explicit and never presented as confirmed", () => {
  assert.deepEqual(visaDatePresentation({ entered_on: "2026-08-20", entry_deadline: null, stay_end: null, expected_stay_end: "2026-09-19" }, "ru"), {
    label: "Предварительно — находиться до",
    value: "2026-09-19",
    estimated: true,
  });
  assert.equal(visaDatePresentation({ entered_on: null, entry_deadline: null, stay_end: null, expected_stay_end: null }, "en"), null);
});
