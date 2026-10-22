import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { getLocalizedPublicPages, publicAlternates } from "../src/lib/public-i18n.ts";
import { getBotVisaCopy } from "../src/lib/visa-bot-copy.ts";
import { visaPriceText } from "../src/lib/visa-price-text.js";
import {publicBuildEntries} from "../scripts/registry-publication.mjs";
import {publicSiteEntries} from '../src/lib/public-site-publication.ts';

// Root can bind checks to its exact frozen build instead of stale checkout dist.
// CI/default still uses the just-built local dist; never inherit old 702 output.
const outputRoot=process.env.SAFRWAY_PUBLIC_TEST_OUTPUT
  ?pathToFileURL(path.resolve(process.env.SAFRWAY_PUBLIC_TEST_OUTPUT)+path.sep)
  :new URL('../dist/',import.meta.url);
const artifactFile=p=>new URL(p,outputRoot);
const read = p => readFileSync(p.startsWith('../dist/')?artifactFile(p.slice(8)):
  p.startsWith('../dist')?artifactFile(p.slice(7).replace(/^\//,'')):new URL(p, import.meta.url), "utf8");
const baseline = JSON.parse(read("./fixtures/registry-baseline.v1.json"));
const hash = text => createHash("sha256").update(text).digest("hex");
const registry = JSON.parse(read("../../shared/content/service-registry.v1.json"));
const syncManifest=JSON.parse(read("../../shared/content/registry-public-build.v1.json"));
const d1Manifest=JSON.parse(read("../../shared/content/registry-d1-d2-build.v1.json"));
const d12Manifest=JSON.parse(read('../../shared/content/registry-d12-e28a-build.v1.json'));
const readyManifest=JSON.parse(read('../../shared/content/registry-ready-editorial-public-build.v1.json'));
const draftManifest=JSON.parse(read('../../shared/content/registry-draft-editorial-public-build.v1.json'));
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
const readyIds=new Set(['student','retirement','second_home','knowledge_student_documents','knowledge_retirement_e33f_vs_e33e','knowledge_second_home_requirements']);
const draftIds=new Set(['business','pma','nib_oss','corporate_changes','liquidation','knowledge_pt_pma_capital',
  'documents','translations','apostille','legalization','corporate_docs','knowledge_apostille_vs_legalization',
  'working','rptka','wlkp','working_conversion','knowledge_working_documents','knowledge_working_vs_e33g']);
const replacedRoutes=new Set(selected.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route));
const selectedIds=new Set(selected.map(e=>e.contentId));
const escape=value=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const decode=value=>value.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex??dec,hex?16:10)))
  .replace(/&(amp|lt|gt|quot|apos|#39);/g,(_,entity)=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'","#39":"'"})[entity]);
const normalizedText=value=>decode(value.replace(/<[^>]*>/g," ")).replace(/\s+/gu," ").trim();
// Reconstruct ONLY historical indexing metadata so the existing immutable full
// model hash still checks every customer/SEO/card/price field. These exact
// dispositions predate the version-bound 2026-10-12 owner indexing overlay.
const historicalSubstantial=new Set(['/','/bali/','/bali/housing/','/bali/housing/villa/','/bali/housing/housing-videos/','/bali/housing/housing-risks/']);
const historicalHidden=new Set(['/privacy/','/bali/exchange/other-exchange/']);
function historicalPublication(page,locale) {
  const raw=page.route==='/en/'?'/':page.route.replace(/^\/en\//,'/');
  if(getBotVisaCopy(page.route,locale)||raw==='/bali/visas/')return {indexable:true,reason:'eligible_owner_approved',lastmod:visaApproval.approvedAt};
  if(historicalHidden.has(raw))return {indexable:false,reason:'not_published'};
  return historicalSubstantial.has(raw)?{indexable:true,reason:'eligible'}:{indexable:false,reason:'insufficient_content'};
}

test("legacy customer models remain hash-exact apart from scoped privacy/D12 changes and explicit owner indexing metadata", () => {
  const pages = ["ru", "en"].flatMap(getLocalizedPublicPages);
  assert.equal(pages.length, baseline.pages.length);
  for (const page of pages) {
    const previous = baseline.pages.find(x => x.route === page.route);
    assert.ok(previous, page.route);
    const checked=structuredClone(page);
    const locale=page.route.startsWith('/en/')?'en':'ru';
    assert.equal(page.indexable,true);assert.equal(page.publication.reason,'eligible_owner_approved_indexing');
    assert.equal(page.publication.independentReviewClaim,false);
    checked.publication=historicalPublication(page,locale);checked.indexable=checked.publication.indexable;
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
      assert.equal(page.indexable,true);assert.equal(page.publication.reason,'eligible_owner_approved_indexing');
      assert.doesNotMatch(page.body,/\$5000|5[ .]000\s*USD/,'Superseded universal D12 balance is not restored');
      const legacyBody=(locale==='ru'?legacyVisaSource.D12.text:legacyBotRuntime.entries['visa.d12.body'][locale]).replace(/\\n/g,'\n').trim();
      const legacyParagraphs=legacyBody.split('\n\n');
      checked.body=legacyBody;checked.title=legacyParagraphs[0];checked.lead=legacyParagraphs[1];
      checked.publication.lastmod=visaApproval.approvedAt;
      assert.equal(hash(JSON.stringify(checked)),previous.modelHash,'Only approved D12 title/lead/body/date may differ: '+page.route);
    } else assert.equal(hash(JSON.stringify(checked)), previous.modelHash, page.route);
    const raw=page.route==='/en/'?'/':page.route.replace(/^\/en\//,'/');
    const expectedAlternates=[{locale:'ru',href:raw},{locale:'en',href:raw==='/'?'/en/':'/en'+raw},{locale:'x-default',href:raw}];
    assert.deepEqual(publicAlternates(page.route),expectedAlternates,page.route);
    // Previously approved alternates retain their exact routes; empty old
    // alternates become public only through the explicit indexing decision.
    if(previous.alternates.length)assert.deepEqual(expectedAlternates,previous.alternates,page.route);
  }
});

test("37original+6G02+18draft and bank10 overlays retain every other legacy route/content/SEO meaning", () => {
  assert.equal(syncManifest.records.length,14);assert.equal(selectedSync.length,140);
  assert.deepEqual([...d1Ids].sort(),["d1","d2","d1_d2","d1_d2_extension","knowledge_d1_d2_extension","knowledge_d1_d2_documents"].sort());
  assert.equal(d1Manifest.records.length,6);assert.equal(selectedD1.length,60);
  assert.deepEqual([...d12Ids].sort(),['d12','investor','d12_extension','knowledge_d12_documents','knowledge_d12_180','knowledge_e28a_requirements','knowledge_e28a_extension'].sort());
  assert.equal(d12Manifest.records.length,7);assert.equal(selectedD12.length,70);
  assert.deepEqual(readyManifest.records.map(r=>r.contentId).sort(),[...readyIds].sort());
  assert.deepEqual(draftManifest.records.map(r=>r.contentId).sort(),[...draftIds].sort());
  assert.equal(selected.filter(e=>readyIds.has(e.contentId)).length,60);assert.equal(selected.filter(e=>draftIds.has(e.contentId)).length,180);
  assert.equal(selected.filter(e=>!['bank','vietnam','sktt','hospitality'].includes(e.contentId)).length,370+readyIds.size*10+draftIds.size*10);
  assert.equal(selected.filter(e=>!['bank','vietnam','sktt','hospitality'].includes(e.contentId)).length,610);
  assert.equal(selected.filter(e=>e.contentId==='bank').length,10);assert.equal(selected.filter(e=>e.contentId==='vietnam').length,10);assert.equal(selected.filter(e=>e.contentId==='sktt').length,10);assert.equal(selected.filter(e=>e.contentId==='hospitality').length,10);assert.equal(selected.length,650);
  assert.equal(selected.filter(e=>['family','family_spouse','family_child','family_parent','knowledge_family_documents'].includes(e.contentId)).length,50);
  assert.equal(selected.filter(e=>e.contentId==='partners').length,10);
  const syncReplaced=new Set(selectedSync.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route));
  assert.equal(syncReplaced.size,6);
  assert.equal(selectedSync.filter(e=>!syncReplaced.has(e.route)).length,134);
  const d1Replaced=selectedD1.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route);
  assert.deepEqual(d1Replaced.sort(),["/bali/visas/d1-d2/","/en/bali/visas/d1-d2/"]);
  const d12Replaced=selectedD12.filter(e=>registry.records.find(r=>r.contentId===e.contentId).published?.routes[e.locale]).map(e=>e.route);
  assert.deepEqual(d12Replaced.sort(),['/bali/visas/d12/','/en/bali/visas/d12/']);
  assert.equal(replacedRoutes.size,10);
  assert.equal(selected.filter(e=>!replacedRoutes.has(e.route)).length,360+readyIds.size*10+draftIds.size*10+10+10+10+10);
  assert.ok(selected.every(e=>e.indexable===true));
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
    assert.equal(existsSync(artifactFile(file)),true,file);
    assert.match(read("../dist/"+file),/rel="canonical"/);
    const og=file.replace(/\/index\.html$/,".png");
    assert.equal(existsSync(artifactFile("og/"+og)),true,og);
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

test('unchanged1070 Owner routes plus separate bank10/Vietnam10/SKTT10/hospitality10 emit1110 sitemap routes, never private surfaces',()=>{
  // The original100 legacy model pins are checked separately above. New source
  // routing and the1070 Owner overlay supersede the historical712/702 projection.
  assert.equal(baseline.pages.length,100);assert.equal(selected.filter(e=>!['bank','vietnam','sktt','hospitality'].includes(e.contentId)).length,610);
  assert.equal(selected.filter(e=>e.contentId==='bank').length,10);assert.equal(replacedRoutes.size,10);
  assert.equal(selected.filter(e=>e.contentId==='vietnam').length,10);
  const current=publicSiteEntries();
  assert.equal(current.filter(x=>x.kind==='legacy').length,450);
  assert.equal(current.filter(x=>x.kind==='registry'&&!['bank','vietnam','sktt','hospitality'].includes(x.page.contentId)).length,610);
  assert.equal(current.filter(x=>x.kind==='registry'&&x.page.contentId==='bank').length,10);
  assert.equal(current.filter(x=>x.kind==='registry'&&x.page.contentId==='vietnam').length,10);
  assert.equal(current.filter(x=>x.kind==='registry'&&x.page.contentId==='sktt').length,10);
  assert.equal(current.filter(x=>x.kind==='registry'&&x.page.contentId==='hospitality').length,10);
  assert.equal(current.filter(x=>x.kind==='standalone').length,10);
  assert(current.every(x=>x.page.indexable===true));
  assert(current.filter(x=>x.kind!=='registry').every(x=>x.page.publication.independentReviewClaim===false));
  const routes=new Set(current.map(x=>x.route));assert.equal(current.length,1110);assert.equal(routes.size,1110);
  const emitted=[...read('../dist/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>{
    const url=new URL(match[1]);assert.equal(url.origin,'https://safrway.online');return url.pathname;
  });
  assert.equal(new Set(emitted).size,emitted.length);assert.deepEqual(emitted.sort(),[...routes].sort());
  assert.ok(emitted.every(route=>!route.split('/').some(part=>['account','admin','auth','api','_registry','preview','private','mini-app','cabinet','login'].includes(part))));
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
      assert.equal(existsSync(artifactFile(route.slice(1)+"index.html")), false, route);
      assert.equal(publicLinks.has(route), false, route);
      assert.equal(sitemap.includes("https://safrway.online" + route + "<"), false, route);
    }
  }
  for(const entry of selected){
    assert.equal(existsSync(artifactFile(entry.route.slice(1)+"index.html")),true,entry.route);
    // Source/raw release QA is unchanged. The separate version-bound owner
    // decision permits public indexing without fabricating independent review.
    if(syncIds.has(entry.contentId))assert.equal(entry.indexable,true);
    else assert(d1Ids.has(entry.contentId)||d12Ids.has(entry.contentId)||readyIds.has(entry.contentId)||draftIds.has(entry.contentId)||
      ['e33g_next_term','knowledge_e33g_extension','e33g_conversion','employment_review',
        'family','family_spouse','family_child','family_parent','knowledge_family_documents','partners','bank','vietnam','sktt','hospitality'].includes(entry.contentId),
      "Unknown public scope is never accepted");
    assert.equal(sitemap.includes("https://safrway.online"+entry.route+"<"),entry.indexable,entry.route);
    const html=read("../dist"+entry.route+"index.html");
    assert.ok(html.includes('name="robots" content="'+(entry.indexable?'index,follow':'noindex,follow')+'"'),entry.route);
  }
});
