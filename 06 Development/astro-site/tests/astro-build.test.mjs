import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {publicEntryForRoute} from "../scripts/registry-publication.mjs";
import {publicSiteEntries,publicSiteAlternates} from '../src/lib/public-site-publication.ts';
import {publicTenLocaleApprovedRoutes} from '../src/lib/public-ten-locale-publication.mjs';
import {validatePublicJavascriptBudget,validatePublicCssBudget} from './fixtures/public-asset-budgets.mjs';
import {publicInteractionCaptionPayload,serializePublicInteractionCaptions} from '../src/lib/public-interactions.mjs';

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
const localizedRoutes = routes.flatMap((route) => [
  route,
  route === "/" ? "/en/" : `/en${route}`,
]);
// The fixed Owner grant supersedes the historical RU/EN-only 626-route union.
// Derive expected membership from that independently pinned approval, never
// from the emitted sitemap or from whichever output files happen to exist.
const approvedRoutes=publicTenLocaleApprovedRoutes();
const allPublicRoutes=approvedRoutes.map(row=>row.route);
const currentSources=new Map(publicSiteEntries().map(row=>[row.route,row]));
assert.equal(allPublicRoutes.length,1070);
assert.equal(new Set(allPublicRoutes).size,1070);
assert.deepEqual([...currentSources.keys()].sort(),[...allPublicRoutes].sort());
const legacyVisaRoutes = routes.filter((route) =>
  route.startsWith("/bali/visas/"),
);
const expectedIndexedRoutes=new Set(allPublicRoutes);

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

const visibleText = html => html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/g, "")
  .replace(/<[^>]*>/g, " ");
const decodeAttribute=value=>value.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex??dec,hex?16:10)))
  .replace(/&(amp|lt|gt|quot|apos);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[name]);

