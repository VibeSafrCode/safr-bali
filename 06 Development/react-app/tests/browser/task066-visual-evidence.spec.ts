import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("../artifacts/BALI-TASK-066/designer-review/react");
const sizes = [
  { name: "compact-320", width: 320, height: 844 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const exchangeRoute = {
  route_code: "USDT_TO_IDR_BANK",
  version: 3,
  is_active: true,
  settings: {
    route_enabled: true,
    manual_confirmation_required: true,
    safrway_fee_percent: "4",
    safrway_min_fee: "10",
    safrway_min_fee_currency: "USDT",
    partner_fee_percent: "0",
    partner_min_fee: "0",
    partner_min_fee_currency: "USDT",
    technical_fee_percent: "0",
    quote_ttl_seconds: 300,
    rounding_step: "10000",
  },
};

async function adminFixture(page: import("@playwright/test").Page, locale: "ru" | "en") {
  await page.route("**/api/web/admin/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, actor: { first_name: "Root Admin", role: "admin", locale }, csrf_token: "fixture" }) }));
  await page.route("**/api/web/admin/settings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exchange_routes: [exchangeRoute], visa_types: [{ code: "B1", name: "B1", version: 1, rules_verified: true }], services: [{ slug: "visas", name: "Визы", category: "visa", is_active: true }], notifications: [{ event: "CASE_UPDATED", audience: "client", delivery: "Telegram", enabled: true }] }) }));
  await page.route("**/api/web/admin/settings/exchange/USDT_TO_IDR_BANK/versions", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ route_code: exchangeRoute.route_code, versions: [exchangeRoute, { ...exchangeRoute, id: 2, version: 2, is_active: false }] }) }));
  await page.route("**/api/web/locale", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale }) }));
}

async function accountFixture(page: import("@playwright/test").Page, locale: "ru" | "en") {
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, first_name: locale === "ru" ? "Полина" : "Polina", csrf_token: "fixture" }) }));
  await page.route("**/api/web/account", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ telegram_id: 618, locale, first_name: locale === "ru" ? "Полина" : "Polina", username: "fixture", balance: 1200, referral_count: 2, referral_link: null, orders: [] }) }));
}

