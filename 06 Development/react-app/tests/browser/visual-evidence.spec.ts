import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const outputDirectory = process.env.SAFR_VISUAL_OUTPUT_DIR;

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
        referral_link: "https://t.me/safr_bali_bot?start=SAFE618",
        orders: [],
      }),
    }),
  );
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
}

test.beforeAll(async () => {
  await mkdir(outputDirectory!, { recursive: true });
});

for (const viewport of viewports) {
  test(`capture Mini App visual matrix at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockMiniApp(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Куда вы направляетесь?" }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /Храм Пура Улун Дану/ })).toBeVisible();
    await expectNoPageOverflow(page);
    await expectTouchTarget(page, ".bottom-nav button");
    await capture(page, viewport.name, "01-home");

    await page.getByRole("button", { name: /Таиланд/ }).click();
    await expect(page.locator(".service-card em")).toHaveCount(4);
    await capture(page, viewport.name, "02-home-thailand-soon");
    await page.getByRole("button", { name: /Бали/ }).click();

    await page.getByRole("button", { name: "Открыть раздел: Бали" }).click();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "03-bali-services");

    await page.getByRole("button", { name: /Сделать визу/ }).click();
    await expect(page.locator(".visa-card")).toHaveCount(6);
    await expectTouchTarget(page, ".visa-card");
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "04-visa-grid");

    await page.getByRole("button", { name: /ITAS E33G/ }).click();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "05-visa-detail");

    await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
    await expect(page.getByText("Введите сумму", { exact: true })).toBeVisible();
    await expectTouchTarget(page, ".currency-swap");
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "06-calculator-empty");

    await page.locator(".asset-picker").first().getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, viewport.name, "07-calculator-selector");
    await page.getByRole("dialog").getByRole("button", { name: "Готово" }).click();

    await page.getByRole("textbox", { name: "Сколько отдаёте" }).fill("5150000");
    await expect(page.getByText("20 021 RUB")).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "08-calculator-result");

    await page.goto("/?screen=services%2Frussia%2Fspb");
    await expect(
      page.getByRole("img", {
        name: "Петропавловская крепость и набережная Невы на рассвете",
      }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "09-spb-header");

    await page.getByRole("button", { name: /Профиль/ }).click();
    await expectNoPageOverflow(page);
    await capture(page, viewport.name, "10-profile");

    if (viewport.name === "iphone-390" || viewport.name === "desktop-1440") {
      await page.getByRole("button", { name: /Заявки/ }).click();
      await capture(page, viewport.name, "11-orders-empty");
      await page.getByRole("button", { name: /Поддержка/ }).click();
      await expect(page.getByRole("heading", { name: "Диалог с менеджером" })).toBeVisible();
      await capture(page, viewport.name, "12-support-empty");
    }
  });
}
