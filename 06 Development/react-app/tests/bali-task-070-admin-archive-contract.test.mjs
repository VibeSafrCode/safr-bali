import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const app = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
const crm = readFileSync(join(root, "src/components/AdminVisaCRM.tsx"), "utf8");
const archive = readFileSync(join(root, "src/components/AdminVisaArchive.tsx"), "utf8");
const dialog = readFileSync(join(root, "src/components/AdminDialog.tsx"), "utf8");
const css = readFileSync(join(root, "src/admin.css"), "utf8");

test("visa archive is an explicit admin-only navigation child with its own API and URL state", () => {
  assert.match(app, /"visa-archive", label: "Архив виз", en: "Visa archive"/);
  assert.match(app, /tab === "visa-archive"/);
  assert.match(app, /actor\.role === "admin"/);
  assert.match(archive, /\/api\/web\/admin\/visa-cases\/archive/);
  for (const token of ["search", "service_status", "lifecycle_status", "archived_desc", "archived_asc"]) assert.match(archive, new RegExp(token));
  assert.match(archive, /window\.history\.pushState/);
  assert.match(archive, /window\.addEventListener\("popstate"/);
});

test("ordinary client detail excludes archived visas and never exposes permanent delete", () => {
  assert.match(crm, /publication_status !== "ARCHIVED"/);
  assert.doesNotMatch(crm, /delete-preview|permanent-delete|Удалить навсегда|Delete permanently/);
  assert.doesNotMatch(crm, /\["archived"/);
});

test("archive owns restore and permanent delete with explicit confirmation boundaries", () => {
  assert.match(archive, /publication\/hide/);
  assert.match(archive, /notify_client: false/);
  assert.match(archive, /delete-preview/);
  assert.match(archive, /permanent-delete/);
  assert.match(archive, /confirm_case_id/);
  assert.match(archive, /expected_version/);
  assert.match(archive, /reason: deleteReason\.trim\(\)/);
  assert.match(archive, /protected_files_present/);
});

test("confirmation dialogs trap focus and responsive grids never rely on square cards", () => {
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus/);
  assert.match(css, /\.admin-overlay[^}]*backdrop-filter/);
  assert.match(css, /\.admin-dialog-actions/);
  assert.match(css, /@media \(min-width:480px\)[\s\S]*\.admin-archive-grid[^}]*repeat\(2/);
  assert.match(css, /@media \(min-width:720px\)[\s\S]*\.admin-archive-grid[^}]*repeat\(3/);
  assert.match(css, /@media \(min-width:1280px\)[\s\S]*\.admin-archive-grid[^}]*repeat\(4/);
  assert.doesNotMatch(css, /\.crm-case-row\s*\{[^}]*aspect-ratio/);
});
