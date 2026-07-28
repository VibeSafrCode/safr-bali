import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const developmentRoot = path.resolve(projectRoot, "..");
const pilotRoutes = [
  "/",
  "/directions/",
  "/directions/bali/",
  "/directions/bali/visas/",
  "/directions/bali/visas/e33g/",
  "/directions/bali/visas/d12/",
  "/directions/bali/visas/voa/",
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalize(value) {
  return value
    .replaceAll("\\n", "\n")
    .replace(/\s+/g, " ")
    .trim();
}

test("Astro pilot is a strict subset of the frozen Next/Vinext route contract", async () => {
  const referenceRoutes = await readJson(
    path.join(developmentRoot, "web/tests/public-routes.json"),
  );
  const referencePaths = new Set(
    referenceRoutes.map((route) => route.buildPath),
  );
  for (const route of pilotRoutes) {
    assert.ok(referencePaths.has(route), `reference route is missing: ${route}`);
  }
  assert.equal(new Set(pilotRoutes).size, 7);
});

test("preview snapshot is immutable, self-verifying and deterministic", async () => {
  const snapshot = await readJson(
    path.join(projectRoot, "src/data/generated/pilot-snapshot.v1.json"),
  );
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.immutable, true);
  assert.equal(snapshot.entries.length, 4);
  assert.equal(snapshot.contentRevision, "legacy-next-reference-9b918cd");
  assert.equal(snapshot.generatedAt, "2026-07-28T00:00:00.000Z");
  for (const entry of snapshot.entries) {
    assert.equal(entry.contentHash, digest(JSON.stringify(entry.content)));
    assert.equal(entry.content.legacyChecksum, digest(entry.content.body));
    assert.equal(entry.content.status, "legacy_needs_sources");
    assert.equal(entry.content.productionCutoverAllowed, false);
    assert.deepEqual(entry.content.sources, []);
  }
});

test("E33G, D12 and VOA preserve the exact legacy bot meaning", async () => {
  const [snapshot, visas] = await Promise.all([
    readJson(
      path.join(projectRoot, "src/data/generated/pilot-snapshot.v1.json"),
    ),
    readJson(path.join(developmentRoot, "bot/app/content/visas.json")),
  ]);
  const pairs = [
    ["bali.visas.e33g", "E33G", "/directions/bali/visas/e33g/"],
    ["bali.visas.d12", "D12", "/directions/bali/visas/d12/"],
    ["bali.visas.voa", "VOA", "/directions/bali/visas/voa/"],
  ];
  for (const [contentId, legacyKey, route] of pairs) {
    const entry = snapshot.entries.find(
      (candidate) => candidate.content.contentId === contentId,
    );
    assert.ok(entry, `snapshot content is missing: ${contentId}`);
    assert.equal(normalize(entry.content.body), normalize(visas[legacyKey].text));

    const html = await readFile(
      path.join(projectRoot, "dist", route.slice(1), "index.html"),
      "utf8",
    );
    const visibleText = normalize(
      html
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " "),
    );
    assert.ok(
      visibleText.includes(normalize(entry.content.body)),
      `${route} does not expose the full legacy content in HTML`,
    );
  }
});
