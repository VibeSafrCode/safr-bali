import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const app = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
const managers = readFileSync(join(root, "src/components/AdminManagers.tsx"), "utf8");
const catalogue = readFileSync(join(root, "src/components/AdminNotificationCatalogue.tsx"), "utf8");
const crm = readFileSync(join(root, "src/components/AdminVisaCRM.tsx"), "utf8");
const css = readFileSync(join(root, "src/admin.css"), "utf8");

test("root manager directory uses only supported grant and revoke contracts", () => {
  assert.match(app, /"managers", label: "Менеджеры", en: "Managers"/);
  assert.match(app, /tab === "managers"[^\n]*actor\.role === "admin"/);
  assert.match(managers, /staff\?include_revoked=true/);
  assert.match(managers, /staff\/grants/);
  assert.match(managers, /staff\/grants\/\$\{revokeTarget\.grant_id\}\/revoke/);
  assert.match(managers, /visa_manager/);
  assert.match(managers, /general_manager/);
  assert.match(managers, /Доступ прекращён немедленно/);
});

test("visa editor supports many assignments and a structured contact plan", () => {
  assert.match(crm, /\/assignments/);
  assert.match(crm, /assignments\/\$\{assignmentTarget!\.id\}\/revoke/);
  assert.match(crm, /make_primary: false/);
  for (const code of ["VISA_EXPIRY", "EXTENSION", "NEW_VISA", "OTHER"]) assert.match(crm, new RegExp(code));
  assert.match(crm, /contact_reason_code/);
  assert.match(crm, /contact_internal_note/);
  assert.match(crm, /role="radiogroup"/);
});

test("manual Notify is independent from Save and reports asynchronous truth", () => {
  assert.match(crm, /notifications\/status-summary/);
  assert.match(crm, /STATUS_SUMMARY_MANUAL/);
  assert.match(crm, /Постановка в очередь не равна доставке/);
  assert.match(crm, /notification-history/);
  assert.match(crm, /manual_review_required/);
  assert.match(crm, /retry_allowed/);
  assert.match(crm, /confirm_delivery_id/);
  assert.match(crm, /notificationOutcomeRef/);
  assert.match(crm, /setNotificationFeedback/);
  assert.match(crm, /notificationFeedback && <p[^>]+tabIndex=\{-1\}[^>]+role="status"/);
  assert.doesNotMatch(crm, /manual_review_required[^\n]{0,200}Повторить доставку/);
});

test("notification catalogue shows localized preview and backend delivery truth", () => {
  assert.match(catalogue, /notification-catalogue/);
  assert.match(catalogue, /preview\[locale\]/);
  assert.match(catalogue, /Асинхронная очередь Telegram/);
  assert.match(catalogue, /автоматический повтор запрещён/);
  assert.doesNotMatch(catalogue, /JSON\.stringify/);
});

test("new controls retain responsive layout and 44px focusable actions", () => {
  assert.match(css, /\.admin-manager-grant[^}]*grid-template-columns/);
  assert.match(css, /\.admin-manager-grant button[^}]*min-height:44px/);
  assert.match(css, /\.crm-reason-buttons button[^}]*min-height:44px/);
  assert.match(css, /\.crm-notification-history > li > button[^}]*min-height:44px/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.admin-manager-grant[^}]*grid-template-columns:1fr/);
});
