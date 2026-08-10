import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const contract = JSON.parse(
  readFileSync(
    new URL("../../shared/contracts/ecosystem-routes.v1.json", import.meta.url),
    "utf8",
  ),
);
const routes = contract.astroPublicRoutes as string[];
const localizedRoutes = routes.flatMap((route) => [
  route,
  route === "/" ? "/en/" : `/en${route}`,
]);
const productionCsp =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

for (const route of localizedRoutes) {
  test(`${route} passes axe WCAG A/AA`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("language switch keeps the exact route and first-visit prompt never redirects", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/russia/spb/boat-spb/");
  await expect(page).toHaveURL(/\/russia\/spb\/boat-spb\/$/);
  await expect(page.locator("[data-language-suggestion]")).toBeVisible();
  await page.locator('[data-language-choice="en"]').click();
  await expect(page).toHaveURL(/\/en\/russia\/spb\/boat-spb\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator('[data-language-choice="ru"]').click();
  await expect(page).toHaveURL(/\/russia\/spb\/boat-spb\/$/);
});

test("Home discovery remains navigable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-public-services]")).toHaveCount(4);
  await page.getByRole("link", { name: "Показать услуги: Таиланд" }).click();
  await expect(page).toHaveURL(/#public-services-thailand$/);
  await page.locator('[data-public-country="bali"] .public-country-details').click();
  await expect(page).toHaveURL(/\/bali\/$/);
  await page.getByRole("link", { name: /Сделать визу/ }).click();
  await expect(page).toHaveURL(/\/bali\/visas\/$/);
  await context.close();
});

test("home country selection stays on Home and sibling details open every real hub", async ({ page }) => {
  for (const destination of ["bali", "thailand", "russia", "nepal"]) {
    await page.goto("/");
    const card = page.locator(`[data-public-country="${destination}"]`);
    await card.locator(".public-country-select").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(card).toHaveAttribute("data-selected", "true");
    await expect(card.locator(".public-country-details")).toHaveAttribute("href", `/${destination}/`);
    await card.locator(".public-country-details").click();
    await expect(page).toHaveURL(new RegExp(`/${destination}/$`));
  }
});

test("fingerprinted Home and support assets ignore simulated stale root cache objects", async ({ page }) => {
  let staleRootRequests = 0;
  for (const stalePath of ["home.js", "support.js"]) {
    await page.route(`**/${stalePath}`, async (route) => {
      staleRootRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "throw new Error('stale root cache object executed')",
      });
    });
  }
  await page.goto("/");
  const thailand = page.locator('[data-public-country="thailand"]');
  await thailand.locator(".public-country-select").click();
  await expect(thailand).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-public-services="thailand"]')).toBeVisible();
  await page.goto("/thailand/");
  await page.locator("[data-support-open]").first().click();
  await expect(page.locator("[data-support-panel]")).toBeVisible();
  expect(staleRootRequests).toBe(0);
});

test("representative visual routes run under the production CSP without style violations", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      cspViolations.push(message.text());
    }
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": productionCsp,
      },
    });
  });

  const cases = [
    ["/bali/", ".public-route-hero > img", "60% 16%"],
    ["/russia/", 'a[href="/russia/spb/"] img', "62% 22%"],
    ["/russia/spb/boat-spb/", ".public-route-hero > img", "62% 22%"],
    ["/russia/spb/boat-spb/", ".public-service-photo img", "62% 54%"],
    ["/russia/ural/rafting-ural/", ".public-route-hero > img", "68% 48%"],
    ["/bali/housing/villa/", ".public-service-photo img", "56% 48%"],
  ] as const;
  for (const [route, selector, position] of cases) {
    await page.goto(route);
    await expect(page.locator(selector)).toHaveCSS("object-position", position);
    await expect(page.locator("[style]")).toHaveCount(0);
  }
  expect(cspViolations).toEqual([]);
});

test("Home dual controls have no nested interactive elements", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("a a, a button, button a, button button")).toHaveCount(0);
  await expect(page.locator(".public-country-select")).toHaveCount(4);
  await expect(page.locator(".public-country-details")).toHaveCount(4);
});

test("public Thailand support preserves Thai staff route context", async ({ page }) => {
  const payloads: Array<Record<string, any>> = [];
  await page.route("**/api/web/chat/guest", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, conversation_id: 618 }),
    });
  });

  const thailandRoutes = [
    "/thailand/",
    "/thailand/exchange/",
    "/thailand/visas/",
    "/thailand/property/",
    "/thailand/yachts/",
  ];
  for (const route of thailandRoutes) {
    await page.goto(route);
    await page.locator("[data-support-open]").first().click();
    await page.locator('input[name="name"]').fill("Тест");
    await page.locator('input[name="contact"]').fill("@fixture");
    await page.locator('textarea[name="body"]').fill("Нужна консультация");
    await page.locator("[data-support-submit]").click();
    await expect.poll(() => payloads.length).toBe(thailandRoutes.indexOf(route) + 1);
    expect(payloads.at(-1)?.route_context).toMatchObject({
      country: "Таиланд",
      service: route,
    });
  }

  await page.goto("/bali/");
  await page.locator("[data-support-open]").first().click();
  await page.locator('input[name="name"]').fill("Тест");
  await page.locator('input[name="contact"]').fill("@fixture");
  await page.locator('textarea[name="body"]').fill("Нужна консультация");
  await page.locator("[data-support-submit]").click();
  await expect.poll(() => payloads.length).toBe(thailandRoutes.length + 1);
  expect(payloads.at(-1)?.route_context.country).toBeUndefined();
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
  await expect(page.locator(".support-launcher")).toBeHidden();
  await expect(page.locator(".manager-cta [data-support-open]:visible")).toHaveCount(1);
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
  await expect(page.locator(".support-launcher")).toBeHidden();
  await expect(page.locator(".manager-cta [data-support-open]:visible")).toHaveCount(1);
  await context.close();
});
