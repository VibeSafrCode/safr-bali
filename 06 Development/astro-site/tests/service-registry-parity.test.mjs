import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { getLocalizedPublicPages, publicAlternates } from "../src/lib/public-i18n.ts";
import { getBotVisaCopy } from "../src/lib/visa-bot-copy.ts";
import { visaPriceText } from "../src/lib/visa-price-text.js";
import {publicBuildEntries} from "../scripts/registry-publication.mjs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const baseline = JSON.parse(read("./fixtures/registry-baseline.v1.json"));
const hash = text => createHash("sha256").update(text).digest("hex");
const registry = JSON.parse(read("../../shared/content/service-registry.v1.json"));
const syncManifest=JSON.parse(read("../../shared/content/registry-public-build.v1.json"));
const d1Manifest=JSON.parse(read("../../shared/content/registry-d1-d2-build.v1.json"));
const d12Manifest=JSON.parse(read('../../shared/content/registry-d12-e28a-build.v1.json'));
const d12Summaries=JSON.parse(read('../../shared/content/d12-e28a-bot-summaries.v1.json'));
const legacyVisaSource=JSON.parse(read('../../bot/app/content/visas.json'));
const legacyBotRuntime=JSON.parse(read('../../shared/content/generated/i18n/bot.v1.json'));
const visaApproval=JSON.parse(read('../src/content/visa-copy-approval.json'));
const selected=publicBuildEntries();
const syncIds=new Set(syncManifest.records.map(r=>r.contentId));
const d1Ids=new Set(d1Manifest.records.map(r=>r.contentId));
const d12Ids=new Set(d12Manifest.records.map(r=>r.contentId));
const selectedSync=selected.filter(e=>syncIds.has(e.contentId));
const selectedD1=selected.filter(e=>d1Ids.has(e.contentId));
const selectedD12=selected.filter(e=>d12Ids.has(e.contentId));
const replacedRoutes=new Set(selected.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route));
const selectedIds=new Set(selected.map(e=>e.contentId));
const escape=value=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const decode=value=>value.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex??dec,hex?16:10)))
  .replace(/&(amp|lt|gt|quot|apos|#39);/g,(_,entity)=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'","#39":"'"})[entity]);
const normalizedText=value=>decode(value.replace(/<[^>]*>/g," ")).replace(/\s+/gu," ").trim();

test("Registry adapter preserves legacy models apart from scoped privacy and approved D12 summaries", () => {
  const pages = ["ru", "en"].flatMap(getLocalizedPublicPages);
  assert.equal(pages.length, baseline.pages.length);
  for (const page of pages) {
    const previous = baseline.pages.find(x => x.route === page.route);
    assert.ok(previous, page.route);
    const checked=structuredClone(page);
    if(['/privacy/','/en/privacy/'].includes(page.route)){
      const paragraphs=page.body.split('\n\n');
      assert.equal(paragraphs.length,5);
      assert.match(paragraphs[2],/Do Not Track|аналитика|analytics/);
      assert.match(paragraphs[3],/13/);assert.match(paragraphs[3],/36/);
      checked.body=[paragraphs[0],paragraphs[1],paragraphs[4]].join('\n\n');
    }
    if(['/bali/visas/d12/','/en/bali/visas/d12/'].includes(page.route)) {
      const locale=page.route.startsWith('/en/')?'en':'ru',summary=d12Summaries.entries.D12[locale];
      assert.equal(hash(summary.body),summary.bodySha256,'Approved D12 summary integrity');
      const paragraphs=summary.body.trim().split('\n\n');
      assert.equal(page.body,summary.body);assert.equal(page.title,paragraphs[0]);assert.equal(page.lead,paragraphs[1]);
      assert.equal(page.indexable,true);assert.equal(page.publication.reason,'eligible_owner_approved');
      assert.doesNotMatch(page.body,/\$5000|5[ .]000\s*USD/,'Superseded universal D12 balance is not restored');
      const legacyBody=(locale==='ru'?legacyVisaSource.D12.text:legacyBotRuntime.entries['visa.d12.body'][locale]).replace(/\\n/g,'\n').trim();
      const legacyParagraphs=legacyBody.split('\n\n');
      checked.body=legacyBody;checked.title=legacyParagraphs[0];checked.lead=legacyParagraphs[1];
      checked.publication.lastmod=visaApproval.approvedAt;
      assert.equal(hash(JSON.stringify(checked)),previous.modelHash,'Only approved D12 title/lead/body/date may differ: '+page.route);
    } else assert.equal(hash(JSON.stringify(checked)), previous.modelHash, page.route);
    assert.deepEqual(publicAlternates(page.route), previous.alternates, page.route);
  }
});

test("SYNC, D1/D2 and approved D12/E28A overlays retain every other legacy route/content/SEO meaning", () => {
  assert.equal(syncManifest.records.length,14);assert.equal(selectedSync.length,140);
  assert.deepEqual([...d1Ids].sort(),["d1","d2","d1_d2","d1_d2_extension","knowledge_d1_d2_extension","knowledge_d1_d2_documents"].sort());
  assert.equal(d1Manifest.records.length,6);assert.equal(selectedD1.length,60);
  assert.deepEqual([...d12Ids].sort(),['d12','investor','d12_extension','knowledge_d12_documents','knowledge_d12_180','knowledge_e28a_requirements','knowledge_e28a_extension'].sort());
  assert.equal(d12Manifest.records.length,7);assert.equal(selectedD12.length,70);assert.equal(selected.length,310);
  const syncReplaced=new Set(selectedSync.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route));
  assert.equal(syncReplaced.size,6);
  assert.equal(selectedSync.filter(e=>!syncReplaced.has(e.route)).length,134);
  const d1Replaced=selectedD1.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route);
  assert.deepEqual(d1Replaced.sort(),["/bali/visas/d1-d2/","/en/bali/visas/d1-d2/"]);
  const d12Replaced=selectedD12.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route);
  assert.deepEqual(d12Replaced.sort(),['/bali/visas/d12/','/en/bali/visas/d12/']);
  assert.equal(replacedRoutes.size,10);
  assert.equal(selected.filter(e=>!replacedRoutes.has(e.route)).length,300);
  for (const page of ["ru","en"].flatMap(getLocalizedPublicPages)) {
    const html=read("../dist"+page.route+"index.html");
    assert.ok(html.includes('<link rel="canonical" href="https://safrway.online'+page.route+'"'),page.route);
    if(replacedRoutes.has(page.route))continue;
    assert.equal(decode(html.match(/name="description" content="([^"]*)"/)?.[1]??""),page.description,page.route);
    assert.ok(html.includes('name="robots" content="'+(page.indexable?'index,follow':'noindex,follow')+'"'),page.route);
    const graph=JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1]??"null");
    const webpage=graph.find(entry=>entry["@type"]==="WebPage");
    assert.equal(webpage.url,"https://safrway.online"+page.route);
    assert.equal(webpage.description,page.description);
    assert.equal(webpage.name,page.title.includes("SAFRWAY")?page.title:page.title+" — SAFRWAY");
    const locale=page.route.startsWith('/en/')?'en':'ru';
    assert.equal(webpage.inLanguage,locale);
    const botCopy=getBotVisaCopy(page.route,locale);
    if(botCopy){
      const text=normalizedText(html);
      for(const paragraph of [...botCopy.paragraphs,...botCopy.disclaimers])assert.ok(text.includes(normalizedText(paragraph)),page.route);
      if(botCopy.key!=="Другая виза"){
        assert.match(html,/data-canonical-price/);
        assert.ok(html.includes('data-entity-key="'+escape(botCopy.key)+'"'));
      }
    }
  }
  for (const file of Object.keys(baseline.standaloneHtml)) {
    assert.equal(existsSync(new URL("../dist/"+file,import.meta.url)),true,file);
    assert.match(read("../dist/"+file),/rel="canonical"/);
    const og=file.replace(/\/index\.html$/,".png");
    assert.equal(existsSync(new URL("../dist/og/"+og,import.meta.url)),true,og);
  }
});

