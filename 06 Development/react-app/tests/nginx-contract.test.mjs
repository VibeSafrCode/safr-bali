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
});

test("React app is noindex and has no SPA catch-all masquerading as pages", () => {
  assert.match(config, /X-Robots-Tag "noindex, nofollow"/);
  assert.match(config, /location = \/\s*\{\s*try_files \/index\.html =404;/s);
  assert.match(
    config,
    /location ~ \^\/account\/\(\?:\[A-Za-z0-9_-\]\+\/\)\*\$\s*\{\s*try_files \/account\/index\.html =404;/s,
  );
  assert.match(config, /location \/\s*\{\s*return 404;/s);
});
