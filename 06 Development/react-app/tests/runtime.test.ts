import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiBaseUrl } from "../src/api/client";
import { readTelegramLayout } from "../src/components/TelegramSafeArea";
import { browserLoginUrl } from "../src/runtime/browser";
import { telegramInitData } from "../src/runtime/telegram";
import {
  authenticatedLocale,
  initialLocale,
  normalizeLocale,
} from "../src/i18n/locale";
import { translate } from "../src/i18n/runtime";

test("browser login uses one same-origin endpoint and a safe account return", () => {
  assert.equal(
    browserLoginUrl("https://app.safrway.online"),
    "https://app.safrway.online/api/web/auth/start?return_to=%2Faccount%2F",
  );
  assert.equal(
    browserLoginUrl(
      "https://app.safrway.online",
      "/account/orders/",
    ),
    "https://app.safrway.online/api/web/auth/start?return_to=%2Faccount%2Forders%2F",
  );
  assert.equal(
    browserLoginUrl(
      "https://app.safrway.online",
      "https://evil.example",
    ),
    "https://app.safrway.online/api/web/auth/start?return_to=%2Faccount%2F",
  );
});

test("API URL normalization accepts only a clean HTTP origin", () => {
  assert.equal(
    normalizeApiBaseUrl(undefined, "https://app.safrway.online/account/"),
    "https://app.safrway.online",
  );
  assert.throws(
    () =>
      normalizeApiBaseUrl(
        "https://user:secret@app.safrway.online",
        "https://app.safrway.online",
      ),
    /unsupported components/,
  );
});

test("Telegram adapter forwards only opaque signed initData", () => {
  assert.equal(
    telegramInitData({
      initData: "query_id=opaque&hash=signed",
      ready() {},
      expand() {},
    }),
    "query_id=opaque&hash=signed",
  );
  assert.equal(telegramInitData(null), "");
});

test("locale bootstrap respects saved/server Telegram locale, browser, then RU priority", () => {
  assert.equal(initialLocale({ cached: "en", telegram: "ru" }), "en");
  assert.equal(initialLocale({ telegram: "en-US", browser: ["ru"] }), "en");
  assert.equal(initialLocale({ browser: ["en-GB"] }), "en");
  assert.equal(initialLocale({ browser: ["de-DE"] }), "ru");
  assert.equal(authenticatedLocale("ru", "en"), "en");
  assert.equal(authenticatedLocale("en", null), "en");
  assert.equal(normalizeLocale("fr"), "ru");
});

test("Mini App runtime corpus translates controls and preserves placeholders", () => {
  assert.equal(translate("ru", "nav.services"), "Услуги");
  assert.equal(translate("en", "nav.services"), "Services");
  assert.equal(
    translate("en", "orders.number", { id: 42 }),
    "Request #42",
  );
  assert.match(translate("en", "shell.language.offline"), /offline/i);
  assert.equal(translate("en", "calculator.asset.idrCash"), "Cash IDR");
  assert.equal(translate("en", "calculator.asset.idrBank"), "Bank-transfer IDR");
  assert.equal(translate("en", "calculator.asset.rubBank"), "Bank-transfer RUB");
});

test("Telegram layout prefers stable viewport and preserves both safe areas", () => {
  assert.deepEqual(
    readTelegramLayout({
      initData: "signed",
      ready() {},
      expand() {},
      viewportHeight: 700,
      viewportStableHeight: 680,
      safeAreaInset: { top: 20, right: 1, bottom: 16, left: 1 },
      contentSafeAreaInset: { top: 52, right: 0, bottom: 70, left: 0 },
    }),
    {
      safeArea: { top: 20, right: 1, bottom: 16, left: 1 },
      contentSafeArea: { top: 52, right: 0, bottom: 70, left: 0 },
      viewportHeight: 680,
    },
  );
});
