import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {
  CLIENT_UI_LANGUAGE_OPTIONS, clientPublicCalculator, clientPublicHome,
  createClientUiBindings, requireClientUiBindings, requireClientUiLocale,
  serverContactLocale,
} from "../src/i18n/client-ui-bindings";
import {CLIENT_RUNTIME_LOCALES, clientRuntimeText} from "../src/i18n/client-runtime";
import {
  CLIENT_UI_LOCALE_STORAGE_KEY, createClientUiLocaleSession, readClientUiPreference,
} from "../src/i18n/client-ui-locale";
import {browserLoginUrl, safeBrowserAccountPath} from "../src/runtime/browser";
import {destinationsForLocale} from "../src/catalog";
import {clientDestinationById} from "../src/i18n/client-catalog-destination";
import {restoreCurrentAcceptedSourceHistory as restoreAcceptedSourceHistory} from './fixtures/client-current-history-qualification';

function environment(initial: typeof CLIENT_RUNTIME_LOCALES[number] = "ru", saved: string | null = null) {
  let stored = saved;
  const documents: string[] = [];
  const storageWrites: (string | null)[] = [];
  return {initial, read: () => stored,
    write(value: string | null) {stored = value; storageWrites.push(value);},
    apply(value: typeof initial) {documents.push(value + "/" + (value === "ar" ? "rtl" : "ltr"));},
    current: () => stored, documents, storageWrites};
}
function deferred() {
  let resolve!: () => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

test("browser preference recovers from an invalid cache without erasing unrelated storage or widening allowed locales", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>([["unrelated-client-key", "preserve"]]);
  const removed: string[] = [];
  try {
    Object.defineProperty(globalThis, "localStorage", {configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {removed.push(key); values.delete(key);},
    }});
    assert.equal(readClientUiPreference(), null);
    for (const locale of CLIENT_RUNTIME_LOCALES) {
      values.set(CLIENT_UI_LOCALE_STORAGE_KEY, locale);
      assert.equal(readClientUiPreference(), locale);
    }
    for (const invalid of ["fa", "en-US", "zh-cn", "__proto__", "", " ar", "ar "]) {
      values.set(CLIENT_UI_LOCALE_STORAGE_KEY, invalid);
      assert.equal(readClientUiPreference(), null);
      assert.equal(values.has(CLIENT_UI_LOCALE_STORAGE_KEY), false);
      assert.equal(values.get("unrelated-client-key"), "preserve");
      const session = createClientUiLocaleSession({...environment("ja"), read: readClientUiPreference});
      assert.equal(session.snapshot().locale, "ja");
      assert.equal(session.snapshot().actor, null);
    }
    assert.equal(removed.length, 7);
    assert(removed.every(key => key === CLIENT_UI_LOCALE_STORAGE_KEY));
    Object.defineProperty(globalThis, "localStorage", {configurable: true, value: {
      getItem() {throw new Error("storage unavailable");},
      removeItem() {throw new Error("storage unavailable");},
    }});
    assert.equal(readClientUiPreference(), null);
    assert.throws(() => requireClientUiLocale("fa"), /UNKNOWN_LOCALE/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("client10 bindings have fixed roles, autonyms, routes and no locale2 coercion", () => {
  const prefixes = ["", "/en", "/zh-cn", "/ko", "/fr", "/de", "/ja", "/hi", "/es", "/ar"];
  assert.deepEqual(CLIENT_UI_LANGUAGE_OPTIONS.map(row => row.code), CLIENT_RUNTIME_LOCALES);
  for (const [index, locale] of CLIENT_RUNTIME_LOCALES.entries()) {
    const ui = createClientUiBindings(locale);
    assert.equal(requireClientUiBindings(ui), ui);
    assert.equal(ui.locale, locale); assert.equal(ui.role, "client");
    assert.equal(ui.dir, locale === "ar" ? "rtl" : "ltr");
    assert.equal(ui.text("calculator.title"), clientRuntimeText(locale, "calculator.title"));
    assert.equal(clientPublicHome(locale), prefixes[index] + "/");
    assert.equal(clientPublicCalculator(locale), prefixes[index] + "/bali/exchange/usdt-idr/");
    assert.equal(safeBrowserAccountPath(clientPublicHome(locale)), clientPublicHome(locale));
    assert.equal(new URL(browserLoginUrl("https://app.safrway.online", clientPublicHome(locale))).searchParams.get("return_to"), clientPublicHome(locale));
    if (locale !== "ru" && locale !== "en") assert.throws(() => serverContactLocale(locale), /CONTACT_LOCALE_BOUNDARY/);
  }
  assert.equal(serverContactLocale(undefined), "ru");
  for (const value of ["fa", "en-US", "zh-cn", "zh-Hant", "__proto__", {}, [], null, new String("ar")]) {
    assert.throws(() => requireClientUiLocale(value), /UNKNOWN_LOCALE/);
    assert.throws(() => createClientUiBindings(value), /UNKNOWN_LOCALE/);
  }
  for (const value of [{role: "client", locale: "ar"}, {role: "admin", locale: "en"},
    Object.create(createClientUiBindings("ru")), null]) {
    assert.throws(() => requireClientUiBindings(value), /BINDING_ROLE_OR_PROVENANCE/);
  }
  for (const route of ["//evil.example/", "/en/fr/", "/ru/", "/zh-Hans/", "/fa/", "/en/admin/", "/%2e%2e/", "/fr/?x=1"]) {
    assert.equal(safeBrowserAccountPath(route), "/account/");
  }
});

test("each foreign local preference binds a real actor without ever sending foreign to Locale2", async () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const env = environment("ru"); const session = createClientUiLocaleSession(env);
    session.mount(); session.bindPrincipal(101, "ru");
    const calls: string[] = [];
    const status = await session.change(locale, async value => {calls.push(value);});
    assert.equal(session.snapshot().locale, locale);
    if (locale === "ru") {assert.equal(status, "unchanged"); assert.deepEqual(calls, []);}
    else if (locale === "en") {assert.equal(status, "persisted"); assert.deepEqual(calls, ["en"]);}
    else {assert.equal(status, "local"); assert.deepEqual(calls, []); assert.equal(session.snapshot().contactLocale, "ru");}
    assert(env.storageWrites.every(value => value === null || CLIENT_RUNTIME_LOCALES.includes(value as typeof locale)));
    assert.equal(env.documents.at(-1), locale + "/" + (locale === "ar" ? "rtl" : "ltr"));
  }
});

test("local preference survives reload; logout/actor switch invalidates pending response and clears only UI preference", async () => {
  const env = environment("ru", "ar"), session = createClientUiLocaleSession(env);
  session.mount(); session.bindPrincipal(101, "ru");
  assert.equal(session.snapshot().locale, "ar");
  const delayed = deferred(); const pending = session.change("en", () => delayed.promise);
  await Promise.resolve(); // The transport must actually be in flight before actor invalidation.
  session.bindPrincipal(202, "ru"); delayed.resolve();
  assert.equal(await pending, "stale"); assert.equal(session.snapshot().actor, 202);
  assert.equal(session.snapshot().locale, "ru"); assert.equal(env.current(), null);
  await session.change("ar");
  const delayedLogout = deferred(); const lost = session.change("en", () => delayedLogout.promise);
  await Promise.resolve(); // Distinguish a late response from work never sent.
  session.logout(); delayedLogout.reject(new Error("late old actor failure"));
  assert.equal(await lost, "stale"); assert.equal(session.snapshot().actor, null);
  assert.equal(session.snapshot().locale, "ru"); assert.equal(env.documents.at(-1), "ru/ltr");
  assert.equal(env.current(), null);
});

test("failure restores one locale/cache/lang/dir snapshot; newer choice and disposed epoch reject stale results", async () => {
  const env = environment("ru", "ar"), session = createClientUiLocaleSession(env);
  session.bindPrincipal(101, "ru");
  assert.equal(await session.change("en", async () => {throw new Error("network");}), "rollback");
  assert.equal(session.snapshot().locale, "ar"); assert.equal(session.snapshot().contactLocale, "ru");
  assert.equal(env.current(), "ar"); assert.equal(env.documents.at(-1), "ar/rtl");
  const delayed = deferred(), old = session.change("en", () => delayed.promise);
  assert.equal(await session.change("ja"), "local"); delayed.resolve();
  assert.equal(await old, "stale"); assert.equal(session.snapshot().locale, "ja");
  const delayedDispose = deferred(), disposed = session.change("en", () => delayedDispose.promise);
  session.dispose(); delayedDispose.resolve(); assert.equal(await disposed, "stale");
  const count = env.documents.length;
  assert.equal(await session.change("ar"), "stale"); assert.equal(env.documents.length, count);
  session.mount(); session.bindPrincipal(null, "ru");
  assert.equal(session.snapshot().locale, "ru");
});

test("unknown locale/actor/cache inputs fail closed without coercion, storage or transport", async () => {
  let coerced = 0;
  const env = environment("ru"), session = createClientUiLocaleSession(env);
  session.bindPrincipal(101, "ru"); const before = session.snapshot();
  for (const value of ["fa", "en-US", "zh-cn", null, 0, {}, Object.create({locale: "ar"}),
    {toString() {coerced++; return "ar";}}]) {
    await assert.rejects(session.change(value), /UNKNOWN_LOCALE/);
    assert.equal(session.snapshot(), before);
  }
  assert.equal(coerced, 0);
  for (const actor of [undefined, "101", 0, -1, NaN, Infinity, {}, 2 ** 53]) {
    assert.throws(() => session.bindPrincipal(actor, "ru"), /ACTOR_INVALID/);
  }
  assert.throws(() => createClientUiLocaleSession(environment("ru", "fa")), /UNKNOWN_LOCALE/);
});

test("client catalog uses exact existing145 source on all10 and never calls RUEN-only D12 path", () => {
  for (const locale of CLIENT_RUNTIME_LOCALES) {
    const bali = clientDestinationById("bali", locale);
    assert(bali); assert.equal(bali.id, "bali");
    const d12 = bali.services.find(row => row.id === "visas")?.children?.find(row => row.id === "d12");
    assert(d12?.content && d12.content.length > 100);
    assert.equal(clientDestinationById("uae", locale)?.id, "uae");
  }
  assert.equal(destinationsForLocale("ru").length, 5);
  assert.equal(destinationsForLocale("en").length, 5);
  assert.throws(() => clientDestinationById("bali", "fa"), /UNKNOWN_LOCALE/);
  assert.throws(() => clientDestinationById("__proto__", "ru"), /DESTINATION_ID/);
});

test("calculator-only visibility correction preserves every other legacy style byte", () => {
  const css=fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.equal(createHash("sha256").update(restoreAcceptedSourceHistory("calculatorCss",css)).digest("hex"),
    "dd5a2858a60acebd31d83d8b9155ba8d8a2933085312b02c34b278693d7e1518");
  // Source-only: accepted palette/picker reversals, not rendered visibility.
});

test("historical Admin/Locale2/contact and F01 source provenance remains independently fixed", () => {
  const root=fileURLToPath(new URL("../../../",import.meta.url));
  const pins:Record<string,[string,string]>={
    "06 Development/react-app/src/i18n/locale.ts":["legacyLocale","aa04886d3c3cadee2dc2824f26ed676306364f99a98ef02b99192848636b655e"],
    "06 Development/react-app/src/i18n/runtime.tsx":["legacyRuntime","8b41ab0f6dcc2071e7f295e584648a047121e56bf7e00f9c7a6f914236234714"],
    "06 Development/react-app/src/api/types.ts":["legacyTypes","f2e6de671f99177247a21cb87c78d96188c2433c1434c29c018aa88b9d127b4a"],
    "06 Development/react-app/src/components/AppearanceControls.tsx":["legacyAppearance","627d009ee21da654fd96d8000ace02e97ddc583d3c2bcfedad60f21d475d01c9"],
    "06 Development/react-app/src/surfaces/AccountApp.tsx":["legacyAccount","b515ae74cfd9924e5b658fa7cd0547db294168f871d2b37e262ec6bfd838f1fc"],
    "06 Development/react-app/src/surfaces/MiniApp.tsx":["legacyMini","2a0a50a53dd4cf6a72aeb3b5628b423b9a393e4276ada1f4acf6bd897230f3c5"],
  };
  for(const[relative,[id,expected]]of Object.entries(pins)){
    const historical=id==='legacyAccount'
      ? fs.readFileSync(new URL('./fixtures/accepted-6adadff/AccountApp.tsx.txt',import.meta.url),'utf8')
      : id==='legacyTypes' ? fs.readFileSync(new URL('./fixtures/accepted-6adadff/types.ts.txt',import.meta.url),'utf8')
      : fs.readFileSync(path.join(root,relative),'utf8');
    const restored=restoreAcceptedSourceHistory(id,historical);
    assert.equal(createHash("sha256").update(restored).digest("hex"),expected,relative);
  }
});