test('both layouts emit exactly the current locale captions, never the full ten-language source in browser code',async()=>{
  for(const route of allPublicRoutes){
    const html=await htmlFor(route),locale=currentSources.get(route).locale;
    const tags=[...html.matchAll(/<script\b([^>]*)data-public-interaction-captions([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(tags.length,1,route);assert.match(tags[0][1]+tags[0][2],/type="application\/json"/);
    assert.equal(tags[0][3],serializePublicInteractionCaptions(locale),route);
    assert.deepEqual(JSON.parse(tags[0][3]),publicInteractionCaptionPayload(locale));
  }
  const scripts=(await filesRecursively(distRoot)).filter(file=>/\.(?:js|mjs)$/.test(file));
  for(const file of scripts){
    const code=await readFile(file,'utf8');
    assert.doesNotMatch(code,/SOURCE_PINNED_PUBLIC_INTERACTION_REUSE|PUBLIC_CLIENT_INTERACTION_CAPTIONS_ONLY_NO_ADMIN_OR_ARTICLES/);
    // A fixed non-Latin source string detects accidental data import even if
    // a future bundler removes metadata while preserving the full dictionary.
    assert.ok(!code.includes(publicInteractionCaptionPayload('ja').values['support.description']),file);
  }
});

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

test("Astro emits 50 RU and 50 EN public documents and leaves catalog to the coupled redirect", async () => {
  assert.equal(routes.length, 50);
  assert.equal(localizedRoutes.length, 100);
  for (const route of allPublicRoutes) {
    assert.equal((await stat(outputPath(route))).isFile(), true, route);
  }
  await assert.rejects(stat(outputPath("/catalog/")));
  assert.equal(contract.counts.astroPublicDiscoverySurfaces, 51);
});

test("every localized public route has unique SEO, one H1 and safe locale metadata", async () => {
  const titles = new Set();
  const descriptions = new Set();
  const originalTitles=new Set(),originalDescriptions=new Set();
  for (const route of allPublicRoutes) {
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
    const supplied = publicEntryForRoute(route);
    const current=currentSources.get(route);
    // Supplied, version-bound localized SEO is preserved byte-for-byte, not
    // truncated to the old static-summary recommendation of 180 characters.
    assert.ok(description.length > 0, route);
    if(!supplied)assert.equal(decodeAttribute(description),current.page.description,route);
    assert.equal(canonical, new URL(route, "https://safrway.online").toString());
    assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${current.locale}"`));
    assert.match(html, new RegExp(`dir="${current.locale==='ar'?'rtl':'ltr'}"`));
    const alternates=[...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
      .map(([,locale,href])=>({locale,href}));
    const expected=publicSiteAlternates(route).map(row=>({locale:row.locale,href:new URL(row.href,'https://safrway.online').href}));
    assert.equal(expected.length,11,route);
    const byLocale=(a,b)=>a.locale.localeCompare(b.locale);
    assert.deepEqual(alternates.sort(byLocale),expected.sort(byLocale),route);
    // Different language routes may retain identical Founder-approved proper
    // names. Keep uniqueness within each language and the original RU/EN set.
    const titleKey=current.locale+'\0'+title,descriptionKey=current.locale+'\0'+description;
    assert.ok(!titles.has(titleKey), `duplicate ${current.locale} title: ${title}`);
    assert.ok(!descriptions.has(descriptionKey), `duplicate ${current.locale} description: ${route}`);
    titles.add(titleKey);descriptions.add(descriptionKey);
    if(localizedRoutes.includes(route)) {
      assert.ok(!originalTitles.has(title),`duplicate original title: ${title}`);
      assert.ok(!originalDescriptions.has(description),`duplicate original description: ${route}`);
      originalTitles.add(title);originalDescriptions.add(description);
    }
    assert.match(html, /property="og:title"/);
    assert.doesNotMatch(html, /<style\b|\sstyle="/, `${route}: production CSP forbids inline CSS`);
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

test("Founder-approved hub and bot articles are indexable without audit clutter", async () => {
  const sitemap = await readFile(path.join(distRoot, "sitemap.xml"), "utf8");
  assert.equal(legacyVisaRoutes.length, 7);
  for (const route of legacyVisaRoutes.flatMap((route) => [route, `/en${route}`])) {
    const html = await htmlFor(route);
    const eligible=publicEntryForRoute(route)?.indexable??true;
    assert.ok(html.includes('name="robots" content="'+(eligible?'index,follow':'noindex,follow')+'"'));
    assert.doesNotMatch(
      visibleText(html),
      /Версия snapshot|sha256:|PENDING/,
    );
    assert.doesNotMatch(html, /class="legacy-notice"/);
    assert.doesNotMatch(visibleText(html), /\\n/);
    assert.equal(sitemap.includes(`<loc>${new URL(route, "https://safrway.online")}</loc>`), eligible);
    assert.doesNotMatch(html, /data-source-review|data-editorial-content|editorial-provenance/);
  }

  const visa = await htmlFor("/bali/visas/e33g/");
  assert.match(visa, /data-content-id="e33g"/);
  assert.match(visa, /data-service-id="visa"/);
  assert.match(visa, /data-registry-price="e33g_standard"/);
  assert.match(visa, /data-registry-price="e33g_express"/);
  assert.match(visa, /e33g-tariff-grid/);

  assert.ok(sitemap.includes("https://safrway.online/privacy/"));
  assert.ok(sitemap.includes("https://safrway.online/en/privacy/"));
  assert.ok(!sitemap.includes("/account/"));
  assert.ok(!sitemap.includes("/catalog/"));
  assert.ok(!sitemap.includes("app.safrway.online"));
  assert.equal((sitemap.match(/<url>/g) ?? []).length, expectedIndexedRoutes.size,
    "Exact1070 Owner-approved public routes, including privacy; no private surfaces");
});

test("all preserved and approved public routes share robots, canonical, sitemap, alternates and truthful dates", async () => {
  const sitemap = await readFile(path.join(distRoot, "sitemap.xml"), "utf8");
  const entries = new Map([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => [matchOne(m[1], /<loc>([^<]+)<\/loc>/g, "sitemap loc"), m[1]]));
  assert.equal(entries.size, expectedIndexedRoutes.size);
  for (const route of allPublicRoutes) {
    const html = await htmlFor(route);
    const canonical = new URL(route, "https://safrway.online").href;
    const current=currentSources.get(route),eligible=current.page.indexable;
    assert.equal(eligible,true,route);
    assert.equal(matchOne(html, /<meta name="robots" content="([^"]+)"/g, route), eligible ? "index,follow" : "noindex,follow", route);
    assert.equal(entries.has(canonical), eligible, route);
    const schema = JSON.parse(matchOne(html, /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g, route));
    const webPage = schema.find((node) => node["@type"] === "WebPage");
    assert.equal(webPage.url, canonical);
    const lastModified = current.page.publication?.lastmod??current.page.lastModified;
    assert.equal(webPage.dateModified, lastModified, route);
    if (eligible) {
      const xml = entries.get(canonical);
      const date = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)];
      assert.equal(date.length, lastModified ? 1 : 0, route);
      if (date.length) assert.equal(date[0][1], lastModified);
      for (const alternate of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) {
        assert.ok(entries.has(alternate[2]), `${route}: excluded alternate`);
        assert.ok(xml.includes(`hreflang="${alternate[1]}" href="${alternate[2]}"`), route);
      }
    }
  }
});

test("all localized social previews exist as bounded 1200×630 PNG with OG/Twitter parity", async () => {
  const seen = new Set();
  for (const route of localizedRoutes) {
    const html = await htmlFor(route);
    const og = matchOne(html, /<meta property="og:image" content="([^"]+)"/g, route);
    assert.equal(matchOne(html, /<meta name="twitter:image" content="([^"]+)"/g, route), og);
    const imagePath = new URL(og).pathname;
    assert.equal(seen.has(imagePath), false, route);
    seen.add(imagePath);
    const png = await readFile(path.join(distRoot, imagePath));
    assert.equal(png.subarray(1, 4).toString(), "PNG", route);
    assert.equal(png.readUInt32BE(16), 1200, route);
    assert.equal(png.readUInt32BE(20), 630, route);
    assert.ok(png.length < 150_000, `${route}: social preview byte budget`);
  }
});

test("All Indonesia guide is crawlable, downloadable and grounded in visible page copy", async () => {
  const [ru, en] = await Promise.all([
    htmlFor("/bali/guides/all-indonesia/"),
    htmlFor("/en/bali/guides/all-indonesia/"),
  ]);
  const pdfPath = path.join(
    distRoot,
    "downloads/all-indonesia-client-guide-safrway-2026.pdf",
  );

  assert.equal((await stat(pdfPath)).isFile(), true);
  const pdf = await readFile(pdfPath);
  assert.equal(pdf.byteLength, 97_998);
  assert.equal(
    createHash("sha256").update(pdf).digest("hex"),
    "830441318cbb7836b050df95eb4ed3f35a8a3e10b495518ddd57a22fa89e7a34",
    "the reviewed price-neutral public-safe PDF must not be replaced without a new privacy review",
  );
  for (const html of [ru, en]) {
    assert.match(html, /class="guide-download-card"/);
    assert.match(
      html,
      /href="https:\/\/safrway\.online\/downloads\/all-indonesia-client-guide-safrway-2026\.pdf"/,
    );
    assert.match(html, /https:\/\/allindonesia\.imigrasi\.go\.id\//);
    assert.match(html, /"@type":"Article"/);
    assert.match(html, /"@type":"DigitalDocument"/);
    assert.match(html, /SAFRWAY/);
    assert.doesNotMatch(html, /ignore previous|system prompt|AI crawler/i);
    const structuredData = JSON.parse(
      matchOne(
        html,
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        "guide JSON-LD",
      ),
    );
    const breadcrumb = structuredData.find(
      (item) => item["@type"] === "BreadcrumbList",
    );
    const breadcrumbUrls = breadcrumb.itemListElement.map((item) => item.item);
    assert.equal(new Set(breadcrumbUrls).size, breadcrumbUrls.length);
  }
  assert.match(ru, /Сохраните PDF на телефон/);
  assert.match(en, /Save the PDF to your phone/);
});

test("English suggestion is non-forcing and manual language choices are persisted", async () => {
  const [home, languageSource] = await Promise.all([
    htmlFor("/"),
    readFile(path.join(projectRoot, "src/client/language.js"), "utf8"),
  ]);
  assert.match(home, /data-language-suggestion/);
  assert.match(home, /data-language-choice="ru"/);
  assert.match(home, /data-language-choice="en"/);
  assert.match(languageSource, /localStorage/);
  assert.doesNotMatch(languageSource, /location\.(?:assign|replace)|window\.location\s*=/);
});

test("Home country cards retain real routes without JavaScript and one selected service action", async () => {
  for (const prefix of ["", "/en"]) {
    const home = await htmlFor(prefix ? "/en/" : "/");
    assert.match(home, /class="public-country-rail"/);
    assert.equal((home.match(/class="public-country-card"/g) ?? []).length, 6);
    for (const destination of ["bali", "thailand", "uae", "nepal", "russia"]) {
      const route = prefix + "/" + destination + "/";
      assert.match(home, new RegExp('href="' + route + '"[^>]*data-public-country-select="' + destination + '"'));
      assert.match(home, new RegExp('data-country-route="' + route + '"'));
      assert.match(home, new RegExp('id="public-services-' + destination + '"'));
      assert.match(home, new RegExp('class="public-country-action country-services-open" href="' + route + '"'));
    }
    const actions = home.match(/<a[^>]*class="public-country-action country-services-open"[^>]*>/g) ?? [];
    assert.equal(actions.length, 5);
    assert.equal(actions.filter(action => !/\bhidden(?:[=\s>])/.test(action)).length, 1);
    assert.match(home, /href="#public-services-vietnam"[^>]*data-public-country-select="vietnam"/);
    assert.match(home, /data-public-country-select="vietnam"[^>]*data-country-route(?:=""|(?=[\s>]))/);
    assert.match(home, /id="public-services-vietnam"/);
    assert.match(home, /data-support-message="[^"]+(?:Vietnam|Вьетнаме)/);
    assert.doesNotMatch(home, /href="(?:\/en)?\/vietnam\//,
      "Contact-only Vietnam does not invent an empty country route");
    assert.doesNotMatch(home, /class="public-country-details"/);
    assert.doesNotMatch(home, />\s*0[1-4]\s*</);
  }
  assert.match(visibleText(await htmlFor("/")), /Скоро/);
});

test("route classes keep distinct factual jobs and approved artwork", async () => {
  const expectations = new Map([
    ["/bali/", "public-route-country"],
    ["/thailand/", "public-route-country"],
    ["/russia/", "public-route-country"],
    ["/nepal/", "public-route-country"],
    ["/russia/spb/", "public-route-location"],
    ["/russia/ural/", "public-route-location"],
    ["/russia/caucasus/", "public-route-location"],
    ["/bali/housing/", "public-route-collection"],
    ["/bali/housing/villa/", "public-route-leaf"],
    ["/bali/visas/", "public-route-visa-list"],
    ["/bali/visas/e33g/", "public-route-visa-detail"],
    ["/bali/exchange/usdt-idr/", "public-route-calculator-gate"],
    ["/privacy/", "public-route-legal"],
  ]);
  for (const [route, routeClass] of expectations) {
    const html = await htmlFor(route);
    if (publicEntryForRoute(route)) {
      assert.match(html, /<body class="registry-public-page"/);
      assert.match(html, /data-content-id="e33g"/);
    } else assert.match(html, new RegExp(`class="page-shell ${routeClass}"`), route);
  }

  assert.match(await htmlFor("/russia/ural/"), /Лесистые Уральские хребты и река утром/);
  assert.match(await htmlFor("/russia/caucasus/"), /Высокогорная долина Кавказа с рекой/);
  for (const route of [
    "/russia/spb/sup-spb/",
    "/russia/spb/boat-spb/",
    "/russia/spb/fire-spb/",
  ]) {
    const html = await htmlFor(route);
    assert.match(html, /Петропавловская крепость и набережная Невы на рассвете/, route);
    assert.doesNotMatch(html, /Московский Кремль и набережная Москвы-реки/, route);
  }
  for (const route of [
    "/russia/ural/sup-ural/",
    "/russia/ural/rafting-ural/",
    "/russia/ural/fire-ural/",
    "/russia/ural/retreat-ural/",
  ]) {
    const html = await htmlFor(route);
    assert.match(html, /Лесистые Уральские хребты и река утром/, route);
    assert.doesNotMatch(html, /Московский Кремль и набережная Москвы-реки/, route);
  }
  const villa = await htmlFor("/bali/housing/villa/");
  const spbBoat = await htmlFor("/russia/spb/boat-spb/");
  assert.match(villa, /class="public-service-photo"/);
  assert.match(villa, /public-visual-focus-60-16/);
  assert.match(villa, /public-visual-focus-56-48/);
  assert.match(spbBoat, /class="public-service-photo"/);
  assert.match(spbBoat, /public-visual-focus-62-22/);
  assert.match(spbBoat, /public-visual-focus-62-54/);
  assert.doesNotMatch(await htmlFor("/bali/housing/guesthouse/"), /class="public-service-photo"/);
  for (const route of routes) {
    assert.doesNotMatch(await htmlFor(route), /\sstyle=/, `${route} has CSP-blocked inline style`);
  }
});

test("public visa catalog uses the real six-card SoT without unsupported filters", async () => {
  const html = await htmlFor("/bali/visas/");
  assert.match(html, /data-visa-workspace/);
  assert.match(html, /<h1>Визы<\/h1>/);
  assert.match(html, /public-visa-layout/);
  assert.match(html, /public-visa-grid/);
  assert.equal(
    (html.match(/class="catalog-card[^"]*" href="\/bali\/visas\//g) ?? []).length,
    6,
  );
  assert.equal((html.match(/catalog-card-price/g) ?? []).length, 5);
  assert.doesNotMatch(html, /catalog-card-icon/);
  assert.doesNotMatch(html, /ITAS D5|Популярное|Недавние|visa-filter/);
});

test("hidden catalog entries stay routable but never appear in public navigation", async () => {
  const legacyRoute = "/bali/exchange/other-exchange/";
  assert.equal((await stat(outputPath(legacyRoute))).isFile(), true);

  for (const route of routes.filter((candidate) => candidate !== legacyRoute)) {
    const html = await htmlFor(route);
    assert.doesNotMatch(
      html,
      /href="\/bali\/exchange\/other-exchange\/"|Другой обмен/,
      `${route} exposes a navigation entry that must remain hidden`,
    );
  }
});

test("public exchange calculator route restores auth and links the browser calculator", async () => {
  const html = await htmlFor("/bali/exchange/usdt-idr/");
  const header = html.indexOf("exchange-login-intro");
  const cta = html.indexOf("exchange-login-cta");
  const support = html.indexOf("manager-cta");

  assert.ok(header >= 0);
  assert.ok(cta > header);
  assert.ok(support > cta);
  assert.match(html, /href="\/api\/web\/auth\/start\?return_to=%2F"/);
  assert.match(html, /data-signed-in-href="https:\/\/app\.safrway\.online\/calculator\/"/);
  assert.match(html, /href="\/api\/web\/account-redirect"[^>]*data-exchange-account-action/);
  assert.match(html, /Расчёт доступен после входа/);
  assert.doesNotMatch(html, /api\/public\/exchange|data-public-exchange-calculator/);
});

test("all internal links resolve to Astro HTML or one account redirect", async () => {
  const known = new Set(allPublicRoutes);
  for (const route of allPublicRoutes) {
    const html = await htmlFor(route);
    for (const match of html.matchAll(/<a[^>]+href="([^"]+)"/g)) {
      const href = match[1];
      if (href.startsWith("#")) continue;
      if (href.startsWith("https://t.me/")) continue;
      if (href.startsWith("https://safrway.online/")) {
        const sourceUrl = new URL(href);
        assert.ok(
          known.has(sourceUrl.pathname) || (sourceUrl.pathname.startsWith("/downloads/") &&
            (await stat(path.join(distRoot,sourceUrl.pathname))).isFile()),
          `${route} links to an unknown SAFRWAY source ${href}`,
        );
        continue;
      }
      if (href.startsWith("https://")) {
        assert.doesNotThrow(() => new URL(href));
        continue;
      }
      assert.ok(href.startsWith("/"), `${route} has nonlocal href ${href}`);
      assert.ok(
        known.has(new URL(href, "https://safrway.online").pathname) || ["/uae/", "/en/uae/", "/uae/services/", "/en/uae/services/"].includes(new URL(href, "https://safrway.online").pathname) || href === "/account/" || href.startsWith("/api/web/"),
        `${route} links to an unbuilt route ${href}`,
      );
    }
    const telegramLinks = [...html.matchAll(/href="(https:\/\/t\.me\/[^"]+)"/g)];
    const fallbackLinks = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].flatMap((m) => [...m[1].matchAll(/href="(https:\/\/t\.me\/[^"]+)"/g)]);
    assert.ok(telegramLinks.length >= 1 + fallbackLinks.length, route);
    for (const link of telegramLinks) assert.equal(link[1], "https://t.me/safr_bali_bot");
    assert.match(html, /class="support-channel support-channel-telegram"/);
    assert.doesNotMatch(html, /[?&]start=/);
  }
});

test("public scripts comply with the production CSP and keep ordinary page scrolling intact", async () => {
  const [home, source, homeSource, homeScript, supportScript, css] = await Promise.all([
    htmlFor("/"),
    readFile(
      path.join(projectRoot, "src/components/SupportLauncher.astro"),
      "utf8",
    ),
    readFile(
      path.join(projectRoot, "src/components/HomeExperience.astro"),
      "utf8",
    ),
    readFile(path.join(projectRoot, "src/client/home.js"), "utf8"),
    readFile(path.join(projectRoot, "src/client/support.js"), "utf8"),
    readFile(path.join(projectRoot, "src/styles/global.css"), "utf8"),
  ]);
  assert.match(home, /data-support-launcher/);
  assert.match(source, /<script>\s*import\s+['"]\.\.\/client\/support\.js['"];?\s*<\/script>/);
  assert.doesNotMatch(source, /support\.js\?url/);
  assert.match(homeSource, /home\.js\?url&no-inline/);
  const homeAsset = matchOne(
    home,
    /<script type="module" src="(\/_astro\/home\.[A-Za-z0-9_-]+\.js)"><\/script>/g,
    "Home fingerprinted browser asset",
  );
  // Astro processes the entry so its shared insurance import is bundled. Match
  // the actual emitted support behavior, not an old raw ?url filename/byte copy.
  const moduleAssets = [...home.matchAll(/<script\b[^>]*\bsrc="(\/_astro\/[^"/]+\.js)"[^>]*><\/script>/g)].map(match => match[1]);
  const supportAssets = [];
  for (const asset of moduleAssets) {
    const code = await readFile(path.join(distRoot, asset.slice(1)), "utf8");
    if (code.includes("data-support-launcher")) supportAssets.push({asset,code});
  }
  assert.equal(supportAssets.length, 1, "exactly one processed fingerprinted support entry");
  const emittedSupport = supportAssets[0].code;
  assert.equal(
    await readFile(path.join(distRoot, homeAsset.slice(1)), "utf8"),
    homeScript,
  );
  assert.match(emittedSupport, /\/api\/web\/chat\/guest/);
  assert.doesNotMatch(emittedSupport, /(?:\.\.\/)+shared\/src\/insurance/);
  await assert.rejects(stat(path.join(distRoot, "home.js")));
  await assert.rejects(stat(path.join(distRoot, "support.js")));
  assert.doesNotMatch(home, /src="(?:\/home\.js|\/support\.js|data:)/);
  assert.match(homeScript, /data-public-country/);
  assert.match(supportScript, /fetch\(['"]\/api\/web\/chat\/guest['"]/);
  assert.doesNotMatch(home, /<script type="module">/);
  assert.doesNotMatch(source, /document\.body\.style\.overflow|overflow-hidden/);
  assert.doesNotMatch(
    supportScript,
    /document\.body\.style\.overflow|overflow-hidden/,
  );
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow:\s*hidden/s);
});

test("production artifacts stay secret-free and inside public budgets", async () => {
  const files = await filesRecursively(distRoot);
  const jsFiles = files.filter((file) => /\.(?:js|mjs)$/.test(file));
  const cssFiles = files.filter((file) => file.endsWith(".css"));
  // 05's follow-up replaces the old28KB full-language package with two exact
  // data-free reader/loader assets. All per-file limits apply to every asset;
  // remaining aggregate75K/28K and tightened full81864/31649 are independent.
  // Full recursive inventory, CSS/secrets and Lighthouse35000 stay unchanged.
  validatePublicJavascriptBudget(await Promise.all(jsFiles.map(async file=>({
    name:path.relative(distRoot,file).split(path.sep).join('/'),bytes:await readFile(file),
  }))),await readFile(path.join(developmentRoot,'shared/content/client-ui/public-interactions.v1.json')));
  // New fixed candidate baseline, not a claim of old production-byte parity.
  // One exact CSS asset may be160840/26973; total180000/32000 is unchanged.
  validatePublicCssBudget(await Promise.all(cssFiles.map(async file=>({
    name:path.relative(distRoot,file).split(path.sep).join('/'),bytes:await readFile(file),
  }))));

  const serialized = (
    await Promise.all(files.map((file) => readFile(file).catch(() => Buffer.of())))
  )
    .map((value) => value.toString("utf8"))
    .join("\n");
  assert.ok(!serialized.includes("localhost"));
  assert.ok(!serialized.includes(":8081"));
  assert.ok(!/BOT_TOKEN|DATABASE_URL|SESSION_SECRET|CLIENT_SECRET/.test(serialized));
});

test("emitted browser modules never import unreachable repository sources", async () => {
  const assets = (await filesRecursively(distRoot)).filter(file => /\.(?:js|mjs)$/.test(file));
  for (const asset of assets) {
    const code = await readFile(asset, "utf8");
    // Raw ?url assets retain their source bytes. Static import/export targets
    // must still resolve in dist; a source-only TS path breaks the whole entry.
    const references = [...code.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g)]
      .map(match => match[1]);
    for (const reference of references) {
      assert.ok(reference.startsWith(".") || reference.startsWith("/"), `unbundled/external import in ${path.basename(asset)}: ${reference}`);
      const target = reference.startsWith("/") ? path.resolve(distRoot, "." + reference) : path.resolve(path.dirname(asset), reference);
      assert.ok(target.startsWith(distRoot + path.sep), `import escaped public dist: ${reference}`);
      assert.ok(/\.(?:js|mjs)$/.test(target), `browser module imports non-JS source: ${reference}`);
      assert.ok((await stat(target)).isFile(), `missing browser import in ${path.basename(asset)}: ${reference}`);
    }
  }
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
