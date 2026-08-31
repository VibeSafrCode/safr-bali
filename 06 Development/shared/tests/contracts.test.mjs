import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateContentEntry,
  validateContracts,
} from "../scripts/validate-contracts.mjs";
import {
  buildAccountRedirect,
  safeAccountReturnPath,
} from "../src/account-redirect.mjs";

const report = await validateContracts();
const redirectContract = JSON.parse(
  await readFile(
    new URL("../contracts/account-redirect.v1.json", import.meta.url),
    "utf8",
  ),
);
const contentSchema = JSON.parse(
  await readFile(
    new URL("../contracts/content-entry.v1.schema.json", import.meta.url),
    "utf8",
  ),
);
const snapshotExample = JSON.parse(
  await readFile(
    new URL("../examples/catalog-snapshot.v1.example.json", import.meta.url),
    "utf8",
  ),
);

test("Astro contract is 46 documents plus one discovery redirect surface", () => {
  assert.equal(report.astroRoutes, 46);
  assert.equal(report.astroDiscoverySurfaces, 47);
});

test("React application contract is exactly two routes", () => {
  assert.equal(report.reactRoutes, 2);
});

test("ecosystem contract remains 49 routes", () => {
  assert.equal(report.ecosystemRoutes, 49);
});

test("legacy migration registry keeps all seven entries unverified", () => {
  assert.equal(report.legacyVisaEntries, 7);
});

test("content contract rejects false verification and unsafe cutover", () => {
  const legacy = snapshotExample.entries[0].content;
  assert.throws(
    () =>
      validateContentEntry(
        {
          ...legacy,
          status: "verified",
          lastVerifiedAt: "2026-07-28T00:00:00Z",
        },
        contentSchema,
      ),
    /verified content requires sources/,
  );
  assert.throws(
    () =>
      validateContentEntry(
        {
          ...legacy,
          productionCutoverAllowed: true,
        },
        contentSchema,
      ),
    /must block cutover/,
  );
});

test("shared design tokens are present and CSS-synchronized", () => {
  assert.ok(report.designTokens >= 20);
});

test("account redirect preserves only a safe relative return path", () => {
  const redirect = buildAccountRedirect(
    "https://safrway.online/account/?return_to=%2Faccount%2Forders%2F",
    redirectContract,
  );

  assert.equal(redirect.status, 307);
  assert.equal(
    redirect.location,
    "https://app.safrway.online/account/?return_to=%2Faccount%2Forders%2F",
  );
});

test("account redirect drops secrets and unsafe return paths", () => {
  const redirect = buildAccountRedirect(
    "https://safrway.online/account/?access_token=secret&return_to=https%3A%2F%2Fevil.example",
    redirectContract,
  );

  assert.equal(redirect.location, "https://app.safrway.online/account/");
  assert.ok(!redirect.location.includes("secret"));
  assert.equal(safeAccountReturnPath("/account/../admin/"), null);
  assert.equal(safeAccountReturnPath("//evil.example/account/"), null);
});

test("production redirect stays temporary until cutover enables 308", () => {
  const current = buildAccountRedirect(
    "https://safrway.online/account/",
    redirectContract,
    { environment: "production" },
  );
  const enabled = buildAccountRedirect(
    "https://safrway.online/account/",
    { ...redirectContract, productionStatusEnabled: true },
    { environment: "production" },
  );

  assert.equal(current.status, 307);
  assert.equal(enabled.status, 308);
});

test("all four surfaces consume one canonical pricing projection", async () => {
  const developmentRoot = new URL("../../", import.meta.url);
  const [botRuntime, reactRuntime, astroRuntime, visaSource, housingSource, botI18n, guideSource] =
    await Promise.all([
      readFile(new URL("bot/app/services/exchange_rates.py", developmentRoot), "utf8"),
      readFile(new URL("react-app/src/pricing/runtime.tsx", developmentRoot), "utf8"),
      readFile(new URL("astro-site/src/client/pricing.js", developmentRoot), "utf8"),
      readFile(new URL("bot/app/content/visas.json", developmentRoot), "utf8"),
      readFile(new URL("bot/app/content/housing.json", developmentRoot), "utf8"),
      readFile(new URL("shared/src/i18n/bot.ts", developmentRoot), "utf8"),
      readFile(new URL("shared/src/guides/all-indonesia.ts", developmentRoot), "utf8"),
    ]);

  for (const runtime of [botRuntime, reactRuntime, astroRuntime]) {
    assert.match(runtime, /\/api\/catalog\/pricing/);
  }
  assert.doesNotMatch(botRuntime, /indodax/i);

  const retiredCommercialCopies = [
    /\$30(?!\d)/,
    /\$50(?!\d)/,
    /\$150(?!\d)/,
    /12\.000\.000 IDR/,
    /7\.500\.000 IDR/,
    /5\.500\.000 IDR/,
    /2\.500\.000 IDR/,
    /800\.000 IDR/,
  ];
  for (const source of [visaSource, housingSource, botI18n, guideSource]) {
    for (const legacyPrice of retiredCommercialCopies) {
      assert.doesNotMatch(source, legacyPrice);
    }
  }
});
