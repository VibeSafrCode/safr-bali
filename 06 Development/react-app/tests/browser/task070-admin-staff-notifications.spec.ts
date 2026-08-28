import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = path.resolve("../artifacts/BALI-TASK-070/designer-review/admin-staff-notifications");

async function respond(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function rootSession(page: Page, locale: "ru" | "en") {
  await page.route("**/api/web/admin/session", (route) => respond(route, 200, { authenticated: true, actor: { id: 1, first_name: "Root", role: "admin", locale, allowed_tabs: ["clients", "settings"] }, csrf_token: "fixture" }));
}

const staff = [
  { grant_id: 11, user_id: 21, name: "Visa Manager", role_code: "visa_manager", active: true, granted_at: "2026-08-20T08:00:00Z", revoked_at: null },
  { grant_id: 12, user_id: 22, name: "General Manager", role_code: "general_manager", active: true, granted_at: "2026-08-21T08:00:00Z", revoked_at: null },
  { grant_id: 13, user_id: 23, name: "Former Manager", role_code: "visa_manager", active: false, granted_at: "2026-08-10T08:00:00Z", revoked_at: "2026-08-22T08:00:00Z" },
];

for (const matrix of [
  { width: 320, locale: "ru" as const, theme: "dark" },
  { width: 390, locale: "en" as const, theme: "light" },
  { width: 768, locale: "ru" as const, theme: "light" },
  { width: 1440, locale: "en" as const, theme: "dark" },
]) test(`manager directory is responsive at ${matrix.width} ${matrix.locale}/${matrix.theme}`, async ({ page }) => {
  await page.setViewportSize({ width: matrix.width, height: 900 });
  await page.addInitScript((theme) => localStorage.setItem("safrway:appearance", theme), matrix.theme);
  await rootSession(page, matrix.locale);
  await page.route(/\/api\/web\/admin\/visa-cases\/staff\?include_revoked=true$/, (route) => respond(route, 200, { items: staff, total: staff.length }));
  await page.goto("/admin/managers/");
  await expect(page.getByRole("heading", { name: matrix.locale === "ru" ? "Менеджеры" : "Managers", level: 1 })).toBeVisible();
  await expect(page.locator(".admin-manager-card").first().getByText(matrix.locale === "ru" ? "Визовый менеджер" : "Visa manager", { exact: true })).toBeVisible();
  const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, controls: [...document.querySelectorAll<HTMLElement>(".admin-manager-grant input,.admin-manager-grant select,.admin-manager-grant button,.admin-manager-card button")].map((node) => node.getBoundingClientRect().height) }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
  for (const height of geometry.controls) expect(height).toBeGreaterThanOrEqual(44);
  await mkdir(artifactRoot, { recursive: true });
  await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-managers.png`), fullPage: true });
});

test("manager revoke confirmation traps focus, returns it and moves the grant immediately", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
  await rootSession(page, "ru");
  await page.route(/\/api\/web\/admin\/visa-cases\/staff\?include_revoked=true$/, (route) => respond(route, 200, { items: staff, total: staff.length }));
  await page.route("**/api/web/admin/visa-cases/staff/grants/11/revoke", (route) => respond(route, 200, { ...staff[0], active: false, revoked_at: "2026-08-28T09:00:00Z" }));
  await page.goto("/admin/managers/");
  const trigger = page.getByRole("button", { name: "Отозвать роль" }).first();
  await trigger.focus(); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Отозвать роль?" });
  await expect(page.getByLabel("Причина отзыва")).toBeFocused();
  const box = await dialog.locator(".admin-dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(8); expect(box!.x + box!.width).toBeLessThanOrEqual(382);
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByLabel("Причина отзыва").fill("Role scope changed"); await page.getByRole("button", { name: "Отозвать роль", exact: true }).last().click();
  await expect(page.getByRole("status")).toContainText("Доступ прекращён немедленно");
  await expect(page.getByText("1 активных")).toBeVisible();
  await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, "390-ru-dark-manager-revoked.png"), fullPage: true });
});

test("manager role grant is confirmed, audited in copy and announced in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "light"));
  await rootSession(page, "en");
  await page.route(/\/api\/web\/admin\/visa-cases\/staff\?include_revoked=true$/, (route) => respond(route, 200, { items: staff, total: staff.length }));
  await page.route("**/api/web/admin/visa-cases/staff/grants", (route) => respond(route, 201, { grant_id: 14, user_id: 24, name: "New Manager", role_code: "general_manager", active: true, granted_at: "2026-08-28T10:00:00Z", revoked_at: null }));
  await page.goto("/admin/managers/");
  await page.getByLabel("Staff SAFRWAY ID").fill("24");
  await page.getByLabel("Role").selectOption("general_manager");
  await page.getByLabel("Reason for access").fill("Bali client operations");
  const trigger = page.getByRole("button", { name: "Review role grant" }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Grant manager role?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog).toContainText("immutable audit");
  await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, "390-en-light-manager-grant-confirm.png") });
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await trigger.click();
  await dialog.getByRole("button", { name: "Grant role" }).click();
  const outcome = page.locator(".admin-outcome").filter({ hasText: "New Manager" });
  await expect(outcome).toBeFocused(); await expect(page.getByText("3 active")).toBeVisible();
});

const catalogue = [
  { code: "STATUS_SUMMARY_MANUAL", trigger: "root_admin_confirmed_manual_action", audience: ["client"], channel: "telegram", consent: "requires_case_notifications_enabled", preview: { ru: "Актуальная сводка по вашей визе: статус и подтверждённые даты.", en: "Current visa summary: status and confirmed dates." }, current_truth: { queue: "backend_outbox", delivery: "asynchronous_not_guaranteed", unknown_policy: "human_review_only_no_automatic_retry" } },
  { code: "CONTACT_REMINDER", trigger: "due_versioned_contact_plan", audience: ["client", "assigned_staff", "root_admin"], channel: "telegram", consent: "client_row_suppressed_when_disabled_staff_rows_independent", preview: { ru: "Рекомендуем связаться с менеджером в связи с ближайшим действием по визе.", en: "We recommend contacting your manager about an upcoming visa action." }, current_truth: { queue: "backend_outbox", delivery: "asynchronous_not_guaranteed", unknown_policy: "human_review_only_no_automatic_retry" } },
];

test("root notification catalogue shows localized preview and current delivery truth", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "light"));
  await rootSession(page, "en");
  await page.route("**/api/web/admin/settings", (route) => respond(route, 200, { visa_types: [], exchange_routes: [], services: [], notifications: [] }));
  await page.route("**/api/web/admin/visa-cases/notification-catalogue", (route) => respond(route, 200, { items: catalogue }));
  await page.goto("/admin/settings/"); await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("Current visa summary: status and confirmed dates.")).toBeVisible();
  await expect(page.getByText(/automatic retry is prohibited/i).first()).toBeVisible();
  await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, "1440-en-light-notification-catalogue.png"), fullPage: true });
});

const caseItem = {
  id: 77, user_id: 5, country_code: "ID", visa_type: { code: "E33G", name: "Remote worker ITAS" }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true,
  entry_deadline: "2026-09-15", stay_end: "2027-09-15", date_source: "VISA_ADMIN", next_action_text: "Prepare extension", recommended_contact_at: "2027-08-15T00:00:00+08:00", contact_reason_code: "VISA_EXPIRY", contact_internal_note: "Confirm passport validity", contact_plan_version: 2, version: 8,
  assigned_admin: { id: 1, name: "Root", role: "admin" }, assignments: [{ id: 201, staff_user_id: 21, name: "Visa Manager", primary: false }, { id: 202, staff_user_id: 22, name: "General Manager", primary: false }], documents: [], processes: [],
};
const deliveries = [
  { delivery_id: 301, audience: "client", audience_label: "Клиент", type: "STATUS_SUMMARY_MANUAL", type_label: "Ручная сводка по визе", state: "DELIVERED", state_label: "Доставлено", attempts: 1, created_at: "2026-08-27T08:00:00Z", updated_at: "2026-08-27T08:01:00Z", delivered_at: "2026-08-27T08:01:00Z", error_label: null, retry_allowed: false, manual_review_required: false },
  { delivery_id: 302, audience: "client", audience_label: "Клиент", type: "CASE_UPDATED", type_label: "Данные визы обновлены", state: "UNKNOWN", state_label: "Результат не подтверждён", attempts: 1, created_at: "2026-08-27T09:00:00Z", updated_at: "2026-08-27T09:01:00Z", delivered_at: null, error_label: "Результат Telegram не подтверждён", retry_allowed: false, manual_review_required: true },
  { delivery_id: 303, audience: "staff", audience_label: "Сотрудник", type: "CONTACT_REMINDER", type_label: "Напоминание о связи", state: "FAILED", state_label: "Ошибка", attempts: 1, created_at: "2026-08-27T10:00:00Z", updated_at: "2026-08-27T10:01:00Z", delivered_at: null, error_label: "Ошибка до отправки", retry_allowed: true, manual_review_required: false },
];

function localizedDeliveries(locale: "ru" | "en") {
  if (locale === "ru") return deliveries;
  return deliveries.map((delivery) => ({
    ...delivery,
    audience_label: delivery.audience === "client" ? "Client" : "Staff",
    type_label: delivery.type === "STATUS_SUMMARY_MANUAL" ? "Manual visa summary" : delivery.type === "CASE_UPDATED" ? "Visa details updated" : "Contact reminder",
    state_label: delivery.state === "DELIVERED" ? "Delivered" : delivery.state === "UNKNOWN" ? "Outcome not confirmed" : "Failed",
    error_label: delivery.state === "UNKNOWN" ? "Telegram outcome was not confirmed" : delivery.state === "FAILED" ? "Failed before sending" : null,
  }));
}

async function mockCrm(page: Page, locale: "ru" | "en") {
  await rootSession(page, locale);
  await page.route(/\/api\/web\/admin\/clients(?:\?.*)?$/, (route) => respond(route, 200, { items: [{ id: 5, first_name: "Polina", telegram_id_mask: "••••1250", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }], total: 1 }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => respond(route, 200, { items: [{ id: 1, code: "E33G", name: "Remote worker ITAS", version: 1, rules_verified: true }] }));
  await page.route("**/api/web/admin/visa-cases/document-storage/readiness", (route) => respond(route, 200, { storage_configured: false, storage_private: false, encryption_configured: false, key_versioned: false, key_custody_confirmed: false, scanner_configured: false, retention_configured: false, backup_restore_verified: false, ready: false, max_bytes: 0 }));
  await page.route("**/api/web/admin/visa-cases/staff/visa-managers", (route) => respond(route, 200, { enabled: true, items: [{ user_id: 1, name: "Root", role_code: "root_admin" }, { user_id: 21, name: "Visa Manager", role_code: "visa_manager" }] }));
  await page.route(/\/api\/web\/admin\/visa-cases\/staff$/, (route) => respond(route, 200, { items: staff.filter((item) => item.active), total: 2 }));
  await page.route("**/api/web/admin/clients/5", (route) => respond(route, 200, { client: { id: 5, first_name: "Polina", telegram_id_mask: "••••1250", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [caseItem], notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } }));
  await page.route("**/api/web/admin/visa-cases/77/notification-history", (route) => respond(route, 200, { items: localizedDeliveries(locale), total: deliveries.length, page: 1 }));
}

for (const matrix of [
  { width: 320, locale: "ru" as const, theme: "dark" },
  { width: 390, locale: "en" as const, theme: "light" },
  { width: 768, locale: "ru" as const, theme: "light" },
  { width: 1440, locale: "en" as const, theme: "dark" },
]) test(`visa staff/contact/notification editor is contained at ${matrix.width} ${matrix.locale}/${matrix.theme}`, async ({ page }) => {
  await page.setViewportSize({ width: matrix.width, height: 900 }); await page.addInitScript((theme) => localStorage.setItem("safrway:appearance", theme), matrix.theme); await mockCrm(page, matrix.locale);
  await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Polina/ }).click(); await page.getByRole("button", { name: /Remote worker ITAS/ }).click();
  await expect(page.getByRole("heading", { name: matrix.locale === "ru" ? "План связи" : "Contact plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: matrix.locale === "ru" ? "Уведомить" : "Notify", exact: true })).toBeVisible();
  await expect(page.getByText(matrix.locale === "ru" ? "Результат неизвестен: нужна ручная проверка." : "Outcome unknown: manual review is required.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: matrix.locale === "ru" ? "Повторить доставку" : "Retry delivery" })).toHaveCount(1);
  const geometry = await page.locator(".crm-visa-editor").evaluate((node) => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, controls: [...node.querySelectorAll<HTMLElement>("button,input:not([type=checkbox]):not([type=radio]),select,textarea")].filter((control) => getComputedStyle(control).display !== "none").map((control) => control.getBoundingClientRect().height) }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.left).toBeGreaterThanOrEqual(8); expect(geometry.right).toBeLessThanOrEqual(matrix.width - 8);
  for (const height of geometry.controls.filter((height) => height > 0)) expect(height).toBeGreaterThanOrEqual(44);
  await mkdir(artifactRoot, { recursive: true });
  const contactPlan = page.locator(".crm-contact-plan");
  await contactPlan.scrollIntoViewIfNeeded();
  await expect(contactPlan).toBeVisible();
  await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-contact-assignment.png`) });
  const assignments = page.locator(".crm-assignment");
  await assignments.scrollIntoViewIfNeeded();
  await expect(assignments).toBeVisible();
  await assignments.locator("summary").click();
  await expect(page.locator(".crm-assignment-list")).toBeVisible();
  await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-assignments.png`) });
  const notificationHistory = page.locator(".crm-notifications");
  await notificationHistory.scrollIntoViewIfNeeded();
  await expect(notificationHistory).toBeVisible();
  const retryAction = notificationHistory.getByRole("button", { name: matrix.locale === "ru" ? "Повторить доставку" : "Retry delivery" });
  await retryAction.scrollIntoViewIfNeeded();
  const retryBox = await retryAction.boundingBox();
  const saveBarBox = await page.locator(".crm-save-actions").boundingBox();
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(saveBarBox!.y);
  await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-notification-history.png`) });
});

