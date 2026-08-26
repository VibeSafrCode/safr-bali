import { expect, test, type Page } from "@playwright/test";

async function mockMiniApp(page: Page, locale: "ru" | "en") {
  await page.route(/telegram-web-app\.js/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "opaque-guide-fixture",
        ready() {},
        expand() {},
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      },
    };
  });
  await page.route("**/mini-app/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        telegram_id: 618,
        first_name: "Guide",
        username: "guide_fixture",
        balance: 0,
        referral_count: 0,
        referral_link: "",
        orders: [],
        locale,
      }),
    }),
  );
}

for (const fixture of [
  { width: 320, locale: "ru" as const, label: "Скачать PDF-гайд" },
  { width: 1440, locale: "en" as const, label: "Download the PDF guide" },
]) {
  test(`All Indonesia guide is downloadable and readable at ${fixture.width}px ${fixture.locale}`, async ({ page }) => {
    await page.setViewportSize({ width: fixture.width, height: 900 });
    await mockMiniApp(page, fixture.locale);
    await page.goto("/#/services/bali/guides/all-indonesia");

    await expect(page.getByRole("heading", { name: "All Indonesia", level: 1 })).toBeVisible();
    const download = page.getByRole("link", { name: fixture.label });
    await expect(download).toHaveAttribute(
      "href",
      "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf",
    );
    await expect(download).toHaveAttribute(
      "download",
      "all-indonesia-client-guide-safrway-2026.pdf",
    );
    const box = await download.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(page.locator("body")).toContainText(
      fixture.locale === "ru" ? "Сохраните PDF на телефон" : "Save the PDF to your phone",
    );
    await expect(page.locator("body")).toContainText("https://allindonesia.imigrasi.go.id/");
    await expect(page.locator("body")).not.toContainText("system prompt");
    await expect(page.locator(".guide-content-card h2")).toHaveCount(12);
    await expect(page.locator(".guide-content-card a[href='https://allindonesia.imigrasi.go.id/']")).toBeVisible();
    expect(await page.locator(".bottom-nav").evaluate((node) => getComputedStyle(node).position)).toBe("static");
  });
}
