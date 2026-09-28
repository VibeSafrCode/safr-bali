import assert from "node:assert/strict";
import test from "node:test";
import { backdropPosition, loadBackdrop, nightBackdrop } from "../../shared/src/destination-backdrops";

test("backdrop only loads current theme and explicitly falls back on failure", async () => {
  const original = globalThis.Image;
  const calls: string[] = [];
  let rejectNight = false;
  let rejectAll = false;
  class FakeImage {
    src = ""; srcset = ""; sizes = ""; decoding = "";
    get currentSrc() { return this.src; }
    async decode() {
      calls.push(this.src);
      if (rejectAll || (rejectNight && this.src.includes("night"))) throw new Error("Unavailable");
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  try {
    assert.equal(await loadBackdrop("bali", "light", { src: "day.webp" }), "day.webp");
    assert.deepEqual(calls.splice(0), ["day.webp"]);
    assert.equal(await loadBackdrop("bali", "dark", { src: "day.webp" }), nightBackdrop("bali")?.src);
    assert.equal(calls.splice(0).length, 1);
    rejectNight = true;
    assert.equal(await loadBackdrop("bali", "dark", { src: "day.webp" }), "day.webp");
    assert.deepEqual(calls.splice(0), [nightBackdrop("bali")?.src, "day.webp"]);
    rejectAll = true;
    await assert.rejects(loadBackdrop("bali", "dark", { src: "day.webp" }));
  } finally { globalThis.Image = original; }
});

test("only known countries have night assets and focal points are deterministic", () => {
  assert.equal(nightBackdrop("../../unknown"), null);
  assert.equal(backdropPosition("bali", true), "76% 50%");
  assert.equal(backdropPosition("bali", false), "50% 50%");
  assert.equal(backdropPosition("unknown", true), "50% 50%");
});
