import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";

const routes = [
  "/",
  "/catalog/",
  "/bali/",
  "/bali/visas/e33g/",
  "/thailand/",
  "/russia/ural/retreat-ural/",
  "/nepal/everest/",
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

test("public catalog remains navigable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Открыть направления" }).click();
  await expect(page).toHaveURL(/\/catalog\/$/);
  await page.getByRole("link", { name: /Бали/ }).first().click();
  await expect(page).toHaveURL(/\/bali\/$/);
  await page.getByRole("link", { name: /Сделать визу/ }).click();
  await expect(page).toHaveURL(/\/bali\/visas\/$/);
  await context.close();
});

test("mobile public page scrolls after support panel interactions", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  await page.goto("/bali/visas/e33g/");
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
  await page.getByRole("button", { name: "Написать менеджеру" }).first().click();
  await expect(
    page.getByRole("link", { name: "Перейти в Telegram" }),
  ).toHaveAttribute("href", "https://t.me/safr_bali_bot");
  await page.getByRole("button", { name: "Закрыть форму" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await context.close();
});

test("mobile manager launcher respects safe space and does not cover footer links", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  await page.goto("/bali/visas/e33g/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const launcher = await page.locator(".support-launcher-button").boundingBox();
  const footerLinks = await page.locator(".site-footer a").evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    }),
  );

  expect(launcher).not.toBeNull();
  for (const link of footerLinks) {
    const overlaps =
      launcher!.x < link.right &&
      launcher!.x + launcher!.width > link.left &&
      launcher!.y < link.bottom &&
      launcher!.y + launcher!.height > link.top;
    expect(overlaps).toBe(false);
  }
  await context.close();
});

test("unknown route returns a real 404", async ({ page }) => {
  const response = await page.goto("/missing-b2-route/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
});

test("desktop exchange login CTA is visible in the first viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/bali/exchange/usdt-idr/");
  const cta = page.getByRole("link", { name: "Войти", exact: true });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/account/");
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  await expect(page.locator("[data-public-exchange-calculator]")).toHaveCount(0);
});

test("mobile exchange login CTA is visible in the first viewport", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  await page.goto("/bali/exchange/usdt-idr/");
  const cta = page.getByRole("link", { name: "Войти", exact: true });
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await context.close();
});
