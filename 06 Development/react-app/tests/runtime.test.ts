import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiBaseUrl } from "../src/api/client";
import { browserLoginUrl } from "../src/runtime/browser";
import { telegramInitData } from "../src/runtime/telegram";

test("browser login uses one same-origin endpoint and a safe account return", () => {
  assert.equal(
    browserLoginUrl("https://app.safrway.online"),
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
