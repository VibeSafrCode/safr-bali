import assert from "node:assert/strict";
import test from "node:test";

// Exercise the actual compile-time Yoga branch, not a pathname or brand hint.
Object.defineProperty(globalThis, "__YOGA_MINI_APP__", { value: true, configurable: true });
const { loadTelegramWebApp } = await import("../src/runtime/telegram");

test("Actual Yoga runtime consumes a successful early singleton without another script", async () => {
  const webApp = { initData: "signed-value", ready() {}, expand() {} };
  Object.defineProperty(globalThis, "window", { value: {
    __yogaTelegramSdk: { status: "ready", promise: Promise.resolve(webApp) },
  }, configurable: true });
  assert.equal(await loadTelegramWebApp(), webApp);
});

test("Actual Yoga runtime fails closed after timeout or missing bootstrap despite a late global SDK", async () => {
  const webApp = { initData: "late-value", ready() {}, expand() {} };
  for (const state of [undefined, { status: "timeout", promise: Promise.resolve(null) }, { status: "error", promise: Promise.resolve(null) }]) {
    Object.defineProperty(globalThis, "window", { value: {
      Telegram: { WebApp: webApp }, __yogaTelegramSdk: state,
      setTimeout() { throw new Error("Do not restart the SDK deadline"); },
    }, configurable: true });
    assert.equal(await loadTelegramWebApp(), null);
  }
});
