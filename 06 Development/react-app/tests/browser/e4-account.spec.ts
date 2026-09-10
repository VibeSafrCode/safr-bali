import { expect, test, type Page } from "@playwright/test";

// Network-failure fixtures must not be satisfied by the service-worker cache.
test.use({ serviceWorkers: "block" });

const link = "https://t.me/safr_bali_bot?start=SAFE_E4";
function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const linear = [...color.matchAll(/[\d.]+/g)].slice(0, 3).map(([value]) => {
      const channel = Number(value) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}
const history = {
  items: [
    { id: 3, operation_type: "referral_reversal", amount: -50, balance_after: 75, created_at: "2026-09-01T12:00:00+00:00" },
    { id: 2, operation_type: "referral_accrual", amount: 125, balance_after: 125, created_at: "2026-08-30T12:00:00+00:00" },
  ], has_more: true, limit: 30,
};

async function prepare(page: Page, locale: "ru" | "en", surface: "account" | "mini", points: unknown = history) {
  const dashboard = { telegram_id: 618, locale, first_name: "Fixture", balance: 75, referral_count: 2, referral_link: link, orders: [], points_history: points };
  await page.route("**/api/web/auth/me", (route) => route.fulfill({ json: { authenticated: true, first_name: "Fixture" } }));
  await page.route("**/api/web/account", (route) => route.fulfill({ json: dashboard }));
  await page.route("**/mini-app/me", (route) => route.fulfill({ json: dashboard }));
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.addInitScript(() => {
    window.Telegram = { WebApp: { initData: "opaque", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } };
  });
  await page.goto(surface === "account" ? "/account/points/" : "/#/profile");
}

for (const locale of ["ru", "en"] as const) {
  for (const surface of ["account", "mini"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${surface} ${locale} ${theme}: readable server history and local QR at 320px`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.addInitScript((value) => localStorage.setItem("safrway:appearance", value), theme);
        await prepare(page, locale, surface);
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        const historyPanel = page.getByRole("region", { name: locale === "ru" ? "История Points" : "Points history" });
        await expect(historyPanel).toContainText("-50 Points");
        await expect(historyPanel).toContainText("+125 Points");
        await expect(historyPanel.locator("time")).toHaveCount(2);
        const historyColors = await historyPanel.evaluate((element) => ({ fg: getComputedStyle(element).color, muted: getComputedStyle(element.querySelector("time")!).color, bg: getComputedStyle(element).backgroundColor }));
        expect(contrast(historyColors.fg, historyColors.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(historyColors.muted, historyColors.bg)).toBeGreaterThanOrEqual(4.5);
        await expect(historyPanel).toContainText(locale === "ru" ? "Показаны последние операции" : "Showing recent transactions");
        if (surface === "account") await page.getByRole("button", { name: locale === "ru" ? "Моя сеть" : "My network", exact: true }).click();
        await expect(page.getByRole("img", { name: locale === "ru" ? "QR-код приглашения" : "Invitation QR code" })).toBeVisible();
        const qrBounds = (await page.locator("canvas").boundingBox())!;
        expect(Math.abs(qrBounds.width - qrBounds.height)).toBeLessThan(1);
        expect(qrBounds.width).toBeLessThanOrEqual(192);
        const canvasPixels = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data].filter((value, index) => index % 4 === 0 && value === 0).length);
        expect(canvasPixels).toBeGreaterThan(1000);
        await expect(page.getByRole("textbox")).toHaveValue(link);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const clipped = await page.locator(".account-detail-card").evaluateAll((cards) => cards.some((card) => [...card.querySelectorAll("strong,time,input,button,figcaption")].some((child) => { const rect = child.getBoundingClientRect(); return rect.left < 0 || rect.right > window.innerWidth + 1; })));
        expect(clipped).toBe(false);
        const colors = await page.locator(".account-detail-card").first().evaluate((element) => ({ fg: getComputedStyle(element).color, bg: getComputedStyle(element).backgroundColor }));
        expect(contrast(colors.fg, colors.bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
}

test("clipboard failure is actionable, success copies exact URL without external request", async ({ page }) => {
  const unexpectedExternal: string[] = [];
  page.on("request", (request) => { const url = new URL(request.url()); if (url.hostname !== "127.0.0.1" && url.hostname !== "telegram.org") unexpectedExternal.push(url.origin); });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
  await prepare(page, "en", "account");
  await page.getByRole("button", { name: "My network", exact: true }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status")).toContainText("Select the link and copy it manually");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.body.dataset.copied = text; } } }));
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status")).toContainText("Link copied");
  await expect(page.locator("body")).toHaveAttribute("data-copied", link);
  expect(unexpectedExternal).toEqual([]);
});

test("logout failure preserves signed-in screen and retry succeeds", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/web/auth/logout", (route) => route.fulfill({ status: ++attempts === 1 ? 503 : 200, json: { authenticated: false } }));
  await prepare(page, "en", "account");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.locator(".account-action-error[role=alert]")).toContainText("Could not confirm log out");
  await expect(page.getByRole("heading", { name: "75 Points" })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in with Telegram" })).toBeVisible();
});

test("missing history is not represented as an empty financial history", async ({ page }) => {
  await prepare(page, "en", "account", null);
  await expect(page.getByRole("status")).toContainText("History is temporarily unavailable");
  await expect(page.getByText("No transactions yet")).toHaveCount(0);
});

test("empty history and absent referral are explicit", async ({ page }) => {
  await prepare(page, "en", "account", { items: [], limit: 30, has_more: false });
  await expect(page.getByText("No transactions yet")).toBeVisible();
  await page.route("**/api/web/account", (route) => route.fulfill({ json: { locale: "en", balance: 0, referral_count: 0, referral_link: "https://evil.test/?private=1", orders: [] } }));
  await page.goto("/account/referrals/");
  await expect(page.getByText("Link is not available yet")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("QR chunk failure preserves selectable referral link", async ({ page }) => {
  await prepare(page, "en", "account");
  await expect(page.getByRole("heading", { name: "75 Points" })).toBeVisible();
  await page.route("**/assets/browser-*.js", (route) => route.abort());
  await page.getByRole("button", { name: "My network", exact: true }).click();
  await expect(page.getByText("QR code is unavailable. You can send the link instead.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue(link);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeEnabled();
});
