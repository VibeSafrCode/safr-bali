import assert from "node:assert/strict";
import test from "node:test";
import { readServicePresence, setServicePresence } from "../src/components/client-service-filter";

test("client service filter keeps search, visa, sort and pagination parameters", () => {
  const params = new URLSearchParams("search=Alex&visa_filter=active&sort=joined_asc&page=2&no_services=true");
  setServicePresence(params, "with");
  assert.equal(params.get("has_services"), "true");
  assert.equal(params.has("no_services"), false);
  assert.equal(params.get("search"), "Alex");
  assert.equal(params.get("visa_filter"), "active");
  assert.equal(params.get("sort"), "joined_asc");
  assert.equal(params.get("page"), "2");
  assert.equal(readServicePresence(params), "with");
  setServicePresence(params, "all");
  assert.equal(readServicePresence(params), "all");
  assert.equal(params.has("has_services"), false);
});

test("legacy without-services aliases are mutually exclusive with positive filter", () => {
  assert.equal(readServicePresence(new URLSearchParams("has_services=false")), "without");
  assert.equal(readServicePresence(new URLSearchParams("no_services=true")), "without");
  const params = setServicePresence(new URLSearchParams("has_services=true"), "without");
  assert.equal(params.toString(), "no_services=true");
});
