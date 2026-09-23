import { expect, test, type Page } from "@playwright/test";

const row = { id: 1, user_id: 5, kind: "bike", title: "Yamaha NMAX", description: "Agreed rental", link_url: "https://example.com/bike", start_date: "2026-01-01", end_date: "2099-10-30", price_amount: "2500000.00", price_currency: "IDR", price_unit: "month", public_contact: "Public rental contact", publication_status: "PUBLISHED", version: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", owner_details: "PRIVATE OWNER", internal_note: "PRIVATE NOTE" };
const visa = { id: 41, country_code: "ID", visa_type: { code: "B1", name: "B1 visa", version: 1 }, lifecycle_status: "ACTIVE", service_status: "COMPLETED", publication_status: "PUBLISHED", notifications_enabled: true, entered_on: "2026-01-01", entry_deadline: "2026-02-01", stay_end: "2099-11-15", expected_stay_end: "2099-12-15" };
async function clientRoutes(page: Page, items = [row]) {
  await page.route("**/api/web/life-services", (route) => route.fulfill({ json: { items } }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ json: { items: [visa] } }));
}

test("client mobile summary, exact visa date, details and keyboard return", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await clientRoutes(page, [row, { ...row, id: 2, kind: "insurance", title: "Fixture Insurance", start_date: null as unknown as string }]);
  await page.goto("/tests/life-fixture.html");
  await expect(page.getByRole("heading", { name: "My life in Bali" })).toBeVisible();
  await expect(page.getByText("15 November 2099")).toBeVisible();
  await expect(page.getByText("15 December 2099")).toHaveCount(0);
  await expect(page.getByText("Policy end date", { exact: true })).toBeVisible();
  const columns = await page.locator(".life-categories").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  await page.screenshot({ path: testInfo.outputPath("client-mobile-light.png"), fullPage: true });
  const bike = page.getByRole("button", { name: /Yamaha NMAX/ });
  await bike.click();
  await expect(page.getByRole("heading", { name: "Yamaha NMAX" })).toBeFocused();
  await expect(page.locator(".life-detail").getByText("Rp 2,500,000.00 per month")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open service link/ })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator("body")).not.toContainText("PRIVATE");
  expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(bike).toBeFocused();
  expect(errors).toEqual([]);
});

test("focus refresh updates selected detail and identity switch clears old records", async ({ page }) => {
  let items = [row];
  let requests = 0;
  await page.route("**/api/web/life-services", async (route) => { requests++; if (!items.length) await new Promise((resolve) => setTimeout(resolve, 150)); await route.fulfill({ json: { items } }); });
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/tests/life-fixture.html");
  await page.getByRole("button", { name: /Yamaha NMAX/ }).click();
  items = [{ ...row, end_date: "2099-11-20" }];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".life-detail")).toContainText("20 November 2099");
  expect(requests).toBe(2);
  items = [];
  await page.getByRole("button", { name: "Switch fixture user" }).click();
  await expect(page.locator("body")).not.toContainText("Yamaha NMAX");
  await expect(page.getByText("You have no published services yet.")).toBeVisible();
});

test("monthly housing and multiple bikes show agreed totals without invented expiry", async ({ page }) => {
  const items = [
    { ...row, id: 11, kind: "housing", title: "Monthly villa", housing_type: "villa", rental_mode: "monthly", end_date: null, price_amount: "12000000.00", quantity: 1 },
    { ...row, id: 12, title: "Monthly bikes", rental_mode: "monthly", end_date: null, quantity: 3 },
  ];
  await page.route("**/api/web/life-services", (route) => route.fulfill({ json: { items } }));
  await page.route("**/api/web/visa-cases", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/tests/life-fixture.html");
  const housing = page.getByRole("button", { name: /Monthly villa/ });
  await expect(housing).toContainText("Villa");
  await expect(housing).toContainText("No end date");
  await expect(housing).toContainText("1 January 2026");
  await expect(housing).toContainText("Rp 12,000,000.00 per month");
  const bikes = page.getByRole("button", { name: /Monthly bikes/ });
  await expect(bikes).toContainText("Quantity: 3");
  await expect(bikes).toContainText("Rp 2,500,000.00 per month");
  await expect(page.locator(".life-countdown")).toHaveCount(0);
  await bikes.click();
  await expect(page.locator(".life-detail")).toContainText("Monthly · no end date");
  await expect(page.locator(".life-detail").getByText("Rp 2,500,000.00 per month")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRIVATE");
});

test("desktop dark has four categories, history and visible long detail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await clientRoutes(page, [row, { ...row, id: 2, kind: "housing", title: "Past villa", end_date: "2020-01-01", start_date: "2019-12-01" }, { ...row, id: 3, title: "Long model description ".repeat(12) }]);
  await page.goto("/tests/life-fixture.html?theme=dark&locale=ru");
  await expect(page.getByRole("heading", { name: "История" })).toBeVisible();
  expect(await page.locator(".life-categories").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(4);
  await page.getByRole("button", { name: /Long model description/ }).click();
  await expect(page.locator(".life-lists")).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("client-desktop-dark.png"), fullPage: true });
});

