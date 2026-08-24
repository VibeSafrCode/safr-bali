import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("PWA manifest is installable and starts in authenticated account", () => {
  const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "/account/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#0b1914");
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes("maskable")));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/assets\/pwa\//);
  }
  for (const icon of ["icon-192.png", "icon-512.png"]) {
    assert.ok(readFileSync(join(root, "public/assets/pwa", icon)).length > 1000);
  }
});

test("service worker never caches authenticated APIs or mutation requests", () => {
  const source = readFileSync(join(root, "public/sw.js"), "utf8");
  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/mini-app\/"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/assets\/"\)/);
  assert.doesNotMatch(source, /["']\/pwa\//);
  assert.doesNotMatch(source, /cache\.put\(request[^\n]+api/i);
});

test("account and admin entries expose the shared manifest", () => {
  for (const entry of ["account/index.html", "admin/index.html"]) {
    const html = readFileSync(join(root, entry), "utf8");
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /rel="icon" href="\/assets\/pwa\/icon\.svg"/);
  }
  const mini = readFileSync(join(root, "index.html"), "utf8");
  assert.doesNotMatch(mini, /rel="manifest"/);
});

test("PWA update check uses a public no-store build version", () => {
  const source = readFileSync(join(root, "src/components/PwaLifecycle.tsx"), "utf8");
  const config = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.match(source, /build-version\.json\?v=/);
  assert.match(source, /cache: "no-store", credentials: "omit"/);
  assert.match(source, /__SAFRWAY_BUILD_ID__/);
  assert.match(source, /reloadAfterActivation/);
  assert.match(config, /fileName: "build-version\.json"/);
});

test("PWA and native lifecycle notices follow the active interface locale", () => {
  const controls = readFileSync(join(root, "src/components/AppearanceControls.tsx"), "utf8");
  const main = readFileSync(join(root, "src/main.tsx"), "utf8");
  const account = readFileSync(join(root, "src/surfaces/AccountApp.tsx"), "utf8");
  const admin = readFileSync(join(root, "src/surfaces/AdminApp.tsx"), "utf8");
  assert.match(controls, /MutationObserver/);
  assert.match(controls, /attributeFilter: \["lang"\]/);
  assert.match(main, /useDocumentLocale/);
  assert.match(main, /ApplicationLifecycle/);
  assert.match(account, /document\.documentElement\.lang = account\.locale/);
  assert.match(admin, /document\.documentElement\.lang = result\.actor\.locale/);
});
