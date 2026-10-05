import assert from "node:assert/strict";
import {readFileSync,existsSync,readdirSync} from "node:fs";
import test from "node:test";
import {readRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {publicBuildEntries,publicAlternatesForRoute} from "../scripts/registry-publication.mjs";

const root=new URL("../dist/",import.meta.url);
const read=file=>readFileSync(new URL(file,root),"utf8");
const entries=publicBuildEntries();
const registry=readRegistry();
const decode=value=>value.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex??dec,hex?16:10)))
  .replace(/&(amp|lt|gt|quot|apos);/g,(_,entity)=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"})[entity]);

test("built140 public documents expose approved localized SEO, language and real CTAs",()=>{
  for(const entry of entries){
    const html=read(entry.route.slice(1)+"index.html");
    assert.match(html,new RegExp(`<html[^>]+lang="${entry.locale}"`),entry.route);
    assert.match(html,new RegExp(`<html[^>]+dir="${entry.dir}"`),entry.route);
    assert.equal(decode(html.match(/name="description" content="([^"]*)"/)?.[1]??""),entry.description,entry.route);
    assert.equal(decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]??""),entry.seoTitle.includes("SAFRWAY")?entry.seoTitle:entry.seoTitle+" — SAFRWAY",entry.route);
    assert.ok(html.includes('<link rel="canonical" href="https://safrway.online'+entry.route+'"'),entry.route);
    assert.match(html,/<meta name="robots" content="index,follow"/);
    assert.match(html,/data-support-open/);assert.match(html,/data-support-form/);
    assert.ok(html.includes('data-content-id="'+entry.contentId+'"'));
    assert.ok(html.includes('data-source-revision="'+entry.sourceRevision+'"'));
    assert.doesNotMatch(html,/\/_registry\/|preview_only|Protected preview|Отправка заявок отключена|data-preview-usd/);
    for(const alternate of publicAlternatesForRoute(entry.route))assert.ok(html.includes('hreflang="'+alternate.locale+'" href="https://safrway.online'+alternate.href+'"'),entry.route);
    assert.equal(existsSync(new URL("og/"+entry.route.replace(/^\/|\/$/g,"")+".png",root)),true,entry.route);
    const graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
    assert.ok(graphs.some(graph=>graph.some(node=>node["@type"]==="WebPage"&&node.url==="https://safrway.online"+entry.route&&node.inLanguage===entry.locale)),entry.route);
  }
});

test("public sitemap exactly exposes selected eligible locales, no private candidates",()=>{
  const sitemap=read("sitemap.xml");
  const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.equal(new Set(locs).size,locs.length);
  for(const entry of entries){
    assert.ok(locs.includes("https://safrway.online"+entry.route),entry.route);
    const block=sitemap.match(new RegExp('<url>\\s*<loc>https://safrway\\.online'+entry.route.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+'<\\/loc>([\\s\\S]*?)<\\/url>'))?.[1];
    assert.ok(block,entry.route);
    for(const alternate of publicAlternatesForRoute(entry.route))assert.ok(block.includes('hreflang="'+alternate.locale+'" href="https://safrway.online'+alternate.href+'"'),entry.route);
  }
  for(const record of registry.records.filter(r=>!entries.some(e=>e.contentId===r.contentId)&&!r.published)){
    for(const locale of registry.locales){
      const route=locale.prefix+record.candidate.route;
      assert.equal(existsSync(new URL(route.slice(1)+"index.html",root)),false,route);
      assert.equal(locs.includes("https://safrway.online"+route),false,route);
    }
  }
  assert.doesNotMatch(sitemap,/\/_registry\//);
});

test("public sources use same-origin CSP assets, not preview's inline script/style",()=>{
  const generatedFiles=readdirSync(root,{recursive:true});
  assert.equal(generatedFiles.some(file=>/registry-copy|registry-public-build|service-registry|\.meta\.json$|\.md$/.test(file)),false,"Authored source assets stay server-only");
  for(const file of generatedFiles.filter(file=>file.startsWith("_astro/")&&file.endsWith(".js"))){
    assert.doesNotMatch(read(file),/LOCAL_READY_NO_DEPLOY|MODEL_REVIEWED_PENDING_RENDER_QA|sourceEnvelopeSha256/,file);
  }
  for(const entry of entries){
    const html=read(entry.route.slice(1)+"index.html");
    assert.doesNotMatch(html,/<style(?:\s|>)/);
    const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for(const [,attrs,body] of scripts){
      if(attrs.includes('type="application/ld+json"'))continue;
      assert.match(attrs,/\bsrc="\/(?:_astro\/|assets\/)/,entry.route);
      assert.equal(body.trim(),"");
    }
    if(entry.contentId==="knowledge_evoa_vs_voa")assert.equal((html.match(/<table>/g)??[]).length,2,entry.route);
  }
});
