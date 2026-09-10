import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const comparison = JSON.parse(
  await readFile(
    new URL("../artifacts/build-comparison.json", import.meta.url),
    "utf8",
  ),
);

test("both static exporters preserve all 49 reference routes semantically", () => {
  assert.equal(comparison.routesCompared, 49);
  assert.deepEqual(comparison.semanticMismatches, []);
});

for (const variant of ["vinext", "next"]) {
  test(`${variant} static export passes without warnings`, () => {
    assert.equal(comparison.variants[variant].htmlCount >= 50, true);
    assert.equal(comparison.variants[variant].outputBytes > 0, true);
    assert.equal(comparison.variants[variant].clientJavaScriptBytes > 0, true);
    assert.deepEqual(comparison.variants[variant].warnings, []);
  });
}
