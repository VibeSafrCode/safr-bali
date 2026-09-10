import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../dist/", import.meta.url);
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

for (const route of ["", "en/", "bali/", "en/bali/"]) {
  test(`${route || "/"} serves dimensioned responsive approved images`, async () => {
    const html = await readFile(new URL(`${route}index.html`, dist), "utf8");
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag)
      .filter((tag) => attribute(tag, "src")?.includes("country-hero-approved"));
    assert.equal(images.length, route.endsWith("bali/") ? 1 : 4);
    for (const image of images) {
      assert.ok(Number(attribute(image, "width")) > 0);
      assert.ok(Number(attribute(image, "height")) > 0);
      assert.ok(attribute(image, "sizes"));
      assert.match(attribute(image, "src") ?? "", /^\/_astro\/.*\.webp$/);
      const candidates = attribute(image, "srcset")?.split(",").map((entry) => entry.trim());
      assert.ok(candidates?.length >= 3, "multiple device widths, not one oversized JPEG");
      for (const candidate of candidates) {
        const [url, width] = candidate.split(/\s+/);
        assert.match(url, /^\/_astro\/[^/]+\.webp$/);
        assert.match(width, /^\d+w$/);
        const bytes = await readFile(new URL(url.slice(1), dist));
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
        if (Number.parseInt(width, 10) <= 320) {
          assert.ok(bytes.length < 40_000, "small country cards must not carry original-size payloads");
        }
      }
    }
  });
}
