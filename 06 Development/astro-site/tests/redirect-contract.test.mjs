import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentRoot = new URL("../../", import.meta.url);
const contract = JSON.parse(
  await readFile(new URL("shared/contracts/ecosystem-routes.v1.json", developmentRoot), "utf8"),
);
const configUrls = [
  "deploy/nginx/safr-target-production.conf",
  "deploy/nginx/safr-astro-site.preview.conf",
  "deploy/nginx/safr-web.conf",
].map((path) => new URL(path, developmentRoot));

function exactRedirect(path) {
  const escaped = path.replaceAll("/", "\\/");
  return new RegExp(
    `location = ${escaped}\\s*\\{\\s*return 308 https:\\/\\/safrway\\.online\\/\\$is_args\\$args;`,
    "s",
  );
}

test("catalog and root directions aliases are one-hop 308 redirects to Home", async () => {
  for (const configUrl of configUrls) {
    const config = await readFile(configUrl, "utf8");
    for (const path of ["/catalog", "/catalog/", "/directions", "/directions/"]) {
      assert.match(config, exactRedirect(path), `${configUrl.pathname}: ${path}`);
    }
    assert.doesNotMatch(config, /return 308 https:\/\/safrway\.online\/catalog\//);
  }
});

test("nested legacy directions preserve canonical intent and query parameters", async () => {
  for (const configUrl of configUrls) {
    const config = await readFile(configUrl, "utf8");
    assert.match(
      config,
      /location ~ \^\/directions\/\(\.\+\)\/\$\s*\{\s*return 308 https:\/\/safrway\.online\/\$1\/\$is_args\$args;/s,
    );
    assert.match(
      config,
      /location ~ \^\/directions\/\(\.\+\[\^\/\]\)\$\s*\{\s*return 308 https:\/\/safrway\.online\/\$1\/\$is_args\$args;/s,
    );
  }

  const canonicalRoutes = new Set(contract.astroPublicRoutes);
  for (const route of contract.astroPublicRoutes.filter((route) => route.split("/").filter(Boolean).length > 0)) {
    const nestedLegacy = `/directions${route}`;
    const canonical = `/${nestedLegacy.replace(/^\/directions\//, "").replace(/^\/+|\/+$/g, "")}/`;
    assert.ok(canonicalRoutes.has(canonical), `${nestedLegacy} must map to ${canonical}`);
  }
});

test("route contract separates 46 HTML documents from the catalog redirect surface", () => {
  assert.equal(contract.astroPublicRoutes.length, 46);
  assert.equal(contract.counts.astroPublicDiscoverySurfaces, 47);
  assert.ok(!contract.astroPublicRoutes.includes("/catalog/"));
  assert.deepEqual(contract.astroRedirectRoutes.slice(0, 4), [
    { from: "/catalog", to: "/", status: 308 },
    { from: "/catalog/", to: "/", status: 308 },
    { from: "/directions", to: "/", status: 308 },
    { from: "/directions/", to: "/", status: 308 },
  ]);
});
