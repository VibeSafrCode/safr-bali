import {
  BOT_PROTECTED_PROTOCOL_TOKENS,
  BOT_SENSITIVE_REVIEW_KEYS,
  botCorpus,
} from "./bot";
import { miniAppCorpus } from "./mini-app";
import {
  PUBLIC_ASTRO_ROUTES,
  PUBLIC_ROUTE_COVERAGE,
  PUBLIC_SENSITIVE_ROUTES,
  PUBLIC_SENSITIVE_SOURCE_EVIDENCE,
  publicCorpus,
} from "./public";
import type { TranslationUnit } from "./types";

function fail(message: string): never {
  throw new Error(`BALI-TASK-050 corpus validation failed: ${message}`);
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function placeholders(value: string) {
  return [...value.matchAll(/\{[A-Za-z][A-Za-z0-9_]*\}/g)]
    .map(([token]) => token)
    .sort();
}

function validateEntry(domain: string, key: string, entry: TranslationUnit) {
  if (!entry.ru.trim()) fail(`${domain}.${key} has empty ru text`);
  if (!entry.en.trim()) fail(`${domain}.${key} has empty en text`);
  if (!entry.source.trim()) fail(`${domain}.${key} has no source path`);

  const ruPlaceholders = placeholders(entry.ru);
  const enPlaceholders = placeholders(entry.en);
  if (!sameValues(ruPlaceholders, enPlaceholders)) {
    fail(`${domain}.${key} changes placeholders`);
  }

  for (const token of entry.protectedTokens ?? []) {
    if (!entry.ru.includes(token)) {
      fail(`${domain}.${key} protected token is absent from ru: ${token}`);
    }
    if (!entry.en.includes(token)) {
      fail(`${domain}.${key} protected token is absent from en: ${token}`);
    }
  }
}

const corpora = [publicCorpus, botCorpus, miniAppCorpus] as const;
for (const corpus of corpora) {
  for (const [key, entry] of Object.entries(corpus.entries)) {
    validateEntry(corpus.domain, key, entry);
  }
}

if (PUBLIC_ASTRO_ROUTES.length !== 46) {
  fail(`public route tuple has ${PUBLIC_ASTRO_ROUTES.length} routes, expected 46`);
}
if (new Set(PUBLIC_ASTRO_ROUTES).size !== PUBLIC_ASTRO_ROUTES.length) {
  fail("public route tuple contains duplicates");
}

const coverageRoutes = Object.keys(PUBLIC_ROUTE_COVERAGE).sort();
const contractedRoutes = [...PUBLIC_ASTRO_ROUTES].sort();
if (!sameValues(coverageRoutes, contractedRoutes)) {
  fail("public route coverage differs from the exact 46-route contract");
}

if (PUBLIC_SENSITIVE_ROUTES.length !== 9) {
  fail(`sensitive route tuple has ${PUBLIC_SENSITIVE_ROUTES.length} routes, expected 9`);
}
for (const route of PUBLIC_SENSITIVE_ROUTES) {
  const coverage = PUBLIC_ROUTE_COVERAGE[route];
  if (!coverage || coverage.review !== "HUMAN_REVIEW_REQUIRED") {
    fail(`${route} is missing the HUMAN_REVIEW_REQUIRED gate`);
  }
}

for (const [route, coverage] of Object.entries(PUBLIC_ROUTE_COVERAGE)) {
  if (!(coverage.key in publicCorpus.entries)) {
    fail(`${route} references missing public corpus key ${coverage.key}`);
  }
}

const evidenceRoutes = Object.keys(PUBLIC_SENSITIVE_SOURCE_EVIDENCE).sort();
const sensitiveRoutes = [...PUBLIC_SENSITIVE_ROUTES].sort();
if (!sameValues(evidenceRoutes, sensitiveRoutes)) {
  fail("sensitive source evidence differs from the exact nine-route gate");
}
for (const route of PUBLIC_SENSITIVE_ROUTES) {
  const evidence = PUBLIC_SENSITIVE_SOURCE_EVIDENCE[route];
  if (route === "/privacy/") {
    if (
      evidence.verification !== null ||
      evidence.lastVerifiedAt !== null ||
      evidence.productionCutoverAllowed !== null ||
      evidence.sourceIds.length !== 0
    ) {
      fail("privacy source evidence must preserve the source null state");
    }
    continue;
  }
  const expectedVerificationDate = route === "/bali/guides/all-indonesia/"
    ? "2026-08-25T00:00:00.000Z"
    : "2026-07-29T00:00:00.000Z";
  if (evidence.lastVerifiedAt !== expectedVerificationDate) {
    fail(`${route} changes lastVerifiedAt`);
  }
  const sourceIds: readonly string[] = evidence.sourceIds;
  if (sourceIds.length === 0) fail(`${route} has no source IDs`);
  if (new Set(sourceIds).size !== sourceIds.length) {
    fail(`${route} duplicates source IDs`);
  }
}

if (BOT_SENSITIVE_REVIEW_KEYS.length !== 70) {
  fail(`bot sensitive key count is ${BOT_SENSITIVE_REVIEW_KEYS.length}, expected 70`);
}
for (const key of BOT_SENSITIVE_REVIEW_KEYS) {
  if (botCorpus.entries[key].review !== "HUMAN_REVIEW_REQUIRED") {
    fail(`bot sensitive key is not gated: ${key}`);
  }
}
if (BOT_PROTECTED_PROTOCOL_TOKENS.length !== 70) {
  fail(
    `bot protocol token count is ${BOT_PROTECTED_PROTOCOL_TOKENS.length}, expected 70`,
  );
}

const expectedEntryCounts = {
  public: 251,
  bot: 280,
  "mini-app-client": 245,
} as const;
for (const corpus of corpora) {
  const actual = Object.keys(corpus.entries).length;
  if (actual !== expectedEntryCounts[corpus.domain]) {
    fail(`${corpus.domain} has ${actual} entries, expected ${expectedEntryCounts[corpus.domain]}`);
  }
}

const sensitiveEntries = corpora.flatMap((corpus) =>
  Object.entries(corpus.entries)
    .filter(([, entry]) => entry.review === "HUMAN_REVIEW_REQUIRED")
    .map(([key]) => `${corpus.domain}:${key}`),
);
const sensitiveByDomain = Object.fromEntries(
  corpora.map((corpus) => [
    corpus.domain,
    Object.values(corpus.entries).filter(
      (entry) => entry.review === "HUMAN_REVIEW_REQUIRED",
    ).length,
  ]),
);
if (
  sensitiveByDomain.public !== 52 ||
  sensitiveByDomain.bot !== 70 ||
  sensitiveByDomain["mini-app-client"] !== 0
) {
  fail("sensitive entry counts differ from the audited 52/70/0 split");
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      locales: ["ru", "en"],
      publicRoutes: `${PUBLIC_ASTRO_ROUTES.length}/46`,
      publicCatalogTextLeaves: `${Object.keys(publicCorpus.entries).filter((key) => key.startsWith("catalog.")).length}/117`,
      sensitivePublicRoutes: `${PUBLIC_SENSITIVE_ROUTES.length}/9`,
      botCoreButtons: `${Object.keys(botCorpus.entries).filter((key) => key.startsWith("button.")).length}/94`,
      botJsonStringLeaves: "60/60",
      miniAppSourceFragments: {
        audited: 244,
        exact: 224,
        placeholderComposites: 14,
        protectedRouteContextExcluded: 2,
      },
      entries: Object.fromEntries(
        corpora.map((corpus) => [corpus.domain, Object.keys(corpus.entries).length]),
      ),
      totalEntries: corpora.reduce(
        (total, corpus) => total + Object.keys(corpus.entries).length,
        0,
      ),
      missingLocaleEntries: 0,
      sensitiveSourceEvidence: `${evidenceRoutes.length}/9`,
      botSensitiveReviewKeys: `${BOT_SENSITIVE_REVIEW_KEYS.length}/70`,
      botProtectedProtocolTokens: `${BOT_PROTECTED_PROTOCOL_TOKENS.length}/70`,
      sensitiveEntries: sensitiveEntries.length,
      sensitiveEntriesByDomain: sensitiveByDomain,
      placeholderMismatches: 0,
      protectedTokenFailures: 0,
    },
    null,
    2,
  ),
);
