import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NEXT_PUBLIC_SITE_URL = "https://safrway.online";

const {
  classifyRoute,
  indexableSiteRoutes,
  publicRoutePolicies,
} = await import("../lib/route-policy");

const frozenRoutes = JSON.parse(
  await readFile(new URL("./public-routes.json", import.meta.url), "utf8"),
) as Array<{ buildPath: string; publicUrl: string }>;

test("typed route policy covers the frozen 47-page public surface", () => {
  const policies = publicRoutePolicies();
  assert.equal(policies.length, 47);
  assert.deepEqual(
    policies.map(({ buildPath, publicUrl }) => ({ buildPath, publicUrl })),
    frozenRoutes,
  );
});

test("route classes keep private, public-noindex and API surfaces separate", () => {
  assert.equal(classifyRoute("/"), "indexable");
  assert.equal(classifyRoute("/bali/visas/"), "indexable");
  assert.equal(classifyRoute("/privacy/"), "public_noindex");
  assert.equal(classifyRoute("/account/"), "private_noindex");
  assert.equal(classifyRoute("/mini-app/"), "private_noindex");
  assert.equal(classifyRoute("/auth/callback/"), "private_noindex");
  assert.equal(classifyRoute("/api/v1/mini-app/me"), "api");
});

test("sitemap candidates contain only indexable website routes", () => {
  const routes = indexableSiteRoutes();
  assert.equal(routes.length, 44);
  assert.equal(routes.every((route) => route.routeClass === "indexable"), true);
  assert.equal(
    routes.every((route) => route.publicUrl.startsWith("https://safrway.online/")),
    true,
  );
  assert.equal(
    routes.some((route) => /account|mini-app|privacy/.test(route.buildPath)),
    false,
  );
});
