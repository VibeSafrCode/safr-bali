import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {build} from "vite";
import react from "@vitejs/plugin-react";
import {createHash} from "node:crypto";
import * as bindingModule from "../src/i18n/client-ui-bindings";
import * as localeModule from "../src/i18n/client-ui-locale";
import * as surfaceModule from '../src/i18n/client-ui-surface';
import * as authLifecycleModule from '../src/runtime/client-auth-lifecycle';
import * as provenanceModule from '../src/i18n/client-ui-provenance';
import * as catalogModule from "../src/catalog";
import * as browserModule from "../src/runtime/browser";
import * as legacyModule from "../src/i18n/runtime";
import {ApiError} from "../src/api/client";
import {CLIENT_RUNTIME_LOCALES, clientRuntimeText} from "../src/i18n/client-runtime";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(appRoot, "package.json"));
type Node = {type: string; props: Record<string, any>; children: (Node | string)[]};
type Call = {route: string; options: RequestInit};
const optionsFixture = {
  give: [{code: "RUB_BANK", label: "Рубли на счёте"}],
  receive: [{code: "USDT", label: "USDT"}, {code: "UNKNOWN_ASSET", label: "Неизвестная подпись"}],
  supported_pairs: [{give_currency: "RUB_BANK", receive_currency: "USDT", amount_sides: ["give", "receive"], route_code: "RUB_BANK_TO_USDT"},
    {give_currency: "RUB_BANK", receive_currency: "UNKNOWN_ASSET", amount_sides: ["give"], route_code: "RUB_BANK_TO_UNKNOWN_ASSET"}],
  manual_pairs_supported: false,
};
const quoteFixture = {
  quote_id: "mock-quote-1", status: "PRELIMINARY", manual_confirmation_required: true,
  source_asset: "RUB_BANK", target_asset: "USDT", source_amount_display: "1000.00",
  target_amount_display: "20.00", calculated_at: "2026-10-13T03:00:00Z", expires_at: "2026-10-13T03:05:00Z",
  warning: "Исходная серверная оговорка — сохранить буквально.",
};
function defer<T>() {
  let resolve!: (value: T) => void, reject!: (value?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

/**
 * Actual unmodified TSX is compiled with the installed TS compiler. This adapter
 * drives returned real React JSX elements, callbacks and effect closures using
 * deterministic state slots, memo/ref slots, fake timers and mocked transport.
 * It is NOT React DOM reconciliation/hydration, layout, focus or browser proof.
 * CSS is not executed; API/legacy-context/theme and environment are explicit
 * mocks. A complementary realReact SSR case exercises static loading labels.
 */
function harness(locale: typeof CLIENT_RUNTIME_LOCALES[number], config: {
  authenticated?: boolean; authError?: boolean; optionsError?: boolean;
  quoteError?: boolean; requestError?: boolean; contactDelay?: ReturnType<typeof defer<unknown>>;
  offline?: boolean; realReact?: boolean;
  uiPreference?: {ui_locale: bindingModule.ClientUiLocale10 | null; revision: number};
  uiWrite?: (value: {ui_locale: bindingModule.ClientUiLocale10; expected_revision: number}, options: RequestInit) => Promise<unknown>;
  quoteResult?: typeof quoteFixture;
  requestDelays?: Record<string, ReturnType<typeof defer<unknown>>>;
  authDelay?:ReturnType<typeof defer<unknown>>;
  pathname?:string;
} = {}) {
  const calls: Call[] = [], instances = new Map<string, any[]>(), cache = new Map<string, any>();
  let active: any[] = [], slot = 0, dirty = true, id = 0;
  let pendingEffects: (() => void)[] = [];
  let disposed = false, postDisposeWrites = 0;
  const timers = new Map<number, () => void>(), savedGlobals = new Map<string, PropertyDescriptor | undefined>();
  const storage = new Map<string, string>([[localeModule.CLIENT_UI_LOCALE_STORAGE_KEY, locale]]);
  const windowMock = Object.assign(new EventTarget(), {
    location: {origin: "https://app.safrway.online", pathname: config.pathname??"/calculator/", assign() {}, reload() {}},
    setTimeout(callback: () => void) {const key = ++id; timers.set(key, callback); return key;},
    clearTimeout(key: number) {timers.delete(key);},
    requestAnimationFrame(callback: () => void) {const key = ++id; timers.set(key, callback); return key;},
    cancelAnimationFrame(key: number) {timers.delete(key);}, isSecureContext: false,
  });
  const html = {lang: locale as string, dir: locale === "ar" ? "rtl" : "ltr", dataset: {appDesign: "true"}, style: {colorScheme: "dark", overflow: ""}};
  const localStorage = {getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {storage.set(key, value);}, removeItem: (key: string) => {storage.delete(key);}};
  const documentMock = {documentElement: html, querySelector: () => null, activeElement: null};
  for (const [name, value] of Object.entries({window: windowMock, document: documentMock, localStorage,
    navigator: {onLine: !config.offline, languages: [locale]},
    fetch: () => {throw new Error("NO_REAL_NETWORK");}})) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {value, writable: true, configurable: true});
  }
  const api = {async request(route: string, input: RequestInit = {}) {
    calls.push({route, options: input});
    if (route === "/api/web/auth/me") {
      if(config.authDelay)await config.authDelay.promise;
      if (config.authError) throw new ApiError("mock auth", {kind: "network"});
      return config.authenticated === false ? {authenticated: false, locale: "ru"} :
        {authenticated: true, telegram_id: 101, locale: "ru", csrf_token: "a".repeat(64),
          ...(config.uiPreference === undefined ? {} : {client_ui_preference: config.uiPreference})};
    }
    if (route === "/api/web/preferences/ui-locale") {
      const value = JSON.parse(String(input.body));
      if (config.uiWrite) return config.uiWrite(value, input);
      if (!config.uiPreference || value.expected_revision !== config.uiPreference.revision)
        throw new ApiError("synthetic conflict", {kind: "http", status: 409, details: {current: config.uiPreference}});
      config.uiPreference = {ui_locale: value.ui_locale, revision: value.expected_revision + 1};
      return {...config.uiPreference};
    }
    if (route === "/api/web/locale") return config.contactDelay ? config.contactDelay.promise : {locale: JSON.parse(String(input.body)).locale};
    if (route.endsWith("/exchange/options")) {
      if (config.optionsError) throw new ApiError("mock options", {kind: "network"});
      return optionsFixture;
    }
    if (route.endsWith("/exchange/quotes")) {
      if (config.quoteError) throw new ApiError("mock quote", {kind: "network"});
      return config.quoteResult ?? quoteFixture;
    }
    if (route.endsWith("/exchange/requests")) {
      const delayed = config.requestDelays?.[JSON.parse(String(input.body)).quote_id];
      if (delayed) return delayed.promise;
      if (config.requestError) throw new ApiError("mock request", {kind: "network"});
      return {id: "mock-request-1", quote_id: "mock-quote-1", status: "AWAITING_OPERATOR"};
    }
    throw new Error("UNEXPECTED_MOCK_ROUTE: " + route);
  }};
  const state = (initial: any) => {
    const index = slot++, cells = active;
    if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
    return [cells[index], (value: any) => {
      if (disposed) postDisposeWrites++;
      const next = typeof value === "function" ? value(cells[index]) : value;
      if (!Object.is(cells[index], next)) {cells[index] = next; dirty = true;}
    }];
  };
  const equalDeps = (a?: any[], b?: any[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (compute: () => any, deps?: any[]) => {
    const index = slot++, cells = active;
    if (!cells[index] || !equalDeps(cells[index].deps, deps)) cells[index] = {value: compute(), deps};
    return cells[index].value;
  };
  const effect = (callback: () => any, deps?: any[]) => {
    const index = slot++, cells = active, previous = cells[index];
    if (!previous || !equalDeps(previous.deps, deps)) {
      cells[index] = {deps, cleanup: undefined};
      pendingEffects.push(() => {previous?.cleanup?.(); cells[index].cleanup = callback();});
    }
  };
  const hooks = {...React, useState: state, useEffect: effect, useLayoutEffect: effect,
    useMemo: memo, useCallback: (callback: any, deps: any[]) => memo(() => callback, deps),
    useRef: (initial: any) => memo(() => ({current: initial}), []),
    useId: () => memo(() => "mock-id-" + (++id), [])};
  const modules: Record<string, any> = {
    "i18n/client-ui-bindings": bindingModule, "i18n/client-ui-locale": localeModule,
    'i18n/client-ui-surface':surfaceModule,'runtime/client-auth-lifecycle':authLifecycleModule,
    'i18n/client-ui-provenance':provenanceModule,
    catalog: catalogModule, "runtime/browser": browserModule,
    "api/client": {ApiError, appApiClient: () => api},
    "i18n/runtime": {...legacyModule, useI18n: () => ({locale: "ru", t: (key: any, variables: any) => legacyModule.translate("ru", key, variables)}),
      I18nProvider: ({children}: any) => children},
    "components/AppearanceControls": {useAppearance: () => ({theme: "dark", setTheme() {}})},
  };
  function load(relative: string): any {
    const key = relative.replace(/^\.\//, "").replace(/\.(tsx?|mjs)$/, "");
    if (modules[key]) return modules[key];
    if (cache.has(key)) return cache.get(key);
    const candidates = [path.join(appRoot, "src", key + ".tsx"), path.join(appRoot, "src", key + ".ts")];
    const filename = candidates.find(file => fs.existsSync(file));
    assert(filename, key);
    const result = {exports: {} as any}; cache.set(key, result.exports);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
    }).outputText;
    const scopedRequire = (specifier: string) => {
      if (specifier === "react") return config.realReact ? React : hooks;
      if (specifier === "react/jsx-runtime") return require(specifier);
      if (specifier === "react-dom") return {createPortal: (node: any) => node};
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith(".")) return load(path.posix.normalize(path.posix.join(path.posix.dirname(key), specifier)));
      return require(specifier);
    };
    vm.runInThisContext("(function(require,module,exports){" + compiled + "\n})", {filename})(scopedRequire, result, result.exports);
    return result.exports;
  }
  function walk(value: any, location = "root"): (Node | string)[] {
    if (value === null || value === undefined || typeof value === "boolean") return [];
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.flatMap((child, index) => walk(child, location + "/" + index));
    if (value.type === React.Fragment) return walk(value.props.children, location + "/fragment");
    if (typeof value.type === "function") {
      const name = location + "/" + value.type.name;
      const cells = instances.get(name) ?? []; instances.set(name, cells);
      const previous = active, previousSlot = slot; active = cells; slot = 0;
      const rendered = value.type(value.props); active = previous; slot = previousSlot;
      return walk(rendered, name);
    }
    assert.equal(typeof value.type, "string");
    return [{type: value.type, props: value.props, children: walk(value.props.children, location + "/" + value.type)}];
  }
  const WebCalculatorApp = load("surfaces/WebCalculatorApp").WebCalculatorApp;
  let tree: (Node | string)[] = [];
  const render = () => {dirty = false; tree = walk(React.createElement(WebCalculatorApp)); const effects = pendingEffects; pendingEffects = []; effects.forEach(run => run());};
  const flush = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (dirty) render();
      for (let index = 0; index < 8; index++) await Promise.resolve();
      if (!dirty && pendingEffects.length === 0) return;
    }
    throw new Error("MOCK_RENDER_DID_NOT_SETTLE");
  };
  const nodes = () => {
    const result: Node[] = [];
    const visit = (rows: (Node | string)[]) => rows.forEach(row => {if (typeof row !== "string") {result.push(row); visit(row.children);}});
    visit(tree); return result;
  };
  const text = () => {const collect = (rows: (Node | string)[]): string => rows.map(row => typeof row === "string" ? row : collect(row.children)).join(" "); return collect(tree);};
  return {calls, html, storage, load, tree: () => tree, nodes, text, render, flush,
    ssr: () => renderToStaticMarkup(React.createElement(WebCalculatorApp)),
    async timers() {const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach(run => run()); await flush();},
    logout() {windowMock.dispatchEvent(new Event("safr:auth-logout"));},
    postDisposeWrites: () => postDisposeWrites,
    dispose() {disposed = true; for (const cells of instances.values()) for (const cell of cells) cell?.cleanup?.();
      for (const [name, descriptor] of savedGlobals) {if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name];}}};
}
const sourceKey = (name: string) => "source:06 Development/react-app/src/surfaces/WebCalculatorApp.tsx#copy." + name;

