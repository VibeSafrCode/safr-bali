import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactRoots = [
  resolve(root, "artifacts", "build-vinext-export"),
  resolve(root, "artifacts", "build-next-export"),
];
const forbiddenNames = [
  /^\.DS_Store$/,
  /^\._/,
  /^\.env(?:\.|$)/,
  /\.(?:pem|key|p12|pfx)$/i,
];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".rsc",
  ".txt",
  ".xml",
]);
const frameworkJavaScriptExtensions = new Set([".js"]);

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(path)));
    else output.push(path);
  }
  return output;
}

function extension(path) {
  const match = path.match(/(\.[^.\/]+)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

for (const artifactRoot of artifactRoots) {
  test(`${basename(artifactRoot)} contains no private or macOS artifacts`, async () => {
    const files = await filesUnder(artifactRoot);

    for (const path of files) {
      assert.equal(
        forbiddenNames.some((pattern) => pattern.test(basename(path))),
        false,
        `forbidden artifact: ${path}`,
      );
    }
  });

  test(`${basename(artifactRoot)} contains no private origins or server secrets`, async () => {
    const files = (await filesUnder(artifactRoot)).filter(
      (path) =>
        textExtensions.has(extension(path)) &&
        !path.endsWith("build.log") &&
        !path.endsWith("build-report.json"),
    );

    for (const path of files) {
      const contents = await readFile(path, "utf8");
      if (frameworkJavaScriptExtensions.has(extension(path))) {
        // Vinext itself contains the generic URL base `http://localhost` for
        // resolving relative URLs during SSR. It is not a public link or an
        // origin used by SAFRWAY. Private origins with a port or path remain
        // forbidden in every JavaScript bundle.
        assert.doesNotMatch(
          contents,
          /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+|\/)/i,
        );
      } else {
        assert.doesNotMatch(contents, /https?:\/\/(?:localhost|127\.0\.0\.1)/i);
      }
      assert.doesNotMatch(contents, /https?:\/\/[^"'\s]+:8081/i);
      assert.doesNotMatch(
        contents,
        /\b(?:DATABASE_URL|TELEGRAM_BOT_TOKEN|ADMIN_API_TOKEN|SERVICE_API_TOKEN)\b/,
      );
      assert.doesNotMatch(contents, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    }
  });
}
