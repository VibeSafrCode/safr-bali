import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {readRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {publicBuildEntries,publicEntryForRoute,publicAlternatesForRoute,publicTargetHref,
  validatePublicBuild,buildPublicRegistryModel} from "../scripts/registry-publication.mjs";

const root=new URL("../../shared/content/",import.meta.url);
const registry=readRegistry();
const manifest=JSON.parse(readFileSync(new URL("registry-public-build.v1.json",root)));
const d1Manifest=JSON.parse(readFileSync(new URL("registry-d1-d2-build.v1.json",root)));
const d12Manifest=JSON.parse(readFileSync(new URL('registry-d12-e28a-build.v1.json',root)));
const e33gNextManifest=JSON.parse(readFileSync(new URL('registry-e33g-next-build.v1.json',root)));
const familyManifest=JSON.parse(readFileSync(new URL('registry-family-kitas-build.v1.json',root)));
const partnersManifest=JSON.parse(readFileSync(new URL('registry-partners-build.v1.json',root)));
const readyManifest=JSON.parse(readFileSync(new URL('registry-ready-editorial-public-build.v1.json',root)));
const draftManifest=JSON.parse(readFileSync(new URL('registry-draft-editorial-public-build.v1.json',root)));
const originalIds=new Set([...manifest.records,...d1Manifest.records,...d12Manifest.records,...e33gNextManifest.records,...familyManifest.records,...partnersManifest.records].map(r=>r.contentId));
const readyIds=['student','retirement','second_home','knowledge_student_documents','knowledge_retirement_e33f_vs_e33e','knowledge_second_home_requirements'];
const draftIds=['business','pma','nib_oss','corporate_changes','liquidation','knowledge_pt_pma_capital',
  'documents','translations','apostille','legalization','corporate_docs','knowledge_apostille_vs_legalization',
  'working','rptka','wlkp','working_conversion','knowledge_working_documents','knowledge_working_vs_e33g'];
const selectedIds=new Set([...originalIds,...readyIds,...draftIds,'bank','vietnam']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const coreBytes=readFileSync(new URL('../../../AUDIT/GPT_COLLABORATION_2026-10-11/PUBLIC_370_CORE_SOURCE_BASELINE_2026_10_12.json',import.meta.url));
assert.equal(sha(coreBytes),'d81a4944672fdf1514203cd6591666036e2712d3ec61cc0079ba689bfa98a9a1');
const coreBaseline=JSON.parse(coreBytes);

test("local overlay preserves37+6G02+18draft identities and separately adds existing bank and Vietnam, ten locales each",()=>{
  const entries=publicBuildEntries();
  assert.equal(originalIds.size,37);assert.equal(coreBaseline.count,370);
  assert.deepEqual(readyManifest.records.map(r=>r.contentId).sort(),[...readyIds].sort());
  assert.deepEqual(draftManifest.records.map(r=>r.contentId).sort(),[...draftIds].sort());
  const expected=(originalIds.size+readyIds.length+draftIds.length)*registry.locales.length;
  assert.equal(expected,610);assert.equal(entries.filter(e=>!['bank','vietnam'].includes(e.contentId)).length,expected);
  assert.equal(entries.filter(e=>e.contentId==='bank').length,10);
  assert.equal(entries.filter(e=>e.contentId==='vietnam').length,10);
  assert.equal(entries.length,expected+10+10);assert.equal(new Set(entries.map(e=>e.route)).size,expected+10+10);
  assert.deepEqual([...new Set(entries.map(e=>e.contentId))].sort(),[...selectedIds].sort());
  assert.ok(entries.every(e=>e.indexable===true));
  for(const id of selectedIds)assert.deepEqual(entries.filter(e=>e.contentId===id).map(e=>e.locale).sort(),registry.locales.map(l=>l.code).sort());
  assert.equal(d12Manifest.records.length,7);
  assert.equal(e33gNextManifest.records.length,4);
  assert.equal(familyManifest.records.length,5);assert.equal(partnersManifest.records.length,1);
  assert.equal(validatePublicBuild(manifest,registry).length,140);
  assert.equal(manifest.stage,"LOCAL_READY_NO_DEPLOY");
  for(const id of ["c1","voa","e33g"])for(const locale of ["ru","en"]){
    const source=registry.records.find(r=>r.contentId===id);
    assert.equal(entries.find(e=>e.contentId===id&&e.locale===locale).route,source.published.routes[locale]);
  }
  assert.ok(registry.records.every(r=>r.candidate.exposure==="preview_only"&&r.release==="not_authorized"));
  assert.equal(publicEntryForRoute("/fr/bali/visas/c1/").locale,"fr");
  assert.equal(publicEntryForRoute("/_registry/c1/?locale=fr"),null);
});

test('all370 pre-expansion core customer/source/Service/pricing projections and source bytes are unchanged',()=>{
  assert.equal(Object.keys(coreBaseline.models).length,370);
  for(const [route,expected]of Object.entries(coreBaseline.models)) {
    const entry=publicEntryForRoute(route);assert.ok(entry,route);assert.ok(originalIds.has(entry.contentId));
    const core=Object.fromEntries(coreBaseline.fields.map(field=>[field,entry[field]]));
    assert.equal(sha(JSON.stringify(core)),expected,route);
    const record=registry.records.find(r=>r.contentId===entry.contentId),copy=entry.locale==='ru'?record.candidate.ru:record.candidate.translations[entry.locale];
    assert.equal(sha(readFileSync(new URL(copy.bodyFile,root))),entry.bodySha256,route);
    assert.equal(sha(readFileSync(new URL(copy.metadataFile,root))),entry.metadataSha256,route);
  }
});

test("unapproved shells and missing localized legacy targets never become public links",()=>{
  const entries=publicBuildEntries();
  for(const record of registry.records.filter(r=>!selectedIds.has(r.contentId)&&!r.published)){
    for(const {code} of registry.locales)assert.equal(publicTargetHref(record.contentId,code),null);
    assert.equal(entries.some(e=>e.contentId===record.contentId),false);
  }
  assert.equal(publicTargetHref("d12","en"),"/en/bali/visas/d12/");
  assert.equal(publicTargetHref("d12","fr"),'/fr/bali/visas/d12/');
  assert.equal(publicTargetHref("c1_extension","ar"),"/ar/bali/visas/c1/extension/");
  assert.equal(publicTargetHref("unknown","ru"),null);
});

test("body, metadata, RU lineage, routes and price identities are source-bound",()=>{
  for(const alter of [
    m=>{m.records[0].sourceRevision="sha256:"+"0".repeat(64);},
    m=>{m.records[0].locales.ru.bodySha256="0".repeat(64);},
    m=>{m.records[0].locales.en.metadataSha256="0".repeat(64);},
    m=>{m.records[0].locales.ar.sourceEnvelopeSha256="0".repeat(64);},
    m=>{m.records[0].locales.fr.route="/fr/bali/visas/new-c1/";},
    m=>{m.records[0].pricingRef.entityKey="VOA";},
    m=>{m.records[0].serviceId="new-service";},
    m=>{m.records.pop();},
    m=>{delete m.records[0].locales.fr;},
    m=>{m.stage="DEPLOYED";},
  ]){
    const copy=structuredClone(manifest);alter(copy);assert.throws(()=>validatePublicBuild(copy,registry));
  }
  assert.throws(()=>validatePublicBuild(manifest,registry,{readContent:()=>Buffer.from("changed")}));
  const stale=structuredClone(registry);
  stale.records.find(r=>r.contentId==="c1").candidate.translations.fr.sourceRevision="old";
  assert.throws(()=>validatePublicBuild(manifest,stale),/Stale public translation/);
  const qaDrift=structuredClone(registry);
  qaDrift.records.find(r=>r.contentId==="c1").candidate.translations.fr.qaPage="unrelated.md";
  assert.throws(()=>validatePublicBuild(manifest,qaDrift),/Public translation evidence drift/);
});

test("only indexable canonical targets have reciprocal full locale alternates, one x-default",()=>{
  for(const entry of publicBuildEntries()){
    const alternates=publicAlternatesForRoute(entry.route);
    if(!entry.indexable){assert.deepEqual(alternates,[]);continue;}
    assert.equal(alternates.length,11);
    assert.equal(alternates.filter(a=>a.locale==="x-default").length,1);
    assert.equal(alternates.find(a=>a.locale===entry.locale).href,entry.route);
    for(const alternate of alternates){
      const target=publicEntryForRoute(alternate.href);
      assert.ok(target);assert.equal(target.contentId,entry.contentId);assert.equal(target.indexable,true);
      assert.deepEqual(publicAlternatesForRoute(target.route),alternates);
    }
  }
  assert.deepEqual(publicAlternatesForRoute("/fr/bali/knowledge/unapproved/"),[]);
});

test("public models keep supplied SEO/direct facts/both tables without preview links",()=>{
  for(const entry of publicBuildEntries()){
    const model=buildPublicRegistryModel(entry);
    assert.equal(model.title,entry.title);
    if(!model.seoTitlePriceTemplate)assert.equal(model.seoTitle,entry.seoTitle);
    else assert.doesNotMatch(model.seoTitle,/\{\{CATALOG_PRICE:/);
    if(!model.seoPriceTemplate)assert.equal(model.description,entry.description);
    else assert.doesNotMatch(model.description,/\{\{CATALOG_PRICE:/);
    assert.equal(model.locale,entry.locale);
    assert.equal(model.dir,entry.locale==="ar"?"rtl":"ltr");
    assert.equal(model.previewNotice,undefined);assert.equal(model.pricingHref,undefined);assert.equal(model.diagnostics,undefined);
    const html=[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join("");
    assert.doesNotMatch(html,/\/_registry\/|\{\{(?:USD|PRICE_IDR)/,entry.route);
    for(const target of [...model.related,...model.languages])assert.ok(target.href&&!target.href.startsWith("/_registry/"));
    assert.equal(model.sourceContext.content_id,entry.contentId);assert.equal(model.sourceContext.source_revision,entry.sourceRevision);
    const section=entry.contentId==='partners'?'partners':entry.canonicalPath.includes('/knowledge/')?'knowledge':
      entry.canonicalPath.startsWith('/bali/business/')?'business':entry.canonicalPath.startsWith('/bali/documents/')?'documents':'visa';
    assert.equal(model.sourceContext.path,entry.route);assert.equal(model.sourceContext.section,section);
    if(entry.contentId==='partners'){assert.equal(model.sourceContext.service,undefined);assert.equal(model.sourceContext.country,undefined);}
    assert.equal(model.languageChoices.length,10);
    if(entry.contentId==="knowledge_evoa_vs_voa"){
      assert.equal((model.factHtml.match(/<table>/g)??[]).length,1);
      assert.equal((model.sections.map(s=>s.html).join("").match(/<table>/g)??[]).length,1);
    }
  }
});
