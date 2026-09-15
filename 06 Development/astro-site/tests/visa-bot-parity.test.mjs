import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { getBotVisaCopy } from "../src/lib/visa-bot-copy.ts";
import { visaPriceText } from "../src/lib/visa-price-text.js";
import { getPublicPages } from "../src/lib/public-catalog.ts";
import { applyPublication } from "../src/lib/public-publication.ts";

const routes = [
  ["e33g", "E33G", 2], ["d12", "D12", 4], ["d1-d2", "D1/D2", 12],
  ["c1", "C1", 1], ["voa", "VOA", 1], ["other-visa", "Другая виза", 0],
];
const locales = ["ru", "en"];
const now = Date.parse("2026-09-15T12:00:00Z");
const expiry = now + 15 * 60_000;
const botRoot = fileURLToPath(new URL("../../bot/", import.meta.url));
const fixtureEnvironment = {
  ...process.env, BOT_TOKEN: "123:token", ADMIN_CHAT_ID: "1",
  BACKEND_API_URL: "", BACKEND_SERVICE_TOKEN: "", PYTHONDONTWRITEBYTECODE: "1",
};
const candidates = process.env.BOT_PARITY_PYTHON ? [process.env.BOT_PARITY_PYTHON] : [
  ...(existsSync(`${botRoot}.venv/bin/python`) ? [`${botRoot}.venv/bin/python`] : []),
  "python3",
];
const python = candidates.find((candidate) => spawnSync(candidate, ["-c", "from app.content.visas import get_visa_card"],
  { cwd: botRoot, env: fixtureEnvironment, timeout: 15_000, encoding: "utf8" }).status === 0);
if (process.env.BOT_PARITY_PYTHON) assert.ok(python, "BOT_PARITY_PYTHON must import the bot runtime");

function pricingFixture() {
  const items = routes.flatMap(([, key, count]) => Array.from({ length: count }, (_, index) => ({
    sku: `fixture:${key}:${index}`, entity_type: "VISA", entity_key: key,
    option_code: `option-${index}`, label: { ru: `Вариант ${key} ${index}`, en: `Option ${key} ${index}` },
    amount_idr: String(1_234_567 + index * 101), display_usdt: `${81 + index}.37`,
    show_price: true, sort_order: Math.floor(index / 2),
    fee_note: { ru: `Примечание ${key}`, en: `Fee note ${key}` },
  }))).reverse();
  items.push(
    { ...items[0], sku: "hidden-price", entity_key: "E33G", show_price: false, amount_idr: "999" },
    { ...items[0], sku: "missing-amount", entity_key: "E33G", amount_idr: null },
    { ...items[0], sku: "other-entity", entity_type: "SERVICE", entity_key: "E33G", amount_idr: "888" },
  );
  return { projection_id: "visa-parity-fixture", catalog_version_id: 3, fx_snapshot_id: 7,
    formula_version: "fixture", derived_expires_at: new Date(expiry).toISOString(), items };
}
const projection = pricingFixture();
const scenarios = [
  { name: "fresh", projection, now },
  { name: "expiry-boundary", projection, now: expiry },
  { name: "expired", projection, now: expiry + 1 },
  { name: "outage", projection: null, now },
  { name: "no-published-prices", projection: { ...projection, items: [] }, now },
];

// Executes the real pure rendering code, never handlers, bot sends or backend
// requests. Optional locally; CI can require it by setting BOT_PARITY_PYTHON.
function botCards() {
  const result = spawnSync(python, ["-c", `
import json, sys
from datetime import datetime, timezone
from app.content.visas import get_visa_card, _canonical_price_block
from app.services.exchange_rates import _validated_projection
from app.services.locale import set_current_locale, reset_current_locale
request = json.load(sys.stdin)
result = {}
for scenario in request["scenarios"]:
    clock = datetime.fromtimestamp(scenario["now"] / 1000, tz=timezone.utc)
    projection = _validated_projection(scenario["projection"], now=clock)
    for locale in request["locales"]:
        token = set_current_locale(locale)
        try:
            for key in request["keys"]:
                result[f'{scenario["name"]}:{locale}:{key}'] = {
                    "card": get_visa_card(key, projection),
                    "price": _canonical_price_block(key, projection),
                }
        finally:
            reset_current_locale(token)
print(json.dumps(result, ensure_ascii=False))
`], {
    cwd: botRoot, env: fixtureEnvironment, timeout: 15_000, maxBuffer: 2_000_000,
    encoding: "utf8", input: JSON.stringify({ scenarios, locales, keys: routes.map(([, key]) => key) }),
  });
  assert.equal(result.status, 0, "Real bot rendering subprocess must succeed");
  return JSON.parse(result.stdout);
}

test("all six RU/EN bodies, three disclaimers and full price tiers equal actual bot messages", {
  skip: python ? false : "Python with bot dependencies unavailable; set BOT_PARITY_PYTHON to require this check",
}, () => {
  const expected = botCards();
  for (const scenario of scenarios) for (const locale of locales) for (const [slug, key] of routes) {
    const route = `${locale === "en" ? "/en" : ""}/bali/visas/${slug}/`;
    const copy = getBotVisaCopy(route, locale);
    const price = key === "Другая виза" ? "" : visaPriceText(key, scenario.projection, locale, copy.priceCopy, scenario.now);
    const actual = `${copy.fullBody}\n\n${price}\n\n${copy.disclaimers.join("\n\n")}`;
    const label = `${scenario.name}:${locale}:${key}`;
    assert.equal(price, expected[label].price, `commercial block ${label}`);
    assert.equal(actual, expected[label].card, `complete message ${label}`);
  }
});

