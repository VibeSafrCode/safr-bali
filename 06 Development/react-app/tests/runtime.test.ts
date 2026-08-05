import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiBaseUrl } from "../src/api/client";
import { readTelegramLayout } from "../src/components/TelegramSafeArea";
import { browserLoginUrl } from "../src/runtime/browser";
import { telegramInitData } from "../src/runtime/telegram";

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
