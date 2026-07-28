import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContentEntry } from "../../shared/scripts/validate-contracts.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptRoot, "..");
const developmentRoot = path.resolve(projectRoot, "..");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function contentEntry({
  contentId,
  route,
  title,
  summary,
  body,
}) {
  const normalizedBody = body.replaceAll("\\n", "\n");
  return {
    schemaVersion: 1,
    contentId,
    route,
    locale: "ru",
    kind: route.endsWith("/visas/") ? "service" : "article",
    status: "legacy_needs_sources",
    verificationPriority: "high",
    title,
    summary,
    body: normalizedBody,
    sources: [],
    criticalFacts: [],
    lastVerifiedAt: null,
    legacyChecksum: digest(normalizedBody),
    previewAllowed: true,
    productionCutoverAllowed: false,
  };
}

const [visaContent, legacyRegistry, contentSchema] = await Promise.all([
  readJson(path.join(developmentRoot, "bot/app/content/visas.json")),
  readJson(path.join(developmentRoot, "shared/content/legacy-content-registry.v1.json")),
  readJson(path.join(developmentRoot, "shared/contracts/content-entry.v1.schema.json")),
]);

const sourceEntries = [
  contentEntry({
    contentId: "bali.visas",
    route: "/directions/bali/visas/",
    title: "Визы на Бали",
    summary:
      "Каталог текущих визовых сценариев SAFRWAY для поездки и проживания на Бали.",
    body:
      "Выберите подходящий сценарий: ITAS E33G для удалённых работников, многократную визу D12 или eVOA для короткой поездки.",
  }),
  contentEntry({
    contentId: "bali.visas.e33g",
    route: "/directions/bali/visas/e33g/",
    title: "ITAS E33G",
    summary: "Для удалённых работников, сроком на 1 год.",
    body: visaContent.E33G.text,
  }),
  contentEntry({
    contentId: "bali.visas.d12",
    route: "/directions/bali/visas/d12/",
    title: "D12",
    summary: "Многократная виза на 1 или 2 года.",
    body: visaContent.D12.text,
  }),
  contentEntry({
    contentId: "bali.visas.voa",
    route: "/directions/bali/visas/voa/",
    title: "eVOA",
    summary: "Краткосрочная виза по прибытии.",
    body: visaContent.VOA.text,
  }),
];

const expectedRoutes = new Set(
  legacyRegistry.entries
    .filter((entry) => entry.verificationPriority === "high")
    .map((entry) => entry.route),
);

for (const entry of sourceEntries) {
  if (!expectedRoutes.has(entry.route)) {
    throw new Error(`Preview entry is not registered as high priority: ${entry.route}`);
  }
  validateContentEntry(entry, contentSchema);
}

const snapshot = {
  schemaVersion: 1,
  snapshotId: "catalog-v1-bali-visa-pilot",
  contentRevision: "legacy-next-reference-9b918cd",
  routeContractVersion: 1,
  designTokenVersion: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  immutable: true,
  entries: sourceEntries.map((content) => ({
    contentHash: digest(JSON.stringify(content)),
    content,
  })),
};

const outputPath = path.join(
  projectRoot,
  "src/data/generated/pilot-snapshot.v1.json",
);
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    snapshotId: snapshot.snapshotId,
    entries: snapshot.entries.length,
    output: path.relative(projectRoot, outputPath),
  }),
);
