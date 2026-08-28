import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const artifactRoot = resolve(process.cwd(), "../artifacts/BALI-TASK-055-corrections");
const ruVisa = { id: 41, country_code: "ID", visa_type: { code: "B1", name: "B1", version: 1 }, service_status: "PROCESSING", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED", notifications_enabled: true, entered_on: "2026-08-17", stay_end: "2026-09-15", date_source: "BOSS_ADMIN", next_action_text: "Обратиться в SAFRWAY до продления", recommended_contact_at: "2026-09-01T00:00:00+08:00", contact_reason_code: "VISA_EXPIRY", version: 2 };
const enVisa = { ...ruVisa, next_action_text: "Contact SAFRWAY before extension" };
const detail = { ...enVisa, entered_on: null, stay_end: null, entry_deadline: "2026-09-15", current_process: { type: "APPLICATION", external_status: "PROCESSING", updated_at: "2026-08-20T00:00:00Z" }, timeline: [{ id: 1, type: "PUBLIC_UPDATE", title: "Visa issued", created_at: "2026-08-20T00:00:00Z" }], documents: [{ id: 2, type: "VISA", name: "Visa PDF", access_url: "/api/web/visa-cases/41/documents/2" }] };
const dashboard = { telegram_id: 618, first_name: "Fixture", username: "fixture", balance: 0, referral_count: 0, referral_link: null, orders: [] };

async function viewportContract(page: Page, scope: string) {
  const metrics = await page.evaluate((selector) => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth, small: [...document.querySelectorAll(`${selector} button,${selector} a`)].filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 40; }).length }), scope);
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport); expect(metrics.small).toBe(0);
}
async function telegram(page: Page) {
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { window.Telegram = { WebApp: { initData: "fixture", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
}

for (const viewport of [{ name: "compact-320", width: 320, height: 844 }, { name: "iphone-390", width: 390, height: 844 }, { name: "desktop-1440", width: 1440, height: 900 }]) {
  test(`RU/EN client states ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport); await telegram(page);
    let locale: "ru" | "en" = "ru";
    await page.route("**/mini-app/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale }) }));
    await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [locale === "ru" ? ruVisa : enVisa] }) }));
    await page.route("**/mini-app/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }));
    await page.goto("/#/visas"); await expect(page.getByRole("heading", { name: "Мои визы" })).toBeVisible(); await viewportContract(page, ".visa-cabinet");
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-ru-list.png`, fullPage: true });
    await page.getByRole("button", { name: "Открыть визу" }).click(); await expect(page.getByText("SAFRWAY оформляет")).toBeVisible(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-ru-detail.png`, fullPage: true });
    locale = "en"; await page.reload(); await page.getByRole("button", { name: "Open visa" }).click();
    await expect(page.getByText("SAFRWAY is processing")).toBeVisible(); await expect(page.getByText("PROCESSING", { exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "ACTIVE" })).toBeVisible(); await expect(page.locator("body")).not.toContainText(/Обратиться/);
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-en-detail.png`, fullPage: true });

    let finishToggle!: () => void;
    await page.route("**/mini-app/visa-cases/41/notifications", async (route) => { await new Promise<void>((resolve) => { finishToggle = resolve; }); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
    await page.getByRole("button", { name: "Disabled" }).click(); await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-notification-pending.png`, fullPage: true }); finishToggle(); await expect(page.getByRole("status")).toContainText("previous value was restored");
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-notification-error.png`, fullPage: true });
    let finishEntry!: () => void;
    await page.route("**/mini-app/visa-cases/41/entry", async (route) => { await new Promise<void>((resolve) => { finishEntry = resolve; }); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
    await page.getByLabel("Entry date").fill("2026-08-21"); await page.getByRole("button", { name: "Confirm" }).click(); await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-entry-pending.png`, fullPage: true }); finishEntry(); await expect(page.getByRole("status")).toContainText("previous value was restored");
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/mini-entry-error.png`, fullPage: true });

    let accountLocale: "ru" | "en" = "en";
    await page.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: "Fixture", csrf_token: "fixture" }) }));
    await page.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale: accountLocale }) }));
    await page.route("**/api/web/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [accountLocale === "en" ? enVisa : ruVisa] }) }));
    await page.route("**/api/web/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }));
    await page.goto("/account/visas/"); await expect(page.getByRole("heading", { name: "My visas" })).toBeVisible(); await expect(page.getByRole("navigation", { name: "Account sections" })).toBeVisible();
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-en-list.png`, fullPage: true }); await page.getByRole("button", { name: "Open visa" }).click(); await expect(page.getByText("PROCESSING", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-en-detail.png`, fullPage: true });
    let finishAccountToggle!: () => void;
    await page.route("**/api/web/visa-cases/41/notifications", async (route) => { await new Promise<void>((resolve) => { finishAccountToggle = resolve; }); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
    await page.getByRole("button", { name: "Disabled" }).click(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-notification-pending.png`, fullPage: true }); finishAccountToggle(); await expect(page.getByRole("status")).toContainText("previous value was restored"); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-notification-error.png`, fullPage: true });
    let finishAccountEntry!: () => void;
    await page.route("**/api/web/visa-cases/41/entry", async (route) => { await new Promise<void>((resolve) => { finishAccountEntry = resolve; }); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
    await page.getByLabel("Entry date").fill("2026-08-21"); await page.getByRole("button", { name: "Confirm" }).click(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-entry-pending.png`, fullPage: true }); finishAccountEntry(); await expect(page.getByRole("status")).toContainText("previous value was restored"); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-entry-error.png`, fullPage: true });
    accountLocale = "ru"; await page.reload(); await expect(page.getByRole("heading", { name: "Мои визы" })).toBeVisible(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-ru-list.png`, fullPage: true }); await page.getByRole("button", { name: "Открыть визу" }).click(); await expect(page.getByText("SAFRWAY оформляет")).toBeVisible(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/account-ru-detail.png`, fullPage: true });
  });
}

