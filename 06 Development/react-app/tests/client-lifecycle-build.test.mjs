import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import test from "node:test";
import ts from "typescript";
import {tsImport} from "tsx/esm/api";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const bindings = await tsImport("../src/i18n/client-ui-bindings.ts", import.meta.url);
const locales = bindings.CLIENT_UI_LANGUAGE_OPTIONS.map(option => option.code);
const main = fs.readFileSync(path.join(root, "src/main.tsx"), "utf8");
const lifecycleSource = fs.readFileSync(path.join(root, "src/components/ClientApplicationLifecycle.tsx"), "utf8");
const localeSource = fs.readFileSync(path.join(root, "src/i18n/client-ui-locale.ts"), "utf8");
const eventName = "safr:client-ui-locale";

// Execute the real owned function bodies, not a rewritten subscription model.
// No application entrypoint, API, service worker or browser is started here.
function functionSource(source, names) {
  const file = ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    const node = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(node, "missing actual function: " + name);
    return node.getText(file).replace(/^export\s+/, "");
  }).join("\n");
}
function compile(source, exports, globals = {}) {
  const output = ts.transpileModule(source + "\nmodule.exports={" + exports.join(",") + "};", {
    fileName: "fixture.tsx", compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const module = {exports: {}};
  const context = vm.createContext({module, exports: module.exports, ...globals});
  new vm.Script(output, {filename: "actual-client-lifecycle-fixture.js"}).runInContext(context);
  return module.exports;
}
function lifecycleHarness(initial = "ru", name = "ClientApplicationLifecycle") {
  let state, initialized = false, pending, cleanup, effectSeen = false;
  let writes = 0, renderCount = 0;
  const trace = [], target = new EventTarget(), listeners = new Set();
  const element = {lang: initial, dir: initial === "ar" ? "rtl" : "ltr"};
  const window = {
    addEventListener(type, handler) {trace.push("subscribe"); listeners.add(handler); target.addEventListener(type, handler);},
    removeEventListener(type, handler) {trace.push("cleanup"); listeners.delete(handler); target.removeEventListener(type, handler);},
    dispatchEvent(event) {return target.dispatchEvent(event);},
  };
  const document = {documentElement: element};
  const localeFunctions = compile(functionSource(localeSource, ["applyClientDocumentLocale", "documentClientUiLocale"]),
    ["applyClientDocumentLocale", "documentClientUiLocale"], {
      createClientUiBindings: bindings.createClientUiBindings, requireClientUiLocale: bindings.requireClientUiLocale,
      document, window, Event, CLIENT_UI_LOCALE_EVENT: eventName,
    });
  const component = compile(functionSource(name === "ClientApplicationLifecycle" ? lifecycleSource : main, [name]), [name], {
    require: id => {assert.equal(id, "react/jsx-runtime"); return require(id);},
    PwaLifecycle: () => null, CLIENT_UI_LOCALE_EVENT: eventName, window,
    documentClientUiLocale: () => {trace.push("read"); return localeFunctions.documentClientUiLocale();},
    createClientUiBindings: bindings.createClientUiBindings, useDocumentLocale: () => initial,
    useState(value) {
      if (!initialized) {state = typeof value === "function" ? value() : value; initialized = true;}
      return [state, value => {writes++; state = typeof value === "function" ? value(state) : value;}];
    },
    useEffect(effect) {if (!effectSeen) {pending = effect; effectSeen = true;}},
    useMemo: factory => factory(),
  })[name];
  return {
    document, trace, apply: localeFunctions.applyClientDocumentLocale,
    render() {renderCount++; return component();},
    mountEffect() {assert.ok(pending); cleanup = pending(); pending = undefined;},
    cleanup() {cleanup?.(); cleanup = undefined;},
    strictRemountEffect() {effectSeen = false; component(); this.mountEffect();},
    get listeners() {return listeners.size;}, get writes() {return writes;}, get renderCount() {return renderCount;},
  };
}

for (const locale of locales) test("PWA catches real locale change between render and listener mount: " + locale, () => {
  const h = lifecycleHarness(locale === "ru" ? "en" : "ru");
  h.render(); h.apply(locale); h.mountEffect();
  const tree = h.render();
  assert.equal(tree.props.ui.locale, locale);
  assert.equal(tree.props.ui.dir, locale === "ar" ? "rtl" : "ltr");
  assert.equal(h.document.documentElement.lang, locale);
  assert.equal(h.document.documentElement.dir, locale === "ar" ? "rtl" : "ltr");
  assert.equal(nodeText(pwaNotice(cases[0].state, tree.props)), bindings.createClientUiBindings(locale).text(prefix + cases[0].key));
  assert.deepEqual(h.trace.slice(-2), ["subscribe", "read"]);
  assert.equal(h.listeners, 1); h.cleanup(); assert.equal(h.listeners, 0);
});
test("PWA follows all ten document events and StrictMode cleanup/remount without duplicate listeners", () => {
  const h = lifecycleHarness(), initialTree = h.render(); h.mountEffect();
  for (const locale of [...locales, "ar"]) {
    h.apply(locale); const tree = h.render(); assert.equal(tree.props.ui.locale, locale);
    assert.equal(tree.type, initialTree.type); assert.equal(tree.key, null);
  }
  h.cleanup(); const oldWrites = h.writes;
  h.apply("ar"); assert.equal(h.writes, oldWrites); assert.equal(h.listeners, 0);
  h.strictRemountEffect(); assert.equal(h.listeners, 1); assert.equal(h.render().props.ui.locale, "ar");
  const before = h.writes; h.apply("ja"); assert.equal(h.writes, before + 1);
  assert.equal(h.render().props.ui.locale, "ja"); h.cleanup(); assert.equal(h.listeners, 0);
});
test("Admin keeps the legacy RUEN lifecycle and account preview never mounts the Main client lifecycle", () => {
  for (const locale of ["ru", "en"]) {
    const h = lifecycleHarness(locale, "ApplicationLifecycle");
    const tree = h.render(); assert.equal(tree.props.locale, locale);
    assert.equal(Object.keys(tree.props).join(","), "locale"); assert.equal(h.listeners, 0);
  }
  assert.match(main, /isAdmin\s*\?\s*<><AdminApp\s*\/><ApplicationLifecycle\s*\/><\/>/);
  assert.match(main, /<AccountApp withClientLifecycle=\{!isPreviewAccount\}/);
  const accountEntry = fs.readFileSync(path.join(root, 'src/surfaces/AccountApp.tsx'), 'utf8');
  const calculatorEntry = fs.readFileSync(path.join(root, 'src/surfaces/WebCalculatorApp.tsx'), 'utf8');
  assert.match(accountEntry, /<AccountApp\/>\{withClientLifecycle&&<ClientApplicationLifecycle\/>\}/);
  assert.match(calculatorEntry, /<WebCalculatorApp\/><ClientApplicationLifecycle\/>/);
  assert.doesNotMatch(main, /import\("\.\/components\/ClientApplicationLifecycle"\)/);
  const yoga = fs.readFileSync(path.join(root, "src/yoga-main.tsx"), "utf8");
  assert.doesNotMatch(yoga, /ClientApplicationLifecycle|PwaLifecycle/);
});

const pwaSource = fs.readFileSync(path.join(root, "src/components/PwaLifecycle.tsx"), "utf8");
const prefix = "inline:06 Development/react-app/src/components/PwaLifecycle.tsx#";
const cases = [
  {key: "90f188900739", state: [null, null, true, false, false, null]},
  {key: "55d5e1de67c3", state: [null, null, false, false, true, null]},
  {key: "e51845477f02", state: [{prompt() {}, userChoice: Promise.resolve()}, null, false, false, false, null]},
  {key: "10b98a0f0034", state: [null, {postMessage() {}}, false, false, false, null]},
  {key: "b439c637e388", state: [null, null, false, true, false, null]},
];
function nodeText(value) {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(nodeText).join("");
  return typeof value === "object" ? nodeText(value.props.children) : String(value);
}
function pwaNotice(state, props, yoga = false) {
  let index = 0;
  const component = compile(functionSource(pwaSource, ["PwaLifecycle"]), ["PwaLifecycle"], {
    require: id => {assert.equal(id, "react/jsx-runtime"); return require(id);},
    YOGA_MINI_APP: yoga, requireClientUiBindings: bindings.requireClientUiBindings,
    useState: () => [state[index++], () => {throw new Error("NO_RENDER_SIDE_EFFECT");}],
    useRef: value => ({current: value}), useEffect() {}, createPortal: () => {throw new Error("NO_PORTAL_HOST");},
    navigator: {onLine: true},
  }).PwaLifecycle;
  return component(props);
}
for (const locale of locales) test("actual PWA renders five exact accepted captions in " + locale, () => {
  const ui = bindings.createClientUiBindings(locale);
  for (const {key, state} of cases) assert.equal(nodeText(pwaNotice(state, {locale: "ru", ui})), ui.text(prefix + key));
});
test("PWA keeps Yoga and legacy RUEN notices exact and rejects forged Main bindings", () => {
  for (const yoga of [false, true]) for (const locale of ["ru", "en"]) for (const {key, state} of cases) {
    const props = {locale, ...(yoga ? {ui: bindings.createClientUiBindings("ar")} : {})};
    assert.equal(nodeText(pwaNotice(state, props, yoga)), bindings.createClientUiBindings(locale).text(prefix + key));
  }
  assert.throws(() => pwaNotice(cases[0].state, {locale: "ru", ui: {locale: "ar"}}), /BINDING_ROLE_OR_PROVENANCE/);
});