test("same canonical pricing snapshot produces identical RU/EN fresh/stale display", () => {
  const projection = JSON.parse(read("./fixtures/registry-pricing-projection.v1.json"));
  assert.equal(hash(JSON.stringify(projection)), baseline.pricingFixtureHash);
  for (const expected of baseline.priceOutputs) {
    const copy = getBotVisaCopy("/bali/visas/voa/", expected.locale);
    assert.equal(visaPriceText("VOA", projection, expected.locale, copy.priceCopy, expected.now), expected.text);
    assert.equal(expected.text.includes("≈ $"), expected.now === 0, "fixture must exercise both fresh and expired USD");
  }
});

test("only selected approved shells emit public HTML; other candidates remain absent", () => {
  const pages = ["ru", "en"].flatMap(getLocalizedPublicPages);
  const publicLinks = new Set(pages.flatMap(p => [p.route,
    ...p.cards.map(c => c.href), ...p.relatedRoutes.map(c => c.href),
    ...publicAlternates(p.route).map(c => c.href)]));
  const sitemap = read("../dist/sitemap.xml");
  for (const record of registry.records.filter(r => !r.published&&!selectedIds.has(r.contentId))) {
    for (const prefix of ["", "/en"]) {
      const route = prefix + record.candidate.route;
      assert.equal(existsSync(new URL("../dist" + route + "index.html", import.meta.url)), false, route);
      assert.equal(publicLinks.has(route), false, route);
      assert.equal(sitemap.includes("https://safrway.online" + route + "<"), false, route);
    }
  }
  for(const entry of selected){
    assert.equal(existsSync(new URL("../dist"+entry.route+"index.html",import.meta.url)),true,entry.route);
    // The source-pinned D1 manifest emits useful local candidates, but cannot
    // turn pending actual release gates into sitemap/indexability evidence.
    // Established140 remains indexable; only separately verified D1 may join.
    if(syncIds.has(entry.contentId))assert.equal(entry.indexable,true);
    else assert(d1Ids.has(entry.contentId)||d12Ids.has(entry.contentId)||
      ['e33g_next_term','knowledge_e33g_extension','e33g_conversion','employment_review'].includes(entry.contentId),
      "Unknown public scope is never accepted");
    assert.equal(sitemap.includes("https://safrway.online"+entry.route+"<"),entry.indexable,entry.route);
    const html=read("../dist"+entry.route+"index.html");
    assert.ok(html.includes('name="robots" content="'+(entry.indexable?'index,follow':'noindex,follow')+'"'),entry.route);
  }
});
