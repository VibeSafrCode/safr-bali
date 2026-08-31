import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const assets = new URL("../dist/assets/", import.meta.url);

test("Admin Users has one structural surface without a CSS-hidden legacy panel", async () => {
  const [admin, css] = await Promise.all([
    readFile(new URL("src/surfaces/AdminApp.tsx", root), "utf8"),
    readFile(new URL("src/admin.css", root), "utf8"),
  ]);

  assert.match(admin, /tab !== "managers" && tab !== "users" && <section className="admin-panel">/);
  assert.match(admin, /tab === "users" && <AdminUsers/);
  assert.doesNotMatch(admin, /tab === "queues" \|\| tab === "users"/);
  assert.doesNotMatch(css, /admin-content:has\(> \.admin-users\)/);
});

test("route-level lazy loading keeps every production JavaScript chunk below the warning threshold", async () => {
  const source = await readFile(new URL("src/main.tsx", root), "utf8");
  assert.match(source, /lazy\(\(\) => import\("\.\/surfaces\/AdminApp"\)/);
  assert.match(source, /lazy\(\(\) => import\("\.\/surfaces\/MiniApp"\)/);
  assert.match(source, /<Suspense fallback=\{<ApplicationLoading \/>\}>/);

  const names = (await readdir(assets)).filter((name) => name.endsWith(".js"));
  assert.ok(names.some((name) => name.startsWith("AdminApp-")));
  assert.ok(names.some((name) => name.startsWith("MiniApp-")));
  assert.ok(names.some((name) => name.startsWith("WebCalculatorApp-")));
  for (const name of names) {
    const details = await stat(new URL(name, assets));
    assert.ok(details.size < 500_000, `${name} is ${details.size} bytes`);
  }
});