test("actual compiled WebCalculator guest/loading/error trees and realReact SSR labels ×10", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const guest = harness(locale, {authenticated: false});
    try {
      guest.render();
      assert(guest.text().includes(clientRuntimeText(locale, sourceKey("guestDetail") as any)));
      await guest.flush();
      assert(guest.text().includes(clientRuntimeText(locale, sourceKey("eyebrow") as any)));
      assert(guest.text().includes(clientRuntimeText(locale, sourceKey("guestTitle") as any)));
      assert(guest.text().includes(clientRuntimeText(locale, sourceKey("login") as any)));
      assert.equal(guest.html.lang, locale); assert.equal(guest.html.dir, locale === "ar" ? "rtl" : "ltr");
      const select = guest.nodes().find(node => node.type === "select" && node.props.className === "compact-locale");
      assert(select); assert.equal(select.children.length, 10);
      const signIn = guest.nodes().find(node => node.type === "a" && node.props.className === "button primary");
      assert(signIn); assert.equal(new URL(signIn.props.href).searchParams.get("return_to"), bindingModule.clientPublicHome(locale));
      assert.equal(guest.calls.some(call => call.route.includes("/locale")), false);
    } finally {guest.dispose();}
    const error = harness(locale, {authError: true});
    try {await error.flush(); assert(error.text().includes(clientRuntimeText(locale, sourceKey("errorTitle") as any)));} finally {error.dispose();}
    const real = harness(locale, {realReact: true});
    try {const html = real.ssr(); assert(html.includes(clientRuntimeText(locale, sourceKey("eyebrow") as any))); assert(html.includes(clientRuntimeText(locale, sourceKey("guestTitle") as any))); assert.equal(real.calls.length, 0);} finally {real.dispose();}
  }
});

