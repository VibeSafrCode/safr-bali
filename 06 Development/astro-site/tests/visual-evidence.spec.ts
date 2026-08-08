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

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

for (const viewport of viewports) {
  test(`capture Astro matrix at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/");
    await expect(page.locator(".public-country-card")).toHaveCount(4);
    await expectNoOverflow(page);
    if (viewport.name === "desktop-1440") {
      const dashboard = await page.locator(".public-home-dashboard").boundingBox();
      expect(dashboard).not.toBeNull();
      expect(dashboard!.y).toBeLessThan(430);
      expect(dashboard!.y + dashboard!.height).toBeLessThanOrEqual(810);
    }
    await capture(page, viewport.name, "01-home");

    await page.getByRole("link", { name: /Таиланд/ }).click();
    await expect(page).toHaveURL(/\/thailand\/$/);
    await expect(page.locator(".catalog-card.soon")).toHaveCount(4);
    await capture(page, viewport.name, "02-home-thailand-soon");

    await page.goto("/bali/visas/");
    await expect(page.locator(".public-visa-hero")).toBeVisible();
    await expect(page.locator(".public-visa-grid .catalog-card")).toHaveCount(6);
    await expect(page.locator(".public-visa-grid .catalog-card-icon")).toHaveCount(0);
    await expect(page.locator(".public-visa-grid .catalog-card-price")).toHaveCount(5);
    await expect(page.locator(".public-visa-grid .catalog-card").first()).toHaveCSS(
      "border-color",
      "rgb(216, 217, 210)",
    );
    await expect(page.locator(".public-visa-grid .catalog-card-price").first()).toHaveCSS(
      "color",
      "rgb(184, 79, 57)",
    );
    await expectNoOverflow(page);
    if (viewport.name === "desktop-1440") {
      const layout = await page.locator(".public-visa-layout").boundingBox();
      expect(layout).not.toBeNull();
      expect(layout!.y + layout!.height).toBeLessThanOrEqual(810);
    }
    await capture(page, viewport.name, "03-visa-grid");

    await page.goto("/bali/visas/e33g/");
    await expectNoOverflow(page);
    await capture(page, viewport.name, "04-visa-detail");

    await page.goto("/bali/exchange/usdt-idr/");
    await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.locator("[data-public-exchange-calculator]")).toHaveCount(0);
    await expectNoOverflow(page);
    await capture(page, viewport.name, "05-exchange-login");
  });
}
