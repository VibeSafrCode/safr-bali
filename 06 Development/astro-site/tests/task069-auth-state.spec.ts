import { expect, test } from "@playwright/test";

test("authenticated public exchange page opens calculator and keeps account access", async ({ page }) => {
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, first_name: "Maria", locale: "ru" }),
  }));
  await page.goto("/bali/exchange/usdt-idr/");
  await expect(page.locator("[data-public-auth-state]")).toHaveAttribute("data-public-auth-state", "authenticated");
  await expect(page.locator("[data-public-account-status]")).toHaveText("Открыть кабинет");
  await expect(page.locator("[data-public-account-mobile-status]")).toHaveText("Кабинет");
  await expect(page.locator("[data-exchange-auth-action]")).toHaveText("Открыть калькулятор");
  await expect(page.locator("[data-exchange-auth-action]")).toHaveAttribute(
    "href",
    "https://app.safrway.online/calculator/",
  );
  await expect(page.locator("[data-exchange-account-action]")).toBeVisible();
});

test("guest public exchange page starts Telegram auth with a localized Home return", async ({ page }) => {
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ detail: "Not authenticated" }),
  }));
  await page.goto("/en/bali/exchange/usdt-idr/");
  await expect(page.locator("[data-public-auth-state]")).toHaveAttribute("data-public-auth-state", "guest");
  await expect(page.locator("[data-exchange-auth-action]")).toHaveText("Sign in");
  await expect(page.locator("[data-exchange-auth-action]")).toHaveAttribute(
    "href",
    "/api/web/auth/start?return_to=%2Fen%2F",
  );
  await expect(page.locator("[data-exchange-account-action]")).toBeHidden();
});

test("public 320 controls keep language and theme on one line", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, first_name: "Maria", locale: "ru" }),
  }));
  await page.goto("/bali/visas/");
  const language = await page.locator(".site-language-switch").boundingBox();
  const theme = await page.locator(".site-theme-switch").boundingBox();
  expect(Math.abs((language?.y ?? 0) - (theme?.y ?? 100))).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("[data-public-account-link]")).toBeVisible();
  await expect(page.locator("[data-public-account-mobile-status]")).toBeVisible();
});
