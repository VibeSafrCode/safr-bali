import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadTelegramWebApp, loadYogaTelegramWebApp } from "../src/runtime/telegram";

// Vite injects the config's source directory when loading the TS config. Use
// that same directory in this isolated Node test; do not write a build artifact.
Object.defineProperty(globalThis, "__dirname", { value: fileURLToPath(new URL("../", import.meta.url)), configurable: true });
const { default: yogaConfig } = await import("../vite.yoga.config");
const bootstrap = readFileSync(new URL("../public/yoga-telegram-sdk.js", import.meta.url), "utf8");
const mainHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("all three application typecheck entries include their existing build declarations", () => {
  for(const file of ['tsconfig.yoga.json','tsconfig.york-preview.json']) {
    const config=JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    assert.ok(config.include.includes('src/vite-env.d.ts'),file);
  }
  const main=JSON.parse(readFileSync(new URL('../tsconfig.app.json',import.meta.url),'utf8'));
  assert.ok(main.include.includes('src'));
});

function harness(existing = false) {
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const listeners = new Map<string, Set<() => void>>();
  const script = {
    src: "", async: false, dataset: {} as Record<string, string>,
    addEventListener(name: string, callback: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
    },
    removeEventListener(name: string, callback: () => void) { listeners.get(name)?.delete(callback); },
  };
  const appended: unknown[] = [];
  const notice = { textContent: "Загрузка / Loading…" };
  const window = {
    Telegram: undefined as { WebApp?: unknown } | undefined,
    __yogaTelegramSdk: undefined as { status: string; promise: Promise<unknown> } | undefined,
    setTimeout(callback: () => void, ms: number) {
      timers.set(++timerId, { due: now + ms, callback });
      return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const document = {
    querySelector: () => existing || appended.length ? script : null,
    createElement: (tag: string) => { assert.equal(tag, "script"); return script; },
    getElementById: (id: string) => { assert.equal(id, "yoga-bootstrap-status"); return notice; },
    head: { append: (value: unknown) => { appended.push(value); } },
  };
  const context = vm.createContext({ window, document });
  const run = () => vm.runInContext(bootstrap, context, { timeout: 1000 });
  const dispatch = (event: string) => { for (const callback of [...listeners.get(event) ?? []]) callback(); };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.due > now) continue;
      timers.delete(id);
      timer.callback();
    }
  };
  return { window, document, script, appended, notice, run, dispatch, advance, timers };
}

test("Yoga early bootstrap appends exactly one asynchronous SDK, sharing readiness before React", async () => {
  const app = harness();
  app.run();
  const state = app.window.__yogaTelegramSdk!;
  assert.equal(state.status, "loading");
  assert.equal(app.script.async, true);
  assert.equal(app.script.src, "https://telegram.org/js/telegram-web-app.js?63");
  app.run();
  assert.equal(app.appended.length, 1);
  assert.equal(app.window.__yogaTelegramSdk, state);
  const webApp = { initData: "opaque-signed-value" };
  app.window.Telegram = { WebApp: webApp };
  app.dispatch("load");
  assert.equal(state.status, "ready");
  assert.equal(await state.promise, webApp);
  assert.equal(app.timers.size, 0);
  Object.defineProperty(globalThis, "window", { value: app.window, configurable: true });
  assert.equal(await loadYogaTelegramWebApp(), webApp, "An event before runtime initialization is retained");
});

test("Yoga retains early SDK failure and does not wait five more seconds at runtime", async () => {
  const app = harness();
  app.run();
  app.dispatch("error");
  assert.equal(app.window.__yogaTelegramSdk!.status, "error");
  assert.equal(await app.window.__yogaTelegramSdk!.promise, null);
  Object.defineProperty(globalThis, "window", { value: app.window, configurable: true });
  assert.equal(await loadYogaTelegramWebApp(), null);
  assert.equal(app.timers.size, 0);
  assert.match(app.notice.textContent, /Reopen the Mini App/);
  app.run();
  assert.equal(app.appended.length, 1);
});

