import assert from "node:assert/strict";
import test from "node:test";
import { accountRouteTab, clientNavigationTab, clientNavigationTabs, miniRouteSegments } from "../src/components/client-navigation";

test("neutral cabinet entry opens My life on Mini and web", () => {
  assert.deepEqual(miniRouteSegments("", ""), ["life"]);
  assert.deepEqual(miniRouteSegments("#/", ""), ["life"]);
  assert.equal(accountRouteTab("/account/"), "life");
  assert.equal(accountRouteTab("/account"), "life");
});

test("explicit Mini routes and screen links retain their destination", () => {
  assert.deepEqual(miniRouteSegments("#/home", ""), ["home"]);
  assert.deepEqual(miniRouteSegments("#/services/bali/visas", "?screen=life"), ["services","bali","visas"]);
  assert.deepEqual(miniRouteSegments("", "?screen=orders"), ["orders"]);
  assert.deepEqual(miniRouteSegments("#/visas", ""), ["visas"]);
});

test("old profile/life links remain valid aliases", () => {
  assert.deepEqual(miniRouteSegments("#/profile/life", ""), ["life"]);
  assert.deepEqual(miniRouteSegments("", "?screen=profile/life"), ["life"]);
  assert.equal(accountRouteTab("/account/profile/life/"), "life");
});

test("explicit web routes preserve orders, visa details and profile tools", () => {
  for(const tab of ["orders","visas","home","points","referrals","overview","profile"] as const) assert.equal(accountRouteTab(`/account/${tab}/`), tab);
  assert.equal(accountRouteTab("/account/", "#orders"), "orders");
  assert.equal(accountRouteTab("/account/services/bali/exchange/usdt-idr/"), "services");
});

test("My life is the center of five destinations; requests and visas stay reachable under their parent", () => {
  assert.deepEqual(clientNavigationTabs, ["home","services","life","profile","support"]);
  assert.equal(clientNavigationTab("orders"), "services");
  assert.equal(clientNavigationTab("visas"), "life");
  assert.equal(clientNavigationTab("points"), "profile");
});
