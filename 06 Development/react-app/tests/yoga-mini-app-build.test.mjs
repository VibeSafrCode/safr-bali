import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

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
  const code = scripts.map((path) => readFileSync(path, "utf8")).join("\n");
  const match = code.match(/var\s+([\w$]+)=`(safrway|yoga-gangster)`;if\(\1!==`safrway`&&\1!==`yoga-gangster`\)throw Error\(`Unknown client presentation brand`\)/);
  assert.ok(match, "The actual compiled brand selection must be found, not inferred from HTML/CSS");
  assert.equal(match[2], "yoga-gangster");
  assert.ok(code.includes("dataset.clientBrand="), "Runtime selection must reach the DOM");
  const config = readFileSync(new URL("../vite.yoga.config.ts", import.meta.url), "utf8");
  assert.ok(config.includes('"import.meta.env.VITE_CLIENT_BRAND": JSON.stringify("yoga-gangster")'));
  const mainConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.equal(mainConfig.includes("VITE_CLIENT_BRAND"), false, "Do not change the Main build brand");
});

test("Actual compiled selection and entry assignment keep Yoga on the mounted Mini App path", () => {
  const code = scripts.map((path) => readFileSync(path, "utf8")).join("\n");
  const marker = code.indexOf("Unknown client presentation brand");
  const start = code.lastIndexOf("var ", marker);
  const end = code.indexOf("function ", marker);
  const entry = code.match(/document\.documentElement\.dataset\.clientBrand=([\w$]+)\.id/);
  assert.ok(start >= 0 && end > marker && entry, "Find actual compiled brand block and entry assignment");
  const context = { window: { location: { pathname: "/yoga-preview/mini-app/" } },
    document: { documentElement: { dataset: {} } } };
  // Pure compiled presentation block only: no SDK/auth/network or fake actor.
  vm.runInNewContext(code.slice(start, end) + `;document.documentElement.dataset.clientBrand=${entry[1]}.id;`, context, {timeout:1000});
  assert.equal(context.document.documentElement.dataset.clientBrand, "yoga-gangster");
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
