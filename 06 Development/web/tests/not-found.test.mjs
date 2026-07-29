import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("custom not-found page is noindex and links back into the site", async () => {
  const source = await readFile(
    new URL("../app/not-found.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /robots:\s*\{[\s\S]*?index: false/);
  assert.match(source, /follow: false/);
  assert.match(source, /href="\/"/);
  assert.match(source, /href="\/catalog"/);
  assert.doesNotMatch(source, /MiniApp|telegram-web-app|localhost/);
});

test("Nginx serves the generated 404 page with the original 404 status", async () => {
  const source = await readFile(
    new URL("../../deploy/nginx/safr-web.conf", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /server_name safrway\.online;[\s\S]*?error_page 404 \/404\.html;/,
  );
  assert.match(source, /location = \/404\.html \{\s*internal;/);
  assert.match(source, /try_files \$uri\/index\.html =404;/);
});
