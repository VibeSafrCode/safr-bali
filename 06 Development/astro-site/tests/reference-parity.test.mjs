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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalize(value) {
  return value
    .replaceAll("\\n", "\n")
    .replace(/\s+/g, " ")
    .trim();
}

test("Astro 45-route contract equals the frozen ecosystem contract", async () => {
  const contract = await readJson(
    path.join(developmentRoot, "shared/contracts/ecosystem-routes.v1.json"),
  );
  assert.equal(contract.astroPublicRoutes.length, 45);
  assert.equal(new Set(contract.astroPublicRoutes).size, 45);
  for (const route of contract.astroPublicRoutes) {
    const output =
      route === "/"
        ? path.join(projectRoot, "dist/index.html")
        : path.join(projectRoot, "dist", route.slice(1), "index.html");
    assert.ok(await readFile(output, "utf8"), route);
  }
});

test("runtime catalog snapshot is deterministic and content-addressed", async () => {
  const snapshot = await readJson(
    path.join(
      developmentRoot,
      "shared/content/generated/catalog-runtime.v1.json",
    ),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(snapshot.destinations))
    .digest("hex");
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.immutable, true);
  assert.equal(snapshot.destinations.length, 4);
  assert.equal(snapshot.contentRevision, `sha256:${digest}`);
  assert.equal(
    snapshot.snapshotId,
    `catalog-runtime-v1-${digest.slice(0, 12)}`,
  );
  assert.equal(snapshot.generatedAt, "2026-07-28T00:00:00.000Z");
});

test("all legacy visa materials preserve bot source meaning", async () => {
  const [snapshot, visas] = await Promise.all([
    readJson(
      path.join(
        developmentRoot,
        "shared/content/generated/catalog-runtime.v1.json",
      ),
    ),
    readJson(path.join(developmentRoot, "bot/app/content/visas.json")),
  ]);
  const visaService = snapshot.destinations
    .find((destination) => destination.id === "bali")
    .services.find((service) => service.id === "visas");
  const pairs = [
    ["e33g", "E33G"],
    ["d12", "D12"],
    ["d1-d2", "D1/D2"],
    ["c1", "C1"],
    ["voa", "VOA"],
    ["other-visa", "Другая виза"],
  ];

  for (const [itemId, legacyKey] of pairs) {
    const item = visaService.children.find((candidate) => candidate.id === itemId);
    assert.equal(normalize(item.content), normalize(visas[legacyKey].text));
    const route = `/directions/bali/visas/${itemId}/`;
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
      visibleText.includes(normalize(item.content)),
      `${route} does not expose full legacy content in HTML`,
    );
  }
});

test("priority visa snapshot records sources and independent review status", async () => {
  const snapshot = await readJson(
    path.join(projectRoot, "src/data/generated/pilot-snapshot.v1.json"),
  );
  const byRoute = new Map(
    snapshot.entries.map((entry) => [entry.content.route, entry.content]),
  );

  const landing = byRoute.get("/directions/bali/visas/");
  const e33g = byRoute.get("/directions/bali/visas/e33g/");
  const d12 = byRoute.get("/directions/bali/visas/d12/");
  const evoa = byRoute.get("/directions/bali/visas/voa/");

  assert.equal(landing.status, "needs_review");
  assert.equal(e33g.status, "needs_review");
  assert.equal(e33g.productionCutoverAllowed, false);
  assert.ok(e33g.sources.some((source) => source.sourceId === "imigrasi-e31e"));
  assert.ok(e33g.sources.some((source) => source.sourceId === "imigrasi-e31h"));

  for (const entry of [d12, evoa]) {
    assert.equal(entry.status, "verified");
    assert.equal(entry.lastVerifiedAt, "2026-07-29T00:00:00.000Z");
    assert.equal(entry.productionCutoverAllowed, true);
    assert.ok(entry.sources.length >= 2);
    assert.ok(entry.criticalFacts.length >= 3);
  }

  assert.ok(evoa.sources.some((source) => source.sourceId === "imigrasi-b1"));
  assert.ok(
    evoa.sources.some((source) => source.sourceId === "imigrasi-voa-countries"),
  );
});
