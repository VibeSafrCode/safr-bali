import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const sourceVisas = JSON.parse(readFileSync(new URL("../../bot/app/content/visas.json", import.meta.url), "utf8"));
const botMessages = JSON.parse(readFileSync(new URL("../../shared/content/generated/i18n/bot.v1.json", import.meta.url), "utf8")).entries;
function getBotVisaCopy(route: string, locale: "ru" | "en") {
  const slug = route.split("/").filter(Boolean).at(-1)!;
  const [key, message] = ({ e33g: ["E33G", "e33g"], d12: ["D12", "d12"], "d1-d2": ["D1/D2", "d1d2"], c1: ["C1", "c1"], voa: ["VOA", "voa"], "other-visa": ["Другая виза", "other"] } as Record<string, string[]>)[slug];
  const paragraphs = (locale === "ru" ? sourceVisas[key].text : botMessages[`visa.${message}.body`][locale]).replace(/\\n/g, "\n").trim().split(/\n\n/);
  return { key, title: paragraphs[0], lead: paragraphs[1], paragraphs: paragraphs.slice(2),
    disclaimers: ["conditionsMayChange", "verifyBeforePayment", "writeNext"].map((id) => botMessages[`visa.disclaimer.${id}`][locale]),
    priceCopy: Object.fromEntries(["heading", "feesIncluded", "noExtra", "line"].map((id) => [id, botMessages[`visa.price.${id}`][locale]])),
  };
}

const pilot = ["/bali/visas/"]
  .flatMap((route) => [route, `/en${route}`]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

test("visa catalog has no audit panels and remains usable under production CSP", async ({ page }, testInfo) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (m.text().includes("Content Security Policy")) violations.push(m.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname.startsWith("/api/")) {
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  for (const route of pilot) {
    await page.goto(route);
    if (/\/bali\/visas\/$/.test(route)) await page.locator('[data-visa-view="catalog"]').click();
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
    await expect(page.locator("[data-editorial-content], [data-source-review], .source-review-notice")).toHaveCount(0);
    await expect(page.locator(".public-visa-card")).toHaveCount(6);
    const visa = page.locator('.public-visa-card[href$="/visas/e33g/"]');
    await visa.focus();
    await expect(visa).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`catalog-${route.startsWith('/en') ? 'en' : 'ru'}.png`), fullPage: true });
  }
  expect(violations).toEqual([]);
});

test("catalog and guide omit audit panels without JavaScript and keep customer actions", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 320, height: 720 } });
  try {
    const page = await context.newPage();
    for (const route of [...pilot, "/bali/guides/all-indonesia/", "/en/bali/guides/all-indonesia/"]) {
      await page.goto(route);
      await expect(page.locator("[data-editorial-content], [data-source-review], .source-review-notice")).toHaveCount(0);
      const action = route.includes("/visas/") ? page.locator('.public-visa-card[href$="/visas/e33g/"]') : page.locator('noscript a[href="https://t.me/safr_bali_bot"]');
      await expect(action).toBeVisible();
      await action.focus();
      await expect(action).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  } finally { await context.close(); }
});

test("all bot visa texts and full price tiers render on mobile under strict CSP in both languages and themes", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.text().includes("Content Security Policy")) errors.push(message.text()); });
  const projection = {
    projection_id: "parity-test", catalog_version_id: 1, fx_snapshot_id: 1,
    derived_expires_at: "2099-01-01T00:00:00Z", items: [
      { entity_type: "VISA", entity_key: "E33G", show_price: true, amount_idr: "14000000", display_usdt: "850.01", display_usd_approx: "850", sku: "express", sort_order: 2, label: { ru: "Экспресс", en: "Express" } },
      { entity_type: "VISA", entity_key: "E33G", show_price: true, amount_idr: "12000000", display_usdt: "720.02", display_usd_approx: "720", sku: "standard", sort_order: 1, label: { ru: "Стандарт", en: "Standard" } },
    ],
  };
  await page.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/catalog/pricing") return route.fulfill({ json: projection });
    if (pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: {} });
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  for (const locale of ["ru", "en"] as const) for (const slug of ["e33g", "d12", "d1-d2", "c1", "voa", "other-visa"]) {
    const route = `${locale === "en" ? "/en" : ""}/bali/visas/${slug}/`;
    const copy = getBotVisaCopy(route, locale)!;
    await page.setViewportSize({ width: locale === "ru" ? 320 : 390, height: 844 });
    await page.goto(route);
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, locale === "ru" ? "dark" : "light");
    await expect(page.locator("h1")).toHaveText(copy.title);
    await expect(page.locator(".public-route-hero p")).toHaveText(copy.lead);
    await expect(page.locator(".public-route-hero p")).toHaveCSS("white-space", "pre-line");
    await expect(page.locator("[data-bot-visa-paragraph]")).toHaveText(copy.paragraphs);
    await expect(page.locator("[data-bot-visa-disclaimer]")).toHaveText(copy.disclaimers);
    await expect(page.locator("[data-editorial-content], [data-source-review]")).toHaveCount(0);
    if (slug !== "other-visa") {
      const price = page.locator("[data-visa-price-copy]");
      if (slug === "e33g") {
        await expect(price).toContainText(copy.priceCopy.heading);
        await expect(price).toContainText("Rp 12.000.000 (≈ $720)");
        await expect(price).toContainText("Rp 14.000.000 (≈ $850)");
        const text = await price.textContent();
        expect(text!.indexOf("12.000.000")).toBeLessThan(text!.indexOf("14.000.000"));
      } else {
        await expect(price).toContainText(locale === "en" ? "Current price is temporarily unavailable." : "Актуальная цена временно недоступна.");
      }
      await expect(price).toHaveAttribute("data-projection-id", "parity-test");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (slug === "e33g") await page.screenshot({ path: testInfo.outputPath(`e33g-${locale}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("restored visa text is present without JavaScript and never invents offline prices", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 320, height: 720 } });
  try {
    const page = await context.newPage();
    for (const locale of ["ru", "en"] as const) {
      await page.goto(`${locale === "en" ? "/en" : ""}/bali/visas/e33g/`);
      await expect(page.locator("[data-bot-visa-content]")).toContainText("$60.000");
      await expect(page.locator('noscript a[href="https://t.me/safr_bali_bot"]')).toBeVisible();
      await expect(page.locator("[data-visa-price-copy]")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  } finally { await context.close(); }
});
