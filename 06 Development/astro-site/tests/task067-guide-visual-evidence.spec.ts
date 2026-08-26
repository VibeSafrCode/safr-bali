import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("../artifacts/BALI-TASK-067/designer-review/guides/astro");
const sizes = [
  { name: "compact-320", width: 320, height: 844 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

test("All Indonesia public guide remains readable in every locale, theme and required viewport", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(root, { recursive: true });

  for (const size of sizes) {
    for (const locale of ["ru", "en"] as const) {
      for (const theme of ["dark", "light"] as const) {
        const context = await browser.newContext({
          viewport: size,
          locale: locale === "ru" ? "ru-RU" : "en-US",
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ([key, value]) => localStorage.setItem(key, value),
          ["safrway:appearance", theme],
        );
        const page = await context.newPage();
        await page.goto(
          locale === "ru"
            ? "/bali/guides/all-indonesia/"
            : "/en/bali/guides/all-indonesia/",
        );

        await expect(page.getByRole("heading", { name: "All Indonesia", level: 1 })).toBeVisible();
        const download = page.getByRole("link", {
          name: locale === "ru" ? "Скачать PDF-гайд" : "Download the PDF guide",
        });
        await expect(download).toBeVisible();
        await expect(download).toHaveAttribute(
          "href",
          "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf",
        );
        await expect(page.locator(".support-launcher-button")).toBeHidden();
        expect((await download.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
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
