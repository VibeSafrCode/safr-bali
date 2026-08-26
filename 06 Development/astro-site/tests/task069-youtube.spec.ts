import { expect, test } from "@playwright/test";

test("YouTube stays disconnected until click, then loads the privacy-enhanced player", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (/youtube|youtu\.be|googlevideo/i.test(hostname)) externalRequests.push(request.url());
  });
  await page.route("https://www.youtube-nocookie.com/embed/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>fixture</title>" });
  });

  await page.goto("/");
  const section = page.locator(".public-youtube");
  await expect(section.getByRole("button", { name: /Смотреть видео/ })).toHaveCount(3);
  await expect(section.locator("iframe")).toHaveCount(0);
  expect(externalRequests).toEqual([]);

  await section.getByRole("button", { name: /часть 1/ }).click();
  const frame = section.locator("iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/OmlTDy12UQ4?autoplay=1&rel=0",
  );
  expect(externalRequests).toHaveLength(1);
  expect(externalRequests[0]).toContain("youtube-nocookie.com/embed/OmlTDy12UQ4");
});

test("YouTube controls remain localized, keyboard-safe and inside the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/en/");
  const section = page.locator(".public-youtube");
  const buttons = section.getByRole("button", { name: /Watch video/ });
  await expect(buttons).toHaveCount(3);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 321) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  await buttons.first().focus();
  await expect(buttons.first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(section.getByRole("link", { name: /All videos on YouTube/ })).toHaveAttribute(
    "href",
    "https://www.youtube.com/channel/UCeCPrNH3V7E2YK4CtsgyQ_A",
  );
});
