import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getPublicPages } from "../src/lib/public-catalog.ts";
import { localizedPage } from "../src/lib/public-i18n.ts";
import { getBotVisaCopy } from "../src/lib/visa-bot-copy.ts";
import { destinations as referenceDestinations } from "../../web/lib/catalog.ts";

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

test("Astro 50-document contract plus discovery redirect equals the ecosystem contract", async () => {
  const contract = await readJson(
    path.join(developmentRoot, "shared/contracts/ecosystem-routes.v1.json"),
  );
  assert.equal(contract.astroPublicRoutes.length, 50);
  assert.equal(new Set(contract.astroPublicRoutes).size, 50);
  assert.equal(contract.counts.astroPublicDiscoverySurfaces, 51);
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
  assert.equal(snapshot.generatedAt, "2026-07-29T00:00:00.000Z");
});

test("runtime preserves every legacy visa identity and body except the exact approved D12 excerpt", async () => {
  const [snapshot, visas, summaryBytes, publicTranslations] = await Promise.all([
    readJson(
      path.join(
        developmentRoot,
        "shared/content/generated/catalog-runtime.v1.json",
      ),
    ),
    readJson(path.join(developmentRoot, "bot/app/content/visas.json")),
    readFile(path.join(developmentRoot, "shared/content/d12-e28a-bot-summaries.v1.json")),
    readJson(path.join(developmentRoot, "shared/content/generated/i18n/public.v1.json")),
  ]);
  assert.equal(createHash("sha256").update(summaryBytes).digest("hex"),
    "1e1fc2d5026d67642f4eb837895db2fe0d3829a61dcf6680b917c5d859f2a1e6");
  const approved = JSON.parse(summaryBytes);
  assert.deepEqual(approved.locales, ["ru", "en"]);
  const visaService = snapshot.destinations
    .find((destination) => destination.id === "bali")
    .services.find((service) => service.id === "visas");
  const referenceVisas = referenceDestinations.find((destination) => destination.id === "bali")
    .services.find((service) => service.id === "visas");
  const pairs = [
    ["e33g", "E33G"],
    ["d12", "D12"],
    ["d1-d2", "D1/D2"],
    ["c1", "C1"],
    ["voa", "VOA"],
    ["other-visa", "Другая виза"],
  ];
  assert.deepEqual(visaService.children.map((item) => item.id), pairs.map(([itemId]) => itemId));
  assert.deepEqual(referenceVisas.children.map((item) => item.id), pairs.map(([itemId]) => itemId));

  for (const [itemId, legacyKey] of pairs) {
    const item = visaService.children.find((candidate) => candidate.id === itemId);
    assert.equal(referenceVisas.children.find((candidate) => candidate.id === itemId).content, item.content);
    if (itemId === "d12") {
      assert.equal(item.content, approved.entries.D12.ru.body);
      assert.notEqual(normalize(item.content), normalize(visas.D12.text));
    } else {
      assert.equal(normalize(item.content), normalize(visas[legacyKey].text));
      const raw = getPublicPages().find((page) => page.route === `/bali/visas/${itemId}/`);
      for (const locale of ["ru", "en"]) {
        assert.equal(localizedPage(raw, locale).body,
          publicTranslations.entries[`catalog.bali.visas.${itemId}.content`][locale]);
      }
    }
  }
  const d12 = getPublicPages().find((page) => page.route === "/bali/visas/d12/");
  for (const locale of ["ru", "en"]) {
    const row = approved.entries.D12[locale];
    assert.equal(createHash("sha256").update(row.body).digest("hex"), row.bodySha256);
    assert.equal(row.body, row.sourceUnits.map((unit) => unit.text).join("\n\n"));
    assert.equal(localizedPage(d12, locale).body, row.body);
    assert.equal(getBotVisaCopy(d12.route, locale).fullBody, row.body);
  }
});

test("historical preview snapshot remains unchanged and is not current public review authority", async () => {
  const snapshot = await readJson(
    path.join(projectRoot, "src/data/generated/pilot-snapshot.v1.json"),
  );
  const byRoute = new Map(
    snapshot.entries.map((entry) => [entry.content.route, entry.content]),
  );

  const landing = byRoute.get("/bali/visas/");
  const e33g = byRoute.get("/bali/visas/e33g/");
  const d12 = byRoute.get("/bali/visas/d12/");
  const d1d2 = byRoute.get("/bali/visas/d1-d2/");
  const c1 = byRoute.get("/bali/visas/c1/");
  const evoa = byRoute.get("/bali/visas/voa/");
  const otherVisa = byRoute.get("/bali/visas/other-visa/");

  assert.equal(byRoute.size, 7);

  assert.equal(landing.status, "needs_review");
  assert.equal(e33g.status, "needs_review");
  assert.equal(e33g.productionCutoverAllowed, false);
  assert.ok(e33g.sources.some((source) => source.sourceId === "imigrasi-e31e"));
  assert.ok(e33g.sources.some((source) => source.sourceId === "imigrasi-e31h"));

  for (const entry of [d12, d1d2, c1, evoa, otherVisa]) {
    assert.equal(entry.status, "verified");
    assert.equal(entry.lastVerifiedAt, "2026-07-29T00:00:00.000Z");
    assert.equal(entry.productionCutoverAllowed, true);
    assert.ok(entry.sources.length >= 1);
    assert.ok(entry.criticalFacts.length >= 1);
  }

  assert.ok(d1d2.sources.some((source) => source.sourceId === "imigrasi-d1"));
  assert.ok(d1d2.sources.some((source) => source.sourceId === "imigrasi-d2"));
  assert.ok(c1.sources.some((source) => source.sourceId === "imigrasi-c1"));
  assert.ok(evoa.sources.some((source) => source.sourceId === "imigrasi-b1"));
  assert.ok(
    evoa.sources.some((source) => source.sourceId === "imigrasi-voa-countries"),
  );
  assert.ok(
    otherVisa.sources.some(
      (source) => source.sourceId === "imigrasi-visa-catalog",
    ),
  );
});
