import { expect, test } from "@playwright/test";

const pilot = ["/bali/visas/", "/bali/visas/c1/", "/bali/visas/e33g/"]
  .flatMap((route) => [route, `/en${route}`]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

test("E2 reviewed articles retain source styles and citations under production CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (m.text().includes("Content Security Policy")) violations.push(m.text()); });
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
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
    const provenance = page.locator(".editorial-provenance");
    await expect(provenance).toHaveCSS("border-top-style", "solid");
    await expect(provenance).toHaveCSS("border-top-width", "1px");
    const citation = page.locator(".editorial-citation").first();
    const href = await citation.getAttribute("href");
    await citation.focus();
    // Deliberately immediate: rapid focus/activation must reach the source too.
    await citation.press("Enter");
    await expect(page.locator(href!)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(violations).toEqual([]);
});

test("E2 no-JS source and price fallback has a reachable contact on all six pilot pages", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 320, height: 720 } });
  try {
    const page = await context.newPage();
    for (const route of pilot) {
      await page.goto(route);
      await expect(page.locator("[data-source-review]")).toBeVisible();
      const contact = page.locator('noscript a[href="https://t.me/safr_bali_bot"]');
      await expect(contact).toBeVisible();
      await contact.focus();
      await expect(contact).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  } finally { await context.close(); }
});
