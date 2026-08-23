import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("../artifacts/BALI-TASK-062/designer-review");
const widths = [{ name: "compact-320", width: 320 }, { name: "iphone-390", width: 390 }, { name: "desktop-1440", width: 1440 }];

async function adminRoutes(page: Page, detail: "success" | "error" | "loading", locale: "ru-RU" | "en-US") {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin", locale: locale === "en-US" ? "en" : "ru" }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/clients", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }] }) }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route("**/api/web/admin/clients/5", async (route) => {
    if (detail === "loading") await new Promise((resolve) => setTimeout(resolve, 10_000));
    if (detail === "error") return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [], notes: [], credentials: [], dialogue: { id: 4, status: "open", messages: [{ id: 1, author_type: "staff", body: "Queued update", visibility: "client", delivery_status: "pending", created_at: "2026-08-20T08:00:00Z" }, { id: 2, author_type: "staff", body: "Delivered update", visibility: "client", delivery_status: "delivered", created_at: "2026-08-20T09:00:00Z" }, { id: 3, author_type: "client", body: "Client reply", visibility: "client", created_at: "2026-08-20T10:00:00Z" }, { id: 4, author_type: "staff", body: "Failed update", visibility: "client", delivery_status: "failed", created_at: "2026-08-20T11:00:00Z" }] } }) });
  });
  await page.route("**/api/web/admin/clients/5/messages/4/retry", async (route) => { await new Promise((resolve) => setTimeout(resolve, 10_000)); await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
}

async function openAdmin(context: BrowserContext, state: "success" | "error" | "loading", locale: "ru-RU" | "en-US" = "ru-RU") {
  const page = await context.newPage();
  await adminRoutes(page, state, locale);
  await page.goto("/admin/clients/");
  await page.getByRole("button", { name: /Fixture/ }).click();
  return page;
}

test("BALI-TASK-062 dialogue and cabinet evidence matrix", async ({ browser }) => {
  await mkdir(output, { recursive: true });
  for (const viewport of widths) {
    for (const locale of ["ru-RU", "en-US"] as const) {
      const context = await browser.newContext({ locale, viewport: { width: viewport.width, height: 844 } });
      const page = await openAdmin(context, "success", locale);
      await expect(page.locator('[role="log"]')).toBeVisible();
      await page.screenshot({ path: path.join(output, viewport.name, `01-admin-dialogue-${locale.slice(0, 2)}.png`), fullPage: true });
      if (viewport.width >= 390) {
        await page.getByRole("button", { name: locale === "en-US" ? "Retry delivery" : "Повторить отправку" }).click();
        await expect(page.getByRole("button", { name: locale === "en-US" ? "Retrying delivery…" : "Повторяем отправку…" })).toBeDisabled();
        await page.screenshot({ path: path.join(output, viewport.name, `05-admin-retry-pending-${locale.slice(0, 2)}.png`), fullPage: true });
      }
      await context.close();
    }

    const loadingContext = await browser.newContext({ locale: "en-US", viewport: { width: viewport.width, height: 844 } });
    const loadingPage = await openAdmin(loadingContext, "loading", "en-US");
    await expect(loadingPage.getByRole("status")).toContainText("Loading dialogue");
    await loadingPage.screenshot({ path: path.join(output, viewport.name, "02-admin-dialogue-loading.png"), fullPage: true });
    await loadingContext.close();

    const errorContext = await browser.newContext({ locale: "en-US", viewport: { width: viewport.width, height: 844 } });
    const errorPage = await openAdmin(errorContext, "error", "en-US");
    await expect(errorPage.getByRole("button", { name: "Retry" })).toBeVisible();
    await errorPage.screenshot({ path: path.join(output, viewport.name, "03-admin-dialogue-error-retry.png"), fullPage: true });
    await errorContext.close();

    const cabinetContext = await browser.newContext({ locale: "en-US", viewport: { width: viewport.width, height: 844 } });
    const cabinet = await cabinetContext.newPage();
    await cabinet.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: "Fixture", csrf_token: "fixture" }) }));
    await cabinet.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ telegram_id: 1, first_name: "Fixture", username: "fixture", balance: 0, referral_count: 0, referral_link: "", orders: [], locale: "en" }) }));
    await cabinet.route("**/api/web/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 41, country_code: "ID", visa_type: { code: "B1", name: "B1", version: 1 }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, stay_end: "2026-09-15", version: 2 }] }) }));
    await cabinet.goto("/account/visas/");
    await expect(cabinet.getByRole("heading", { name: "My visas" })).toBeVisible();
    await cabinet.screenshot({ path: path.join(output, viewport.name, "04-personal-cabinet-en.png"), fullPage: true });
    await cabinetContext.close();
  }
});

test("BALI-TASK-062 final retry viewport evidence", async ({ browser }) => {
  await mkdir(output, { recursive: true });
  for (const viewport of widths.filter((item) => item.width >= 390)) {
    for (const locale of ["ru-RU", "en-US"] as const) {
      const context = await browser.newContext({ locale, viewport: { width: viewport.width, height: 844 } });
      const page = await openAdmin(context, "success", locale);
      const retry = page.getByRole("button", { name: locale === "en-US" ? "Retry delivery" : "Повторить отправку" });
      await expect(retry).toBeVisible();
      const log = retry.locator('xpath=ancestor::ol[@role="log"]');
      const logBox = (await log.boundingBox())!;
      const retryBox = (await retry.boundingBox())!;
      expect(retryBox.height).toBeGreaterThanOrEqual(44);
      expect(retryBox.y).toBeGreaterThanOrEqual(logBox.y);
      expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(logBox.y + logBox.height);
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.screenshot({ path: path.join(output, viewport.name, `01-admin-dialogue-${locale.slice(0, 2)}.png`), fullPage: true });
      await context.close();
    }
  }
});
