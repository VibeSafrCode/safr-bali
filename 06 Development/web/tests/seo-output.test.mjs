import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const roots = [
  resolve("artifacts/build-vinext-export"),
  resolve("artifacts/build-next-export"),
];
const routes = JSON.parse(
  await readFile(new URL("./public-routes.json", import.meta.url), "utf8"),
);

function outputPath(root, buildPath) {
  if (buildPath === "/") return resolve(root, "index.html");
  return resolve(root, buildPath.replace(/^\/|\/$/g, ""), "index.html");
}

for (const root of roots) {
  const variant = root.split("/").at(-1);

  test(`${variant} emits canonical URLs for all 47 public routes`, async () => {
    for (const route of routes) {
      const html = await readFile(outputPath(root, route.buildPath), "utf8");
      const canonicalPattern =
        route.buildPath === "/mini-app/"
          ? "https:\\/\\/app\\.safrway\\.online\\/?"
          : route.publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        html,
        new RegExp(
          `<link[^>]+rel=["']canonical["'][^>]+href=["']${canonicalPattern}["']`,
        ),
        route.buildPath,
      );
    }
  });

  test(`${variant} emits robots and an indexable-only sitemap`, async () => {
    const robots = await readFile(resolve(root, "robots.txt"), "utf8");
    const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");

    assert.match(robots, /User-Agent: OAI-SearchBot/i);
    assert.match(robots, /User-Agent: GPTBot[\s\S]*?Disallow: \//i);
    assert.match(robots, /Disallow: \/account\//i);
    assert.match(sitemap, /https:\/\/safrway\.online\/directions\/bali\//);
    assert.doesNotMatch(sitemap, /account|mini-app|privacy|app\.safrway/);
    assert.doesNotMatch(sitemap, /localhost|127\.0\.0\.1|:8081/);
  });

  test(`${variant} marks non-indexable pages in generated HTML`, async () => {
    for (const buildPath of ["/account/", "/mini-app/", "/privacy/"]) {
      const html = await readFile(outputPath(root, buildPath), "utf8");
      assert.match(html, /<meta[^>]+name=["']robots["'][^>]+noindex/i);
    }
  });
}
