import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {readRegistry,validateAuthoredRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {buildRegistryDocument,safeMarkdown} from "../scripts/registry-document.mjs";
import {determineLanguage,supportedLanguage} from "../scripts/registry-language.mjs";
const registry=readRegistry();
const ids=["c1","c1_extension","knowledge_c1_overview","knowledge_c1_extension","knowledge_c1_price"];
const now=Date.parse("2026-10-03T12:00:00Z");
const projection={
  projection_id:"test-projection",catalog_version_id:2,fx_snapshot_id:10,currency:"IDR",
  fx:{status:"fresh"},derived_expires_at:"2026-10-03T12:15:00Z",
  display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",
  items:[{entity_type:"VISA",entity_key:"C1",option_code:"standard",sku:"visa:C1:standard",
    amount_idr:"2000000",price_qualifier:"EXACT",show_price:true,display_usd_approx:"110",fee_note:{en:"must not become a suffix"}}],
};
test("exact 50 source hashes, current RU revision and model-semantic QA; unchanged identities",()=>{
  assert.equal(validateAuthoredRegistry().records,153);
  let count=0;
  for(const id of ids) {
    const record=registry.records.find(r=>r.contentId===id);
    assert.equal(record.candidate.exposure,"preview_only");
    assert.equal(record.release,"not_authorized");
    for(const locale of registry.locales) {
      const p=locale.code==="ru"?record.candidate.ru:record.candidate.translations[locale.code];
      const raw=readFileSync(new URL("../../shared/content/"+p.bodyFile,import.meta.url));
      assert.equal(createHash("sha256").update(raw).digest("hex"),p.bodySha256);
      if(locale.code!=="ru"){assert.equal(p.sourceRevision,record.candidate.revision);assert.equal(p.qaMethod,"supplied_model_semantic");}
      const m=buildRegistryDocument(registry,id,locale.code);
      assert.ok(m.title&&m.description&&m.seoTitle);
      assert.ok(m.sections.length>=8);
      assert.ok(m.factHtml.length>0);
      assert.ok(m.sections.some(s=>s.faq));
      assert.equal(m.dir,locale.code==="ar"?"rtl":"ltr");
      assert.doesNotMatch(m.introHtml+m.factHtml+m.sections.map(s=>s.html).join(""),/\{\{USD|\$\[динамический USD/);
      assert.doesNotMatch((m.introHtml+m.factHtml+m.sections.map(s=>s.html).join("")).replace(/<[^>]+>/g,""),
        /IDR\s*[（(]\s*(?:约|約|≈)?\s*[）)]/);
      assert.doesNotMatch(m.sections.filter(s=>s.faq).map(s=>s.html).join(""),/\*\*[246][ ,]000/);
      count++;
    }
  }
  assert.equal(count,50);
});
test("six short HI/AR sources retain article bodies, supplied tables and FAQ",()=>{
  for(const locale of ["hi","ar"])for(const id of ids.filter(id=>id.startsWith("knowledge"))) {
    const m=buildRegistryDocument(registry,id,locale);
    assert.ok(m.directHtml.length>20);
    assert.ok((m.factHtml+m.sections.map(s=>s.html).join("")).includes("<table>"));
    assert.ok(m.sections.some(s=>s.faq));
  }
});
test("legacy T1 extracted-copy records stay on their preserved protected shell",()=>{
  const legacy=structuredClone(registry);
  const payload=legacy.records.find(r=>r.contentId==="voa_extension").candidate.ru;
  payload.bodyFile="registry-copy/voa_extension_ru_v3.md";
  payload.bodySha256=createHash("sha256").update(readFileSync(new URL("../../shared/content/"+payload.bodyFile,import.meta.url))).digest("hex");
  delete payload.metadataFile;delete payload.metadataSha256;delete payload.sourceEnvelopeSha256;
  assert.equal(buildRegistryDocument(legacy,"voa_extension","ru"),null);
});
test("whitelist Markdown blocks scripts, events, hostile links and remote media",()=>{
  const html=safeMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![image](https://evil.example/x)\n\n<img src=x onerror=alert(1)>',{registry,locale:"ar"});
  assert.doesNotMatch(html,/<script|<img|href=/);
  assert.match(html,/&lt;script/);
  assert.ok(!html.includes('<bdi dir="ltr"><bdi'));
});
test("internal links resolve content identities and stay in protected namespace",()=>{
  const html=safeMarkdown("[extension](/bali/visas/c1/extension/) and [KITAS](/bali/knowledge/kitas-indonesia/)",{registry,locale:"en"});
  assert.match(html,/href="\/_registry\/c1_extension\/\?locale=en"/);
  assert.doesNotMatch(html,/href="\/bali/);
  assert.equal((html.match(/href=/g)??[]).length,1);
});
test("only exact initial C1 can consume rounded USD from existing projection; fee notes stay out",()=>{
  const m=buildRegistryDocument(registry,"c1","ru",{projection,now});
  assert.equal(m.price.usdSuffix,"(≈ $110)");
  assert.match(m.introHtml,/data-registry-price="c1"[^>]*data-catalog-version="2"[^>]*data-fx-version="10"/);
  assert.match(m.introHtml,/2 000 000 IDR \(≈ \$110\)/);
  assert.equal(m.price.expires,projection.derived_expires_at);
  assert.doesNotMatch(m.introHtml,/must not become/);
  assert.equal(m.price.catalogVersion,2);
  assert.equal(m.price.fxVersion,10);
  assert.equal(buildRegistryDocument(registry,"c1_extension","ru",{projection,now}).price,null);
  assert.equal(buildRegistryDocument(registry,"knowledge_c1_price","ru",{projection,now}).price,null);
});
test("expiry and invalid projections never fabricate USD or restore an authored price as a second source",()=>{
  const values=[
    {...projection,derived_expires_at:"2026-10-03T11:00:00Z"},
    {...projection,items:{}},{...projection,items:[null]},
    {...projection,items:[{...projection.items[0],show_price:false}]},
    {...projection,items:[...projection.items,...projection.items]},
    {...projection,fx:{status:"untrusted"}},
    {...projection,display_usd_approx_formula_version:"other"},
    {...projection,items:[{...projection.items[0],amount_idr:"not-a-price"}]},
  ];
  for(const p of values){
    const m=buildRegistryDocument(registry,"c1","ru",{projection:p,now});
    assert.doesNotMatch(m.introHtml,/\$110|data-preview-usd-expires/);
    assert.match(m.introHtml,/data-registry-price="c1"/);
    assert.doesNotMatch(m.introHtml,/\{\{USD|REGISTRY_PRICE/);
  }
  for(const derived_expires_at of ["bad","2026-10-03T11:00:00Z"]){
    const stale=buildRegistryDocument(registry,"c1","ru",{projection:{...projection,fx:{status:"stale"},derived_expires_at},now});
    assert.doesNotMatch(stale.introHtml,/\$110/);assert.match(stale.introHtml,/2 000 000 IDR/);
  }
  const bounded=buildRegistryDocument(registry,"c1","ru",{projection:{...projection,fx:{status:"stale"}},now});
  assert.match(bounded.introHtml,/2 000 000 IDR \(≈ \$110\)/);
  const changed=buildRegistryDocument(registry,"c1","ru",{projection:{...projection,items:[{...projection.items[0],amount_idr:"2500000",display_usd_approx:"140"}]},now});
  assert.match(changed.introHtml,/2 500 000 IDR \(≈ \$140\)/);
  assert.doesNotMatch(changed.introHtml,/2 000 000 IDR/);
});
test("missing or stale foreign payload never masquerades as a translated RU article",()=>{
  const clone=structuredClone(registry);
  clone.records.find(r=>r.contentId==="c1").candidate.translations.en.sourceRevision="other";
  assert.equal(buildRegistryDocument(clone,"c1","en"),null);
  assert.equal(buildRegistryDocument(clone,"c1","isv"),null);
});
test("locale priority, regional tags and unsupported-language fallback",()=>{
  assert.equal(determineLanguage({explicit:"ar",saved:"ru",telegram:"en",browser:["de"]}),"ar");
  assert.equal(determineLanguage({saved:"ja",telegram:"ru",browser:["en-US"]}),"ja");
  assert.equal(determineLanguage({telegram:"ko-KR",browser:["en"]}),"ko");
  assert.equal(determineLanguage({browser:["it","fr-FR"]}),"fr");
  assert.equal(determineLanguage({browser:["it","zh-TW"]}),null);
  assert.equal(supportedLanguage("zh-CN"),"zh-Hans");
  assert.equal(supportedLanguage("zh-Hant"),null);
});
