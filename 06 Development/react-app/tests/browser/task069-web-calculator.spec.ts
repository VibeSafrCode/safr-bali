import { expect, test } from "@playwright/test";

const options = {
  give: [
    { code: "RUB_BANK", label: "Bank-transfer RUB" },
    { code: "USDT", label: "USDT" },
  ],
  receive: [{ code: "IDR_BANK", label: "Bank-transfer IDR" }],
  supported_pairs: [
    {
      route_code: "RUB_BANK_TO_IDR_BANK",
      give_currency: "RUB_BANK",
      receive_currency: "IDR_BANK",
      amount_sides: ["give", "receive"],
      enabled: true,
    },
    {
      route_code: "USDT_TO_IDR_BANK",
      give_currency: "USDT",
      receive_currency: "IDR_BANK",
      amount_sides: ["give", "receive"],
      enabled: true,
    },
  ],
  manual_pairs_supported: true,
};

test("authenticated browser session opens the calculator and keeps website/account exits", async ({ page }) => {
  let optionsRequests = 0;
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, first_name: "Maria", locale: "en", csrf_token: "csrf-fixture" }),
  }));
  await page.route("**/api/web/exchange/options", (route) => {
    optionsRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(options) });
  });

  await page.goto("/calculator/");
  await expect(page.locator(".calculator-page")).toBeVisible();
  await expect(page.getByRole("link", { name: "My account" }).first()).toHaveAttribute("href", "/account/");
  await expect(page.getByRole("link", { name: /Back to website/ })).toHaveAttribute(
    "href",
    "https://safrway.online/en/bali/exchange/usdt-idr/",
  );
  expect(optionsRequests).toBe(1);
});

test("guest browser calculator returns to website Home after Telegram login", async ({ page }) => {
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: false, locale: "ru" }),
  }));
  await page.goto("/calculator/");
  await expect(page.getByRole("heading", { name: "Войдите, чтобы открыть калькулятор" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
    "href",
    /\/api\/web\/auth\/start\?return_to=%2F$/,
  );
});

test("mobile language and theme controls stay in one row without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, first_name: "Maria", locale: "ru", csrf_token: "csrf-fixture" }),
  }));
  await page.route("**/api/web/exchange/options", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(options),
  }));
  await page.goto("/calculator/");
  const controls = page.locator(".appearance-controls");
  await expect(controls).toBeVisible();
  const groups = await controls.locator(".appearance-segment").all();
  expect(groups).toHaveLength(2);
  const first = await groups[0].boundingBox();
  const second = await groups[1].boundingBox();
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 100))).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "Личный кабинет" }).first()).toBeVisible();
});

test("authenticated account has explicit website and calculator exits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route("**/api/web/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, first_name: "Fixture", locale: "ru", csrf_token: "csrf-fixture" }),
  }));
  await page.route("**/api/web/account", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ telegram_id: 900000001, first_name: "Fixture", username: "fixture_user", balance: 0, referral_count: 0, referral_link: null, orders: [], locale: "ru" }),
  }));

  await page.goto("/account/");
  await expect(page.locator(".account-sidebar-actions").getByRole("link", { name: "← На сайт и к услугам" })).toHaveAttribute(
    "href",
    "https://safrway.online/",
  );
  await expect(page.locator(".account-sidebar-actions").getByRole("link", { name: "Открыть калькулятор →" })).toHaveAttribute(
    "href",
    "https://safrway.online/bali/exchange/usdt-idr/",
  );
  await expect(page.getByRole("link", { name: "Калькулятор Рассчитать обмен на сайте" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
