import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("../artifacts/BALI-TASK-062/status-help-review");
const widths = [{ name: "compact-320", width: 320 }, { name: "iphone-390", width: 390 }, { name: "desktop-1440", width: 1440 }];
const visa = { id: 41, country_code: "ID", visa_type: { code: "B1", name: "B1", version: 1 }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, stay_end: "2026-09-15", next_action_text: null, version: 2 };

async function mini(page: Page, locale: "ru" | "en") {
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { window.Telegram = { WebApp: { initData: "fixture", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
  await page.route("**/mini-app/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ telegram_id: 1, first_name: "Fixture", balance: 0, referral_count: 0, referral_link: "", orders: [], locale }) }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [visa] }) }));
  await page.route("**/mini-app/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...visa, current_process: { type: "APPLICATION", external_status: "PROCESSING" }, timeline: [], documents: [] }) }));
  await page.goto("/#/visas");
  await page.getByRole("button", { name: locale === "ru" ? "Открыть визу" : "Open visa" }).click();
  await expect(page.getByRole("heading", { name: "ACTIVE" })).toBeVisible();
  const summary = page.locator(`summary[aria-label="${locale === "ru" ? "Что означает статус ACTIVE" : "What status ACTIVE means"}"]`).first();
  await summary.focus(); await expect(summary).toBeFocused(); await summary.click();
  const help = page.getByText(locale === "ru" ? /отмечена как активная/ : /records the visa as active/).first();
  await expect(help).toBeVisible();
  const bounds = await help.locator("xpath=..").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(16);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) - 16);
  const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 0.5).map((node) => ({ tag: node.tagName, className: node.className, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).slice(0, 8));
  expect(overflow, JSON.stringify(overflow)).toEqual([]);
}

async function account(page: Page, locale: "ru" | "en") {
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: "Fixture", csrf_token: "fixture" }) }));
  await page.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ telegram_id: 1, first_name: "Fixture", balance: 0, referral_count: 0, referral_link: "", orders: [], locale }) }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [visa] }) }));
  await page.goto("/account/visas/");
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
  const summary = page.locator(`summary[aria-label="${locale === "ru" ? "Что означает статус ACTIVE" : "What status ACTIVE means"}"]`).first();
  await summary.click();
}

async function admin(page: Page) {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin" }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/clients", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }] }) }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [{ ...visa, user_id: 5 }], notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } }) }));
  await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Fixture/ }).click();
  const summary = page.locator('summary[aria-label="Что означает статус ACTIVE"]').first();
  await summary.click(); await expect(page.getByText(/отмечена как активная/).first()).toBeVisible();
}

test("status help RU EN evidence matrix", async ({ browser }) => {
  await mkdir(output, { recursive: true });
  for (const viewport of widths) {
    for (const locale of ["ru", "en"] as const) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: 844 }, locale: locale === "ru" ? "ru-RU" : "en-US" });
      const page = await context.newPage(); await mini(page, locale);
      await page.screenshot({ path: path.join(output, viewport.name, `mini-${locale}.png`), fullPage: true });
      await context.close();

      const accountContext = await browser.newContext({ viewport: { width: viewport.width, height: 844 }, locale: locale === "ru" ? "ru-RU" : "en-US" });
      const accountPage = await accountContext.newPage(); await account(accountPage, locale);
      await accountPage.screenshot({ path: path.join(output, viewport.name, `account-${locale}.png`), fullPage: true });
      await accountContext.close();
    }
    const adminContext = await browser.newContext({ viewport: { width: viewport.width, height: 844 }, locale: "ru-RU" });
    const adminPage = await adminContext.newPage(); await admin(adminPage);
    await adminPage.screenshot({ path: path.join(output, viewport.name, "admin-ru.png"), fullPage: true });
    await adminContext.close();
  }
});

test("desktop Mini App status help stays inside the viewport", async ({ browser }) => {
  const viewport = { width: 1440, height: 844 };
  for (const locale of ["ru", "en"] as const) {
    const context = await browser.newContext({ viewport, locale: locale === "ru" ? "ru-RU" : "en-US" });
    const page = await context.newPage();
    await mini(page, locale);
    await page.screenshot({ path: path.join(output, "desktop-1440", `mini-${locale}.png`), fullPage: true });
    await context.close();
  }
});
