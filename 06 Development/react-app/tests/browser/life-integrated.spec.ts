import { expect, test, type Page } from "@playwright/test";

const client = { id: 5, first_name: "Bali Life Fixture", username: "fixture_client", telegram_id_mask: "••••0005", bot_status: "active", tags: [], active_visa_count: 0, requires_attention: false };
const bike = { id: 21, user_id: 5, kind: "bike", title: "Yamaha NMAX", description: "Synthetic rental for design review", link_url: "https://example.com/bike", start_date: "2026-09-22", end_date: "2026-10-30", price_amount: "2500000.00", price_currency: "IDR", price_unit: "month", public_contact: "SAFRWAY manager", publication_status: "PUBLISHED", version: 1, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z", owner_details: "INTERNAL FIXTURE OWNER", internal_note: "INTERNAL FIXTURE NOTE" };
const visa = { id: 41, country_code: "ID", visa_type: { code: "B1", name: "B1 visa", version: 1 }, lifecycle_status: "ACTIVE", service_status: "COMPLETED", publication_status: "PUBLISHED", notifications_enabled: true, entered_on: "2026-09-01", entry_deadline: "2026-10-01", stay_end: "2026-11-15" };

async function commonRoutes(page: Page) {
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => route.fulfill({ json: { items: [], offers: [], routes: [], version: 1 } }));
  await page.route("**/build-version.json*", (route) => route.fulfill({ json: { build_id: "local" } }));
}

async function adminRoutes(page: Page, role: "admin" | "visa_manager", locale = "en") {
  await commonRoutes(page);
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ json: { authenticated: true, actor: { first_name: "Local fixture", role, locale, allowed_tabs: role === "visa_manager" ? ["clients"] : undefined }, csrf_token: "synthetic-csrf" } }));
  await page.route(/\/api\/web\/admin\/clients(?:\?.*)?$/, (route) => route.fulfill({ json: { items: [client], total: 1 } }));
  await page.route("**/api/web/admin/clients/5", (route) => route.fulfill({ json: { client, visa_cases: [], notes: [], credentials: [], dialogue: { id: null, status: "empty", messages: [] } } }));
  await page.route("**/api/web/admin/visa-cases/staff/visa-managers", (route) => route.fulfill({ json: { enabled: false, items: [] } }));
  await page.route("**/api/web/admin/visa-cases/document-storage/readiness", (route) => route.fulfill({ json: { ready: false } }));
}

