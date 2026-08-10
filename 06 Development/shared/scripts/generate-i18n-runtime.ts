import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { TranslationUnit } from "../src/i18n/types";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(sharedRoot, "content", "generated", "i18n");

function runtimeEntries(entries: Record<string, TranslationUnit>) {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [
      key,
      {
        ru: entry.ru,
        en: entry.en,
        review: entry.review,
      },
    ]),
  );
}

async function writeSnapshot(
  name: string,
  domain: string,
  entries: Record<string, TranslationUnit>,
  extra: Record<string, unknown> = {},
) {
  const snapshot = {
    schemaVersion: 1,
    domain,
    locales: ["ru", "en"],
    generatedFrom: "shared/src/i18n",
    ...extra,
    entries: runtimeEntries(entries),
  };
  await writeFile(
    path.join(outputDirectory, `${name}.v1.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
}

const requested = new Set(process.argv.slice(2));
const generateAll = requested.size === 0;

await mkdir(outputDirectory, { recursive: true });
if (generateAll || requested.has("bot")) {
  const { botCorpus } = await import("../src/i18n/bot");
  await writeSnapshot("bot", botCorpus.domain, botCorpus.entries);
}
if (generateAll || requested.has("mini-app")) {
  const { miniAppCorpus } = await import("../src/i18n/mini-app");
  await writeSnapshot("mini-app", miniAppCorpus.domain, miniAppCorpus.entries);
}
if (generateAll || requested.has("public")) {
  const {
    PUBLIC_ASTRO_ROUTES,
    PUBLIC_ROUTE_COVERAGE,
    PUBLIC_SENSITIVE_ROUTES,
    publicCorpus,
  } = await import("../src/i18n/public");
  await writeSnapshot("public", publicCorpus.domain, publicCorpus.entries, {
    routes: PUBLIC_ASTRO_ROUTES,
    routeCoverage: PUBLIC_ROUTE_COVERAGE,
    sensitiveRoutes: PUBLIC_SENSITIVE_ROUTES,
  });
}