test("actual ready/idle/debounced quote/success request trees ×10 preserve finance payload and known/unknown asset identities", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const view = harness(locale);
    try {
      await view.flush();
      assert(view.text().includes(clientRuntimeText(locale, "calculator.idle.title")));
      const amount = view.nodes().find(node => node.type === "input" && node.props.inputMode === "decimal");
      assert(amount); amount.props.onChange({target: {value: "1000"}}); await view.flush();
      assert(view.text().includes(clientRuntimeText(locale, "calculator.updating")));
      await view.timers();
      assert(view.text().includes(clientRuntimeText(locale, "calculator.quote.preliminary")));
      assert(view.text().includes("1 000.00 RUB")); assert(view.text().includes("20.00 USDT"));
      assert(view.text().includes(clientRuntimeText(locale, "calculator.whitebird.detail")));
      const quoteCall = view.calls.find(call => call.route.endsWith("/exchange/quotes")); assert(quoteCall);
      assert.deepEqual(JSON.parse(String(quoteCall.options.body)), {route_code: "RUB_BANK_TO_USDT", mode: "GIVE", amount: "1000", give_currency: "RUB_BANK", receive_currency: "USDT", amount_side: "give"});
      assert.equal((quoteCall.options.headers as Record<string, string>)["X-CSRF-Token"], "a".repeat(64));
      const whitebird = view.nodes().find(node => node.type === "a" && node.props.href?.startsWith("https://whitebird.io/"));
      assert.equal(whitebird?.props.href, "https://whitebird.io/signup?refid=xI8m5j0M");
      if (locale !== "ru" && locale !== "en") assert(view.text().includes(quoteFixture.warning));
      const assetSelects = view.nodes().filter(node => node.type === "select" && node.props.className === "asset-select-fallback");
      const unknown = assetSelects.flatMap(node => node.children).find(node => typeof node !== "string" && node.props.value === "UNKNOWN_ASSET") as Node;
      assert(unknown); assert(unknown.children.includes(locale === "ru" ? "Неизвестная подпись" : "UNKNOWN_ASSET"));
      const submit = view.nodes().find(node => node.type === "button" && node.props.className === "button primary" && !node.props.disabled);
      assert(submit); await submit.props.onClick(); await view.flush();
      assert(view.text().includes(clientRuntimeText(locale, "calculator.request.success")));
      const request = view.calls.find(call => call.route.endsWith("/exchange/requests")); assert(request);
      assert.deepEqual(JSON.parse(String(request.options.body)), {quote_id: "mock-quote-1"});
      assert.match((request.options.headers as Record<string, string>)["Idempotency-Key"], /^exchange-request-mock-quote-1-/);
      assert.equal(view.calls.some(call => call.route.endsWith("/locale")), false);
    } finally {view.dispose();}
  }
});

