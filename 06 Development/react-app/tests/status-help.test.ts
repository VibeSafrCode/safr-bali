import assert from "node:assert/strict";
import test from "node:test";

import { statusHelpText } from "../src/components/VisaStatusHelp";

test("system visa stages keep localized workflow-only help without promising issuance", () => {
  assert.match(statusHelpText("visa", "ISSUED", "ru"), /выдача визы/);
  assert.match(statusHelpText("visa", "ISSUED", "en"), /visa issuance/i);
  assert.match(statusHelpText("external", "PROCESSING", "ru"), /рассматривает заявление/);
  assert.match(statusHelpText("external", "PROCESSING", "ru"), /Не означает.*одобрено.*готово к выдаче/);
  assert.match(statusHelpText("external", "PROCESSING", "en"), /reviewing the application/);
  assert.match(statusHelpText("external", "PROCESSING", "en"), /does not imply approval or readiness for issuance/);
});

test("unknown status fallback does not invent legal meaning", () => {
  assert.match(statusHelpText("visa", "FUTURE_STATUS", "ru"), /уточните у менеджера/);
  assert.match(statusHelpText("visa", "FUTURE_STATUS", "en"), /Ask a manager/);
  assert.doesNotMatch(statusHelpText("visa", "FUTURE_STATUS", "ru"), /официальный код/);
  assert.doesNotMatch(statusHelpText("visa", "FUTURE_STATUS", "en"), /official code/i);
  assert.doesNotMatch(statusHelpText("visa", "FUTURE_STATUS", "en"), /deadline|right|guarantee/i);
});
