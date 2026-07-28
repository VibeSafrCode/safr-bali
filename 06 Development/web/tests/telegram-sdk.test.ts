import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeTelegramWebApp,
  loadTelegramWebApp,
  type TelegramWebApp,
} from "../lib/telegram-web-app";

test("does not access the browser while rendering statically", async () => {
  assert.equal(await loadTelegramWebApp(), null);
});

test("initializes ready, expand and the Telegram theme", () => {
  let readyCalls = 0;
  let expandCalls = 0;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: {} } },
  });

  try {
    initializeTelegramWebApp({
      initData: "signed-data",
      colorScheme: "dark",
      ready() {
        readyCalls += 1;
      },
      expand() {
        expandCalls += 1;
      },
    } satisfies TelegramWebApp);

    assert.equal(readyCalls, 1);
    assert.equal(expandCalls, 1);
    assert.equal(document.documentElement.dataset.telegramTheme, "dark");
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
  }
});
