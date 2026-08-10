import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const outputDirectory = process.env.SAFR_VISUAL_OUTPUT_DIR;
const dashboard = {
  telegram_id: 618,
  first_name: "Никита",
  username: "safr",
  balance: 12500,
  referral_count: 3,
  referral_link: "https://t.me/safr_bali_bot?start=SAFE618",
  orders: [],
};

const viewports = [
  { name: "compact-320", width: 320, height: 568 },
  { name: "android-360", width: 360, height: 800 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 810 },
] as const;

test.skip(!outputDirectory, "Set SAFR_VISUAL_OUTPUT_DIR to capture review artifacts");

async function capture(page: Page, viewport: string, name: string) {
  const directory = path.join(outputDirectory!, viewport);
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    animations: "disabled",
  });
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function expectTouchTarget(page: Page, selector: string) {
  const dimensions = await page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dimensions.width).toBeGreaterThanOrEqual(44);
  expect(dimensions.height).toBeGreaterThanOrEqual(44);
}

async function mockMiniApp(page: Page) {
  let selectedLocale = "ru";
  let localeRequestMode: "success" | "error" | "pending" = "success";
  let releasePendingLocale: (() => void) | null = null;
  await page.route(/telegram-web-app\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "opaque-signed-data",
        ready() {},
        expand() {},
        HapticFeedback: { impactOccurred() {} },
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      },
    };
  });
  await page.route("**/mini-app/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        telegram_id: 618,
        first_name: "Никита",
        username: "safr",
        balance: 12500,
        referral_count: 3,
        locale: selectedLocale,
        referral_link: "https://t.me/safr_bali_bot?start=SAFE618",
        orders: [],
      }),
    }),
  );
  await page.route("**/mini-app/locale", async (route) => {
    const payload = route.request().postDataJSON() as { locale?: "ru" | "en" };
    if (localeRequestMode === "pending") {
      await new Promise<void>((resolve) => {
        releasePendingLocale = resolve;
      });
    }
    if (localeRequestMode === "error") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "locale sync unavailable" }),
      });
      return;
    }
    if (payload.locale) selectedLocale = payload.locale;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locale: selectedLocale, changed: true }),
    });
  });
  await page.route("**/mini-app/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: null, status: "new", messages: [] }),
    }),
  );
  await page.route("**/mini-app/exchange/options", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        give: [
          { code: "IDR_CASH", label: "Рупии наличные" },
          { code: "RUB_BANK", label: "Рубли безналичные" },
          { code: "USDT", label: "USDT" },
        ],
        receive: [
          { code: "RUB_BANK", label: "Рубли безналичные" },
          { code: "IDR_CASH", label: "Рупии наличные" },
        ],
        supported_pairs: [
          {
            route_code: "IDR_CASH_TO_RUB_BANK",
            give_currency: "IDR_CASH",
            receive_currency: "RUB_BANK",
            amount_sides: ["give", "receive"],
            enabled: true,
          },
          {
            route_code: "RUB_BANK_TO_IDR_CASH",
            give_currency: "RUB_BANK",
            receive_currency: "IDR_CASH",
            amount_sides: ["give", "receive"],
            enabled: true,
          },
          {
            route_code: "USDT_TO_RUB_BANK",
            give_currency: "USDT",
            receive_currency: "RUB_BANK",
            amount_sides: ["give", "receive"],
            enabled: true,
          },
        ],
        manual_pairs_supported: true,
      }),
    }),
  );
  await page.route("**/mini-app/exchange/quotes", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        quote_id: "visual-quote",
        route_code: "IDR_CASH_TO_RUB_BANK",
        mode: "GIVE",
        source_asset: "IDR_CASH",
        source_amount_display: "5150000",
        target_asset: "RUB_BANK",
        target_amount_display: "20021",
        status: "PRELIMINARY",
        manual_confirmation_required: true,
        calculated_at: "2026-08-05T10:00:00",
        expires_at: "2026-08-05T10:05:00",
        warning: "Финальную сумму и способ проведения сделки подтверждает оператор.",
      }),
    }),
  );
  return {
    setLocaleRequestMode(mode: "success" | "error" | "pending") {
      localeRequestMode = mode;
    },
    finishPendingLocale(outcome: "success" | "error") {
      localeRequestMode = outcome;
      releasePendingLocale?.();
      releasePendingLocale = null;
    },
  };
}

