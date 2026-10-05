import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

const editorial = JSON.parse(readFileSync(new URL("../src/data/travel-videos.json", import.meta.url), "utf8"));
const posterPixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/1kAAAAASUVORK5CYII=", "base64");

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
        // A static preview has no backend API. Exercise a fresh canonical public
        // projection, not the deliberately short-lived committed cold-start cache.
        // Poster pixels are synthetic; no external media or playback is requested.
        await context.route("**/*", async route => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/public/youtube-playlist.json") {
            const now = Date.now();
            await route.fulfill({ json: { version: 1, source: "youtube-data-api-v3", playlistId: editorial.playlistId,
              fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(), videos: editorial.videos } });
          } else if (url.hostname === "i.ytimg.com") await route.fulfill({ contentType: "image/png", body: posterPixel });
          else if (["127.0.0.1", "localhost"].includes(url.hostname)) await route.continue();
          else await route.abort();
        });
        const page = await context.newPage();
        const externalVideoRequests: string[] = [];
        page.on("request", (request) => {
          const host = new URL(request.url()).hostname;
          if (/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com)$/.test(host)) externalVideoRequests.push(request.url());
        });
        await page.goto(locale === "ru" ? "/" : "/en/");
        await expect(page.getByRole("heading", { name: locale === "ru" ? "Почувствуйте место до поездки." : "Get to know a place before you go." })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme-preference", theme);
        if(size.width < 700) await expect(page.locator("[data-theme-toggle]")).toHaveAccessibleName(/Тема:|Theme:/);
        else await expect(page.locator(`[data-public-theme-choice="${theme}"]`)).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        await expect(page.locator(".public-country-card img")).toHaveCount(6);
        await expect(page.locator("[data-playlist-frame] iframe")).toHaveCount(0);
        await expect(page.locator("[data-playlist-poster]")).toHaveAttribute("src", /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\//);
        await expect(page.locator("[data-playlist-player]")).toHaveAttribute("data-playlist-source", "youtube-data-api-v3");
        expect(externalVideoRequests).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(root, `${size.name}-${locale}-${theme}-home.png`), fullPage: true });
        await context.close();
      }
    }
  }
});

test("expired playlist projection removes previews instead of silently retaining old videos", async ({ page }) => {
  await page.route("**/api/public/youtube-playlist.json", async route => {
    const now = Date.now();
    await route.fulfill({ json: { version: 1, source: "youtube-data-api-v3", playlistId: editorial.playlistId,
      fetchedAt: new Date(now - 7_200_000).toISOString(), expiresAt: new Date(now - 3_600_000).toISOString(), videos: editorial.videos } });
  });
  await page.route("https://i.ytimg.com/**", route => route.fulfill({ contentType: "image/png", body: posterPixel }));
  await page.goto("/en/");
  await expect(page.locator("[data-playlist-player]")).toBeHidden();
  await expect(page.locator("[data-playlist-fallback]")).toBeVisible();
  await expect(page.locator("[data-playlist-poster]")).toHaveCount(0);
  await expect(page.locator("[data-playlist-frame] iframe")).toHaveCount(0);
});
