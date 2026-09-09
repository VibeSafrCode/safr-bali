import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const preferenceKey = "safr:public-locale:v1";
const languageAsset = /\/language\.[^/]+\.js$/;
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
test.use({ locale: "en-US" });

async function prepare(page: Page, theme: "light" | "dark" = "dark", preference?: string) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  await page.addInitScript(({ selectedTheme, saved, key }) => {
    localStorage.setItem("safrway:appearance", selectedTheme);
    if (saved) localStorage.setItem(key, saved);
    const state = window as typeof window & { e1MainShifts: number[] };
    state.e1MainShifts = [];
    new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as PerformanceEntry & { hadRecentInput: boolean; value: number; sources: Array<{ node?: Node }> };
        if (!entry.hadRecentInput && entry.sources.some(({ node }) => node instanceof HTMLElement && node.id === "content")) state.e1MainShifts.push(entry.value);
      }
    }).observe({ type: "layout-shift", buffered: true });
  }, { selectedTheme: theme, saved: preference, key: preferenceKey });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname.startsWith("/api/")) {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  return violations;
}

async function assertInFlow(page: Page) {
  const boxes = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)!;
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    };
    return { banner: rect("[data-language-suggestion]"), main: rect("#content"), header: rect(".site-header"), width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(boxes.banner.top).toBeGreaterThanOrEqual(boxes.header.bottom - .5);
  expect(boxes.main.top).toBeGreaterThanOrEqual(boxes.banner.bottom - .5);
  expect(boxes.banner.left).toBeGreaterThanOrEqual(0);
  expect(boxes.banner.right).toBeLessThanOrEqual(boxes.width + .5);
  expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.width + 1);
}

for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"] as const) {
  for (const route of ["/", "/bali/"]) {
    test(`prepaint language stays in flow without main CLS: ${route} ${width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      const violations = await prepare(page, theme);
      let release!: () => void;
      let requested!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const requestSeen = new Promise<void>((resolve) => { requested = resolve; });
      await page.route(languageAsset, async (request) => { requested(); await gate; await request.continue(); });
      try {
        await page.goto(route, { waitUntil: "commit" });
        await requestSeen;
        // The tiny classic head script resolves eligibility before the body parses.
        expect(await page.locator("main").count()).toBe(0);
      } finally {
        release();
      }
      await page.waitForLoadState("load");
      const banner = page.locator("[data-language-suggestion]");
      await expect(banner).toBeVisible();
      await expect(page.getByRole("button", { name: "Продолжить на русском", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await assertInFlow(page);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const shifts = await page.evaluate(() => (window as typeof window & { e1MainShifts: number[] }).e1MainShifts);
      expect(shifts.reduce((sum, value) => sum + value, 0)).toBeLessThan(.001);
      expect(violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("language-in-flow.png"), fullPage: true });
    });
  }
}

for (const preference of ["ru", "en"]) {
  test(`saved ${preference} preference does not show prompt or auto-navigate`, async ({ page }) => {
    await prepare(page, "dark", preference);
    await page.goto("/bali/");
    await expect(page.locator("[data-language-suggestion]")).toBeHidden();
    await expect(page).toHaveURL(/\/bali\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
}

test("decline is keyboard-operable immediately and persists on reload", async ({ page }) => {
  await prepare(page);
  await page.goto("/bali/", { waitUntil: "commit" });
  const decline = page.getByRole("button", { name: "Продолжить на русском", exact: true });
  await decline.focus();
  await expect(decline).toBeFocused();
  await decline.press("Enter");
  await expect(page.locator("[data-language-suggestion]")).toBeHidden();
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("ru");
  await page.reload();
  await expect(page.locator("[data-language-suggestion]")).toBeHidden();
  await expect(page).toHaveURL(/\/bali\/$/);
});

test("accept preserves exact localized route and stores English preference", async ({ page }) => {
  await prepare(page);
  await page.goto("/russia/spb/boat-spb/");
  const accept = page.locator("[data-language-suggestion-accept]");
  await expect(accept).toHaveAttribute("href", "/en/russia/spb/boat-spb/");
  await accept.click();
  await expect(page).toHaveURL(/\/en\/russia\/spb\/boat-spb\/$/);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("en");
  await expect(page.locator("[data-language-suggestion]")).toBeHidden();
});

test("unavailable language asset leaves native links usable and does not reveal late banner", async ({ page }) => {
  await prepare(page);
  await page.route(languageAsset, (route) => route.abort());
  await page.goto("/bali/");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("[data-language-suggestion]")).toBeHidden();
  await page.locator('[data-language-choice="en"]').click();
  await expect(page).toHaveURL(/\/en\/bali\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("no-JS visit keeps prompt hidden and exact language links available", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-US" });
  try {
    const page = await context.newPage();
    await page.goto("/bali/");
    await expect(page.locator("[data-language-suggestion]")).toBeHidden();
    await page.locator('[data-language-choice="en"]').click();
    await expect(page).toHaveURL(/\/en\/bali\/$/);
    await expect(page.locator("main")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("visible prompt is exposed to accessibility tools without A/AA violations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await prepare(page);
  await page.goto("/");
  const banner = page.locator("[data-language-suggestion]");
  await expect(banner).toBeVisible();
  await expect(page.getByRole("complementary").filter({ has: page.locator("[data-language-suggestion-accept]") })).toBeVisible();
  const result = await new AxeBuilder({ page }).include("[data-language-suggestion]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
});

test("Russian browser does not receive an English suggestion", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ru-RU" });
  try {
    const page = await context.newPage();
    await prepare(page);
    await page.goto("/");
    await expect(page.locator("[data-language-suggestion]")).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await context.close();
  }
});

test("storage denial preserves dismissibility without automatic navigation", async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Synthetic storage denial", "SecurityError"); } });
  });
  await page.goto("/bali/");
  await page.getByRole("button", { name: "Продолжить на русском", exact: true }).click();
  await expect(page.locator("[data-language-suggestion]")).toBeHidden();
  await expect(page).toHaveURL(/\/bali\/$/);
});

test("200 percent zoom-equivalent viewport keeps prompt and keyboard targets contained", async ({ browser }, testInfo) => {
  // Equivalent geometry to a 640×1136 physical viewport at 200% browser zoom.
  // CSS zoom is unsuitable: it does not adjust the media-query viewport.
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, locale: "en-US" });
  try {
    const page = await context.newPage();
    await prepare(page);
    await page.goto("/");
    await assertInFlow(page);
    const decline = page.getByRole("button", { name: "Продолжить на русском", exact: true });
    await decline.focus();
    await expect(decline).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("language-200-percent-zoom-equivalent.png"), fullPage: true });
    await decline.press("Enter");
    await expect(page.locator("[data-language-suggestion]")).toBeHidden();
  } finally {
    await context.close();
  }
});
