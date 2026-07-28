import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { destinations } from "../src/catalog";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  sharedRoot,
  "content",
  "generated",
  "catalog-runtime.v1.json",
);
const serializedCatalog = JSON.stringify(destinations);
const contentDigest = createHash("sha256")
  .update(serializedCatalog)
  .digest("hex");
const snapshot = {
  schemaVersion: 1,
  snapshotId: `catalog-runtime-v1-${contentDigest.slice(0, 12)}`,
  contentRevision: `sha256:${contentDigest}`,
  routeContractVersion: 1,
  designTokenVersion: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  immutable: true,
  destinations,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
