import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("../artifacts/BALI-TASK-067/designer-review/guides/react");
const sizes = [
  { name: "compact-320", width: 320, height: 844 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

async function mockMiniApp(page: Page, locale: "ru" | "en") {
  await page.route(/telegram-web-app\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "opaque-guide-visual-fixture",
        ready() {},
        expand() {},
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
        first_name: "Guide",
        username: "guide_visual_fixture",
        balance: 0,
        referral_count: 0,
        referral_link: "",
        orders: [],
        locale,
      }),
    }),
  );
}

test("All Indonesia Mini App guide remains readable in every locale, theme and required viewport", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(root, { recursive: true });

  for (const size of sizes) {
    for (const locale of ["ru", "en"] as const) {
      for (const theme of ["dark", "light"] as const) {
        const context = await browser.newContext({
          viewport: size,
          locale: locale === "ru" ? "ru-RU" : "en-US",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await context.addInitScript(
          ([key, value]) => localStorage.setItem(key, value),
          ["safrway:appearance", theme],
        );
        const page = await context.newPage();
        await mockMiniApp(page, locale);
        await page.goto("/#/services/bali/guides/all-indonesia");

        await expect(page.getByRole("heading", { name: "All Indonesia", level: 1 })).toBeVisible();
        const download = page.getByRole("link", {
          name: locale === "ru" ? "Скачать PDF-гайд" : "Download the PDF guide",
        });
        await expect(download).toBeVisible();
        expect((await download.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
        await expect(page.locator(".guide-content-card h2")).toHaveCount(12);
        expect(await page.locator(".bottom-nav").evaluate((node) => getComputedStyle(node).position)).toBe("static");
        if (theme === "dark") {
          await expect(page.locator(".guide-download-card")).toHaveCSS("background-color", "rgb(25, 54, 44)");
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(locale);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: path.join(root, `${size.name}-${locale}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await context.close();
      }
    }
  }
});