for (const mode of [{ name: "desktop-light", width: 1440, height: 1100, theme: "light" }, { name: "mobile-dark", width: 390, height: 844, theme: "dark" }]) {
  test(`actual root CRM creates and updates one bike, reset preserves server date (${mode.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: mode.width, height: mode.height });
    await page.addInitScript((theme) => localStorage.setItem("safrway:appearance", theme), mode.theme);
    await adminRoutes(page, "admin");
    const writes: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postDataJSON() }); });
    let saved: Record<string, unknown> | null = null;
    let releaseCollection!: () => void;
    const initialCollection = new Promise<void>((resolve) => { releaseCollection = resolve; });
    await page.route("**/api/web/admin/clients/5/life-services", async (route) => {
      if (route.request().method() === "GET") { await initialCollection; return route.fulfill({ json: { items: saved ? [saved] : [] } }); }
      expect(route.request().headers()["x-csrf-token"]).toBe("synthetic-csrf");
      saved = { ...bike, ...route.request().postDataJSON(), version: 1 };
      await route.fulfill({ status: 201, json: saved });
    });
    await page.route("**/api/web/admin/clients/5/life-services/21", async (route) => {
      if (route.request().method() === "PUT") saved = { ...saved, ...route.request().postDataJSON(), version: Number(saved?.version) + 1 };
      await route.fulfill({ json: saved });
    });
    await page.goto("/admin/clients/5/");
    await expect(page.getByRole("heading", { name: "Bali Life Fixture" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bali services" })).toBeVisible();
    const add = page.getByRole("button", { name: "Add service" });
    await expect(add).toBeDisabled();
    releaseCollection();
    await expect(add).toBeEnabled();
    await add.click();
    const editor = page.locator(".admin-life-editor");
    await editor.getByLabel("Service type").selectOption("bike");
    await editor.getByRole("combobox", { name: "Bike model" }).selectOption("Yamaha NMAX");
    await editor.getByLabel("Rental start", { exact: true }).fill("2026-09-22");
    await editor.getByLabel("Return", { exact: true }).fill("2026-10-30");
    await editor.getByLabel("Agreed price for the client").fill("2500000.00");
    await editor.getByLabel("Price basis").selectOption("month");
    await editor.getByRole("button", { name: "Save and show to client" }).click();
    await expect(editor.getByRole("status")).toContainText("No client messages were sent");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body.publication_status).toBe("PUBLISHED");
    await editor.getByLabel("Return", { exact: true }).fill("2026-11-20");
    await editor.getByRole("button", { name: "Save changes to client account" }).click();
    await expect(page.locator(".admin-life-list")).toContainText("20 November 2026");
    expect(writes).toHaveLength(2);
    expect(writes[1].method).toBe("PUT");
    expect(writes[1].body.expected_version).toBe(1);
    await editor.getByLabel("Return", { exact: true }).fill("2027-01-01");
    await editor.getByRole("button", { name: "Reset changes" }).click();
    await expect(editor.getByLabel("Return", { exact: true })).toHaveValue("2026-11-20");
    expect(writes).toHaveLength(2);
    await editor.getByRole("button", { name: "Close editor" }).click();
    await page.reload();
    await expect(page.locator(".admin-life-list")).toContainText("Yamaha NMAX");
    await page.locator(".admin-life-list").getByRole("button", { name: /Yamaha NMAX/ }).click();
    await expect(editor.getByLabel("Return", { exact: true })).toHaveValue("2026-11-20");
    expect(writes).toHaveLength(2);
    expect(await page.locator("body").evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`integrated-admin-${mode.name}.png`), fullPage: true });
  });
}

test("actual visa manager CRM never mounts or requests life-service editor", async ({ page }) => {
  await adminRoutes(page, "visa_manager");
  let lifeRequests = 0;
  await page.route("**/api/web/admin/clients/5/life-services**", (route) => { lifeRequests++; return route.fulfill({ status: 403, json: { detail: "Forbidden" } }); });
  await page.goto("/admin/clients/5/");
  await expect(page.getByRole("heading", { name: "Bali Life Fixture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bali services" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add service" })).toHaveCount(0);
  expect(lifeRequests).toBe(0);
});

test("failed collection retry cannot overtake a pending create", async ({ page }) => {
  await adminRoutes(page, "admin");
  let reads = 0;
  let releaseCreate!: () => void;
  const pendingCreate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  await page.route("**/api/web/admin/clients/5/life-services", async (route) => {
    if (route.request().method() === "GET") { reads++; return route.fulfill({ status: 503, json: { detail: "Fixture read failure" } }); }
    await pendingCreate;
    return route.fulfill({ json: { ...bike, title: "Saved fixture", publication_status: "DRAFT" } });
  });
  await page.goto("/admin/clients/5/");
  const life = page.locator(".admin-life");
  await expect(life.getByRole("alert")).toContainText("Could not load services");
  await life.getByRole("button", { name: "Add service" }).click();
  await life.getByRole("button", { name: "Save draft" }).click();
  const readsBeforeRetry = reads;
  const retry = life.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeDisabled();
  await retry.evaluate((element: HTMLButtonElement) => element.click());
  expect(reads).toBe(readsBeforeRetry);
  releaseCreate();
  await expect(life.locator(".admin-life-list")).toContainText("Saved fixture");
  await expect(life.getByRole("heading", { name: "Edit service" })).toBeVisible();
});

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
test(`actual account and Mini life pages preserve deep links, contrast and grid (${width} ${theme})`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript((value) => localStorage.setItem("safrway:appearance", value), theme);
  async function verifyLifeSurface(surface: string) {
    for (const selector of [".bali-life h1", ".bali-life > .life-text-action", ".life-toolbar button", ".life-toolbar small", ".life-group h2"]) {
      await expect(page.locator(selector).first()).toHaveCSS("color", "rgb(255, 253, 248)");
    }
    await expect(page.locator(".life-card").first()).toHaveCSS("color", theme === "light" ? "rgb(24, 42, 35)" : "rgb(240, 246, 241)");
    expect(await page.locator(".life-card-grid").first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width >= 1000 ? 2 : 1);
    expect(await page.locator("body").evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`integrated-${surface}-${width}-${theme}.png`), fullPage: true });
  }
  await commonRoutes(page);
  const dashboard = { telegram_id: 5, first_name: "Fixture", username: "fixture", locale: "ru", balance: 0, referral_count: 0, orders: [] };
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ json: { authenticated: true, telegram_id: 5, csrf_token: "fixture" } }));
  await page.route("**/api/web/account", (route) => route.fulfill({ json: dashboard }));
  await page.route("**/api/web/life-services", (route) => route.fulfill({ json: { items: [bike] } }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ json: { items: [visa] } }));
  await page.goto("/account/profile/life/");
  await expect(page.getByRole("heading", { name: "Моя жизнь на Бали" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Yamaha NMAX/ })).toBeVisible();
  await verifyLifeSurface("account");
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { (window as any).Telegram = { WebApp: { initData: "opaque", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
  await page.route("**/mini-app/me", (route) => route.fulfill({ json: dashboard }));
  await page.route("**/mini-app/life-services", (route) => route.fulfill({ json: { items: [bike] } }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ json: { items: [visa] } }));
  await page.goto("/#/profile/life");
  await expect(page.getByRole("heading", { name: "Моя жизнь на Бали" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Yamaha NMAX/ })).toBeVisible();
  await verifyLifeSurface("mini");
});
}
