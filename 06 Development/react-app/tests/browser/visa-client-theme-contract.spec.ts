import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactRoot = path.resolve("../artifacts/BALI-TASK-070/designer-review/visa-cabinet");

const enteredVisa = {
  id: 41, country_code: "ID", visa_type: { code: "E33G", name: "E33G", version: 1 },
  service_status: "COMPLETED", lifecycle_status: "ACTIVE", publication_status: "PUBLISHED",
  notifications_enabled: true, entered_on: "2026-08-20", entry_deadline: "2026-08-10",
  stay_end: "2026-09-20", expected_stay_end: "2026-09-18", recommended_contact_at: "2026-09-10",
};
const waitingVisa = {
  id: 42, country_code: "ID", visa_type: { code: "D1", name: "D1", version: 1 },
  service_status: "PROCESSING", lifecycle_status: "ISSUED_NOT_ACTIVATED", publication_status: "PUBLISHED",
  notifications_enabled: true, entered_on: null, entry_deadline: "2026-10-05", stay_end: null,
  expected_stay_end: "2026-11-04", recommended_contact_at: null,
};

async function openMiniApp(page: Page, locale: "ru" | "en" = "ru", theme: "dark" | "light" = "dark") {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem("safrway:appearance", selectedTheme);
    window.Telegram = { WebApp: { initData: "fixture", ready() {}, expand() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } };
  }, { selectedTheme: theme });
  await page.route(/telegram-web-app\.js/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/mini-app/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ telegram_id: 1, first_name: "Fixture", balance: 0, referral_count: 0, referral_link: "", orders: [], locale }) }));
  await page.route("**/mini-app/visa-cases", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [enteredVisa, waitingVisa] }) }));
  await page.route("**/mini-app/visa-cases/41", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...enteredVisa, current_process: { type: "APPLICATION", external_status: "APPROVED", updated_at: "2026-08-20" }, timeline: [], documents: [] }) }));
  await page.route("**/mini-app/visa-cases/42", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...waitingVisa, current_process: null, timeline: [], documents: [] }) }));
  await page.goto("/#/visas");
  await expect(page.getByRole("heading", { name: locale === "ru" ? "Мои визы" : "My visas" })).toBeVisible();
}

