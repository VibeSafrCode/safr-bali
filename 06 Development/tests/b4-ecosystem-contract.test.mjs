import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const developmentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const contract = JSON.parse(
  await readFile(
    path.join(developmentRoot, "shared/contracts/ecosystem-routes.v1.json"),
    "utf8",
  ),
);

function astroOutput(route) {
  return route === "/"
    ? path.join(developmentRoot, "astro-site/dist/index.html")
    : path.join(
        developmentRoot,
        "astro-site/dist",
        route.slice(1),
        "index.html",
      );
}

function reactOutput(route) {
  return route === "/"
    ? path.join(developmentRoot, "react-app/dist/index.html")
    : path.join(developmentRoot, "react-app/dist/account/index.html");
}

test("ecosystem artifact contract is exactly 45 Astro plus 2 React routes", async () => {
  assert.equal(contract.astroPublicRoutes.length, 45);
  assert.equal(contract.reactApplicationRoutes.length, 2);
  assert.equal(contract.counts.ecosystem, 47);
  for (const route of contract.astroPublicRoutes) {
    assert.equal((await stat(astroOutput(route))).isFile(), true, route);
  }
  for (const { path: route } of contract.reactApplicationRoutes) {
    assert.equal((await stat(reactOutput(route))).isFile(), true, route);
  }
});

test("account has one preview redirect and never becomes an Astro copy", async () => {
  const [siteConfig, appConfig] = await Promise.all([
    readFile(
      path.join(
        developmentRoot,
        "deploy/nginx/safr-astro-site.preview.conf",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        developmentRoot,
        "deploy/nginx/safr-react-app.preview.conf",
      ),
      "utf8",
    ),
  ]);
  assert.match(
    siteConfig,
    /location = \/account\/\s*\{\s*proxy_pass http:\/\/127\.0\.0\.1:8000\/api\/web\/account-redirect;/s,
  );
  assert.doesNotMatch(siteConfig, /return 308/);
  assert.doesNotMatch(
    siteConfig,
    /return 30[1278][^;]*(?:access_token|session_token|initData)/,
  );
  await assert.rejects(
    stat(path.join(developmentRoot, "astro-site/dist/account/index.html")),
  );
  assert.match(
    appConfig,
    /location ~ \^\/account\/\(\?:\[A-Za-z0-9_-\]\+\/\)\*\$\s*\{\s*try_files \/account\/index\.html =404;/s,
  );
});

test("public and application Nginx candidates keep origin boundaries explicit", async () => {
  const [siteConfig, appConfig] = await Promise.all([
    readFile(
      path.join(
        developmentRoot,
        "deploy/nginx/safr-astro-site.preview.conf",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        developmentRoot,
        "deploy/nginx/safr-react-app.preview.conf",
      ),
      "utf8",
    ),
  ]);
  assert.match(siteConfig, /server_name safrway\.online;/);
  assert.match(siteConfig, /location = \/api\/web\/chat\/guest/);
  assert.match(appConfig, /server_name app\.safrway\.online;/);
  assert.match(appConfig, /location \/\s*\{\s*return 404;/s);
  assert.doesNotMatch(`${siteConfig}\n${appConfig}`, /proxy_pass https?:\/\/[^1]/);
});