test("BALI-TASK-066 locale and theme are independent across Admin and Account", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(root, { recursive: true });
  for (const size of sizes) {
    for (const theme of ["dark", "light"] as const) {
      for (const locale of ["ru", "en"] as const) {
        const context = await browser.newContext({ viewport: size, locale: locale === "ru" ? "ru-RU" : "en-US", reducedMotion: "reduce", serviceWorkers: "block" });
        await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ["safrway:appearance", theme]);
        const page = await context.newPage();
        await adminFixture(page, locale);
        await page.goto("/admin/settings/");
        await page.getByRole("button", { name: locale === "ru" ? "Обменник" : "Exchange" }).click();
        await expect(page.getByRole("heading", { name: locale === "ru" ? "Маршруты обмена" : "Exchange routes" })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(locale);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(root, `${size.name}-${locale}-${theme}-admin-settings.png`), fullPage: true });
        await page.getByRole("button", { name: locale === "ru" ? "Изменить с предпросмотром" : "Edit with preview" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const fieldsFit = await dialog.locator(".admin-setting-fields label").evaluateAll((labels) => labels.every((label) => {
          const box = label.getBoundingClientRect();
          const input = label.querySelector("input");
          const inputBox = input?.getBoundingClientRect();
          return box.left >= 0 && box.right <= window.innerWidth && box.width >= 180
            && (!inputBox || input?.type === "checkbox"
              || (inputBox.left >= box.left && inputBox.right <= box.right && inputBox.width >= 160));
        }));
        expect(fieldsFit).toBe(true);
        await expect(dialog.locator(".admin-setting-fields")).toHaveCSS("display", "grid");
        await page.screenshot({ path: path.join(root, `${size.name}-${locale}-${theme}-exchange-editor.png`), fullPage: true });
        await context.close();

        const accountContext = await browser.newContext({ viewport: size, locale: locale === "ru" ? "ru-RU" : "en-US", serviceWorkers: "block" });
        await accountContext.addInitScript(([key, value]) => localStorage.setItem(key, value), ["safrway:appearance", theme]);
        const account = await accountContext.newPage(); await accountFixture(account, locale);
        await account.goto("/account/");
        await expect(account.getByRole("heading", { name: locale === "ru" ? /Здравствуйте, Полина/ : /Hello, Polina/ })).toBeVisible();
        await expect.poll(() => account.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        await expect.poll(() => account.evaluate(() => document.documentElement.lang)).toBe(locale);
        expect(await account.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await account.screenshot({ path: path.join(root, `${size.name}-${locale}-${theme}-account.png`), fullPage: true });
        await accountContext.close();
      }
    }
  }
});

test("BALI-TASK-066 PWA install update offline and error states", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const size of sizes) {
    for (const state of ["install", "update", "offline", "error"] as const) {
      const light = state === "update" || state === "error";
      const locale = state === "offline" || state === "error" ? "ru" : "en";
      const context = await browser.newContext({ viewport: size, locale: locale === "ru" ? "ru-RU" : "en-US", serviceWorkers: "allow" });
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ["safrway:appearance", light ? "light" : "dark"]);
      const page = await context.newPage(); await accountFixture(page, locale);
      if (state === "update") await page.route("**/build-version.json**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ build_id: "newer-fixture" }) }));
      if (state === "error") await page.route("**/build-version.json**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await page.goto("/account/");
      await expect(page.getByRole("heading", { name: locale === "ru" ? /Здравствуйте, Полина/ : /Hello, Polina/ })).toBeVisible();
      if (state === "install") await page.evaluate(() => {
        const event = new Event("beforeinstallprompt");
        Object.defineProperty(event, "prompt", { value: async () => undefined });
        Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "dismissed" }) });
        window.dispatchEvent(event);
      });
      if (state === "offline") {
        await page.evaluate(() => navigator.serviceWorker.ready);
        const cached = await page.evaluate(async () => {
          const urls: string[] = [];
          for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname);
          return urls;
        });
        expect(cached.some((pathname) => pathname.startsWith("/api/") || pathname.startsWith("/mini-app/") || pathname.startsWith("/account/"))).toBe(false);
        await context.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        expect(await page.evaluate(async () => { try { await fetch("/api/web/offline-write-probe", { method: "POST", body: "{}" }); return false; } catch { return true; } })).toBe(true);
      }
      const label = state === "install" ? "Install app" : state === "update" ? "Load new version" : state === "offline" ? "Нет сети — данные доступны только после подключения." : "Не удалось проверить приложение. Повторите при стабильной сети.";
      await expect(state === "install" || state === "update" ? page.getByRole("button", { name: label }) : page.getByText(label)).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(light ? "light" : "dark");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const overlap = await page.evaluate(() => {
        const notice = document.querySelector(".pwa-lifecycle")?.getBoundingClientRect();
        const card = document.querySelector(".account-content article")?.getBoundingClientRect();
        return Boolean(notice && card && notice.bottom > card.top && notice.top < card.bottom);
      });
      expect(overlap).toBe(false);
      await page.screenshot({ path: path.join(root, `${size.name}-pwa-${state}-${locale}-${light ? "light" : "dark"}.png`), fullPage: true });
      await context.close();
    }
  }
});

test("BALI-TASK-066 reduced motion removes decorative animation", async ({ browser }) => {
  for (const size of sizes.filter((item) => item.width >= 390)) {
    const context = await browser.newContext({ viewport: size, locale: "en-US", reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addInitScript(() => localStorage.setItem("safrway:appearance", "dark"));
    const page = await context.newPage(); await accountFixture(page, "en");
    await page.goto("/account/");
    await expect(page.getByRole("heading", { name: /Hello, Polina/ })).toBeVisible();
    const motion = await page.locator("body *").evaluateAll((nodes) => nodes.every((node) => {
      const style = getComputedStyle(node);
      return style.animationName === "none" && (style.transitionDuration === "0s" || style.transitionDuration === "0.00001s");
    }));
    expect(motion).toBe(true);
    await page.screenshot({ path: path.join(root, `${size.name}-en-dark-reduced-motion.png`), fullPage: true });
    await context.close();
  }
});
