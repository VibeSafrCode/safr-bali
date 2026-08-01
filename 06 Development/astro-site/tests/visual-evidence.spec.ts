import { mkdir } from "node:fs/promises";
import path from "node:path";

import { devices, test, type Page } from "@playwright/test";

const outputDirectory = process.env.SAFR_VISUAL_OUTPUT_DIR;

test.use({ ...devices["iPhone 13"], browserName: "chromium" });
test.skip(!outputDirectory, "Set SAFR_VISUAL_OUTPUT_DIR to capture review artifacts");

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: path.join(outputDirectory!, `${name}.png`),
    animations: "disabled",
  });
}

test.beforeAll(async () => {
  await mkdir(outputDirectory!, { recursive: true });
});

test("capture Astro mobile after-screenshots", async ({ page }) => {
  await page.goto("/");
  await capture(page, "website-home");

  await page.goto("/catalog/");
  await capture(page, "website-country-grid");

  await page.goto("/bali/visas/e33g/");
  await capture(page, "visa-page-top");

  await page.locator(".public-content-facts").scrollIntoViewIfNeeded();
  await capture(page, "visa-page-content");

  await page.locator(".manager-cta").scrollIntoViewIfNeeded();
  await capture(page, "visa-page-bottom-cta");
});
