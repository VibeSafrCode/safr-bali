import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const admin = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
const crm = readFileSync(join(root, "src/components/AdminVisaCRM.tsx"), "utf8");
const graph = readFileSync(join(root, "src/components/AdminReferralGraph.tsx"), "utf8");
const settings = readFileSync(join(root, "src/components/AdminBusinessSettings.tsx"), "utf8");
const css = readFileSync(join(root, "src/admin.css"), "utf8");

test("client navigation preserves routes and filters while cards remain responsive", () => {
  assert.match(admin, /routeClientId/);
  assert.match(admin, /allowed_tabs/);
  assert.match(crm, /clientListUrl/);
  assert.match(crm, /window\.history\.back/);
  assert.match(crm, /joined_desc/);
  assert.match(crm, /crm-filter-chips/);
  assert.match(css, /\.crm-client-grid\s*\{[^}]*repeat\(2/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.crm-client-grid\s*\{\s*grid-template-columns:1fr/);
});

test("visa archive and permanent delete are distinct root-only actions", () => {
  assert.match(crm, /actorRole === "admin"/);
  assert.match(crm, /publication_status === "ARCHIVED"/);
  assert.match(crm, /isRootAdmin && visaFilter === "archived"/);
  assert.match(crm, /Переместить визу в архив/);
  assert.match(crm, /Удалить навсегда/);
  assert.match(crm, /delete-preview/);
  assert.match(crm, /confirm_case_id/);
  assert.match(crm, /expected_version/);
  assert.match(crm, /idempotency_key/);
  assert.match(crm, /Минимальная запись аудита/);
});

test("referral graph has controls, accessible fallback, and preview-first correction", () => {
  for (const token of ["Zoom in", "Zoom out", "Pan right", "Fit", "Reset", "Accessible relationship list"]) assert.match(graph, new RegExp(token));
  assert.match(graph, /role="link"/);
  assert.match(graph, /onKeyDown/);
  assert.match(graph, /correction-preview/);
  assert.match(graph, /reward_ledger_rows/);
  assert.match(graph, /idempotency_key/);
  assert.doesNotMatch(graph, /telegram_id/);
});

test("visa and service settings use typed preview, versions and restore without raw JSON editor", () => {
  assert.match(settings, /BUSINESS_FIELDS/);
  assert.match(settings, /expected_active_version/);
  assert.match(settings, /effective_from/);
  assert.match(settings, /History and restore/);
  assert.match(settings, /Preview/);
  assert.match(admin, /BusinessSettingsEditor entityType="visa"/);
  assert.match(admin, /BusinessSettingsEditor entityType="service"/);
  assert.doesNotMatch(settings, /JSON\.stringify\(draft/);
});

test("protected document UI is fail-closed and covers scan, retry, visibility and staff download", () => {
  for (const token of ["document-storage/readiness", "documents/upload", "Карантин → сканирование → шифрование", "Повторить загрузку", "CLIENT", "INTERNAL", "download_url"]) assert.match(crm, new RegExp(token));
  assert.match(crm, /documentStorage\?\.ready/);
  assert.match(crm, /scanner rejected|отклонён сканером/i);
  assert.match(crm, /credentials: "include"/);
  assert.match(css, /\.crm-document-list/);
});

test("root assignment UI is explicit, audited in copy, and assignment feature remains deny-by-default", () => {
  assert.match(crm, /staff\/visa-managers/);
  assert.match(crm, /\/assignment/);
  assert.match(crm, /assignmentReason/);
  assert.match(crm, /прежний менеджер сразу потеряет доступ/);
  assert.match(crm, /deny-by-default/);
});