test("late requestA success or error cannot label quoteB or its pending request", async () => {
  for (const outcome of ["success", "error", "B-sending", "invalid-input"] as const) {
    const delayedA = defer<unknown>(), delayedB = defer<unknown>();
    const config = {quoteResult: {...quoteFixture}, requestDelays: {
      "mock-quote-1": delayedA, "mock-quote-B": delayedB,
    }};
    const view = harness("ar", config);
    try {
      const amount = () => view.nodes().find(node => node.type === "input" && node.props.inputMode === "decimal")!;
      const submit = () => view.nodes().find(node => node.type === "button" && node.props.className === "button primary")!;
      await view.flush(); amount().props.onChange({target: {value: "1000"}});
      await view.flush(); await view.timers();
      const pendingA = submit().props.onClick(); await view.flush();
      assert.equal(submit().props.disabled, true);
      config.quoteResult = {...quoteFixture, quote_id: "mock-quote-B"};
      amount().props.onChange({target: {value: outcome === "invalid-input" ? "" : "2000"}});
      await view.flush(); await view.timers();
      let pendingB: Promise<void> | undefined;
      if (outcome === "B-sending") {pendingB = submit().props.onClick(); await view.flush();}
      if (outcome === "error") delayedA.reject(new Error("synthetic obsolete request failure"));
      else delayedA.resolve({id: "mock-request-A", quote_id: "mock-quote-1", status: "AWAITING_OPERATOR"});
      await pendingA; await view.flush();
      assert(!view.nodes().some(node => node.props.className === "request-success"));
      assert(!view.nodes().some(node => node.props.className === "request-error"));
      if (outcome !== "invalid-input") assert.equal(submit().props.disabled, outcome === "B-sending");
      if (pendingB) {
        delayedB.resolve({id: "mock-request-B", quote_id: "mock-quote-B", status: "AWAITING_OPERATOR"});
        await pendingB; await view.flush();
        assert(view.nodes().some(node => node.props.className === "request-success"));
      }
      const requests = view.calls.filter(call => call.route.endsWith("/exchange/requests"));
      assert.deepEqual(requests.map(call => JSON.parse(String(call.options.body))),
        outcome === "B-sending" ? [{quote_id: "mock-quote-1"}, {quote_id: "mock-quote-B"}] : [{quote_id: "mock-quote-1"}]);
      assert.equal(new Set(requests.map(call => (call.options.headers as Record<string, string>)["Idempotency-Key"])).size, requests.length);
    } finally {view.dispose();}
  }
});