test("assignment revoke requires a reason, returns focus on Escape and removes only that assignment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark")); await mockCrm(page, "ru");
  let currentCase = { ...caseItem, assignments: [...caseItem.assignments] };
  await page.route("**/api/web/admin/visa-cases/77", (route) => respond(route, 200, currentCase));
  await page.route("**/api/web/admin/visa-cases/77/assignments/201/revoke", (route) => { currentCase = { ...currentCase, version: 9, assignments: currentCase.assignments.filter((assignment) => assignment.id !== 201) }; return respond(route, 200, currentCase); });
  await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Polina/ }).click(); await page.getByRole("button", { name: /Remote worker ITAS/ }).click();
  const assignment = page.locator(".crm-assignment"); await assignment.scrollIntoViewIfNeeded(); await assignment.locator("summary").click();
  const trigger = assignment.getByRole("button", { name: "Отозвать", exact: true }).first(); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Отозвать назначение?" }); const reason = page.getByLabel("Причина отзыва назначения");
  await expect(reason).toBeFocused(); await expect(dialog.getByRole("button", { name: "Да, отозвать" })).toBeDisabled();
  await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, "390-ru-dark-assignment-revoke-confirm.png") });
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await trigger.click(); await reason.fill("Workload reassignment"); await dialog.getByRole("button", { name: "Да, отозвать" }).click();
  const outcome = page.locator(".crm-assignment .admin-outcome"); await expect(outcome).toBeFocused();
  await expect(page.locator(".crm-assignment-list").getByText("Visa Manager", { exact: true })).toHaveCount(0);
  await expect(page.locator(".crm-assignment-list").getByText("General Manager", { exact: true })).toBeVisible();
});

