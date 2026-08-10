import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const outputDirectory = process.env.SAFR_VISUAL_OUTPUT_DIR;
const contract = JSON.parse(
  readFileSync(
    new URL("../../shared/contracts/ecosystem-routes.v1.json", import.meta.url),
    "utf8",
  ),
);
const publicRoutes = contract.astroPublicRoutes as string[];
const localizedPublicRoutes = publicRoutes.flatMap((route) => [
  route,
  route === "/" ? "/en/" : `/en${route}`,
]);
const viewports = [
  { name: "compact-320", width: 320, height: 568 },
  { name: "android-360", width: 360, height: 800 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 810 },
] as const;

test.skip(!outputDirectory, "Set SAFR_VISUAL_OUTPUT_DIR to capture review artifacts");

async function capture(page: Page, viewport: string, name: string) {
  const target = path.join(outputDirectory!, viewport, `${name}.png`);
  await mkdir(path.dirname(target), { recursive: true });
  await page.screenshot({
    path: target,
    animations: "disabled",
  });
}

async function expectNoOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: element.className,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((rect) => rect.left < -1 || rect.right > viewport + 1)
        .slice(0, 8),
      internalOverflow: [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent?.trim().slice(0, 80),
        }))
        .slice(0, 8),
    };
  });
  expect(metrics, JSON.stringify(metrics)).toMatchObject({
    scrollWidth: metrics.viewport,
  });
}

for (const viewport of viewports) {
  test(`capture Astro matrix at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/");
    await expect(page.locator(".public-country-card")).toHaveCount(4);
    await expectNoOverflow(page);
    if (viewport.name === "compact-320") {
      const thailandLabel = page.locator(
        '[data-public-country="thailand"] .public-country-copy strong',
      );
      await expect(thailandLabel).toHaveText("Таиланд");
      expect(
        await thailandLabel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
    }
    await capture(page, viewport.name, "01-home");
    if (viewport.name === "desktop-1440") {
      const suggestion = page.locator("[data-language-suggestion]");
      if (await suggestion.isVisible()) {
        await suggestion.getByRole("button", { name: "Продолжить на русском" }).click();
        await expect(suggestion).toBeHidden();
      }
      const dashboard = await page.locator(".public-home-dashboard").boundingBox();
      expect(dashboard).not.toBeNull();
      expect(dashboard!.y).toBeLessThan(500);
      expect(dashboard!.y + dashboard!.height).toBeLessThanOrEqual(810);
    }

    const thailand = page.locator('[data-public-country="thailand"]');
    await thailand.locator(".public-country-select").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(thailand).toHaveAttribute("data-selected", "true");
    await capture(page, viewport.name, "02-home-thailand-selected");
    await thailand.locator(".public-country-details").click();
    await expect(page).toHaveURL(/\/thailand\/$/);
    await expect(page.locator(".catalog-card.soon")).toHaveCount(4);
    await capture(page, viewport.name, "03-thailand-soon");

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
    await capture(page, viewport.name, "04-visa-grid");

    await page.goto("/bali/visas/e33g/");
    await expectNoOverflow(page);
    await capture(page, viewport.name, "05-visa-detail");

    await page.goto("/bali/exchange/usdt-idr/");
    await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.locator("[data-public-exchange-calculator]")).toHaveCount(0);
    await expectNoOverflow(page);
    await capture(page, viewport.name, "06-exchange-login");

    for (const [index, route] of localizedPublicRoutes.entries()) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await page.evaluate(() => {
        history.scrollRestoration = "manual";
        document.documentElement.style.overflowAnchor = "none";
        window.scrollTo(0, 0);
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expectNoOverflow(page);
      const sourceRoute = route.replace(/^\/en(?=\/)/, "");
      const isEnglish = route === "/en/" || route.startsWith("/en/");
      const nestedLocation = sourceRoute.match(/^\/russia\/(spb|ural)\/.+\/$/)?.[1];
      if (nestedLocation) {
        const expectedAlt =
          nestedLocation === "spb"
            ? isEnglish
              ? "The Peter and Paul Fortress and Neva embankment at sunrise"
              : "Петропавловская крепость и набережная Невы на рассвете"
            : isEnglish
              ? "Forested Ural ridges and a river in the morning"
              : "Лесистые Уральские хребты и река утром";
        const hero = page.locator(".public-route-hero");
        await expect(hero.getByRole("img", { name: expectedAlt })).toBeVisible();
        if (viewport.width <= 760) {
          const parts = await hero.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const eyebrow = element.querySelector("div > span")?.getBoundingClientRect();
            const title = element.querySelector("h1")?.getBoundingClientRect();
            const summary = element.querySelector("p")?.getBoundingClientRect();
            return { bounds, eyebrow, title, summary };
          });
          expect(parts.eyebrow?.top).toBeGreaterThanOrEqual(parts.bounds.top);
          expect(parts.title?.top).toBeGreaterThanOrEqual(parts.eyebrow?.bottom ?? 0);
          expect(parts.summary?.top).toBeGreaterThanOrEqual(parts.title?.bottom ?? 0);
          expect(parts.summary?.bottom).toBeLessThanOrEqual(parts.bounds.bottom + 1);
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", "--");
      await capture(
        page,
        viewport.name,
        `routes/${String(index + 1).padStart(2, "0")}-${slug}`,
      );
    }
  });
}
