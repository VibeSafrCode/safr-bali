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

const publishedVisa = {
  id: 41,
  country_code: "ID",
  visa_type: { code: "B1", name: "B1", version: 1 },
  service_status: "PROCESSING",
  lifecycle_status: "ACTIVE",
  publication_status: "PUBLISHED",
  notifications_enabled: true,
  stay_end: "2026-09-15",
  next_action_text: "Contact SAFRWAY before extension",
  recommended_contact_at: "2026-09-01T00:00:00+08:00",
  version: 2,
};

test("published visa cabinet is shared by authenticated Mini App and account", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { window.Telegram = { WebApp: { initData: "opaque", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
  await page.route("**/mini-app/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale: "en" }) }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [publishedVisa] }) }));
  await page.route("**/mini-app/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...publishedVisa, current_process: { type: "APPLICATION", external_status: "PROCESSING", updated_at: "2026-08-20T00:00:00Z" }, timeline: [{ id: 1, type: "PUBLIC_UPDATE", title: "Visa issued", created_at: "2026-08-20T00:00:00Z" }], documents: [{ id: 2, type: "VISA", name: "Visa PDF", access_url: "/mini-app/visa-cases/41/documents/2" }] }) }));
  await page.goto("/#/visas");
  await expect(page.getByRole("heading", { name: "My visas" })).toBeVisible();
  await expect(page.getByText("15 September 2026")).toBeVisible();
  await page.getByRole("button", { name: "Open visa" }).click();
  await expect(page.getByRole("heading", { name: "Visa active" })).toBeVisible();
  await expect(page.getByText("SAFRWAY is processing")).toBeVisible();
  await expect(page.getByText("In progress")).toBeVisible();
  await expect(page.getByText("Visa PDF")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open securely" })).toHaveAttribute("href", "/mini-app/visa-cases/41/documents/2");
  await expect(page.locator("body")).not.toContainText("PROCESSING");
  await expect(page.locator("body")).not.toContainText("passport");
});

test("root admin CRM exposes client search and draft visa creation without client secrets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin" }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/clients", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }] }) }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 1, code: "B1", name: "B1", version: 1, rules_verified: false }, { id: 2, code: "OTHER", name: "Other Visa", version: 1, rules_verified: false }] }) }));
  await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }, visa_cases: [{ ...publishedVisa, user_id: 5 }], notes: [], credentials: [{ id: 8, provider: "Fixture portal", login_mask: "••••mail" }] }) }));
  await page.goto("/admin/clients/");
  await expect(page.getByRole("heading", { name: "Клиенты", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /Fixture/ }).click();
  await expect(page.getByText("Защищённые доступы")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("real-secret");
  await page.getByRole("button", { name: "+ Добавить визу" }).click();
  await expect(page.getByRole("heading", { name: "Новая виза" })).toBeVisible();
  await expect(page.getByText("Кейс будет сохранён как черновик и не появится у клиента до явной публикации.")).toBeVisible();
  await expect(page.getByLabel("Тип визы")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Новая виза" })).toBeHidden();
  await expect(page.getByRole("button", { name: "+ Добавить визу" })).toBeFocused();
});

test("browser account shows the same published-only visa cabinet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: "Fixture", csrf_token: "fixture" }) }));
  await page.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale: "ru" }) }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...publishedVisa, next_action_text: "Обратиться в SAFRWAY" }] }) }));
  await page.goto("/account/visas/");
  await expect(page.getByRole("heading", { name: "Мои визы" })).toBeVisible();
  await expect(page.getByText("15 сентября 2026 г.")).toBeVisible();
  await expect(page.getByText("Обратиться в SAFRWAY")).toBeVisible();
});

