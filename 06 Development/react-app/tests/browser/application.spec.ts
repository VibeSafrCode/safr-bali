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

  await expect(
    page.getByRole("heading", { name: "Куда вы направляетесь?" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/home$/);
  await expect
    .poll(() => exchangedInitData)
    .toBe("query_id=ios-launch&hash=signed");
});

test("Mini App keeps all countries, soon preparation, and Thailand manager context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const externalRequests: string[] = [];
  let supportRequest: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4323")) {
      externalRequests.push(request.url());
    }
  });
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
  await page.route("**/mini-app/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: null, status: "new", messages: [] }),
    }),
  );
  await page.route("**/mini-app/chat/messages", async (route) => {
    supportRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, status: "new", messages: [] }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Куда вы направляетесь?" }),
  ).toBeVisible();
  await expect(page.locator(".country-slide")).toHaveCount(4);
  await expect(page.locator('[data-country-id="thailand"]')).toBeVisible();
  await expect(page.locator('[data-country-id="nepal"]')).toBeVisible();
  await expect(page.locator(".service-card")).toHaveCount(4);

  const destinationNames = {
    bali: "Бали",
    thailand: "Таиланд",
    russia: "Россия",
    nepal: "Непал",
  } as const;
  for (const destination of ["bali", "thailand", "russia", "nepal"] as const) {
    const select = page.locator(`[data-country-id="${destination}"]`);
    await select.click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(select).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: `Подробнее: ${destinationNames[destination]}` }).click();
    await expect(page).toHaveURL(new RegExp(`#\\/services\\/${destination}$`));
    if (destination === "thailand" || destination === "nepal") {
      const soonServices = page.locator(".service-grid .service-card");
      const serviceCount = await soonServices.count();
      expect(serviceCount).toBeGreaterThan(0);
      await expect(soonServices.locator("em")).toHaveCount(serviceCount);
      await expect(page.getByRole("button", { name: "Связаться" })).toBeVisible();
    }
    await page.getByRole("button", { name: "Главная", exact: true }).click();
  }

  await page.getByRole("searchbox", { name: "Найти страну по первым буквам" }).fill("Та");
  await expect(page.locator(".country-slide")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Чем помочь в Таиланде?" })).toBeVisible();
  await expect(page.locator(".service-card")).toHaveCount(4);
  await expect(page.locator(".service-card em")).toHaveCount(4);
  await page.getByRole("button", { name: "Подробнее: Таиланд" }).click();
  await page.getByRole("button", { name: /Обмен/ }).click();
  await expect(page.getByText("Услуга готовится к запуску")).toBeVisible();
  await page.getByRole("button", { name: "Написать менеджеру" }).click();
  await page.getByRole("textbox", { name: "Ваше сообщение" }).fill("Нужна подготовка");
  await page.getByRole("button", { name: "Отправить менеджеру" }).click();
  await expect.poll(() => supportRequest).not.toBeNull();
  expect(supportRequest).toEqual({
    body: "Нужна подготовка",
    route_context: {
      country: "Таиланд",
      section: "Обмен",
      service: "Обмен",
    },
  });
  await page.getByRole("button", { name: "Главная", exact: true }).click();

  await page.getByRole("searchbox", { name: "Найти страну по первым буквам" }).fill("Ро");
  await expect(page.locator(".country-slide")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Чем помочь в России?" })).toBeVisible();
  await expect(page.locator(".service-card")).toHaveCount(3);
  const russiaHero = page.getByRole("img", {
    name: "Московский Кремль и набережная Москвы-реки на рассвете",
  });
  await expect(russiaHero).toBeVisible();
  expect(await russiaHero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Подробнее: Россия" }).click();
  await page.getByRole("button", { name: /Санкт-Петербург/ }).click();
  const cityHeader = page.getByRole("img", {
    name: "Петропавловская крепость и набережная Невы на рассвете",
  });
  await expect(cityHeader).toBeVisible();
  await expect(cityHeader).toHaveAttribute(
    "src",
    "/assets/heroes/russia-spb-city-header-approved.jpg",
  );
  await page.getByRole("button", { name: "Россия" }).click();
  await page.getByRole("button", { name: /Урал/ }).click();
  await expect(
    page.getByRole("img", { name: "Лесистые Уральские хребты и река утром" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Россия" }).click();
  await page.getByRole("button", { name: /Кавказ/ }).click();
  await expect(
    page.getByRole("img", { name: "Высокогорная долина Кавказа с рекой" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Главная", exact: true }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Чем помочь в России?" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Найти страну по первым буквам" }).fill("Ба");
  await expect(page.getByRole("heading", { name: "Чем помочь на Бали?" })).toBeVisible();
  await page.getByRole("button", { name: "Открыть раздел: Бали" }).click();
  await expect(page.locator(".service-card")).toHaveCount(4);
  expect(
    await page.locator(".service-grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: /Сделать визу/ }).click();
  await expect(page.locator(".visa-card")).toHaveCount(6);
  await expect(page.locator(".visa-card-action")).toHaveCount(6);
  await expect(page.locator(".visa-grid .catalog-icon")).toHaveCount(0);
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

test("Telegram safe areas and focus primitives are applied to the shared shell", async ({
  page,
}) => {
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
        initData: "opaque-signed-data",
        ready() {},
        expand() {},
        viewportHeight: 700,
        viewportStableHeight: 680,
        safeAreaInset: { top: 20, right: 2, bottom: 16, left: 2 },
        contentSafeAreaInset: { top: 52, right: 0, bottom: 70, left: 0 },
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
  const safeArea = page.locator(".telegram-safe-area");
  await expect(safeArea).toHaveCSS("min-height", "680px");
  expect(
    await safeArea.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--safr-tg-content-top").trim(),
    ),
  ).toBe("52px");
  expect(
    await page.locator(".app-header").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingTop),
    ),
  ).toBeGreaterThanOrEqual(64);
  expect(
    await page.locator(".bottom-nav").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).bottom),
    ),
  ).toBeGreaterThanOrEqual(70);
  await expect(
    page.getByRole("button", { name: "Главная", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const search = page.getByRole("searchbox", {
    name: "Найти страну по первым буквам",
  });
  await search.focus();
  await expect(search).toHaveCSS("outline-style", "solid");
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
          {
            route_code: "RUB_BANK_TO_IDR_CASH",
            give_currency: "RUB_BANK",
            receive_currency: "IDR_CASH",
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
  await expect(page.getByText("Введите сумму", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("IDR_CASH");
  await page.getByRole("button", { name: "Поменять направление обмена" }).click();
  await expect(
    page.locator(".asset-picker").filter({ hasText: "Отдаёте" }),
  ).toContainText("Рубли безналичные");
  await page.getByRole("button", { name: "Поменять направление обмена" }).click();

  const givePicker = page.locator(".asset-picker").filter({ hasText: "Отдаёте" });
  await givePicker.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("option", { name: /Рупии наличные/ }).click();

  await page.getByRole("button", { name: "Сколько отдаю" }).click();
  await page.getByRole("textbox", { name: "Сколько отдаёте" }).fill("5150000");
  await expect(page.getByText("20 021 RUB")).toBeVisible();
  await expect.poll(async () =>
    page.locator(".quote-card").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    }),
  ).toBe(true);

  await page.getByRole("button", { name: "Сколько хочу получить" }).click();
  await page.getByRole("textbox", { name: "Сколько хотите получить" }).fill("20000");
  await expect(page.getByText("20 021 RUB")).toBeVisible();
  await expect(page.getByText("Обновляем расчёт…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Оставить заявку" })).toBeDisabled();
  await expect(page.getByText("5 150 000 IDR")).toBeVisible();
  await expect(page.getByText("Подтверждает оператор", { exact: true })).toBeVisible();
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
