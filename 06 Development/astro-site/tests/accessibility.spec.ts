import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";

const routes = [
  "/",
  "/directions/",
  "/directions/bali/",
  "/directions/bali/visas/e33g/",
];

for (const route of routes) {
  test(`${route} passes axe WCAG A/AA`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("pilot remains navigable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Открыть направления" }).click();
  await expect(page).toHaveURL(/\/directions\/$/);
  await page.getByRole("link", { name: /Бали/ }).first().click();
  await expect(page).toHaveURL(/\/directions\/bali\/$/);
  await page.getByRole("link", { name: /Сделать визу/ }).click();
  await expect(page).toHaveURL(/\/directions\/bali\/visas\/$/);
  await context.close();
});

test("mobile pilot has no horizontal lock and one Telegram exit", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  await page.goto("/directions/bali/visas/e33g/");
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.locator('a[href^="https://t.me/"]')).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Написать менеджеру" }),
  ).toHaveAttribute("href", "https://t.me/safr_bali_bot");
  await context.close();
});

test("unknown route returns a real 404", async ({ page }) => {
  const response = await page.goto("/missing-b2-route/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
});