async function mockAccount(page: Page) {
  await page.route("**/api/web/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        telegram_id: dashboard.telegram_id,
        first_name: dashboard.first_name,
        username: dashboard.username,
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
}

test.beforeAll(async () => {
  await mkdir(outputDirectory!, { recursive: true });
});

for (const viewport of viewports) {
  test(`capture Mini App visual matrix at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockMiniApp(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Куда вы направляетесь?" }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /Храм Пура Улун Дану/ })).toBeVisible();
    await expectNoPageOverflow(page);
    if (viewport.name === "compact-320") {
      const thailandLabel = page.locator('[data-country-id="thailand"] strong');
      await expect(thailandLabel).toHaveText("Таиланд");
      expect(
        await thailandLabel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    }
    await expectTouchTarget(page, ".bottom-nav button");
    await capture(page, viewport.name, "01-home");

    await page.locator('[data-country-id="thailand"]').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.locator('[data-country-id="thailand"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await capture(page, viewport.name, "02-home-thailand-selected");
    await page.getByRole("button", { name: "Подробнее: Таиланд" }).click();
    await expect(page).toHaveURL(/#\/services\/thailand$/);
    await expect(page.locator(".service-card em")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Связаться" })).toBeVisible();
    await capture(page, viewport.name, "03-thailand-soon");
    await page.getByRole("button", { name: "Главная", exact: true }).click();
    await page.locator('[data-country-id="bali"]').click();
    await page.getByRole("button", { name: "Подробнее: Бали" }).click();
    await expect(page).toHaveURL(/#\/services\/bali$/);
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "04-bali-services");

    await page.goto("/?screen=services%2Frussia");
    await expect(page.getByRole("heading", { name: "Чем помочь?" })).toBeVisible();
    await capture(page, viewport.name, "05-russia-hub");

    await page.goto("/?screen=services%2Fnepal");
    await expect(page.getByRole("button", { name: "Связаться" })).toBeVisible();
    await capture(page, viewport.name, "06-nepal-soon");

    await page.goto("/?screen=services%2Fbali%2Fhousing");
    await expect(page.getByRole("heading", { name: "Жильё" })).toBeVisible();
    await capture(page, viewport.name, "07-housing-collection");

    await page.goto("/?screen=services%2Fbali%2Fhousing%2Fvilla");
    await expect(page.getByRole("img", { name: /Вилла на Бали/ })).toBeVisible();
    await capture(page, viewport.name, "08-villa-detail");

    await page.goto("/?screen=services%2Fbali%2Fvisas");
    await expect(page.locator(".visa-card")).toHaveCount(6);
    await expectTouchTarget(page, ".visa-card");
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "09-visa-grid");

    await page.getByRole("button", { name: /ITAS E33G/ }).click();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "10-visa-detail");

    await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
    await expect(page.getByText("Введите сумму", { exact: true })).toBeVisible();
    await expectTouchTarget(page, ".currency-swap");
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "11-calculator-empty");

    await page.locator(".asset-picker").first().getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, viewport.name, "12-calculator-selector");
    await page.getByRole("dialog").getByRole("button", { name: "Готово" }).click();

    await page.getByRole("textbox", { name: "Сколько отдаёте" }).fill("5150000");
    await expect(page.getByText("20 021 RUB")).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "13-calculator-result");

    await page.goto("/?screen=services%2Frussia%2Fspb");
    await expect(
      page.getByRole("img", {
        name: "Петропавловская крепость и набережная Невы на рассвете",
      }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "14-spb-header");

    await page.goto("/?screen=services%2Frussia%2Fspb%2Fboat-spb");
    await expect(page.getByRole("img", { name: /Катер на Неве|Небольшой катер/ })).toBeVisible();
    await capture(page, viewport.name, "15-spb-boat-detail");

    await page.goto("/?screen=services%2Frussia%2Fural");
    await expect(page.getByRole("img", { name: /Уральские хребты/ })).toBeVisible();
    await capture(page, viewport.name, "16-ural-header");

    await page.goto("/?screen=services%2Frussia%2Fcaucasus");
    await expect(page.getByRole("img", { name: /Кавказа/ })).toBeVisible();
    await capture(page, viewport.name, "17-caucasus-header");

    await page.getByRole("button", { name: /Профиль/ }).click();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "18-profile");

    await page.getByRole("button", { name: /Заявки/ }).click();
    await capture(page, viewport.name, "19-orders-empty");
    await page.getByRole("button", { name: /Поддержка/ }).click();
    await expect(page.getByRole("heading", { name: "Диалог с менеджером" })).toBeVisible();
    await capture(page, viewport.name, "20-support-empty");

    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "25-en-home");
    await page.getByRole("button", { name: "Details: Thailand" }).click();
    await expect(page.getByRole("button", { name: "Contact", exact: true })).toBeVisible();
    await capture(page, viewport.name, "26-en-thailand-soon");
    await page.goto("/?screen=services%2Fbali%2Fvisas");
    await expect(page.locator(".visa-card")).toHaveCount(6);
    await capture(page, viewport.name, "27-en-visa-grid");
    await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
    await expect(page.getByText("Enter an amount", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "28-en-calculator");
    await page.getByRole("button", { name: /Profile/ }).click();
    await capture(page, viewport.name, "29-en-profile");
    await page.getByRole("button", { name: /Support/ }).click();
    await capture(page, viewport.name, "30-en-support");

    await mockAccount(page);
    await page.goto("/account/");
    await expect(page.getByRole("heading", { name: /Здравствуйте/ })).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "21-account-overview");
    await page.getByRole("button", { name: "Заявки", exact: true }).click();
    await capture(page, viewport.name, "22-account-orders");
    await page.getByRole("button", { name: "Points", exact: true }).click();
    await capture(page, viewport.name, "23-account-points");
    await page.getByRole("button", { name: "Поддержка", exact: true }).click();
    await capture(page, viewport.name, "24-account-support");
  });
}

for (const viewport of viewports.filter(({ name }) =>
  name === "compact-320" || name === "iphone-390" || name === "desktop-1440"
)) {
  test(`capture language sync states at ${viewport.name}`, async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const localeControl = await mockMiniApp(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Куда вы направляетесь?" })).toBeVisible();

    localeControl.setLocaleRequestMode("pending");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText("Меняем язык…", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "31-language-loading");
    await expect(page.getByText("Language changed. Syncing your preference…", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "32-language-pending-sync");
    localeControl.finishPendingLocale("success");
    await expect(page.getByText("Language changed successfully.", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "33-language-success");

    localeControl.setLocaleRequestMode("success");
    await page.getByRole("button", { name: "RU", exact: true }).click();
    await expect(page.getByText("Язык успешно изменён.", { exact: true })).toBeVisible();
    localeControl.setLocaleRequestMode("error");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText("Не удалось изменить язык. Вернули предыдущий язык.", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "34-language-error-rollback");

    await context.setOffline(true);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText(/You are offline\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry synchronization" })).toBeVisible();
    await capture(page, viewport.name, "35-language-offline");
    await context.setOffline(false);
    localeControl.setLocaleRequestMode("pending");
    await page.getByRole("button", { name: "Retry synchronization" }).click();
    await expect(page.getByText("Language changed. Syncing your preference…", { exact: true })).toBeVisible();
    await capture(page, viewport.name, "36-language-retry");
    localeControl.finishPendingLocale("success");
    await expect(page.getByText("Language changed successfully.", { exact: true })).toBeVisible();
  });
}

test("capture compact English calculator essential labels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockMiniApp(page);
  await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByText("Language changed successfully.", { exact: true })).toBeVisible();
  await page.reload();
  const receiveLabel = page.locator(".asset-picker-trigger strong").filter({
    hasText: "Bank-transfer RUB",
  });
  await expect(receiveLabel).toHaveText("Bank-transfer RUB");
  expect(
    await receiveLabel.evaluate((element) =>
      element.scrollHeight <= element.clientHeight + 1 &&
      element.scrollWidth <= element.clientWidth + 1
    ),
  ).toBe(true);
  await expectNoPageOverflow(page);
  await capture(page, "compact-320", "28-en-calculator");
});
