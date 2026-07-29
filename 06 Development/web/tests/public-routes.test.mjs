import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "..");
const buildRoots = {
  vinext: path.resolve(webRoot, "artifacts", "build-vinext-export"),
  next: path.resolve(webRoot, "artifacts", "build-next-export"),
};
const routes = JSON.parse(
  await readFile(path.resolve(testDirectory, "public-routes.json"), "utf8"),
);

function outputPath(buildPath) {
  if (buildPath === "/") return "index.html";
  return `${buildPath.replace(/^\/|\/$/g, "")}/index.html`;
}

async function listHtmlFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith("._")) continue;
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHtmlFiles(path.resolve(directory, entry.name), relativePath)));
    } else if (entry.name.endsWith(".html")) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

test("public route manifest contains the frozen 47 SAFRWAY pages", () => {
  assert.equal(routes.length, 47);

  const buildPaths = routes.map((route) => route.buildPath);
  const publicUrls = routes.map((route) => route.publicUrl);
  assert.equal(new Set(buildPaths).size, routes.length);
  assert.equal(new Set(publicUrls).size, routes.length);

  for (const route of routes) {
    assert.match(route.buildPath, /^\/(?:.*\/)?$/);
    assert.match(
      route.publicUrl,
      /^https:\/\/(?:app\.)?safrway\.online\/(?:.*\/)?$/,
    );
    assert.doesNotMatch(route.publicUrl, /localhost|127\.0\.0\.1|:8081/);
    assert.doesNotMatch(route.buildPath, /^\/directions(?:\/|$)/);
  }
});

for (const [variant, staticRoot] of Object.entries(buildRoots)) {
  test(`${variant} static output contains every frozen public route`, async () => {
    const expectedFiles = routes
      .map((route) => outputPath(route.buildPath))
      .sort();

    for (const relativePath of expectedFiles) {
      const absolutePath = path.resolve(staticRoot, relativePath);
      await access(absolutePath);
      const html = await readFile(absolutePath, "utf8");
      assert.match(html, /<!DOCTYPE html>/i, relativePath);
    }

    const generatedFiles = await listHtmlFiles(staticRoot);
    assert.deepEqual(
      generatedFiles.filter((relativePath) =>
        expectedFiles.includes(relativePath),
      ),
      expectedFiles,
    );
    assert.ok(
      generatedFiles.includes("404.html"),
      `${variant} output must contain 404.html`,
    );
  });
}
