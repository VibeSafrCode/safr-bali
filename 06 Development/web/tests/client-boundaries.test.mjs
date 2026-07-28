import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const variants = [
  resolve("artifacts/build-vinext-export"),
  resolve("artifacts/build-next-export"),
];

async function loadedJavaScript(buildRoot, htmlPath) {
  const html = await readFile(resolve(buildRoot, htmlPath), "utf8");
  const sourcePaths = [
    ...html.matchAll(
      /<(?:script|link)[^>]+(?:src|href)=["']([^"']+\.js)["']/gi,
    ),
  ].map((match) => match[1]);
  const sources = await Promise.all(
    sourcePaths.map((path) =>
      readFile(resolve(buildRoot, path.replace(/^\//, "")), "utf8"),
    ),
  );
  return sources.join("\n");
}

for (const buildRoot of variants) {
  const variant = buildRoot.split("/").at(-1);
  const isVinext = variant === "build-vinext-export";

  test(`${variant} keeps the website manager widget out of Mini App JavaScript`, async () => {
    const miniAppSurface = isVinext
      ? await readFile(resolve(buildRoot, "mini-app/index.html"), "utf8")
      : await loadedJavaScript(buildRoot, "mini-app/index.html");
    assert.match(miniAppSurface, /MiniAppDashboard|mini-app\/me/);
    assert.doesNotMatch(
      miniAppSurface,
      /ManagerChatWidget|manager-widget|manager-fab/,
    );
  });

  test(`${variant} keeps Telegram WebApp initialization out of website JavaScript`, async () => {
    const websiteSurface = isVinext
      ? await readFile(resolve(buildRoot, "index.html"), "utf8")
      : await loadedJavaScript(buildRoot, "index.html");
    assert.match(websiteSurface, /ManagerChatWidget|manager-widget/);
    assert.doesNotMatch(
      websiteSurface,
      /telegram-web-app\.js|mini-app\/auth\/session|MiniAppDashboard/,
    );
  });
}
