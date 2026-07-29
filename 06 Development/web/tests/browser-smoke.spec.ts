import { expect, test } from "@playwright/test";

const telegramSdk = `
  (() => {
    const callbacks = new Set();
    window.__telegramOpened = [];
    window.Telegram = {
      WebApp: {
        initData: "query_id=test&auth_date=1&hash=test",
        colorScheme: "light",
        themeParams: {},
        ready() {},
        expand() {},
        openTelegramLink(url) { window.__telegramOpened.push(url); },
        HapticFeedback: { impactOccurred() {} },
        BackButton: {
          show() {},
          hide() {},
          onClick(fn) { callbacks.add(fn); },
          offClick(fn) { callbacks.delete(fn); },
        },
      },
    };
  })();
`;
const dashboard = {
  telegram_id: 42,
  first_name: "Тест",
  username: "safr_test",
  balance: 618,
  referral_count: 2,
  referral_link: "https://t.me/safr_bali_bot?start=ref_42",
  orders: [],
};

async function prepareMiniApp(page: import("@playwright/test").Page) {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: telegramSdk,
    }),
  );
  await page.route("https://api.safrway.online/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/mini-app/me") {
      return route.fulfill({ status: 200, json: dashboard });
    }
    return route.fulfill({ status: 204, body: "" });
  });
}

test("website opens catalog pages internally and preserves browser history", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(
        `${message.text()} @ ${message.location().url || "unknown"}`,
      );
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Путешествия и жизнь",
  );

  await page.getByRole("link", { name: /Открыть направления/ }).click();
  await expect(page).toHaveURL(/\/catalog\/$/);
  await page
    .getByRole("link", { name: "Открыть направление Бали" })
    .click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/bali\/$/);
  await page
    .getByRole("link", { name: "Открыть раздел Сделать визу" })
    .click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/bali\/visas\/$/);
  await page
    .getByRole("link", { name: "Открыть страницу eVOA" })
    .click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/bali\/visas\/voa\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("eVOA");

  await page.goBack();
  await expect(page).toHaveURL(/\/bali\/visas\/$/);

  await page.goto("/bali/visas/e33g/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ITAS E33G");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ITAS E33G");
  expect(browserErrors, failedResponses.join("\n")).toEqual([]);
});

test("website remains navigable with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("link", { name: /Открыть направления/ }).click();
  await expect(page).toHaveURL(/\/catalog\/$/);
  await page
    .getByRole("link", { name: "Открыть направление Бали" })
    .click({ position: { x: 24, y: 24 } });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Бали");

  await context.close();
});

test("mobile direction card opens from its full surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog/");

  const baliCard = page.getByRole("link", {
    name: "Открыть направление Бали",
  });
  await expect(baliCard).toBeVisible();
  await baliCard.click({ position: { x: 24, y: 180 } });

  await expect(page).toHaveURL(/\/bali\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Бали");
});

test("mobile service and visa cards open from their full surfaces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bali/");

  await page
    .getByRole("link", { name: "Открыть раздел Сделать визу" })
    .click({ position: { x: 20, y: 24 } });
  await expect(page).toHaveURL(/\/bali\/visas\/$/);

  await page
    .getByRole("link", { name: "Открыть страницу ITAS E33G" })
    .click({ position: { x: 20, y: 24 } });
  await expect(page).toHaveURL(/\/bali\/visas\/e33g\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ITAS E33G");
});

test("only the manager action exposes Telegram on the website", async ({
  page,
}) => {
  await page.goto("/bali/visas/voa/");
  await page.getByRole("button", { name: "Написать менеджеру" }).first().click();
  await expect(
    page.getByRole("region", { name: "Связь с менеджером" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Перейти в Telegram/ }),
  ).toHaveAttribute("href", "https://t.me/safr_bali_bot");
  await expect(page).toHaveURL(/\/bali\/visas\/voa\/$/);
});

test("Mini App catalog stays inside Mini App and bottom tabs do not lock scroll", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(
        `${message.text()} @ ${message.location().url || "unknown"}`,
      );
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await prepareMiniApp(page);
  await page.goto("/mini-app/");
  await expect(page.getByText("Добрый день, Тест")).toBeVisible();

  await page.getByRole("button", { name: "Открыть услуги направления Бали" }).click();
  await expect(page.getByRole("heading", { name: "Бали" })).toBeVisible();
  await page.getByRole("button", { name: /Сделать визу/ }).click();
  await page.getByRole("button", { name: /ITAS E33G/ }).click();
  await expect(page.getByText("Для удалённых работников, сроком на 1 год.")).toBeVisible();
  await expect(page).toHaveURL(/\/mini-app\/$/);
  expect(await page.evaluate(() => window.__telegramOpened)).toEqual([]);

  await page.getByRole("button", { name: /Заявки/ }).click();
  await expect(page.getByRole("heading", { name: "Мои заявки" })).toBeVisible();
  await page.getByRole("button", { name: /Профиль/ }).click();
  await expect(page.getByRole("heading", { name: "Моя сеть" })).toBeVisible();
  await page.getByRole("button", { name: /Услуги/ }).click();
  await expect(page.getByRole("heading", { name: "ITAS E33G" })).toBeVisible();

  const scrollState = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return {
      bodyOverflow: getComputedStyle(document.body).overflow,
      rootOverflow: getComputedStyle(document.documentElement).overflow,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: window.scrollY,
    };
  });
  expect(scrollState.bodyOverflow).not.toBe("hidden");
  expect(scrollState.rootOverflow).not.toBe("hidden");
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.scrollY).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});

test("Mini App shows a safe API failure without parsing HTML", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: telegramSdk }),
  );
  await page.route("https://api.safrway.online/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/html",
      body: "<html>upstream failure</html>",
    }),
  );

  await page.goto("/mini-app/");
  await expect(page.getByRole("status")).toContainText(
    "Сервер вернул неожиданный ответ",
  );
  await expect(page.getByRole("status")).not.toContainText("<html>");
});

test("unknown routes return the custom 404 with an actual 404 status", async ({
  page,
}) => {
  const response = await page.goto("/route-that-does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Все направления" })).toBeVisible();
});

declare global {
  interface Window {
    __telegramOpened: string[];
  }
}