test("English account visa shell contains no Russian labels or raw visa enums", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: "Fixture", csrf_token: "fixture" }) }));
  await page.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale: "en" }) }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...publishedVisa, next_action_text: "Обратиться в SAFRWAY" }] }) }));
  await page.goto("/account/visas/");
  await expect(page.getByRole("heading", { name: "My visas" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account sections" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Мои визы|Личный кабинет|Выйти|PROCESSING|ACTIVE/);
});

test("visa client mutations are single-flight and roll back on failure", async ({ page }) => {
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { window.Telegram = { WebApp: { initData: "opaque", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
  await page.route("**/mini-app/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...dashboard, locale: "en" }) }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [publishedVisa] }) }));
  await page.route("**/mini-app/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publishedVisa) }));
  await page.route("**/mini-app/visa-cases/41/notifications", async (route) => { await new Promise((resolve) => setTimeout(resolve, 150)); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
  await page.route("**/mini-app/visa-cases/41/entry", async (route) => { await new Promise((resolve) => setTimeout(resolve, 150)); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "fixture" }) }); });
  await page.goto("/#/visas"); await page.getByRole("button", { name: "Open visa" }).click();
  const toggle = page.getByRole("button", { name: "Disabled" }); await toggle.click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("previous value was restored");
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
  await page.getByLabel("Entry date").fill("2026-08-21"); await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("previous value was restored");
});

test("admin confirmation, update notification and credential fail-closed states are explicit", async ({ page }) => {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root", role: "admin" }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/clients", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active", tags: [], active_visa_count: 1, requires_attention: false }] }) }));
  await page.route("**/api/web/admin/visa-cases/types", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 1, code: "B1", name: "B1", version: 1, rules_verified: false }] }) }));
  await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ client: { id: 5, first_name: "Fixture", telegram_id_mask: "••••0618", bot_status: "active" }, visa_cases: [{ ...publishedVisa, user_id: 5 }], notes: [], credentials: [{ id: 8, provider: "Fixture portal", login_mask: "••••mail" }] }) }));
  let accessAttempt = 0;
  await page.route("**/api/web/admin/visa-cases/credentials/8/access", async (route) => { accessAttempt += 1; if (accessAttempt === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "key unavailable" }) }); else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "fixture", secret: "ephemeral-fixture" }) }); });
  let updateBody: Record<string, unknown> | null = null;
  await page.route("**/api/web/admin/visa-cases/41", async (route) => { updateBody = route.request().postDataJSON() as Record<string, unknown>; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...publishedVisa, version: 3 }) }); });
  await page.goto("/admin/clients/"); await page.getByRole("button", { name: /Fixture/ }).click();
  await page.getByRole("button", { name: "Показать" }).click(); await expect(page.getByRole("status")).toContainText("ключ шифрования не настроен"); await expect(page.locator("body")).not.toContainText("ephemeral-fixture");
  await page.getByRole("button", { name: "Показать" }).click(); await expect(page.getByText(/ephemeral-fixture/)).toBeVisible(); await page.getByRole("button", { name: "Скрыть сейчас" }).click(); await expect(page.locator("body")).not.toContainText("ephemeral-fixture");
  await page.getByRole("button", { name: /Индонезия/ }).click();
  await page.getByRole("button", { name: "Опубликовать" }).click(); await expect(page.getByRole("heading", { name: "Подтвердите действие" })).toBeVisible(); await expect(page.getByText(/одно уведомление о публикации/)).toBeVisible(); await page.getByRole("button", { name: "Отмена" }).last().click();
  await page.getByRole("button", { name: "Сохранить и уведомить" }).click();
  await expect.poll(() => updateBody).toMatchObject({ notify_client: true });
  expect((updateBody as Record<string, unknown>).idempotency_key).toBeTruthy();
});

test("saved English locale renders Mini App and manual RU switch persists server-side", async ({ page }) => {
  let localeUpdate: Record<string, unknown> | null = null;
  await page.route(/telegram-web-app\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
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
      body: JSON.stringify({ ...dashboard, locale: "en" }),
    }),
  );
  await page.route("**/mini-app/locale", async (route) => {
    localeUpdate = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locale: "ru", changed: true }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Куда вы направляетесь?" })).toBeVisible();
  await expect.poll(() => localeUpdate).toEqual({ locale: "ru" });
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

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

test("secure admin renders nine views and sends actor-bound order mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 810 });
  let mutation: { csrf: string | null; key: string | null; body: unknown } | null = null;
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Admin", role: "admin" }, csrf_token: "fixture-csrf" }) }));
  await page.route("**/api/web/admin/dashboard", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ new_users_7d: 2, orders_attention: 1, open_conversations: 0, referral_missing_rows: 0 }) }));
  await page.route("**/api/web/admin/orders", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1, items: [{ id: 7, service: "Visa", status: "new", payment_status: "pending", created_at: "2026-08-08T12:00:00Z" }] }) }));
  await page.route("**/api/web/admin/orders/7", async (route) => {
    mutation = { csrf: route.request().headers()["x-csrf-token"] ?? null, key: route.request().headers()["idempotency-key"] ?? null, body: route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 7, status: "new", payment_status: "paid", idempotent_replay: false }) });
  });
  await page.route("**/api/web/admin/settings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exchange_routes: [] }) }));
  await page.route(/\/api\/web\/admin\/(users|referrals|points|audit|queues\/.*)$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [], metrics: {} }) }));

  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();
  for (const label of ["Пользователи", "Рефералы", "Заказы", "Points и награды", "Очереди", "Настройки", "Аудит", "Контракт"]) {
    await page.getByRole("button", { name: label, exact: true }).first().click();
    await expect(page.getByRole("heading", { name: label, exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Заказы", exact: true }).first().click();
  await page.getByRole("button", { name: "Действия" }).click();
  await page.getByLabel("Причина").fill("Payment evidence checked");
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(() => mutation).not.toBeNull();
  expect(mutation?.csrf).toBe("fixture-csrf");
  expect(mutation?.key).toBeTruthy();
  expect(mutation?.body).toEqual({ target: "paid", comment: "Payment evidence checked" });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator(".admin-mobile")).toBeVisible();
});

test("admin denies a client session without exposing data", async ({ page }) => {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: "Admin role required" }) }));
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Недостаточно прав" })).toBeVisible();
  await expect(page.getByText("Эта сессия не имеет роли admin.")).toBeVisible();
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
  await page.route("**/mini-app/locale", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locale: "en", changed: true }),
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

  await page.getByRole("button", { name: "EN", exact: true }).click();
  const englishCalculator = page.locator(".calculator-page");
  await expect(englishCalculator).toContainText("Cash IDR");
  await expect(englishCalculator).toContainText("Bank-transfer RUB");
  await expect(englishCalculator).toContainText("Operator confirmation required");
  await expect(englishCalculator).not.toContainText(/[А-Яа-яЁё]/);
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
