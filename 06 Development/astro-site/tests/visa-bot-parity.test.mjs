import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {createHash} from "node:crypto";
import { getBotVisaCopy } from "../src/lib/visa-bot-copy.ts";
import { visaPriceText } from "../src/lib/visa-price-text.js";
import { getPublicPages } from "../src/lib/public-catalog.ts";
import { applyPublication } from "../src/lib/public-publication.ts";
import {priceDisplay,registryPrice,registryPriceTemplate} from "../scripts/registry-price-bindings.mjs";
import {projectionMayReplace} from "../src/lib/pricing-projection-order.js";

const routes = [
  ["e33g", "E33G", 2], ["d12", "D12", 4], ["d1-d2", "D1/D2", 8],
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
const approvedSummaries=JSON.parse(readFileSync(new URL("../../shared/content/generated/bot-visa-summaries.v1.json",import.meta.url),"utf8"));
const d1Options=["d1","d2"].flatMap(visa=>["one","two"].flatMap(year=>["standard","express"].map(tariff=>`${visa}-${year}-year-${tariff}`)));
const d1Root=new URL("../../bot/app/content/d1_d2/",import.meta.url);
const d1Bindings=JSON.parse(readFileSync(new URL("bindings.v1.json",d1Root),"utf8"));
assert.equal(approvedSummaries.schemaVersion,1);
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
    option_code: key === "E33G" ? ["standard","express"][index] : key==="D1/D2"?d1Options[index]:`option-${index}`, label: { ru: `Вариант ${key} ${index}`, en: `Option ${key} ${index}` },
    amount_idr: String(1_234_567 + index * 101), display_usdt: `${81 + index}.37`,
    display_usd_approx: String(80 + index * 5),
    show_price: true,price_qualifier:"EXACT",fee_verification_status:"VERIFIED", sort_order: Math.floor(index / 2),
    fee_note: { ru: `Примечание ${key}`, en: `Fee note ${key}` },
  }))).reverse();
  items.push(
    { ...items[0], sku: "hidden-price", entity_key: "E33G", show_price: false, amount_idr: "999" },
    { ...items[0], sku: "missing-amount", entity_key: "E33G", amount_idr: null },
    { ...items[0], sku: "other-entity", entity_type: "SERVICE", entity_key: "E33G", amount_idr: "888" },
    ...["d1","d2"].map(visa=>({sku:`fixture:${visa}:extension`,entity_type:"SERVICE",entity_key:"visa-extension",
      option_code:`${visa}-extension`,amount_idr:"2500000",display_usd_approx:"150",show_price:true,
      price_qualifier:"EXACT",fee_verification_status:"VERIFIED"})),
  );
  return { projection_id: "visa-parity-fixture", catalog_version_id: 3, fx_snapshot_id: 7,
    currency:"IDR",fx:{status:"fresh"},display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",
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
from unittest.mock import patch
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
                # Rendering revalidates TTL immediately before send. Pin that
                # clock too: historic test snapshots must not use wall time.
                with patch("app.content.visas.datetime", wraps=datetime) as bot_clock, patch("app.content.d1_d2_summaries.datetime", wraps=datetime) as summary_clock:
                    bot_clock.now.return_value = clock
                    summary_clock.now.return_value = clock
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

// Expected D1/D2 uses the supplied short sources, immutable ordinal bindings
// and the real canonical JS projection helpers independently of Python. No
// reauthored translation or second FX/rounding implementation is allowed.
function expectedD1Card(scenario,locale,disclaimers) {
  const metadata=d1Bindings.locales[locale],sourceBytes=readFileSync(new URL(locale+".json",d1Root));
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"),metadata.fileSha256);
  const rows=JSON.parse(sourceBytes);
  assert.deepEqual(rows.map(r=>r.key),["d1","d2","d1_d2_extension"]);
  const display=operation=>{
    const value=registryPrice(operation,scenario.projection,scenario.now);
    const unavailable=locale==="en"?"Price on request":"Цена по запросу";
    return value?"Rp "+value.idr.replaceAll(" ",".")+(value.usd!==null?` (≈ $${value.usd})`:""):unavailable;
  };
  const parts=rows.map(row=>{
    const binding=metadata.summaries[row.key];
    assert.equal("sha256:"+createHash("sha256").update(row.bodyMarkdown).digest("hex"),row.bodyRevision);
    assert.equal(row.sourceBodyRevision,binding.sourceBodyRevision);
    assert.deepEqual(row.sourceUnitIds,binding.units.map(u=>u.unitId));
    let codepoints=[...row.bodyMarkdown];
    for(const item of [...binding.bindings].sort((a,b)=>b.start-a.start)){
      assert.equal(codepoints.slice(item.start,item.end).join(""),item.literal,"Exact source-coordinate binding");
      const rendered=item.operationId==="d1-d2-extension-equal" && !registryPrice(item.operationId,scenario.projection,scenario.now)
        ?`D1: ${display("d1_extension")} / D2: ${display("d2_extension")}`:display(item.operationId);
      codepoints=[...codepoints.slice(0,item.start),...rendered,...codepoints.slice(item.end)];
    }
    const paths={d1:"d1/",d2:"d2/",d1_d2_extension:"d1-d2/extension/"};
    return codepoints.join("").replace(/\n+$/u,"")+"\n\nhttps://safrway.online/"+(locale==="en"?"en/":"")+"bali/visas/"+paths[row.key];
  });
  return [...parts,...disclaimers].join("\n\n");
}

test("approved short Registry summaries and preserved legacy bodies retain actual bot price/TTL parity", {
  skip: python ? false : "Python with bot dependencies unavailable; set BOT_PARITY_PYTHON to require this check",
}, () => {
  const expected = botCards();
  for (const scenario of scenarios) for (const locale of locales) for (const [slug, key] of routes) {
    const route = `${locale === "en" ? "/en" : ""}/bali/visas/${slug}/`;
    const copy = getBotVisaCopy(route, locale);
    const price = key === "Другая виза" ? "" : visaPriceText(key, scenario.projection, locale, copy.priceCopy, scenario.now);
    const summary=approvedSummaries.entries[key]?.[locale];
    if(summary){
      assert.equal(createHash("sha256").update(summary.body).digest("hex"),summary.bodySha256,"approved summary integrity");
      assert.equal(summary.publicUrl,"https://safrway.online"+route,"exact published counterpart, no invented destination");
    }
    const body=summary?.body??copy.fullBody;
    const commercial=(summary?.priceUnitNote?summary.priceUnitNote+"\n":"")+price;
    const actual = key==="D1/D2"?expectedD1Card(scenario,locale,copy.disclaimers):
      `${body}\n\n${commercial}\n\n${copy.disclaimers.join("\n\n")}`+(summary?"\n\n"+summary.publicUrl:"");
    const label = `${scenario.name}:${locale}:${key}`;
    assert.equal(price, expected[label].price, `commercial block ${label}`);
    assert.equal(actual, expected[label].card, `complete message ${label}`);
  }
});

test("legacy D1/D2 price consumer accepts only eight approved issuance options, not unknown or unpriced five-year options",()=>{
  const edited=structuredClone(projection),known=edited.items.find(r=>r.entity_key==="D1/D2");
  edited.items.push({...known,sku:"unapproved:five-year",option_code:"d1-five-year-standard",amount_idr:"99999999"},
    {...known,sku:"unknown:option",option_code:"unknown-business-option",amount_idr:"88888888"});
  for(const locale of locales){
    const copy=getBotVisaCopy("/bali/visas/d1-d2/",locale);
    const price=visaPriceText("D1/D2",edited,locale,copy.priceCopy,now);
    assert.equal(price,visaPriceText("D1/D2",projection,locale,copy.priceCopy,now),"Unapproved option must not leak into legacy client price display");
    assert.doesNotMatch(price,/99\.999\.999|88\.888\.888/);
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
    assert.equal(published.indexable, true);
    assert.equal(published.publication.reason, "eligible_owner_approved");
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
    assert.ok(result.includes("Rp 1.234.567 (≈ $80)"));
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
  // VM harness injects the actual imported production functions below. Remove
  // only these three known ESM declarations, not arbitrary code or behavior.
  .replace(/^import\s+\{\s*visaPriceText\s*\}\s+from\s+[^;]+;\s*/u, "")
  .replace(/^import\s+\{\s*priceDisplay\s*,\s*registryPrice\s*,\s*registryPriceTemplate\s*\}\s+from\s+[^;]+;\s*/u, "")
  .replace(/^import\s+\{\s*projectionMayReplace\s*\}\s+from\s+['"]\.\.\/lib\/pricing-projection-order\.js['"];\s*/u, "");
assert.doesNotMatch(pricingSource,/^import\s/mu,"VM uses actual injected helpers; no ESM declaration may remain");
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
    document: { documentElement: { lang: locale, dataset:{} }, querySelectorAll: selector => selector === "[data-canonical-price]" ? [node] : [],
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
    priceDisplay: (operation,projection,locale) => priceDisplay(operation,projection,locale,clock.value),
    registryPrice: (operation,projection) => registryPrice(operation,projection,clock.value),
    registryPriceTemplate: (template,projection,locale) => registryPriceTemplate(template,projection,locale,clock.value),
    projectionMayReplace,
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

test("browser expiry removes approximate dollars immediately and outage retains only accepted IDR", async () => {
  const runtime = pricingRuntime([projection]);
  await drain();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567 \(≈ \$80\)/);
  assert.equal(runtime.node.dataset.projectionId, projection.projection_id);
  runtime.clock.value = expiry + 1;
  for (const callback of runtime.timers.values()) callback();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567/);
  assert.doesNotMatch(runtime.node.textContent, /≈ \$/);
  runtime.events.focus();
  await drain();
  assert.match(runtime.node.textContent, /Rp 1\.234\.567/);
  assert.doesNotMatch(runtime.node.textContent, /≈ \$/);
});

test("browser rejects a delayed older publication response without rolling back the accepted whole snapshot", async()=>{
  const current={...structuredClone(projection),projection_id:"publication16",publication_version:16};
  const older={...structuredClone(projection),projection_id:"publication15",publication_version:15};
  const newer={...structuredClone(projection),projection_id:"publication17",publication_version:17};
  for(const item of older.items)if(item.entity_type==="VISA"&&item.entity_key==="E33G")item.amount_idr="7777777";
  for(const item of newer.items)if(item.entity_type==="VISA"&&item.entity_key==="E33G")item.amount_idr="8888888";
  const runtime=pricingRuntime([current,older,newer]);
  await drain();assert.equal(runtime.node.dataset.projectionId,"publication16");
  const acceptedText=runtime.node.textContent;
  runtime.events.focus();await drain();
  assert.equal(runtime.node.dataset.projectionId,"publication16");assert.equal(runtime.node.textContent,acceptedText);
  assert.doesNotMatch(runtime.node.textContent,/7\.777\.777/);
  runtime.events.focus();await drain();
  assert.equal(runtime.node.dataset.projectionId,"publication17");assert.match(runtime.node.textContent,/8\.888\.888/);
});
