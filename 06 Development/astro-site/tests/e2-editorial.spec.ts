import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {productionCsp as csp} from "./fixtures/production-csp";

// Playwright 1.51's transform loader cannot safely synchronously import the
// native ESM publication module with JSON attributes. Use a bounded read-only
// Node child to obtain the actual approved model, not a second authored copy.
const modelRead=spawnSync(process.execPath,["--input-type=module","-e",`
  import {buildPublicRegistryModel,publicEntryForRoute} from './scripts/registry-publication.mjs';
  import {currentRegistryProjection} from './tests/fixtures/current-registry-projection.mjs';
  const projection={...currentRegistryProjection(),derived_expires_at:'2099-01-01T00:00:00Z'};
  const models={};
  for(const locale of ['ru','en'])for(const slug of ['e33g','c1','voa']){
    const route=(locale==='en'?'/en':'')+'/bali/visas/'+slug+'/';
    models[route]=buildPublicRegistryModel(publicEntryForRoute(route),{projection});
  }
  process.stdout.write(JSON.stringify({models,projection}));
`],{cwd:fileURLToPath(new URL("../",import.meta.url)),encoding:"utf8",timeout:10_000,maxBuffer:2_000_000});
if(modelRead.status!==0)throw new Error("Approved browser model loading failed: "+(modelRead.error?.message??modelRead.stderr));
const {models:publicModels,projection}=JSON.parse(modelRead.stdout);

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
const htmlText=(value:string)=>value.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();

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

test("approved Registry and preserved legacy visa copy render with versioned prices under strict CSP", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.text().includes("Content Security Policy")) errors.push(message.text()); });
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
    const model=publicModels[route];
    if(model){
      await expect(page.locator("html")).toHaveAttribute("data-content-id",model.contentId);
      await expect(page.locator("html")).toHaveAttribute("data-source-revision",model.sourceRevision);
      await expect(page.locator("html")).toHaveAttribute("data-service-id","visa");
      await expect(page.locator("h1")).toHaveText(htmlText(model.titleHtml));
      await expect(page.locator(".direct-answer")).toHaveText(htmlText(model.directHtml));
      await expect(page.locator(".article-section h2")).toHaveText(model.sections.map((section:any)=>section.heading));
      const boundPrices=page.locator("[data-registry-price]");
      expect(await boundPrices.count()).toBeGreaterThan(0);
      await expect(boundPrices.first()).toHaveAttribute("data-projection-id",projection.projection_id);
      for(const price of await boundPrices.all()){
        await expect(price).toHaveAttribute("data-catalog-version",String(projection.catalog_version_id));
        await expect(price).toHaveAttribute("data-fx-version",String(projection.fx_snapshot_id));
      }
      for(const section of model.sections){
        await expect(page.locator(`.article-section[aria-labelledby="${section.id}"] .prose`)).toHaveText(htmlText(section.html));
      }
      if(slug==="e33g"){
        await expect(page.locator('[data-registry-price="e33g_standard"]').first()).toHaveText("12 000 000 IDR (≈ $725)");
        await expect(page.locator('[data-registry-price="e33g_express"]').first()).toHaveText("14 000 000 IDR (≈ $850)");
        const tariffText=await page.locator(".e33g-tariffs").textContent();
        expect(tariffText!.indexOf("12 000 000")).toBeLessThan(tariffText!.indexOf("14 000 000"));
      }
      await expect(page.locator("[data-editorial-content], [data-source-review]")).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      if(slug==="e33g")await page.screenshot({path:testInfo.outputPath(`e33g-${locale}.png`),fullPage:true});
      continue;
    }
    await expect(page.locator("h1")).toHaveText(copy.title);
    await expect(page.locator(".public-route-hero p")).toHaveText(copy.lead);
    await expect(page.locator(".public-route-hero p")).toHaveCSS("white-space", "pre-line");
    await expect(page.locator("[data-bot-visa-paragraph]")).toHaveText(copy.paragraphs);
    await expect(page.locator("[data-bot-visa-disclaimer]")).toHaveText(copy.disclaimers);
    await expect(page.locator("[data-editorial-content], [data-source-review]")).toHaveCount(0);
    if (slug !== "other-visa") {
      const price = page.locator("[data-visa-price-copy]");
      await expect(price).toContainText(locale === "en" ? "Current price is temporarily unavailable." : "Актуальная цена временно недоступна.");
      await expect(price).toHaveAttribute("data-projection-id", projection.projection_id);
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
      await expect(page.locator("html")).toHaveAttribute("data-content-id","e33g");
      await expect(page.locator("article")).toContainText(locale==="ru"?"60 000 USD":"USD 60,000");
      await expect(page.locator('noscript a[href="https://t.me/safr_bali_bot"]')).toBeVisible();
      const prices=page.locator("[data-registry-price]");
      expect(await prices.count()).toBeGreaterThan(0);
      for(const price of await prices.all()){
        await expect(price).not.toHaveAttribute("data-projection-id",/.+/);
        await expect(price).not.toContainText(/\d[\d ]* IDR|\$/);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  } finally { await context.close(); }
});