function channel(value: string) {
  return [...value.matchAll(/[\d.]+/g)].map((match) => Number(match[0]));
}
function contrast(foreground: string, background: string) {
  const luminance = (rgb: number[]) => {
    const linear = rgb.slice(0, 3).map((value) => { const normalized = value / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const foregroundLuminance = luminance(channel(foreground));
  const backgroundLuminance = luminance(channel(background));
  return (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
}

test("dark visa cards and navigation use readable semantic surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMiniApp(page);
  const card = page.locator(".visa-case-card").first();
  const colors = await card.evaluate((node) => ({ foreground: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
  expect(colors.background).not.toBe("rgb(255, 255, 255)");
  expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
  const navigation = page.locator(".bottom-nav");
  const navigationBackground = await navigation.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(navigationBackground).not.toContain("251, 250, 246");
  const inactiveColor = await navigation.locator("button:not(.active)").first().evaluate((node) => getComputedStyle(node).color);
  expect(contrast(inactiveColor, navigationBackground)).toBeGreaterThanOrEqual(4.5);
  const activeColors = await navigation.locator("button.active").evaluate((node) => ({ foreground: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
  expect(contrast(activeColors.foreground, activeColors.background)).toBeGreaterThanOrEqual(4.5);
});

test("390px list keeps two compact clickable summaries above navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMiniApp(page);
  const cards = page.locator(".visa-case-card");
  await expect(cards).toHaveCount(2);
  const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; }));
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
  expect(boxes[0].height).toBeLessThanOrEqual(260);
  expect(boxes[1].right).toBeLessThanOrEqual(390);
  const navigationTop = await page.locator(".bottom-nav").evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.max(boxes[0].bottom, boxes[1].bottom)).toBeLessThan(navigationTop);
  await expect(page.getByText("Разрешено находиться до")).toHaveCount(1);
  await expect(page.getByText("Въехать до")).toHaveCount(1);
  await expect(page.getByText("Уточняется")).toHaveCount(0);
  for (const button of await page.locator(".visa-card-open").all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("detail renders exactly one contextual visa date and separate contact date", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMiniApp(page);
  await page.locator(".visa-card-open").first().click();
  const important = page.locator(".visa-detail-card").first();
  await expect(important.getByText("Разрешено находиться до")).toHaveCount(1);
  await expect(important.getByText("Въехать до")).toHaveCount(0);
  await expect(important.getByText("Использовать до")).toHaveCount(0);
  await expect(important.getByText("Рекомендуем связаться с SAFRWAY")).toHaveCount(1);
  await page.getByRole("button", { name: /К списку/ }).click();
  await page.locator(".visa-card-open").nth(1).click();
  await expect(page.locator(".visa-detail-card").first().getByText("Въехать до")).toHaveCount(1);
  await expect(page.locator(".visa-detail-card").first().getByText("Разрешено находиться до")).toHaveCount(0);
});

for (const matrix of [
  { width: 320, locale: "ru" as const, theme: "dark" as const },
  { width: 320, locale: "en" as const, theme: "light" as const },
  { width: 390, locale: "ru" as const, theme: "dark" as const },
  { width: 390, locale: "ru" as const, theme: "light" as const },
  { width: 390, locale: "en" as const, theme: "dark" as const },
  { width: 390, locale: "en" as const, theme: "light" as const },
  { width: 768, locale: "en" as const, theme: "dark" as const },
  { width: 768, locale: "ru" as const, theme: "light" as const },
  { width: 1440, locale: "ru" as const, theme: "dark" as const },
  { width: 1440, locale: "en" as const, theme: "light" as const },
]) {
  test(`visa cabinet visual containment ${matrix.width} ${matrix.locale} ${matrix.theme}`, async ({ page }) => {
    await page.setViewportSize({ width: matrix.width, height: 900 });
    await openMiniApp(page, matrix.locale, matrix.theme);
    const cards = page.locator(".visa-case-card");
    await expect(cards).toHaveCount(2);
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, cards: [...document.querySelectorAll<HTMLElement>(".visa-case-card")].map((card) => { const box = card.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, scrollWidth: card.scrollWidth }; }) }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
    geometry.cards.forEach((card) => { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(geometry.viewport); expect(card.scrollWidth).toBeLessThanOrEqual(Math.ceil(card.width)); });
    if (matrix.width === 390) {
      expect(Math.abs(geometry.cards[0].top - geometry.cards[1].top)).toBeLessThan(2);
      const navigationTop = await page.locator(".bottom-nav").evaluate((node) => node.getBoundingClientRect().top);
      expect(Math.max(...geometry.cards.map((card) => card.bottom))).toBeLessThan(navigationTop);
      const issuedCode = cards.nth(1).locator(".visa-summary-code");
      await expect(issuedCode).toHaveText("ISSUED_NOT_ACTIVATED");
      const semanticWrap = await issuedCode.evaluate((node) => ({
        text: node.textContent,
        overflow: (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth + 1,
        parts: [...node.querySelectorAll<HTMLElement>(".visa-code-segment")].map((part) => { const style = getComputedStyle(part); return { whiteSpace: style.whiteSpace, height: part.getBoundingClientRect().height, lineHeight: Number.parseFloat(style.lineHeight) }; }),
      }));
      expect(semanticWrap.text).toBe("ISSUED_NOT_ACTIVATED");
      expect(semanticWrap.overflow).toBe(false);
      expect(semanticWrap.parts.every((part) => part.whiteSpace === "nowrap" && part.height <= part.lineHeight * 1.6)).toBe(true);
    }
    if (matrix.theme === "dark") {
      const colors = await cards.first().evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
      expect(colors.background).not.toBe("rgb(255, 255, 255)");
      expect(contrast(colors.color, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
    await mkdir(artifactRoot, { recursive: true });
    await page.screenshot({ path: path.join(artifactRoot, `${matrix.width}-${matrix.locale}-${matrix.theme}-two-visas.png`) });
    if (matrix.width === 390 && matrix.theme === "dark") {
      await page.locator(".visa-card-open").first().click();
      const detail = page.locator(".visa-detail-card").first();
      const detailColors = await detail.evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
      expect(detailColors.background).not.toBe("rgb(255, 255, 255)");
      expect(contrast(detailColors.color, detailColors.background)).toBeGreaterThanOrEqual(4.5);
      await expect(detail.getByText(matrix.locale === "ru" ? "Разрешено находиться до" : "Permitted to stay until")).toHaveCount(1);
      await expect(detail.getByText(matrix.locale === "ru" ? "Въехать до" : "Enter by")).toHaveCount(0);
      await page.screenshot({ path: path.join(artifactRoot, `390-${matrix.locale}-dark-visa-detail.png`) });
    }
  });
}