test("restored descriptions remain complete, without inheriting audit replacements or certification", () => {
  const pages = getPublicPages();
  for (const locale of locales) for (const [slug, key] of routes) {
    const route = `/bali/visas/${slug}/`;
    const copy = getBotVisaCopy(route, locale);
    assert.equal(copy.key, key);
    assert.equal([copy.title, copy.lead, ...copy.paragraphs].join("\n\n"), copy.fullBody);
    assert.equal(copy.disclaimers.length, 3);
    const published = applyPublication({ ...pages.find((page) => page.route === route),
      route: locale === "en" ? `/en${route}` : route }, locale, new Date(now));
    assert.equal(published.body, copy.fullBody);
    assert.equal(published.title, copy.title);
    assert.equal(published.lead, copy.lead);
    assert.equal(published.editorial, undefined);
    assert.equal(published.indexable, false);
    assert.equal(published.publication.reason, "review_required");
    assert.doesNotMatch(copy.fullBody, /Source review pending|Проверка источников не завершена/);
    assert.doesNotMatch(copy.fullBody, /Стоимость под ключ|All-inclusive price|(?:Rp\s+\d)|\d[\d.,]*\s+IDR/);
  }
  assert.equal(getBotVisaCopy("/bali/visas/", "ru"), null);
  assert.equal(getBotVisaCopy("/bali/housing/", "en"), null);
  assert.match(getBotVisaCopy("/bali/visas/e33g/", "ru").fullBody, /\$2000/);
  assert.match(getBotVisaCopy("/bali/visas/e33g/", "ru").fullBody, /\$60\.000/);
  assert.match(getBotVisaCopy("/bali/visas/d12/", "ru").fullBody, /\$5000/);
});

test("commercial renderer keeps every tier, exact IDR, sorting and locale-specific fee notes", () => {
  for (const locale of locales) for (const [slug, key, tierCount] of routes.filter((row) => row[2])) {
    const copy = getBotVisaCopy(`/bali/visas/${slug}/`, locale);
    const result = visaPriceText(key, projection, locale, copy.priceCopy, now);
    assert.equal(result.split("\n").filter((line) => line.startsWith("▪️")).length, tierCount);
    assert.ok(result.includes("Rp 1.234.567 (≈ 81.37 USDT)"));
    assert.ok(result.endsWith(projection.items.find((item) => item.entity_key === key).fee_note[locale]));
    assert.doesNotMatch(result, /Rp 999|Rp 888/);
    const edited = structuredClone(projection);
    for (const item of edited.items) if (item.entity_key === key && item.show_price && item.amount_idr !== null) item.amount_idr = "987654321";
    const changed = visaPriceText(key, edited, locale, copy.priceCopy, now);
    assert.ok(changed.includes("Rp 987.654.321"));
    assert.ok(!changed.includes("Rp 1.234.567"), "amounts come from the supplied projection");
  }
});

const pricingSource = readFileSync(new URL("../src/client/pricing.js", import.meta.url), "utf8")
  .replace(/^import\s+\{\s*visaPriceText\s*\}\s+from\s+[^;]+;\s*/u, "");
const drain = () => new Promise((resolve) => setImmediate(resolve));

function pricingRuntime(responses, locale = "en") {
  const clock = { value: now };
  const copy = getBotVisaCopy("/bali/visas/e33g/", locale);
  const node = { dataset: { entityType: "VISA", entityKey: "E33G", visaPriceCopy: JSON.stringify(copy.priceCopy) }, hidden: true };
  const timers = new Map();
  const events = {};
  let nextTimer = 0;
  const context = {
    Date: class extends Date { static now() { return clock.value; } },
    document: { documentElement: { lang: locale }, querySelectorAll: () => [node],
      addEventListener: () => {}, visibilityState: "visible" },
    window: { setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: (id) => timers.delete(id), setInterval: () => 1,
      addEventListener: (name, callback) => { events[name] = callback; } },
    fetch: async () => {
      const value = responses.shift();
      if (!value) throw new Error("fixture offline");
      return { ok: true, json: async () => value };
    },
    visaPriceText: (...args) => visaPriceText(...args, clock.value),
  };
  vm.runInNewContext(pricingSource, context, { filename: "pricing.js", timeout: 1000 });
  return { node, clock, timers, events };
}

test("browser cold outage displays the bot unavailable text without stale or embedded amounts", async () => {
  for (const locale of locales) {
    const runtime = pricingRuntime([], locale);
    await drain();
    const copy = getBotVisaCopy("/bali/visas/e33g/", locale);
    assert.equal(runtime.node.textContent, visaPriceText("E33G", null, locale, copy.priceCopy, now));
    assert.equal(runtime.node.hidden, false);
    assert.doesNotMatch(runtime.node.textContent, /\d.*(?:IDR|USDT)|Rp/);
  }
});

test("browser expiry removes USDT immediately and refresh outage retains only accepted IDR", async () => {
  const runtime = pricingRuntime([projection]);
  await drain();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567 \(≈ 81\.37 USDT\)/);
  assert.equal(runtime.node.dataset.projectionId, projection.projection_id);
  runtime.clock.value = expiry + 1;
  for (const callback of runtime.timers.values()) callback();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567/);
  assert.doesNotMatch(runtime.node.textContent, /USDT/);
  runtime.events.focus();
  await drain();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567/);
  assert.doesNotMatch(runtime.node.textContent, /USDT/);
});
