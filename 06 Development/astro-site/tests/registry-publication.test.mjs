import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {readRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {publicBuildEntries,publicEntryForRoute,publicAlternatesForRoute,publicTargetHref,
  validatePublicBuild,buildPublicRegistryModel} from "../scripts/registry-publication.mjs";

const root=new URL("../../shared/content/",import.meta.url);
const registry=readRegistry();
const manifest=JSON.parse(readFileSync(new URL("registry-public-build.v1.json",root)));
const selectedIds=new Set(manifest.records.map(r=>r.contentId));

test("local public overlay is exact14x10 with stable existing canonical routes",()=>{
  const entries=publicBuildEntries();
  assert.equal(entries.length,140);assert.equal(new Set(entries.map(e=>e.route)).size,140);
  assert.equal(manifest.stage,"LOCAL_READY_NO_DEPLOY");
  for(const id of ["c1","voa","e33g"])for(const locale of ["ru","en"]){
    const source=registry.records.find(r=>r.contentId===id);
    assert.equal(entries.find(e=>e.contentId===id&&e.locale===locale).route,source.published.routes[locale]);
  }
  assert.ok(registry.records.every(r=>r.candidate.exposure==="preview_only"&&r.release==="not_authorized"));
  assert.equal(publicEntryForRoute("/fr/bali/visas/c1/").locale,"fr");
  assert.equal(publicEntryForRoute("/_registry/c1/?locale=fr"),null);
});

test("unapproved shells and missing localized legacy targets never become public links",()=>{
  const entries=publicBuildEntries();
  for(const record of registry.records.filter(r=>!selectedIds.has(r.contentId)&&!r.published)){
    for(const {code} of registry.locales)assert.equal(publicTargetHref(record.contentId,code),null);
    assert.equal(entries.some(e=>e.contentId===record.contentId),false);
  }
  assert.equal(publicTargetHref("d12","en"),"/en/bali/visas/d12/");
  assert.equal(publicTargetHref("d12","fr"),null);
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

test("all140 canonical targets have reciprocal full locale alternates, one x-default",()=>{
  for(const entry of publicBuildEntries()){
    const alternates=publicAlternatesForRoute(entry.route);
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
    assert.equal(model.title,entry.title);assert.equal(model.seoTitle,entry.seoTitle);
    assert.equal(model.description,entry.description);assert.equal(model.locale,entry.locale);
    assert.equal(model.dir,entry.locale==="ar"?"rtl":"ltr");
    assert.equal(model.previewNotice,undefined);assert.equal(model.pricingHref,undefined);assert.equal(model.diagnostics,undefined);
    const html=[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join("");
    assert.doesNotMatch(html,/\/_registry\/|\{\{(?:USD|PRICE_IDR)/,entry.route);
    for(const target of [...model.related,...model.languages])assert.ok(target.href&&!target.href.startsWith("/_registry/"));
    assert.equal(model.sourceContext.content_id,entry.contentId);assert.equal(model.sourceContext.source_revision,entry.sourceRevision);
    assert.equal(model.sourceContext.path,entry.route);assert.equal(model.sourceContext.section,"visa");
    assert.equal(model.languageChoices.length,10);
    if(entry.contentId==="knowledge_evoa_vs_voa"){
      assert.equal((model.factHtml.match(/<table>/g)??[]).length,1);
      assert.equal((model.sections.map(s=>s.html).join("").match(/<table>/g)??[]).length,1);
    }
  }
});
