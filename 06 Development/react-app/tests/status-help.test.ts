import assert from "node:assert/strict";
import test from "node:test";

import { statusHelpText } from "../src/components/VisaStatusHelp";

test("official visa codes keep localized workflow-only help", () => {
  assert.match(statusHelpText("visa", "ISSUED", "ru"), /выдача визы/);
  assert.match(statusHelpText("visa", "ISSUED", "en"), /visa issuance/i);
  assert.match(statusHelpText("external", "PROCESSING", "ru"), /в обработке/);
  assert.match(statusHelpText("external", "PROCESSING", "en"), /in progress/);
});

test("unknown status fallback does not invent legal meaning", () => {
  assert.match(statusHelpText("visa", "FUTURE_STATUS", "ru"), /официальный код/);
  assert.match(statusHelpText("visa", "FUTURE_STATUS", "en"), /official code/);
  assert.doesNotMatch(statusHelpText("visa", "FUTURE_STATUS", "en"), /deadline|right|guarantee/i);
});
