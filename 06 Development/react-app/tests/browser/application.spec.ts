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

test("Telegram launch data is captured before React replaces the service hash", async ({
  page,
}) => {
  let sessionCreated = false;
  let exchangedInitData = "";

  await page.route(/telegram-web-app\.js/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "query_id=ios-launch&hash=signed",
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
      status: sessionCreated ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(sessionCreated ? dashboard : { detail: "session required" }),
    }),
  );
  await page.route("**/mini-app/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "refresh required" }),
    }),
  );
  await page.route("**/mini-app/auth/session", async (route) => {
    exchangedInitData = route.request().postDataJSON().init_data;
    sessionCreated = true;
    await route.fulfill({ status: 204 });
  });

  await page.goto(
    "/#tgWebAppData=query_id%3Dios-launch%26hash%3Dsigned&tgWebAppVersion=9.0",
  );

  await expect(page.getByRole("heading", { name: "SAFRWAY" })).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
  await expect
    .poll(() => exchangedInitData)
    .toBe("query_id=ios-launch&hash=signed");
});

test("Mini App opens independent catalog pages without bot commands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await expect(page.getByRole("heading", { name: "SAFRWAY" })).toBeVisible();
  await expect(page.locator(".country-card")).toHaveCount(4);
  expect(
    await page.locator(".country-grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: /Бали/ }).click();
  await expect(page.locator(".service-card")).toHaveCount(4);
  expect(
    await page.locator(".service-grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(2);
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
  await expect(page.getByLabel("Статистика профиля")).toContainText("SAFR Points");
  await expect(page.getByLabel("Статистика профиля")).toContainText("Моя сеть");
  await expect(page.getByLabel("Статистика профиля")).toContainText("Заявки");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflowY),
  ).toBe("auto");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(0);
});

test("Bali calculator supports known give and receive amounts without bot commands", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const quoteRequests: Array<Record<string, string>> = [];
  const exchangeRequests: Array<{
    body: Record<string, string>;
    idempotencyKey: string;
  }> = [];
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
  await page.route("**/mini-app/exchange/options", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        give: [
          { code: "RUB_BANK", label: "Рубли безналичные" },
          { code: "USDT", label: "USDT" },
          { code: "IDR_CASH", label: "Рупии наличные" },
          { code: "IDR_BANK", label: "Рупии безналичные" },
        ],
        receive: [
          { code: "IDR_CASH", label: "Рупии наличные" },
          { code: "IDR_BANK", label: "Рупии безналичные" },
          { code: "RUB_BANK", label: "Рубли безналичные" },
        ],
        supported_pairs: [
          {
            route_code: "IDR_CASH_TO_RUB_BANK",
            give_currency: "IDR_CASH",
            receive_currency: "RUB_BANK",
            amount_sides: ["give", "receive"],
          },
        ],
        manual_pairs_supported: true,
      }),
    }),
  );
  await page.route("**/mini-app/exchange/quotes", async (route) => {
    const request = route.request().postDataJSON() as Record<string, string>;
    quoteRequests.push(request);
    const byGive = request.amount_side === "give";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: byGive ? "quote-give" : "quote-receive",
        give_currency: "IDR_CASH",
        receive_currency: "RUB_BANK",
        give_amount: "5150000",
        receive_amount: byGive ? "20021" : "20000",
        status: "PRELIMINARY",
        manual_confirmation_required: true,
        expires_at: "2026-07-29T10:05:00",
      }),
    });
  });
  await page.route("**/mini-app/exchange/requests", async (route) => {
    exchangeRequests.push({
      body: route.request().postDataJSON() as Record<string, string>,
      idempotencyKey: route.request().headers()["idempotency-key"],
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        quote_id: "quote-receive",
        status: "AWAITING_OPERATOR",
      }),
    });
  });

  await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
  await expect(page).toHaveURL(/#\/services\/bali\/exchange\/usdt-idr$/);
  const givePicker = page.locator(".asset-picker").filter({ hasText: "Отдаёте" });
  await givePicker.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("option", { name: /Рупии наличные/ }).click();

  await page.getByRole("button", { name: "Сколько отдаю" }).click();
  await page.getByRole("textbox", { name: "Сколько отдаёте" }).fill("5150000");
  await expect(page.getByText("20 021 RUB")).toBeVisible();

  await page.getByRole("button", { name: "Сколько хочу получить" }).click();
  await page.getByRole("textbox", { name: "Сколько хотите получить" }).fill("20000");
  await expect(page.getByText("5 150 000 IDR")).toBeVisible();
  await page.getByRole("button", { name: "Оставить заявку" }).click();
  await expect(page.getByRole("button", { name: "Заявка отправлена" })).toBeDisabled();

  expect(quoteRequests).toEqual([
    {
      give_currency: "IDR_CASH",
      receive_currency: "RUB_BANK",
      amount: "5150000",
      amount_side: "give",
      route_code: "IDR_CASH_TO_RUB_BANK",
      mode: "GIVE",
    },
    {
      give_currency: "IDR_CASH",
      receive_currency: "RUB_BANK",
      amount: "20000",
      amount_side: "receive",
      route_code: "IDR_CASH_TO_RUB_BANK",
      mode: "RECEIVE",
    },
  ]);
  expect(exchangeRequests).toHaveLength(1);
  expect(exchangeRequests[0].body).toEqual({ quote_id: "quote-receive" });
  expect(exchangeRequests[0].idempotencyKey).toMatch(
    /^exchange-request-quote-receive-/,
  );
  expect(externalRequests.filter((url) => url.includes("t.me"))).toEqual([]);
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
