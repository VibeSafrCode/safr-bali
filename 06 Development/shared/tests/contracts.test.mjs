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