test("Yoga deadline starts early; timeout is terminal even if SDK eventually loads", async () => {
  const app = harness();
  app.run();
  app.advance(4999);
  assert.equal(app.window.__yogaTelegramSdk!.status, "loading");
  app.advance(1);
  assert.equal(app.window.__yogaTelegramSdk!.status, "timeout");
  assert.equal(await app.window.__yogaTelegramSdk!.promise, null);
  app.window.Telegram = { WebApp: { initData: "late-signed-value" } };
  app.dispatch("load");
  app.run();
  Object.defineProperty(globalThis, "window", { value: app.window, configurable: true });
  assert.equal(await loadYogaTelegramWebApp(), null);
  assert.equal(app.window.__yogaTelegramSdk!.status, "timeout");
  assert.equal(app.appended.length, 1, "No SDK or authentication retry is started");
});

test("Yoga accepts an already available SDK, reuses an existing script, and fails closed without bootstrap", async () => {
  const ready = harness();
  const webApp = { initData: "already-ready" };
  ready.window.Telegram = { WebApp: webApp };
  ready.run();
  assert.equal(await ready.window.__yogaTelegramSdk!.promise, webApp);
  assert.equal(ready.appended.length, 0);
  const existing = harness(true);
  existing.run();
  assert.equal(existing.appended.length, 0);
  existing.dispatch("load");
  assert.equal(existing.window.__yogaTelegramSdk!.status, "error", "A script load without WebApp is not readiness");
  Object.defineProperty(globalThis, "window", { value: { Telegram: { WebApp: webApp } }, configurable: true });
  assert.equal(await loadYogaTelegramWebApp(), null, "Do not skip the Yoga launch state after a missing bootstrap");
});

test("Main retains its original runtime script loading and existing SDK contract", async () => {
  const app = harness();
  Object.defineProperty(globalThis, "window", { value: app.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: app.document, configurable: true });
  const pending = loadTelegramWebApp(100);
  assert.equal(app.appended.length, 1);
  const webApp = { initData: "main-signed-value" };
  app.window.Telegram = { WebApp: webApp };
  app.dispatch("load");
  assert.equal(await pending, webApp);
  assert.equal(await loadTelegramWebApp(), webApp);
  assert.equal(app.window.__yogaTelegramSdk, undefined);
  assert.equal(app.appended.length, 1);
});

test("Yoga HTML has a neutral static shell and deferred bootstrap before its module; Main remains unchanged", async () => {
  const plugins = (yogaConfig.plugins ?? []).flat(Infinity) as Array<{ name?: string; transformIndexHtml?: { handler: (html: string) => string } }>;
  const transform = plugins.find((plugin) => plugin.name === "yoga-mini-app-entry")!.transformIndexHtml!.handler;
  const html = transform(mainHtml);
  const bootstrapPosition = html.indexOf('<script src="/yoga-telegram-sdk.js" defer');
  const modulePosition = html.indexOf('src="/src/yoga-main.tsx"');
  assert.ok(bootstrapPosition > 0 && bootstrapPosition < modulePosition);
  assert.equal(html.includes("https://telegram.org/js/telegram-web-app.js"), false);
  assert.match(html, /id="root"><div class="destination-backdrop" aria-hidden="true"><\/div><main class="status-screen" aria-busy="true">/);
  assert.match(html, /Загрузка \/ Loading…/);
  for (const forbidden of ["referral_link", "balance", "telegram_id", "initData", "<a ", "<button ", "SAFRWAY"]) assert.equal(html.includes(forbidden), false, forbidden);
  assert.match(mainHtml, /src="https:\/\/telegram.org\/js\/telegram-web-app.js\?63"/);
  assert.match(mainHtml, /<div id="root"><\/div>/);
  assert.equal(mainHtml.includes("yoga-telegram-sdk.js"), false);
  const entry = readFileSync(new URL("../src/yoga-main.tsx", import.meta.url), "utf8");
  assert.equal(entry.includes("DestinationBackdrop"), false, "Yoga must not mount the hidden country Image.decode loader");
  assert.match(entry, /<div className="destination-backdrop" aria-hidden="true" \/>/, "Keep the accepted CSS lotus without a country image loader");
  assert.equal(entry.includes("new Image"), false);
  const mainEntry = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(mainEntry, /<DestinationBackdrop\/>/);
  assert.equal(mainEntry.includes("yoga-telegram-sdk"), false);
});
