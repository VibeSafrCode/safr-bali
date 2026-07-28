import assert from "node:assert/strict";
import test from "node:test";

import { catalogSnapshotMeta, destinations } from "../src/catalog";

test("React reads the immutable shared B4 catalog snapshot", () => {
  assert.match(catalogSnapshotMeta.id, /^catalog-runtime-v1-[a-f0-9]{12}$/);
  assert.match(catalogSnapshotMeta.revision, /^sha256:[a-f0-9]{64}$/);
});

test("React catalog preserves all four current bot directions", () => {
  assert.deepEqual(
    destinations.map((destination) => destination.id),
    ["bali", "thailand", "russia", "nepal"],
  );
});

test("Bali catalog preserves independent service and detail screens", () => {
  const bali = destinations.find((destination) => destination.id === "bali");
  assert.ok(bali);
  assert.deepEqual(
    bali.services.map((service) => service.id),
    ["visas", "housing", "exchange", "assistant"],
  );
  const visas = bali.services.find((service) => service.id === "visas");
  assert.ok(visas?.children?.some((item) => item.id === "e33g"));
  assert.ok(visas?.children?.some((item) => item.id === "d12"));
  assert.ok(visas?.children?.some((item) => item.id === "voa"));
});
