import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const dist = new URL("../dist/", import.meta.url);
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
for (const route of ["", "en/", "bali/", "en/bali/", "uae/", "en/uae/"]) {
  test(`${route || "/"} serves dimensioned responsive approved images`, async () => {
    const html = await readFile(new URL(`${route}index.html`, dist), "utf8");
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
    const home = route === "" || route === "en/";
    const backdrops = images.filter(tag => attribute(tag, "data-world-image"));
    assert.equal(backdrops.length, home ? 5 : 1);
    assert.equal(images.length, home ? 11 : 1, "five cards, five backdrop choices and one channel feature on home");
    assert.equal(backdrops.filter(tag => attribute(tag, "src")).length, 1, "only the selected backdrop downloads before selection");
    for (const image of images) {
      const backdrop = attribute(image, "data-world-image");
      const src = attribute(image, "src") ?? attribute(image, "data-world-src");
      assert.ok(Number(attribute(image, "width")) > 0);
      assert.ok(Number(attribute(image, "height")) > 0);
      assert.ok(attribute(image, "sizes"));
      assert.match(src ?? "", /^\/_astro\/.*\.webp$/);
      const candidates = (attribute(image, "srcset") ?? attribute(image, "data-world-srcset"))?.split(",").map((entry) => entry.trim());
      assert.ok(candidates?.length >= 3, "multiple device widths, not one oversized image");
      for (const candidate of candidates) {
        const [url, width] = candidate.split(/\s+/);
        assert.match(url, /^\/_astro\/[^/]+\.webp$/);
        assert.match(width, /^\d+w$/);
        const bytes = await readFile(new URL(url.slice(1), dist));
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
        if (Number.parseInt(width, 10) <= 320 || (backdrop && Number.parseInt(width, 10) <= 480)) assert.ok(bytes.length < 40_000, "small device images must not carry original-size payloads");
        if (backdrop) assert.ok(bytes.length < 230_000, "even desktop backdrops remain bounded");
      }
    }
  });
}