test("quote-effect cleanup ignores an awaited request after component disposal", async () => {
  const delay = defer<unknown>(), view = harness("en", {requestDelays: {"mock-quote-1": delay}});
  let disposed = false;
  try {
    await view.flush();
    const amount = view.nodes().find(node => node.type === "input" && node.props.inputMode === "decimal")!;
    amount.props.onChange({target: {value: "1000"}}); await view.flush(); await view.timers();
    const button = view.nodes().find(node => node.type === "button" && node.props.className === "button primary")!;
    const pending = button.props.onClick(); await view.flush();
    view.dispose(); disposed = true;
    delay.resolve({id: "mock-request-A", quote_id: "mock-quote-1", status: "AWAITING_OPERATOR"});
    await pending; assert.equal(view.postDisposeWrites(), 0);
  } finally {if (!disposed) view.dispose();}
});

test("actual options/quote/request error trees ×10 expose localized errors, not raw server messages", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) for (const kind of ["optionsError", "quoteError", "requestError"] as const) {
    const view = harness(locale, {[kind]: true});
    try {
      await view.flush();
      if (kind !== "optionsError") {
        const input = view.nodes().find(node => node.type === "input" && node.props.inputMode === "decimal"); assert(input);
        input.props.onChange({target: {value: "1000"}}); await view.flush(); await view.timers();
        if (kind === "requestError") {
          const submit = view.nodes().find(node => node.type === "button" && node.props.className === "button primary" && !node.props.disabled); assert(submit);
          await submit.props.onClick(); await view.flush();
        }
      }
      assert(view.text().includes(clientRuntimeText(locale, "api.error.data")));
      assert(!view.text().includes("mock options")); assert(!view.text().includes("mock quote")); assert(!view.text().includes("mock request"));
    } finally {view.dispose();}
  }
});

