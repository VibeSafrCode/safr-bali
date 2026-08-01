import { mkdir } from "node:fs/promises";
import path from "node:path";

import { devices, expect, test, type Page } from "@playwright/test";

const outputDirectory = process.env.SAFR_VISUAL_OUTPUT_DIR;

test.use({ ...devices["iPhone 13"], browserName: "chromium" });
test.skip(!outputDirectory, "Set SAFR_VISUAL_OUTPUT_DIR to capture review artifacts");

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: path.join(outputDirectory!, `${name}.png`),
    animations: "disabled",
  });
}

async function mockMiniApp(page: Page) {
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
        calculated_at: "2026-08-01T10:00:00",
        expires_at: "2026-08-01T10:05:00",
        warning: "Финальную сумму и способ проведения сделки подтверждает оператор.",
      }),
    }),
  );
}

test.beforeAll(async () => {
  await mkdir(outputDirectory!, { recursive: true });
});

test("capture Mini App mobile after-screenshots", async ({ page }) => {
  await mockMiniApp(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SAFRWAY" })).toBeVisible();
  await capture(page, "miniapp-home");

  await page.getByRole("button", { name: /Бали/ }).click();
  await capture(page, "miniapp-bali-services");

  await page.goto("/?screen=services%2Fbali%2Fexchange%2Fusdt-idr");
  await page.locator(".asset-picker").first().getByRole("button").first().click();
  await capture(page, "calculator-wheel");
  await page.getByRole("dialog").getByRole("button", { name: "Готово" }).click();

  await page.getByRole("textbox", { name: "Сколько отдаёте" }).fill("5150000");
  await expect(page.getByText("20 021 RUB")).toBeVisible();
  await capture(page, "calculator-live-quote");

  await page.getByRole("button", { name: /Профиль/ }).click();
  await capture(page, "miniapp-profile");
});
