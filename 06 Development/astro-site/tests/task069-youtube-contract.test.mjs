import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentRoot = new URL("../../", import.meta.url);

test("Home ships three canonical videos without an eager third-party iframe", async () => {
  const [home, youtube] = await Promise.all([
    readFile(new URL("astro-site/src/components/HomeExperience.astro", developmentRoot), "utf8"),
    readFile(new URL("astro-site/src/client/youtube.js", developmentRoot), "utf8"),
  ]);
  for (const videoId of ["OmlTDy12UQ4", "tIc53sL41VE", "keMTgU0CZbE"]) {
    assert.match(home, new RegExp(videoId));
  }
  assert.doesNotMatch(home, /<iframe/i);
  assert.match(youtube, /www\.youtube-nocookie\.com\/embed\/\$\{videoId\}/);
  assert.match(youtube, /VIDEO_ID\.test\(videoId\)/);
  assert.doesNotMatch(youtube, /youtube\.com\/embed/);
});

test("every public Nginx variant permits only the privacy-enhanced YouTube frame origin", async () => {
  const paths = [
    "deploy/nginx/safr-web.conf",
    "deploy/nginx/safr-target-production.conf",
    "deploy/nginx/safr-astro-site.preview.conf",
    "deploy/nginx/safr-closed-preview.conf.template",
  ];
  for (const path of paths) {
    const config = await readFile(new URL(path, developmentRoot), "utf8");
    assert.match(config, /frame-src https:\/\/www\.youtube-nocookie\.com;/, path);
    assert.doesNotMatch(config, /frame-src[^;]*youtube\.com(?:[ ;])/i, path);
  }
});
