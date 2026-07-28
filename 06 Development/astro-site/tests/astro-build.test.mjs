import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const developmentRoot = path.resolve(projectRoot, "..");
const distRoot = path.join(projectRoot, "dist");
const contract = JSON.parse(
  await readFile(
    path.join(developmentRoot, "shared/contracts/ecosystem-routes.v1.json"),
    "utf8",
  ),
);
const routes = contract.astroPublicRoutes;
const legacyVisaRoutes = routes.filter((route) =>
  route.startsWith("/directions/bali/visas/"),
);

function outputPath(route) {
  return route === "/"
    ? path.join(distRoot, "index.html")
    : path.join(distRoot, route.slice(1), "index.html");
}

async function htmlFor(route) {
  return readFile(outputPath(route), "utf8");
}

function matchOne(html, expression, label) {
  const matches = [...html.matchAll(expression)];
  assert.equal(matches.length, 1, `${label} must occur exactly once`);
  return matches[0][1];
}

async function filesRecursively(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesRecursively(target)));
    else files.push(target);
  }
  return files;
}

test("Astro emits all 45 contracted public HTML routes", async () => {
  assert.equal(routes.length, 45);
  for (const route of routes) {
    assert.equal((await stat(outputPath(route))).isFile(), true, route);
  }
});

test("every public route has unique SEO, one H1 and safe canonical", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const route of routes) {
    const html = await htmlFor(route);
    const title = matchOne(html, /<title>([^<]+)<\/title>/g, `${route} title`);
    const description = matchOne(
      html,
      /<meta name="description" content="([^"]+)"/g,
      `${route} description`,
    );
    const canonical = matchOne(
      html,
      /<link rel="canonical" href="([^"]+)"/g,
      `${route} canonical`,
    );
    matchOne(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g, `${route} H1`);
    assert.ok(description.length >= 50, route);
    assert.ok(description.length <= 180, route);
    assert.equal(canonical, new URL(route, "https://safrway.online").toString());
    assert.ok(!titles.has(title), `duplicate title: ${title}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${route}`);
    titles.add(title);
    descriptions.add(description);
    assert.match(html, /property="og:title"/);
    assert.match(html, /type="application\/ld\+json"/);
    for (const block of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      assert.doesNotThrow(() => JSON.parse(block[1]));
    }
    assert.ok(!html.includes("localhost"));
    assert.ok(!html.includes(":8081"));
  }
});

test("legacy visa routes remain noindex and absent from sitemap", async () => {
  const sitemap = await readFile(path.join(distRoot, "sitemap.xml"), "utf8");
  assert.equal(legacyVisaRoutes.length, 7);
  for (const route of legacyVisaRoutes) {
    const html = await htmlFor(route);
    assert.match(html, /name="robots" content="noindex,follow"/);
    assert.match(html, /Статус материала: нужны источники/);
    assert.match(html, /Дата официальной проверки/);
    assert.match(html, /Ещё не установлена/);
    assert.match(html, /Официальные источники/);
    assert.ok(!sitemap.includes(new URL(route, "https://safrway.online")));
  }
  assert.ok(!sitemap.includes("/privacy/"));
  assert.ok(!sitemap.includes("/account/"));
  assert.ok(!sitemap.includes("app.safrway.online"));
});

test("all internal links resolve to Astro HTML or one account redirect", async () => {
  const known = new Set(routes);
  for (const route of routes) {
    const html = await htmlFor(route);
    for (const match of html.matchAll(/<a[^>]+href="([^"]+)"/g)) {
      const href = match[1];
      if (href.startsWith("#")) continue;
      if (href.startsWith("https://t.me/")) continue;
      assert.ok(href.startsWith("/"), `${route} has nonlocal href ${href}`);
      assert.ok(
        known.has(href) || href === "/account/",
        `${route} links to an unbuilt route ${href}`,
      );
    }
    const telegramLinks = [...html.matchAll(/href="(https:\/\/t\.me\/[^"]+)"/g)];
    assert.equal(telegramLinks.length, 1, route);
    assert.match(html, />\s*Перейти в Telegram\s*<\/a>/);
    assert.doesNotMatch(html, /[?&]start=/);
  }
});

test("public support is explicit and keeps ordinary page scrolling intact", async () => {
  const [home, source, css] = await Promise.all([
    htmlFor("/"),
    readFile(
      path.join(projectRoot, "src/components/SupportLauncher.astro"),
      "utf8",
    ),
    readFile(path.join(projectRoot, "src/styles/global.css"), "utf8"),
  ]);
  assert.match(home, /data-support-launcher/);
  assert.match(source, /fetch\("\/api\/web\/chat\/guest"/);
  assert.doesNotMatch(source, /document\.body\.style\.overflow|overflow-hidden/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow:\s*hidden/s);
});

test("production artifacts stay secret-free and inside public budgets", async () => {
  const files = await filesRecursively(distRoot);
  const jsFiles = files.filter((file) => file.endsWith(".js"));
  const cssFiles = files.filter((file) => file.endsWith(".css"));
  const jsBytes = (
    await Promise.all(jsFiles.map(async (file) => (await stat(file)).size))
  ).reduce((total, value) => total + value, 0);
  const cssBytes = (
    await Promise.all(cssFiles.map(async (file) => (await stat(file)).size))
  ).reduce((total, value) => total + value, 0);
  assert.ok(jsBytes < 15_000, `JS budget exceeded: ${jsBytes}`);
  assert.ok(cssBytes < 50_000, `CSS budget exceeded: ${cssBytes}`);

  const serialized = (
    await Promise.all(files.map((file) => readFile(file).catch(() => Buffer.of())))
  )
    .map((value) => value.toString("utf8"))
    .join("\n");
  assert.ok(!serialized.includes("localhost"));
  assert.ok(!serialized.includes(":8081"));
  assert.ok(!/BOT_TOKEN|DATABASE_URL|SESSION_SECRET|CLIENT_SECRET/.test(serialized));
});

test("robots policy and 404 artifact are explicit", async () => {
  const robots = await readFile(path.join(distRoot, "robots.txt"), "utf8");
  const notFound = await readFile(path.join(distRoot, "404.html"), "utf8");
  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
  assert.match(robots, /Sitemap: https:\/\/safrway\.online\/sitemap\.xml/);
  assert.match(notFound, /name="robots" content="noindex,follow"/);
  assert.match(notFound, /Такой страницы нет/);
});
