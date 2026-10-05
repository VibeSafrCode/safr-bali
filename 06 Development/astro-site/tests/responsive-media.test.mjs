import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
const dist = new URL("../dist/", import.meta.url);
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
for (const route of ["", "en/", "bali/", "en/bali/", "uae/", "en/uae/"]) {
  test(`${route || "/"} serves dimensioned responsive approved images`, async () => {
    const html = await readFile(new URL(`${route}index.html`, dist), "utf8");
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
    const home = route === "" || route === "en/";
    const backdrops = [...html.matchAll(/<template\b[^>]*data-world-image="[^"]+"[^>]*>/g)].map(([tag]) => tag);
    assert.equal(backdrops.length, home ? 6 : 1);
    assert.equal(images.length, home ? 7 : 0, "six dimensioned country cards and one opt-in playlist poster on home");
    assert.equal(images.filter(tag => attribute(tag, "data-world-image")).length, 0,
      "background choices are inert templates; runtime decodes only the selected day/night variant");
    assert.equal(backdrops.some(tag => /\ssrc=/.test(tag)), false, "inert choices do not cause eager image downloads");
    for(const backdrop of backdrops){
      for(const [name,minimum] of [["data-world-srcset",3],["data-night-srcset",2]]){
        const candidates=attribute(backdrop,name)?.split(",").map(value=>value.trim());
        assert.ok(candidates?.length>=minimum,"day and night backdrops have responsive candidates");
        for(const candidate of candidates){
          const [url,width]=candidate.split(/\s+/);assert.match(url,/^\/_astro\/[^/]+\.webp$/);assert.match(width,/^\d+w$/);
          const bytes=await readFile(new URL(url.slice(1),dist));
          assert.equal(bytes.toString("ascii",8,12),"WEBP");
          const dimensions=await sharp(bytes).metadata();
          assert.equal(dimensions.width,Number.parseInt(width,10));assert.ok(dimensions.height>0);
          if(Number.parseInt(width,10)<=480)assert.ok(bytes.length<40_000,"small backdrops are bounded");
          assert.ok(bytes.length<230_000,"even desktop backdrops remain bounded");
        }
      }
    }
    for (const image of images) {
      if(/\bdata-playlist-poster\b/.test(image)){
        assert.match(attribute(image,"src")??"",/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/);
        assert.equal(attribute(image,"width"),"480");assert.equal(attribute(image,"height"),"360");
        assert.equal(attribute(image,"loading"),"lazy");assert.equal(attribute(image,"referrerpolicy"),"no-referrer");
        continue;
      }
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
