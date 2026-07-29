import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const sharedRoot = path.resolve(path.dirname(currentFile), "..");

async function readJson(relativePath) {
  const value = await readFile(path.join(sharedRoot, relativePath), "utf8");
  return JSON.parse(value);
}

function unique(values, label) {
  assert.equal(
    new Set(values).size,
    values.length,
    `${label} must not contain duplicates`,
  );
}

function assertPublicPath(value, label) {
  assert.match(value, /^\/(?:[^?#]*\/)?$/, `${label} must be a clean path`);
  assert.ok(!value.includes("\\"), `${label} must not contain backslashes`);
}

function flattenTokens(tokens) {
  return Object.entries(tokens)
    .filter(([category]) => !["schemaVersion", "tokenVersion"].includes(category))
    .flatMap(([category, group]) =>
      Object.entries(group).map(([name, token]) => ({
        category,
        name,
        ...token,
      })),
    );
}

export function validateContentEntry(entry, schema) {
  for (const field of schema.required) {
    assert.ok(
      Object.hasOwn(entry, field),
      `content entry is missing ${field}`,
    );
  }
  for (const field of Object.keys(entry)) {
    assert.ok(
      Object.hasOwn(schema.properties, field),
      `content entry has unknown field ${field}`,
    );
  }

  assert.equal(entry.schemaVersion, 1);
  assertPublicPath(entry.route, "content route");
  assert.ok(schema.properties.status.enum.includes(entry.status));
  assert.ok(
    schema.properties.verificationPriority.enum.includes(
      entry.verificationPriority,
    ),
  );
  assert.ok(entry.title.length > 0);
  assert.ok(entry.summary.length > 0);
  assert.ok(entry.body.length > 0);
  assert.ok(Array.isArray(entry.sources));
  assert.ok(Array.isArray(entry.criticalFacts));

  const sourceIds = new Set(entry.sources.map((source) => source.sourceId));
  assert.equal(
    sourceIds.size,
    entry.sources.length,
    "content sources must have unique sourceId values",
  );
  for (const source of entry.sources) {
    for (const field of schema.properties.sources.items.required) {
      assert.ok(
        Object.hasOwn(source, field),
        `content source is missing ${field}`,
      );
    }
    assert.ok(
      schema.properties.sources.items.properties.type.enum.includes(source.type),
      `content source has unsupported type ${source.type}`,
    );
    assert.match(source.url, /^https:\/\//, "content source must use HTTPS");
    assert.doesNotThrow(() => new URL(source.url));
    assert.ok(
      !Number.isNaN(Date.parse(source.accessedAt)),
      "content source requires a valid accessedAt",
    );
  }
  for (const fact of entry.criticalFacts) {
    assert.ok(
      fact.sourceIds.length > 0,
      `critical fact ${fact.factId} requires at least one source`,
    );
    for (const sourceId of fact.sourceIds) {
      assert.ok(
        sourceIds.has(sourceId),
        `critical fact references unknown source ${sourceId}`,
      );
    }
  }

  if (entry.status === "verified") {
    assert.ok(entry.sources.length > 0, "verified content requires sources");
    assert.equal(
      typeof entry.lastVerifiedAt,
      "string",
      "verified content requires lastVerifiedAt",
    );
  }
  if (entry.status === "legacy_needs_sources") {
    assert.equal(
      entry.lastVerifiedAt,
      null,
      "legacy migration must not set lastVerifiedAt",
    );
  }
  if (
    entry.verificationPriority === "high" &&
    entry.status !== "verified"
  ) {
    assert.equal(
      entry.productionCutoverAllowed,
      false,
      "unverified high-priority content must block cutover",
    );
  }
}

export async function validateContracts() {
  const routes = await readJson("contracts/ecosystem-routes.v1.json");
  const redirect = await readJson("contracts/account-redirect.v1.json");
  const runtime = await readJson("contracts/runtime-policy.v1.json");
  const manifest = await readJson("contracts/manifest.v1.json");
  const contentSchema = await readJson("contracts/content-entry.v1.schema.json");
  const snapshotSchema = await readJson(
    "contracts/catalog-snapshot.v1.schema.json",
  );
  const legacyContent = await readJson(
    "content/legacy-content-registry.v1.json",
  );
  const snapshotExample = await readJson(
    "examples/catalog-snapshot.v1.example.json",
  );
  const tokens = await readJson("design/tokens.v1.json");
  const tokenCss = await readFile(
    path.join(sharedRoot, "design/tokens.v1.css"),
    "utf8",
  );
  const legacyRouteManifest = JSON.parse(
    await readFile(
      path.resolve(sharedRoot, "../web/tests/public-routes.json"),
      "utf8",
    ),
  );

  assert.equal(routes.schemaVersion, 1);
  assert.equal(routes.astroPublicRoutes.length, 45);
  assert.equal(routes.reactApplicationRoutes.length, 2);
  assert.equal(routes.counts.astroPublic, 45);
  assert.equal(routes.counts.reactApplication, 2);
  assert.equal(routes.counts.ecosystem, 47);
  unique(routes.astroPublicRoutes, "Astro routes");
  unique(
    routes.reactApplicationRoutes.map((route) => route.path),
    "React routes",
  );
  for (const route of routes.astroPublicRoutes) {
    assertPublicPath(route, "Astro route");
  }
  for (const route of routes.reactApplicationRoutes) {
    assertPublicPath(route.path, "React route");
    assert.equal(route.robots, "noindex");
  }
  assert.deepEqual(
    routes.reactApplicationRoutes.map((route) => route.path),
    ["/", "/account/"],
  );
  assert.ok(!routes.astroPublicRoutes.includes("/account/"));
  assert.ok(!routes.astroPublicRoutes.includes("/mini-app/"));

  const legacyAstroRoutes = legacyRouteManifest
    .filter(
      (route) =>
        route.buildPath !== "/account/" && route.buildPath !== "/mini-app/",
    )
    .map((route) => route.buildPath)
    .sort();
  assert.deepEqual([...routes.astroPublicRoutes].sort(), legacyAstroRoutes);

  assert.equal(redirect.previewStatus, 307);
  assert.equal(redirect.productionStatus, 308);
  assert.equal(redirect.productionStatusEnabled, false);
  assert.equal(redirect.maxRedirectHops, 1);
  assert.equal(redirect.includeInSitemap, false);
  assert.equal(redirect.targetRobots, "noindex");
  assert.equal(redirect.source, `${routes.siteOrigin}/account/`);
  assert.equal(redirect.target, `${routes.applicationOrigin}/account/`);
  assert.deepEqual(redirect.forwardedQueryParameters, ["return_to"]);
  assert.ok(
    redirect.forbiddenQueryParameters.includes("access_token"),
    "redirect must explicitly reject session credentials",
  );

  assert.equal(runtime.schemaVersion, 1);
  assert.equal(runtime.runtimes.telegram.trustInitDataUnsafe, false);
  assert.equal(runtime.runtimes.browser.trustQueryIdentity, false);
  assert.equal(runtime.runtimes.telegram.origin, routes.applicationOrigin);
  assert.equal(runtime.runtimes.browser.origin, routes.applicationOrigin);
  assert.equal(runtime.runtimes.telegram.backendExchange, "server_session");
  assert.equal(runtime.runtimes.browser.backendExchange, "server_session");

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.compatibility.unknownSchemaVersion, "reject");
  assert.equal(contentSchema.properties.schemaVersion.const, 1);
  assert.ok(
    contentSchema.properties.status.enum.includes("legacy_needs_sources"),
  );
  assert.equal(snapshotSchema.properties.schemaVersion.const, 1);
  assert.equal(snapshotSchema.properties.immutable.const, true);
  assert.equal(snapshotExample.schemaVersion, 1);
  assert.equal(snapshotExample.immutable, true);
  assert.equal(snapshotExample.entries.length, 1);
  assert.match(
    snapshotExample.entries[0].contentHash,
    /^sha256:[a-f0-9]{64}$/,
  );
  validateContentEntry(snapshotExample.entries[0].content, contentSchema);
  assert.equal(
    snapshotExample.entries[0].content.status,
    "legacy_needs_sources",
  );

  const highPriorityVisaRoutes = new Set([
    "/bali/visas/",
    "/bali/visas/e33g/",
    "/bali/visas/d12/",
    "/bali/visas/voa/",
  ]);
  const registryRoutes = new Set();
  for (const entry of legacyContent.entries) {
    registryRoutes.add(entry.route);
    assert.equal(entry.status, "legacy_needs_sources");
    assert.equal(entry.lastVerifiedAt, null);
    assert.deepEqual(entry.sourceIds, []);
    assert.equal(entry.productionCutoverAllowed, false);
    assert.ok(routes.astroPublicRoutes.includes(entry.route));
    if (highPriorityVisaRoutes.has(entry.route)) {
      assert.equal(entry.verificationPriority, "high");
    }
  }
  assert.deepEqual(
    [...highPriorityVisaRoutes].sort(),
    [...registryRoutes]
      .filter((route) => highPriorityVisaRoutes.has(route))
      .sort(),
  );
  assert.equal(legacyContent.policy.migrationChangesMeaning, false);
  assert.equal(legacyContent.policy.migrationSetsVerified, false);
  assert.equal(legacyContent.policy.migrationUpdatesLastVerifiedAt, false);
  assert.equal(legacyContent.policy.fabricatedSourcesAllowed, false);

  const tokenList = flattenTokens(tokens);
  assert.ok(tokenList.length > 0);
  unique(
    tokenList.map((token) => token.cssVariable),
    "CSS token variables",
  );
  for (const token of tokenList) {
    assert.ok(
      tokenCss.includes(`${token.cssVariable}: ${token.value};`),
      `${token.category}.${token.name} must match CSS`,
    );
  }

  const serializedContracts = JSON.stringify({
    routes,
    redirect,
    runtime,
    legacyContent,
    snapshotExample,
  });
  assert.ok(!serializedContracts.includes("localhost"));
  assert.ok(!serializedContracts.includes(":8081"));

  return {
    schemaVersion: 1,
    astroRoutes: routes.astroPublicRoutes.length,
    reactRoutes: routes.reactApplicationRoutes.length,
    ecosystemRoutes:
      routes.astroPublicRoutes.length + routes.reactApplicationRoutes.length,
    legacyVisaEntries: legacyContent.entries.length,
    designTokens: tokenList.length,
  };
}

if (process.argv[1] === currentFile) {
  const report = await validateContracts();
  console.log(JSON.stringify(report, null, 2));
}