test("standalone Notify confirms without a Save and truthfully reports queued state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark")); await mockCrm(page, "ru");
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/web/admin/visa-cases/77/notifications/status-summary", async (route) => { body = route.request().postDataJSON(); await respond(route, 201, { ...deliveries[0], delivery_id: 304, state: "PENDING", state_label: "Ожидает", delivered_at: null }); });
  await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Polina/ }).click(); await page.getByRole("button", { name: /Remote worker ITAS/ }).click();
  const trigger = page.getByRole("button", { name: "Уведомить", exact: true }); await trigger.focus(); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Уведомить клиента о текущем статусе?" }); await expect(page.getByLabel("Причина отправки")).toBeFocused(); await expect(dialog).toContainText("Постановка в очередь не равна доставке");
  await mkdir(artifactRoot, { recursive: true }); await page.screenshot({ path: path.join(artifactRoot, "390-ru-dark-manual-notify-confirm.png") });
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await trigger.click(); await page.getByLabel("Причина отправки").fill("Client requested a current summary"); await dialog.getByRole("button", { name: "Уведомить", exact: true }).click();
  await expect.poll(() => body).toMatchObject({ confirm_case_id: 77, expected_version: 8, reason: "Client requested a current summary" });
  const outcome = page.locator(".admin-outcome").filter({ hasText: "Текущий результат: Ожидает" });
  await expect(outcome).toBeVisible();
  await expect(outcome).toBeFocused();
  await outcome.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifactRoot, "390-ru-dark-manual-notify-success.png") });
});
