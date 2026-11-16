import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../dist-yoga-mini-app/", import.meta.url);
const rootPath = fileURLToPath(root);
function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const paths = files(rootPath);
const html = readFileSync(new URL("index.html", root), "utf8");
const scripts = paths.filter((path) => path.endsWith(".js") && path.includes("/assets/"));

function compiledBrand(pathname) {
  const source = scripts.map((path) => readFileSync(path, "utf8")).find((code) =>
    /document\.documentElement\.dataset\.clientBrand=[\w$]+\.id/.test(code));
  assert.ok(source, "Find the compiled Mini App entry assignment");
  const entry = source.match(/document\.documentElement\.dataset\.clientBrand=([\w$]+)\.id/);
  const compiled = ts.createSourceFile("yoga-build.js", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const declarations = compiled.statements.filter(ts.isVariableStatement).flatMap((statement) =>
    [...statement.declarationList.declarations]);
  const brand = declarations.find((decl) => decl.name.getText(compiled) === entry[1]);
  assert.ok(brand?.initializer && ts.isCallExpression(brand.initializer));
  assert.equal(brand.initializer.expression.getText(compiled), "Object.freeze");
  const [projection] = brand.initializer.arguments;
  assert.ok(projection && ts.isObjectLiteralExpression(projection));
  const id = projection.properties.find((item) => item.name?.getText(compiled) === "id");
  assert.ok(id && ts.isPropertyAssignment(id) && ts.isConditionalExpression(id.initializer));
  const routeGuard = declarations.find((decl) =>
    decl.name.getText(compiled) === id.initializer.condition.getText(compiled));
  assert.ok(routeGuard?.initializer?.getText(compiled).includes("window.location.pathname"));
  const context = { window: { location: { pathname } }, document: { documentElement: { dataset: {} } } };
  // Execute only the compiled presentation guard, projection and DOM assignment.
  vm.runInNewContext(`const ${routeGuard.getText(compiled)}, ${brand.getText(compiled)};${entry[0]};`,
    context, { timeout: 1000 });
  return context.document.documentElement.dataset.clientBrand;
}

test("Yoga initial HTML is branded and dark before hydration without Main theme initialization", () => {
  assert.ok(html.includes("<title>Yoga Ganster · Mini App</title>"));
  assert.ok(html.includes('data-app-night="true"'));
  assert.ok(html.includes('content="#090909"'));
  assert.equal(html.includes("theme-init.js"), false);
  assert.equal(html.includes("SAFRWAY"), false);
  const offline = readFileSync(new URL("offline.html", root), "utf8");
  assert.ok(offline.includes("Yoga Ganster"));
  assert.equal(offline.includes("SAFRWAY"), false);
  const main = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(main.includes("<title>SAFRWAY · Mini App</title>"));
  assert.ok(main.includes('src="/theme-init.js"'));
});

test("Yoga artifact serves its exact deferred bootstrap and static neutral shell before hydration", () => {
  assert.match(html, /<script[^>]*src="\/yoga-preview\/mini-app\/yoga-telegram-sdk\.js"[^>]*defer[^>]*>/);
  assert.equal(html.includes("https://telegram.org/js/telegram-web-app.js"), false);
  assert.match(html, /id="root"><div class="destination-backdrop" aria-hidden="true"><\/div><main class="status-screen" aria-busy="true">/);
  assert.match(html, /id="yoga-bootstrap-status" role="status">Загрузка \/ Loading…/);
  assert.equal(readFileSync(new URL("yoga-telegram-sdk.js", root), "utf8"),
    readFileSync(new URL("../public/yoga-telegram-sdk.js", import.meta.url), "utf8"));
  const main = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(main.includes("yoga-telegram-sdk.js"), false);
});

test("Yoga build contains only the MiniApp HTML entry and no Admin/Account source/maps", () => {
  assert.deepEqual(paths.filter((path) => path.endsWith(".html")).map((path) => path.slice(rootPath.length)).sort(), ["index.html", "offline.html"]);
  assert.equal(paths.some((path) => path.endsWith(".map")), false);
  const code = scripts.map((path) => readFileSync(path, "utf8")).join("\n");
  for (const marker of ["/api/web/admin/", "Administrator dashboard", "ADMIN_API_TOKEN", "YOGA_SERVICE_API_TOKEN", "initDataUnsafe"]) {
    assert.equal(code.includes(marker), false, marker);
  }
  assert.ok(code.includes("/mini-app/auth/yoga-session"));
  assert.ok(code.includes("https://t.me/Yoga_ganster_bot"));
});

test("Compiled Yoga presentation selection cannot fall back to SAFRWAY after hydration", () => {
  assert.equal(compiledBrand("/yoga-preview/mini-app/"), "yoga-gangster");
  const config = readFileSync(new URL("../vite.yoga.config.ts", import.meta.url), "utf8");
  assert.ok(config.includes('"import.meta.env.VITE_CLIENT_BRAND": JSON.stringify("yoga-gangster")'));
  const mainConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.equal(mainConfig.includes("VITE_CLIENT_BRAND"), false, "Do not change the Main build brand");
});

test("Actual compiled selection and entry assignment keep Yoga on the mounted Mini App path", () => {
  assert.equal(compiledBrand("/yoga-preview/mini-app/"), "yoga-gangster");
  for (const pathname of ["/account/", "/admin/", "/calculator/"]) {
    assert.equal(compiledBrand(pathname), "safrway");
  }
});

test("HTML, CSS and dynamic hero roots use the nested Yoga asset base", () => {
  for (const match of html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)) {
    assert.ok(match[1].startsWith("/yoga-preview/mini-app/"), match[1]);
  }
  for (const path of paths.filter((path) => path.endsWith(".css"))) {
    const css = readFileSync(path, "utf8");
    assert.equal(/url\(["']?\/assets\//.test(css), false);
  }
  const code = scripts.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.ok(code.includes("/yoga-preview/mini-app/"));
  const entry = readFileSync(new URL("../src/yoga-main.tsx", import.meta.url), "utf8");
  assert.equal(/AdminApp|AccountApp|PwaLifecycle/.test(entry), false);
});
