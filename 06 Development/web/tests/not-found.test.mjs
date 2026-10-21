import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NOT_FOUND_FOREIGN_ERROR_PATHS } from "../../astro-site/scripts/public-not-found-copy.mjs";

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

const publicTemplates = ["safr-target-production.conf", "safr-astro-site.preview.conf"];
const foreignPrefixes = NOT_FOUND_FOREIGN_ERROR_PATHS.map(({ segment }) => segment);

function errorMap(source) {
  const maps = [...source.matchAll(/map \$uri \$safr_public_error_uri \{([^}]*)\}/g)];
  assert.equal(maps.length, 1, "one normalized-URI error map");
  assert(maps[0].index < source.indexOf("server {"), "map belongs to http context");
  const lines = maps[0][1].split("\n").map(s => s.trim()).filter(Boolean);
  assert.equal(lines.length, 2, "only default and the canonical finite locale allowlist");
  assert.equal(lines[0], "default /404.html;");
  const match = lines[1].match(/^~(\^\/\(\?<safr_public_error_locale>([^)]+)\)\(\?:\/\|\$\)) \/\$safr_public_error_locale\/404\/index\.html;$/);
  assert(match, "anchored named capture and fixed local artifact path");
  assert.deepEqual(match[2].split("|"), foreignPrefixes);
  const pattern = new RegExp(match[1]);
  return {
    text: maps[0][0],
    resolve: normalizedUri => {
      const prefix = pattern.exec(normalizedUri)?.groups?.safr_public_error_locale;
      return prefix ? `/${prefix}/404/index.html` : "/404.html";
    },
  };
}

function publicErrorScope(source) {
  const main = source.split("server_name safrway.online;")[1]?.split("\nserver {")[0];
  assert(main, "Main public server exists");
  assert.match(main, /location \/ \{\s*error_page 404 \$safr_public_error_uri;\s*try_files \$uri \$uri\/ =404;\s*\}/);
  assert.match(main, /location = \/404\.html \{\s*internal;/);
  assert.match(main, /error_page 404 \/404\.html;/);
  assert.equal((source.match(/\$safr_public_error_uri/g) ?? []).length, 2, "map used only by Main public location");
  assert.doesNotMatch(main, /error_page 404\s*=/, "never turn an error into200 or an external redirect");
  const proxyLocations = [...main.matchAll(/location [^{]+\{([^}]*proxy_pass[^}]*)\}/g)];
  assert(proxyLocations.length >= 6, "existing public API/Auth proxies remain present");
  for (const location of proxyLocations) assert.doesNotMatch(location[1], /safr_public_error/);
}

for (const filename of publicTemplates) {
  test(`${filename}: source map covers canonical ten-locale error artifacts, not aliases or query input`, async () => {
    const source = await readFile(new URL(`../../deploy/nginx/${filename}`, import.meta.url), "utf8");
    const map = errorMap(source);
    assert.equal(foreignPrefixes.length, 9, "RU root plus nine foreign prefixes");
    for (const prefix of foreignPrefixes) {
      for (const path of [`/${prefix}/missing/`, `/${prefix}/bali/absent/`, `/${prefix}`]) {
        assert.equal(map.resolve(path), `/${prefix}/404/index.html`);
      }
    }
    for (const path of ["/missing/", "/ru/missing/", "/english/", "/en-US/", "/zh/", "/zh-Hans/", "/id/", "/AR/", "/bank/ar/missing/", "/api/ar/missing/"]) {
      assert.equal(map.resolve(path), "/404.html", path);
    }
    assert.equal(map.resolve(new URL("/missing/?locale=ar", "https://safrway.online").pathname), "/404.html");
    assert.throws(() => errorMap(source.replace("map $uri ", "map $request_uri ")));
    assert.throws(() => errorMap(source.replace("en|zh-cn|ko|fr|de|ja|hi|es|ar", "en|zh-cn|ko|fr|de|ja|hi|es|ar|id")));
  });

  test(`${filename}: localized handling stays internal,404 and public-only; actual Nginx is a separate gate`, async () => {
    const source = await readFile(new URL(`../../deploy/nginx/${filename}`, import.meta.url), "utf8");
    publicErrorScope(source);
    assert.throws(() => publicErrorScope(source.replace("error_page 404 $safr_public_error_uri;", "error_page 404 =200 $safr_public_error_uri;")));
  });
}

test("production and preview use the same canonical public error-map contract", async () => {
  const sources = await Promise.all(publicTemplates.map(name => readFile(new URL(`../../deploy/nginx/${name}`, import.meta.url), "utf8")));
  assert.equal(errorMap(sources[0]).text, errorMap(sources[1]).text);
});