test("actual UI10 CAS callback is actor/CSRF/revision bound; late logout cannot restore old UI", async () => {
  const delay = defer<unknown>(), view = harness("ar", {uiPreference: {ui_locale: "ar", revision: 7}, uiWrite: () => delay.promise, optionsError: true});
  try {
    await view.flush();
    const selector = () => view.nodes().find(node => node.type === "select" && node.props.className === "compact-locale")!;
    selector().props.onChange({target: {value: "en"}}); await view.flush();
    const patch = view.calls.find(call => call.route.endsWith("/preferences/ui-locale")); assert(patch);
    assert.deepEqual(JSON.parse(String(patch.options.body)), {ui_locale: "en", expected_revision: 7});
    assert.equal((patch.options.headers as Record<string,string>)["X-CSRF-Token"], "a".repeat(64));
    assert.equal(view.html.lang, "en");
    assert(view.text().includes(clientRuntimeText("en", "shell.language.pendingSync")));
    assert.equal(view.calls.filter(call => call.route === "/api/web/locale").length, 0);
    view.logout(); await view.flush(); assert.equal(view.html.lang, "ar"); assert.equal(view.html.dir, "rtl");
    delay.resolve({ui_locale: "en", revision: 8}); await view.flush();
    assert.equal(view.html.lang, "ar"); assert.equal(view.html.dir,'rtl');assert.equal(view.calls.filter(call => call.route.endsWith("/preferences/ui-locale")).length, 1);
    assert.equal(view.storage.has(localeModule.CLIENT_UI_LOCALE_STORAGE_KEY), false);
  } finally {view.dispose();}
});

test("actual picker callback ×10 stays explicitly local when backend projection is absent; contact is unchanged", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const view = harness("ru");
    try {
      await view.flush();
      const select = view.nodes().find(node => node.type === "select" && node.props.className === "compact-locale"); assert(select);
      select.props.onChange({target: {value: locale}}); await view.flush();
      assert.equal(view.html.lang, locale); assert.equal(view.html.dir, locale === "ar" ? "rtl" : "ltr");
      assert(view.text().includes(clientRuntimeText(locale, "calculator.idle.title")));
      const route = view.nodes().find(node => node.type === "section" && node.props.className === "calculator-card currency-route-selector"); assert(route);
      assert.equal(route.props["aria-label"], clientRuntimeText(locale, "calculator.routeAria"));
      const calls = view.calls.filter(call => call.route.endsWith("/locale"));
      assert.equal(calls.length, 0);
      assert.equal(view.calls.filter(call => call.route.includes("/preferences/")).length, 0);
      assert(!view.text().includes(clientRuntimeText(locale, "shell.language.success")));
    } finally {view.dispose();}
  }
});

