import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("../artifacts/BALI-TASK-066/designer-review/astro");
const sizes = [
  { name: "compact-320", width: 320, height: 844 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

test("BALI-TASK-066 Home keeps approved art with independent RU EN and light dark themes", async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(root, { recursive: true });
  for (const size of sizes) {
    for (const locale of ["ru", "en"] as const) {
      for (const theme of ["dark", "light"] as const) {
        const context = await browser.newContext({ viewport: size, locale: locale === "ru" ? "ru-RU" : "en-US", reducedMotion: "reduce" });
        await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ["safrway:appearance", theme]);
        const page = await context.newPage();
        const externalVideoRequests: string[] = [];
        page.on("request", (request) => {
          const hostname = new URL(request.url()).hostname;
          if (/youtube|youtu\.be|googlevideo/i.test(hostname)) externalVideoRequests.push(request.url());
        });
        await page.goto(locale === "ru" ? "/" : "/en/");
        await expect(page.getByRole("heading", { name: locale === "ru" ? "Полезное перед поездкой" : "Useful before your trip" })).toBeVisible();
        await expect(page.getByRole("button", { name: locale === "ru" ? (theme === "dark" ? "Тёмная тема" : "Светлая тема") : (theme === "dark" ? "Dark theme" : "Light theme") })).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        await expect(page.locator(".public-country-card img")).toHaveCount(4);
        await expect(page.locator(".public-youtube iframe")).toHaveCount(0);
        expect(externalVideoRequests).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(root, `${size.name}-${locale}-${theme}-home.png`), fullPage: true });
        await context.close();
      }
    }
  }
});