test("admin partial draft, validation, full update, reset and conflict recovery", async ({ page }, testInfo) => {
  let saved = { ...row, title: "", kind: "housing", publication_status: "DRAFT", start_date: null, end_date: null };
  let posts = 0;
  const puts: Record<string, unknown>[] = [];
  let conflict = false;
  await page.route("**/api/web/admin/clients/5/life-services", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      const body = route.request().postDataJSON();
      expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      saved = { ...saved, ...body, title: body.title || null, id: 7, version: 1 };
      await route.fulfill({ status: 201, json: { ...saved, idempotent_replay: false } });
    } else await route.fulfill({ json: { items: [] } });
  });
  await page.route("**/api/web/admin/clients/5/life-services/7", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON(); puts.push(body);
      if (conflict) return route.fulfill({ status: 409, json: { detail: "Version conflict" } });
      saved = { ...saved, ...body, version: saved.version + 1 };
    }
    await route.fulfill({ json: saved });
  });
  await page.goto("/tests/life-fixture.html?admin");
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByRole("button", { name: "Save and show to client" }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved. No client messages were sent.")).toBeVisible();
  expect(posts).toBe(1);
  await page.getByLabel("Property name").fill("Test villa");
  await page.getByLabel("Check-in", { exact: true }).fill("2026-09-22");
  await page.getByLabel("Check-out", { exact: true }).fill("2026-10-22");
  await page.getByRole("button", { name: "Save and show to client" }).click();
  await expect(page.getByRole("button", { name: "Save changes to client account" })).toBeVisible();
  expect(posts).toBe(1); expect(puts[0].expected_version).toBe(1); expect(puts[0].price_amount).toBeNull();
  await page.getByLabel("Property name").fill("Local unsaved change");
  await page.getByRole("button", { name: "Reset changes" }).click();
  await expect(page.getByLabel("Property name")).toHaveValue("Test villa");
  expect(puts).toHaveLength(1);
  conflict = true;
  await page.getByLabel("Property name").fill("Preserved conflict draft");
  await page.getByRole("button", { name: "Save changes to client account" }).click();
  await expect(page.getByRole("alert")).toContainText("Another staff member");
  await expect(page.getByLabel("Property name")).toHaveValue("Preserved conflict draft");
  saved = { ...saved, title: "Other staff's version", version: 3 };
  await page.getByRole("button", { name: "Load current record" }).click();
  await expect(page.getByLabel("Property name")).toHaveValue("Other staff's version");
  conflict = false;
  await page.getByRole("button", { name: "Hide from client account" }).click();
  await expect(page.locator(".admin-life-list")).toContainText("Hidden");
  expect(puts.at(-1)?.publication_status).toBe("HIDDEN");
  expect(puts.at(-1)?.expected_version).toBe(3);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator(".admin-life-list")).toContainText("Archived");
  expect(puts.at(-1)?.publication_status).toBe("ARCHIVED");
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-editor-light.png"), fullPage: true });
});

test("ambiguous create failure retries the same payload and selects saved record", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/web/admin/clients/5/life-services", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: [] } });
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.abort("failed");
    if (requests.length === 2) return route.fulfill({ status: 401, json: { detail: "Authentication required" } });
    await route.fulfill({ json: { ...row, ...requests[0], id: 8, title: "Housing draft", idempotent_replay: true } });
  });
  await page.goto("/tests/life-fixture.html?admin");
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByLabel("Property name")).toBeDisabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("Property name")).toBeDisabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit service" })).toBeVisible();
  expect(requests).toHaveLength(3); expect(requests[1]).toEqual(requests[0]); expect(requests[2]).toEqual(requests[0]);
  await expect(page.getByLabel("Property name")).toBeEnabled();
});

test("account and mini Life navigation opens the same cabinet and preserves legacy aliases", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dashboard = { telegram_id: 5, first_name: "Fixture", username: "fixture", locale: "en", balance: 0, referral_count: 0, orders: [] };
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ json: { authenticated: true, telegram_id: 5, csrf_token: "fixture" } }));
  await page.route("**/api/web/account", (route) => route.fulfill({ json: dashboard }));
  await clientRoutes(page);
  await page.goto("/tests/life-fixture.html?surface=account");
  await page.locator(".account-sidebar").getByRole("button", { name: "My life", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/life\/$/);
  await expect(page.getByRole("heading", { name: "My life in Bali" })).toBeVisible();
  await page.locator(".account-sidebar").getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile\/$/);
  await page.evaluate(() => { history.pushState({}, "", "/account/profile/life/"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page.getByRole("heading", { name: "My life in Bali" })).toBeVisible();

  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => { (window as any).Telegram = { WebApp: { initData: "opaque", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; });
  await page.route("**/mini-app/me", (route) => route.fulfill({ json: dashboard }));
  await page.route("**/mini-app/life-services", (route) => route.fulfill({ json: { items: [row] } }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ json: { items: [visa] } }));
  await page.goto("/tests/life-fixture.html?surface=mini");
  const navBefore = await page.locator(".bottom-nav").innerText();
  await page.locator(".bottom-nav").getByRole("button", { name: "My life", exact: true }).click();
  await expect(page).toHaveURL(/#\/life$/);
  await expect(page.getByRole("heading", { name: "My life in Bali" })).toBeVisible();
  expect(await page.locator(".bottom-nav").innerText()).toBe(navBefore);
  await page.locator(".bottom-nav").getByRole("button", { name: "Profile", exact: true }).click();
  await page.evaluate(() => { location.hash = "/profile/life"; });
  await expect(page.getByRole("heading", { name: "My life in Bali" })).toBeVisible();
});