test("actual authenticated picker ×10 persists UI-only payload including same visible value", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const view = harness("ru", {uiPreference:{ui_locale:locale,revision:7}});
    try {
      await view.flush();assert.equal(view.html.lang,locale);
      const select=view.nodes().find(n=>n.type==="select"&&n.props.className==="compact-locale")!;
      select.props.onChange({target:{value:locale}});await view.flush();await view.flush();
      const calls=view.calls.filter(c=>c.route==="/api/web/preferences/ui-locale");assert.equal(calls.length,1);
      assert.deepEqual(JSON.parse(String(calls[0].options.body)),{ui_locale:locale,expected_revision:7});
      assert.equal(view.calls.filter(c=>c.route==="/api/web/locale").length,0);
      assert.equal(view.html.dir,locale==="ar"?"rtl":"ltr");
      assert(view.text().includes(clientRuntimeText(locale,"shell.language.success")));
      assert(view.storage.size===1&&view.storage.get(localeModule.CLIENT_UI_LOCALE_STORAGE_KEY)===locale);
    }finally{view.dispose();}
  }
});
test("actual conflict exposes unsaved UI, no automatic replay; explicit retry reads fresh same actor", async()=>{
  const config={uiPreference:{ui_locale:"ru" as bindingModule.ClientUiLocale10,revision:7},uiWrite:async(value:{ui_locale:bindingModule.ClientUiLocale10;expected_revision:number})=>{
    if(value.expected_revision===7){config.uiPreference={ui_locale:"ar",revision:8};throw new ApiError("PRIVATE_CONFLICT_SENTINEL",{kind:"http",status:409,details:{current:config.uiPreference}});}
    config.uiPreference={ui_locale:value.ui_locale,revision:value.expected_revision+1};return config.uiPreference;
  }},view=harness("ru",config);
  try{
    await view.flush();view.nodes().find(n=>n.type==="select"&&n.props.className==="compact-locale")!.props.onChange({target:{value:"de"}});
    await view.flush();await view.flush();assert.equal(view.html.lang,"de");
    assert.equal(view.calls.filter(c=>c.route.includes("/preferences/")).length,1);assert(!view.text().includes("PRIVATE_CONFLICT_SENTINEL"));
    const retry=view.nodes().find(n=>n.type==="button"&&n.props["data-ui-preference-retry"]);assert(retry);
    retry.props.onClick();await view.flush();await view.flush();
    const writes=view.calls.filter(c=>c.route.includes("/preferences/"));assert.equal(writes.length,2);
    assert.deepEqual(JSON.parse(String(writes[1].options.body)),{ui_locale:"de",expected_revision:8});
    assert.equal(view.calls.filter(c=>c.route==="/api/web/auth/me").length,2);assert.equal(view.calls.filter(c=>c.route==="/api/web/locale").length,0);
  }finally{view.dispose();}
});
test("actual lost ACK reconciles committed current UI without retransmitting or exposing server error",async()=>{
  const config={uiPreference:{ui_locale:"ru" as bindingModule.ClientUiLocale10,revision:7},uiWrite:async(value:{ui_locale:bindingModule.ClientUiLocale10;expected_revision:number})=>{
    config.uiPreference={ui_locale:value.ui_locale,revision:value.expected_revision+1};throw new ApiError("PRIVATE_UNKNOWN_SENTINEL",{kind:"http",status:503});
  }},view=harness("ru",config);
  try{
    await view.flush();view.nodes().find(n=>n.type==="select"&&n.props.className==="compact-locale")!.props.onChange({target:{value:"ja"}});
    await view.flush();await view.flush();await view.flush();assert.equal(view.html.lang,"ja");
    assert.equal(view.calls.filter(c=>c.route.includes("/preferences/")).length,1);
    assert.equal(view.calls.filter(c=>c.route==="/api/web/auth/me").length,2);assert(!view.text().includes("PRIVATE_UNKNOWN_SENTINEL"));
    assert(view.text().includes(clientRuntimeText("ja","shell.language.success")));
  }finally{view.dispose();}
});

test("actual shared PWA offline trees use explicit client10 while Admin stays literal RUEN", () => {
  assert.throws(()=>provenanceModule.requireClientUiBindings({role:'client',locale:'ar'}),/PROVENANCE/);
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const view = harness(locale, {offline: true});
    try {
      const Pwa = view.load("components/PwaLifecycle").PwaLifecycle;
      // Complementary SSR uses real hooks; separate deterministic adapter is
      // not layout/rendered QA and never registers SW or checks live build ID.
      const ssr = harness(locale, {offline: true, realReact: true});
      try {
        const RealPwa = ssr.load("components/PwaLifecycle").PwaLifecycle;
        const html = renderToStaticMarkup(React.createElement(RealPwa, {locale: "ru", ui: bindingModule.createClientUiBindings(locale)}));
        assert(html.includes(clientRuntimeText(locale, "inline:06 Development/react-app/src/components/PwaLifecycle.tsx#90f188900739")));
        const admin = renderToStaticMarkup(React.createElement(RealPwa, {locale: "en"}));
        assert(admin.includes("Offline — data is available after reconnecting."));
        assert.equal(ssr.calls.length, 0); void Pwa;
      } finally {ssr.dispose();}
    } finally {view.dispose();}
  }
});

