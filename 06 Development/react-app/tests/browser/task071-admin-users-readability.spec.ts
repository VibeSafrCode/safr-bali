import { expect, test } from "@playwright/test";

const session = { authenticated: true, actor: { id: 1, first_name: "Root", role: "admin", locale: "ru" }, csrf_token: "csrf-fixture" };
const users = {
  total: 4, page: 1, page_size: 30, filters: { service_categories: ["housing"] },
  items: [
    { id: 11, username: "maria_safe", first_name: "Мария", last_name: "Клиент", status: "active", role: "client", created_at: "2026-08-29T10:00:00Z", telegram_url: "https://t.me/maria_safe", visa_count: 2, next_visa_expiry: "2026-09-12", dialogue_count: 0, service_count: 2 },
    { id: 12, username: "unsafe-name", first_name: "Очень длинное имя пользователя без выхода за карточку", status: "active", role: "client", created_at: "2026-08-28T10:00:00Z", telegram_url: null, visa_count: 0, next_visa_expiry: null, dialogue_count: 0, service_count: 0 },
    { id: 13, username: "client_13", first_name: "Анна", status: "active", role: "client", created_at: "2026-08-27T10:00:00Z", telegram_url: "https://t.me/client_13", visa_count: 1, next_visa_expiry: "2026-09-30", dialogue_count: 1, service_count: 1 },
    { id: 14, username: null, first_name: "Иван", status: "active", role: "client", created_at: "2026-08-26T10:00:00Z", telegram_url: null, visa_count: 0, next_visa_expiry: null, dialogue_count: 2, service_count: 0 },
  ],
};

function rgb(value: string) { return [...value.matchAll(/[\d.]+/g)].map((match) => Number(match[0])).slice(0, 3); }
function contrast(foreground: string, background: string) {
  const luminance = (values: number[]) => values.map((value) => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const first = luminance(rgb(foreground)); const second = luminance(rgb(background)); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

async function openUsers(page: import("@playwright/test").Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }));
  await page.route("**/api/web/admin/users**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(users) }));
  await page.goto("/admin/users/");
  await expect(page.getByRole("heading", { name: "Пользователи", exact: true }).last()).toBeVisible();
}

test("desktop users use compact four-column cards, visible active navigation and safe Telegram links", async ({ page }) => {
  await openUsers(page, 1440);
  const cards = page.locator(".admin-user-card");
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const active = page.locator(".admin-sidebar button.active");
  await expect(active).toHaveText("Пользователи");
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Открыть Telegram" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Открыть Telegram" }).first()).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "≤ 15 дн." }).click();
  await expect(page).toHaveURL(/visa_expires_within=15/);
});

test("mobile users filters and cards remain contained", async ({ page }) => {
  await openUsers(page, 390);
  const cards = page.locator(".admin-user-card");
  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText("Все фильтры", { exact: true }).click();
  await expect(page.getByLabel("Услуга")).toBeVisible();
  for (const button of await page.locator(".admin-user-actions button, .admin-user-actions a, .admin-user-chips button").all()) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("dark Admin error state remains readable without a white collision", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Temporary failure" }) }));
  await page.goto("/admin/");
  const panel = page.locator(".admin-status section");
  await expect(panel).toBeVisible();
  const colors = await panel.evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
  expect(colors.background).not.toBe("rgb(255, 253, 248)");
  expect(contrast(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5);
});
