import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(
  new URL("../../deploy/nginx/safr-react-app.preview.conf", import.meta.url),
  "utf8",
);

test("preview app server owns both session API namespaces", () => {
  assert.match(config, /location \^~ \/mini-app\//);
  assert.match(config, /location \^~ \/api\/web\//);
  assert.equal((config.match(/proxy_pass http:\/\/127\.0\.0\.1:8000;/g) ?? []).length, 2);
});

test("preview account canonicalization is one temporary redirect", () => {
  assert.match(
    config,
    /location = \/account\s*\{\s*return 307 https:\/\/app\.safrway\.online\/account\/;/s,
  );
  assert.doesNotMatch(config, /return 308/);
  assert.doesNotMatch(config, /access_token|refresh_token|session_token/);
  assert.match(
    config,
    /location = \/admin\s*\{\s*return 307 https:\/\/app\.safrway\.online\/admin\/;/s,
  );
});

test("React app is noindex and has no SPA catch-all masquerading as pages", () => {
  assert.match(config, /X-Robots-Tag "noindex, nofollow"/);
  assert.match(config, /location = \/\s*\{\s*try_files \/index\.html =404;/s);
  assert.match(
    config,
    /location ~ \^\/account\/\(\?:\[A-Za-z0-9_-\]\+\/\)\*\$\s*\{\s*try_files \/account\/index\.html =404;/s,
  );
  assert.match(
    config,
    /location ~ \^\/admin\/\(\?:\[A-Za-z0-9_-\]\+\/\)\*\$\s*\{\s*try_files \/admin\/index\.html =404;/s,
  );
  assert.match(config, /location \/\s*\{\s*return 404;/s);
});

test("PWA root files use four exact same-origin locations and icons stay on the existing assets route", () => {
  const exactFiles = new Map([
    ["manifest.webmanifest", "application/manifest+json"],
    ["sw.js", "application/javascript"],
    ["offline.html", "text/html"],
    ["build-version.json", "application/json"],
  ]);
  for (const [file, mime] of exactFiles) {
    assert.ok(config.includes(`location = /${file} {\n        default_type ${mime};\n        try_files $uri =404;\n    }`));
  }
  assert.equal((config.match(/location = \/(?:manifest\.webmanifest|sw\.js|offline\.html|build-version\.json)/g) ?? []).length, 4);
  assert.match(config, /location \^~ \/assets\/\s*\{[\s\S]*?try_files \$uri =404;/);
  assert.doesNotMatch(config, /location \^~ \/pwa\//);
});
