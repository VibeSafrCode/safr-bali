import { expect, test } from "@playwright/test";

const dashboard = {
  telegram_id: 618,
  first_name: "Никита",
  username: "safr",
  balance: 12500,
  referral_count: 3,
  referral_link: "https://t.me/safr_bali_bot?start=SAFE618",
  orders: [],
};

test("Mini App opens independent catalog pages without bot commands", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4323")) {
      externalRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "opaque-signed-data",
        ready() {},
        expand() {},
        HapticFeedback: { impactOccurred() {} },
        BackButton: {
          show() {},
          hide() {},
          onClick() {},
          offClick() {},
        },
      },
    };
  });
  await page.route("**/mini-app/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboard),
    }),
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Нужная помощь/ })).toBeVisible();
  await page.getByRole("button", { name: /Открыть направления/ }).click();
  await page.getByRole("button", { name: /Бали/ }).click();
  await page.getByRole("button", { name: /Сделать визу/ }).click();
  await page.getByRole("button", { name: /ITAS E33G/ }).click();
  await expect(page.getByRole("heading", { name: "ITAS E33G" })).toBeVisible();
  await expect(page).toHaveURL(/#\/services\/bali\/visas\/e33g$/);
  expect(externalRequests.filter((url) => url.includes("t.me"))).toEqual([]);
});

test("bottom navigation does not lock page scrolling", async ({ page }) => {
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "opaque-signed-data",
        ready() {},
        expand() {},
      },
    };
  });
  await page.route("**/mini-app/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboard),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Профиль/ }).click();
  await expect(page.getByRole("heading", { name: "Никита" })).toBeVisible();
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflowY),
  ).toBe("auto");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(0);
});

test("browser account exposes independent account sections and support", async ({
  page,
}) => {
  await page.route("**/api/web/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        telegram_id: 618,
        first_name: "Никита",
        username: "safr",
      }),
    }),
  );
  await page.route("**/api/web/account", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboard),
    }),
  );
  await page.route("**/api/web/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: null, status: "empty", messages: [] }),
    }),
  );

  await page.goto("/account/orders/");
  await expect(page.getByRole("heading", { name: "Мои услуги" })).toBeVisible();
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Здравствуйте/ })).toBeVisible();
  await page.getByRole("button", { name: "Points", exact: true }).click();
  await expect(page.getByRole("heading", { name: "12 500 Points" })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/points\/$/);
  await page.getByRole("button", { name: "Поддержка", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Диалог с менеджером" })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/support\/$/);
  await expect(page.locator(".manager-fab")).toHaveCount(0);
});
