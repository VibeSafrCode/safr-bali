import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("../artifacts/BALI-TASK-065/designer-review");
const sizes = [{ name: "compact-320", width: 320, height: 844 }, { name: "iphone-390", width: 390, height: 844 }, { name: "desktop-1440", width: 1440, height: 900 }];
const visa = { id: 41, user_id: 5, country_code: "ID", visa_type: { code: "B1", name: "B1" }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, entry_deadline: "2026-09-10", stay_end: "2026-10-10", date_source: "Fixture source", version: 2, processes: [] };

async function common(page: import("@playwright/test").Page, locale: "ru" | "en" = "ru") {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin", locale }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/clients", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", active_visa_count: 1, requires_attention: false }] }) }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active" }, visa_cases: [visa], notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } }) }));
}

test("BALI-TASK-065 admin aggregate/status visual matrix", async ({ browser }) => {
  for (const size of sizes) {
    for (const locale of ["ru", "en"] as const) {
      const context = await browser.newContext({ viewport: size, locale: locale === "ru" ? "ru-RU" : "en-US" });
      const page = await context.newPage(); await common(page, locale);
      let resolveSave!: () => void; let saveAttempt = 0;
      await page.route("**/api/web/admin/visa-cases/41/aggregate", async (route) => { saveAttempt += 1; if (saveAttempt === 1) { await new Promise<void>((resolve) => { resolveSave = resolve; }); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...visa, version: 3 }) }); } return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Forbidden service status transition" }) }); });
      await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Fixture/ }).click(); await page.getByRole("button", { name: /Индонезия/ }).click();
      const forbidden = page.getByRole("radio", { name: /PURCHASED/ }); await expect(forbidden).toBeDisabled();
      await expect(page.getByText(locale === "ru" ? /Переход из PROCESSING в PURCHASED недоступен/ : /Transition from PROCESSING to PURCHASED is unavailable/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(root, size.name, `03-picker-${locale}.png`), fullPage: true });
      await page.getByRole("button", { name: "Сохранить и уведомить" }).click();
      await expect(page.getByText(/CASE_UPDATED/)).toBeVisible(); await page.screenshot({ path: path.join(root, size.name, `04-save-confirm-${locale}.png`), fullPage: true });
      await page.getByRole("button", { name: locale === "ru" ? "Подтвердить сохранение" : "Confirm save" }).click();
      await expect(page.getByRole("button", { name: "Сохраняем всё и уведомляем…" })).toBeDisabled(); await page.screenshot({ path: path.join(root, size.name, `05-save-pending-${locale}.png`), fullPage: true }); resolveSave();
      await expect(page.getByRole("status")).toContainText(/Все изменения сохранены|All changes/);
      await page.getByRole("button", { name: /Индонезия/ }).click(); await page.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(locale === "ru" ? /Не удалось сохранить изменения/ : /Could not save the changes/); await page.screenshot({ path: path.join(root, size.name, `06-save-error-${locale}.png`), fullPage: true });
      await context.close();
    }
  }
});

test("BALI-TASK-065 dashboard metrics visual matrix", async ({ browser }) => {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: size, locale: "ru-RU" }); const page = await context.newPage();
    await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin", locale: "ru" }, csrf_token: "fixture" }) }));
    await page.route("**/api/web/admin/dashboard", async (route) => { await new Promise((resolve) => setTimeout(resolve, 500)); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ new_users_7d: 1, active_visa_cases: 0, open_conversations: 2, orders_attention: 1, referral_missing_rows: 0, visa_cases_attention: 1 }) }); });
    await page.route("**/api/web/admin/dashboard/new_users_7d", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 5, status: "active", created_at: "2026-08-23T00:00:00Z" }] }) }));
    await page.route("**/api/web/admin/dashboard/reviewed_users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 5, status: "active", reviewed_at: "2026-08-23T01:00:00Z" }] }) }));
    await page.route("**/api/web/admin/dashboard/active_visa_cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) }));
    await page.route("**/api/web/admin/users/5/new-review", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviewed: false }) }));
    const navigation = page.goto("/admin/", { waitUntil: "commit" }); await expect(page.getByText("Загружаем показатели…")).toBeVisible(); await page.screenshot({ path: path.join(root, size.name, "00-dashboard-loading.png"), fullPage: true }); await navigation; await expect(page.getByRole("button", { name: /Новые пользователи/ })).toBeVisible();
    await page.screenshot({ path: path.join(root, size.name, "01-dashboard-six-metrics.png"), fullPage: true });
    await page.getByRole("button", { name: /Активные визовые кейсы/ }).click(); await expect(page.getByText("По этому фильтру записей нет.")).toBeVisible(); await page.screenshot({ path: path.join(root, size.name, "01b-dashboard-empty.png"), fullPage: true }); await page.getByRole("button", { name: "← Обзор" }).click();
    await page.getByRole("button", { name: /Новые пользователи/ }).click(); await expect(page.getByText("1 записей")).toBeVisible();
    await page.getByRole("button", { name: "Показать проверенных" }).click(); await expect(page.getByRole("button", { name: "Вернуть в новые" })).toBeVisible();
    await page.screenshot({ path: path.join(root, size.name, "02-dashboard-filter-reversal.png"), fullPage: true });
    await page.unroute("**/api/web/admin/dashboard"); await page.route("**/api/web/admin/dashboard", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Fixture dashboard unavailable" }) }));
    await page.goto("/admin/"); await expect(page.getByRole("alert")).toBeVisible(); await page.screenshot({ path: path.join(root, size.name, "07-dashboard-error.png"), fullPage: true });
    await context.close();
  }
});