test('calculator: null UI preference preserves cached/system AR despite contact RU, with zero automatic PATCH',async()=>{
  const view=harness('ar',{uiPreference:{ui_locale:null,revision:4}});
  try{await view.flush();assert.equal(view.html.lang,'ar');assert.equal(view.html.dir,'rtl');
    assert.equal(view.calls.filter(c=>c.options.method==='PATCH').length,0);
  }finally{view.dispose();}
});
for(const equal of [false,true])test('calculator: early '+(equal?'equal':'different')+' manual choice beats late auth preference while preserving next CAS credentials',async()=>{
  const delay=defer<unknown>(),view=harness('ar',{authDelay:delay,uiPreference:{ui_locale:'ru',revision:4}});
  try{
    await view.flush();const next=equal?'ar':'ja';
    view.nodes().find(n=>n.type==='select'&&n.props.className==='compact-locale')!.props.onChange({target:{value:next}});
    await view.flush();assert.equal(view.html.lang,next);assert.equal(view.calls.filter(c=>c.options.method==='PATCH').length,0);
    delay.resolve(undefined);await view.flush();assert.equal(view.html.lang,next);
    view.nodes().find(n=>n.type==='select'&&n.props.className==='compact-locale')!.props.onChange({target:{value:next}});
    await view.flush();const writes=view.calls.filter(c=>c.options.method==='PATCH');assert.equal(writes.length,1);
    assert.deepEqual(JSON.parse(String(writes[0].options.body)),{ui_locale:next,expected_revision:4});
  }finally{view.dispose();}
});
test('calculator: explicit route UI beats cached and server UI preference, without a write',async()=>{
  const view=harness('ar',{pathname:'/fr/bali/exchange/usdt-idr/',uiPreference:{ui_locale:'ru',revision:4}});
  try{await view.flush();assert.equal(view.html.lang,'fr');assert.equal(view.calls.filter(c=>c.options.method==='PATCH').length,0);}
  finally{view.dispose();}
});

test("actual Vite WebCalculator entry closure excludes private sources and emits source-pinned client code", async () => {
  const result = await build({configFile: false, root: appRoot, envDir: false,
    envPrefix: "__SAFRWAY_NO_AMBIENT_ENV_FOR_LOCAL_QA__", logLevel: "error", plugins: [react()],
    define: {__SAFRWAY_BUILD_ID__: JSON.stringify("local-calculator10-qa")},
    build: {write: false, minify: false, sourcemap: false,
      lib: {entry: path.join(appRoot, "src/surfaces/WebCalculatorApp.tsx"), formats: ["es"]}}});
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(row => row.output);
  const chunks = outputs.filter(row => row.type === "chunk");
  const modules = chunks.flatMap(row => Object.keys(row.modules)).map(id => id.replaceAll("\\", "/"));
  for (const suffix of ["src/surfaces/WebCalculatorApp.tsx", "src/components/CurrencyCalculator.tsx", "src/components/CurrencyRouteSelector.tsx", "src/components/ExchangeAssetWheel.tsx", "src/components/ClientAppearanceControls.tsx", "src/i18n/client-ui-bindings.ts", "src/i18n/client-ui-locale.ts", "src/i18n/client-ui-preference.ts", "shared/content/client-ui/client-runtime.v1.json"]) {
    assert(modules.some(id => id.endsWith(suffix)), suffix);
  }
  assert(!modules.some(id => /client-catalog-(?:runtime\.v1\.json|runtime\.ts|destination\.ts)$/.test(id)),
    "calculator does not load the unrelated full50-article client catalog");
  assert(!modules.some(id => /AUDIT\/|candidates\.v1|_SOURCE_RECEIPT|EDITORIAL_SOURCE_ARCHIVE|registry-copy\//.test(id)));
  assert(!modules.some(id => /Admin[A-Za-z]*\.(?:tsx?|json)$/.test(id)));
  const js = chunks.map(row => row.code).join("\n");
  assert(Buffer.byteLength(js) < 2549038, "same entry/options is smaller than the observed pre-split bundle");
  for (const forbidden of ["CLIENT_CALCULATOR033_GUEST021_16_INDEPENDENT", "NATIVE_RESPONSE.json", "PRIVATE_WEB_CALCULATOR10_PRE_SNAPSHOT", "EDITORIAL_SOURCE_ARCHIVE", "assistantMessageId", "SECRET_API_KEY"]) assert(!js.includes(forbidden), forbidden);
  const proof = {kind: "ACTUAL_VITE_WEB_CALCULATOR_ENTRY", write: false, configFile: false,
    ambientEnvFilesRead: false, sourceStageOnly: true, moduleIds: modules.sort(),
    outputs: outputs.map(row => ({file: row.fileName, type: row.type,
      bytes: Buffer.byteLength(row.type === "chunk" ? row.code : typeof row.source === "string" ? row.source : Buffer.from(row.source)),
      sha256: createHash("sha256").update(row.type === "chunk" ? row.code : typeof row.source === "string" ? row.source : Buffer.from(row.source)).digest("hex")})),
    privateInputsImported: false, AdminImported: false, browserExecuted: false};
  console.log("VITE_CALCULATOR_CLOSURE_PROOF=" + JSON.stringify(proof));
});