for (const viewport of [{ name: "iphone-390", width: 390, height: 844 }, { name: "desktop-1440", width: 1440, height: 900 }]) {
  test(`Admin safety states ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }); });
    await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin" }, csrf_token: "fixture" }) }));
    await page.route(/\/api\/web\/admin\/clients(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 5, first_name: "Тестовый клиент", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }] }) }));
    await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 1, code: "B1", name: "B1", version: 1, rules_verified: false }] }) }));
    await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Тестовый клиент", telegram_id_mask: "••••0618", bot_status: "active" }, visa_cases: [{ ...ruVisa, user_id: 5 }], notes: [], credentials: [{ id: 8, provider: "Fixture portal", login_mask: "••••mail" }] }) }));
    let credentialAttempt = 0;
    await page.route("**/api/web/admin/visa-cases/credentials/8/access", (route) => { credentialAttempt += 1; return credentialAttempt === 1 ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "key unavailable" }) }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "fixture", secret: "ephemeral-fixture" }) }); });
    await page.route("**/api/web/admin/visa-cases/41/aggregate", async (route) => { await new Promise((resolve) => setTimeout(resolve, 250)); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...ruVisa, publication_status: "PUBLISHED", version: 3 }) }); });
    await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Тестовый клиент/ }).click(); await viewportContract(page, ".crm-client-card");
    await page.getByRole("button", { name: "+ Добавить визу" }).click(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-create.png`, fullPage: true }); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Индонезия/ }).click(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-edit.png`, fullPage: true });
    await page.getByRole("checkbox", { name: /Уведомить клиента/ }).check();
    await page.getByRole("button", { name: "Сохранить и уведомить" }).click(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-save-confirm.png`, fullPage: true });
    await page.getByRole("button", { name: "Подтвердить сохранение" }).click(); await expect(page.getByRole("button", { name: "Сохраняем всё…" })).toBeDisabled(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-save-pending.png`, fullPage: true }); await expect(page.getByRole("status")).toContainText(/Все изменения сохранены/);
    await page.getByText("Добавить ЛК иммиграции").click();
    await page.getByRole("button", { name: "Показать" }).click(); await expect(page.getByRole("status")).toContainText("ключ шифрования"); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-key-unavailable.png`, fullPage: true });
    await page.getByRole("button", { name: "Показать" }).click(); await expect(page.getByText(/ephemeral-fixture/)).toBeVisible(); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-reveal.png`, fullPage: true });
    await page.getByRole("button", { name: "Скрыть сейчас" }).click(); await expect(page.locator("body")).not.toContainText("ephemeral-fixture"); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-remask.png`, fullPage: true });
    await page.getByRole("button", { name: "Копировать" }).click(); await expect(page.getByRole("status")).toContainText("Скопировано"); await page.screenshot({ path: `${artifactRoot}/${viewport.name}/admin-copy-success.png`, fullPage: true });
  });
}
