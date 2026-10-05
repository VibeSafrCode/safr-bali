import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {readRegistry,validateAuthoredRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {buildRegistryDocument} from "../scripts/registry-document.mjs";
const r=readRegistry(),root=new URL("../../shared/content/",import.meta.url);
const mapping={"e33g-main.md":"e33g","e33g-requirements.md":"knowledge_e33g_overview","e33g-documents.md":"knowledge_e33g_documents","e33g-family.md":"knowledge_e33g_family"};
const manifest=JSON.parse(readFileSync(new URL("registry-copy/e33g_manifest_supplied.json",root)));
const current=JSON.parse(readFileSync(new URL("registry-copy/sync1004_manifest.json",root))).records;
const qa=JSON.parse(readFileSync(new URL("registry-copy/e33g_translation_qa_import.json",root)));
const html=m=>m.introHtml+m.directHtml+m.factHtml+m.sections.map(s=>s.html).join("");
test("E33G 40 exact source hashes/10 locales preserve approved copy, existing IDs and routes",()=>{
  assert.deepEqual(validateAuthoredRegistry(),{records:146,publishedBindings:44,previewOnly:146});
  assert.equal(manifest.length,40);
  for(const entry of manifest){const id=mapping[entry.page],record=r.records.find(x=>x.contentId===id);
    const payload=entry.locale==="ru"?record.candidate.ru:record.candidate.translations[entry.locale];
    const original="registry-copy/"+id+"_"+entry.locale.toLowerCase().replaceAll("-","_")+"_e33g_supplied.md";
    assert.equal(createHash("sha256").update(readFileSync(new URL(original,root))).digest("hex"),entry.sha256);
    const active=current.find(x=>x.pageKey+".md"===entry.page&&x.locale===entry.locale);
    assert.ok(active);assert.equal(createHash("sha256").update(readFileSync(new URL(payload.bodyFile,root))).digest("hex"),active.bodySha256);
    const m=buildRegistryDocument(r,id,entry.locale);
    assert.ok(m.title&&m.seoTitle&&m.description&&m.sections.length>=10);
    assert.equal(m.dir,entry.locale==="ar"?"rtl":"ltr");
    assert.doesNotMatch(html(m),/\{\{(?:USD|PRICE)|\*\*CTA:|Source locale:|QA_PASSED/);
    if(id!=="e33g")assert.ok(m.directHtml.length>30);
    if(entry.locale!=="ru")assert.equal(payload.sourceRevision,record.candidate.revision);
    assert.equal(record.candidate.exposure,"preview_only");assert.equal(record.release,"not_authorized");
  }
  assert.equal(r.records.find(x=>x.contentId==="knowledge_e33g_overview").candidate.route,"/bali/knowledge/e33g/remote-worker-kitas/");
  assert.equal(r.records.find(x=>x.contentId==="knowledge_e33g_requirements").candidate.ru.bodyFile,null);
  for(const id of Object.values(mapping).filter(x=>x!=="e33g")){const v=r.records.find(x=>x.contentId===id);assert.equal(v.serviceId,null);assert.equal(v.pricingRef,null);}
});
const now=Date.parse("2026-10-03T12:00:00Z");
const quote={projection_id:"e33g-fixture",catalog_version_id:2,fx_snapshot_id:11,currency:"IDR",fx:{status:"fresh"},derived_expires_at:"2026-10-03T12:15:00Z",display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",items:[{entity_type:"VISA",entity_key:"E33G",option_code:"standard",amount_idr:"12000000",show_price:true,display_usd_approx:"725",fee_note:{en:"PRIVATE_MARGIN"}},{entity_type:"VISA",entity_key:"E33G",option_code:"express",amount_idr:"14000000",show_price:true,display_usd_approx:"850"}]};
for(const item of quote.items)item.price_qualifier="EXACT";
test("standard and express consume distinct authoritative already-rounded displays from one projection",()=>{
  for(const {code}of r.locales){const m=buildRegistryDocument(r,"e33g",code,{projection:quote,now});
    assert.equal(m.tariffPrices.standard.idr,"12 000 000");assert.equal(m.tariffPrices.standard.usdSuffix,"(≈ $725)");
    assert.equal(m.tariffPrices.express.idr,"14 000 000");assert.equal(m.tariffPrices.express.usdSuffix,"(≈ $850)");
    assert.equal(m.tariffPrices.standard.catalogVersion,m.tariffPrices.express.catalogVersion);
    assert.equal(m.tariffPrices.standard.fxVersion,m.tariffPrices.express.fxVersion);
    assert.match(html(m),/\$725/);assert.match(html(m),/\$850/);assert.doesNotMatch(html(m),/PRIVATE_MARGIN/);
    assert.match(html(m),/data-catalog-version="2" data-fx-version="11"/);
    assert.match(html(m),/data-registry-price="e33g_standard"/);assert.match(html(m),/data-registry-price="e33g_express"/);
    assert.match(m.pricingHref,/pricing=published/);
  }
});
test("outage, malformed versions and untrusted FX never invent E33G USD; options retain distinct identities",()=>{
  const bad=[null,{...quote,projection_id:""},{...quote,fx_snapshot_id:-1},{...quote,fx:{status:"untrusted"}},{...quote,derived_expires_at:"bad"},{...quote,catalog_version_id:"2"},{...quote,display_usd_approx_formula_version:"new"}];
  for(const projection of bad){const m=buildRegistryDocument(r,"e33g","ru",{projection,now});assert.doesNotMatch(html(m),/\$725|\$850/);assert.match(html(m),/data-registry-price="e33g_standard"/);}
  for(const projection of [{...quote,items:quote.items.slice(0,1)},{...quote,items:[...quote.items,quote.items[1]]},{...quote,items:[quote.items[0],{...quote.items[1],show_price:false}]}]){
    const m=buildRegistryDocument(r,"e33g","ru",{projection,now});
    assert.match(html(m),/12 000 000 IDR \(≈ \$725\)/);
    assert.doesNotMatch(html(m),/\$850/); // only invalid/missing express is unavailable
  }
  const edited=buildRegistryDocument(r,"e33g","ru",{projection:{...quote,items:[{...quote.items[0],amount_idr:"13000000",display_usd_approx:"800"},quote.items[1]]},now});
  assert.match(html(edited),/13 000 000 IDR \(≈ \$800\)/);assert.doesNotMatch(html(edited),/12 000 000 IDR/);
  const bounded=buildRegistryDocument(r,"e33g","ru",{projection:{...quote,fx:{status:"stale"}},now});
  assert.match(html(bounded),/\$725/);
  for(const derived_expires_at of ["bad","2026-10-03T11:00:00Z"]){
    const stale=buildRegistryDocument(r,"e33g","ru",{projection:{...quote,fx:{status:"stale"},derived_expires_at},now});
    assert.doesNotMatch(html(stale),/\$725|\$850/);
  }
});
test("finite expiry removes derived USD; invalid display not re-rounded or executed",()=>{
  const expired=buildRegistryDocument(r,"e33g","ar",{projection:quote,now:Date.parse("2026-10-03T13:00:00Z")});
  assert.equal(expired.tariffPrices.standard.usdSuffix,"");assert.doesNotMatch(html(expired),/\$725|\$850/);
  for(const value of ["726","725.01","<script>alert(1)</script>","Infinity","-5"]){
    const m=buildRegistryDocument(r,"e33g","ru",{projection:{...quote,items:[{...quote.items[0],display_usd_approx:value},quote.items[1]]},now});
    assert.equal(m.tariffPrices.standard.usdSuffix,"");assert.equal(m.tariffPrices.express.usdSuffix,"(≈ $850)");assert.doesNotMatch(html(m),/alert\(1\)|\$726|725\.01/);
  }
});
test("tariffs, timing, evidence and independent family roles are presentation only",()=>{
  for(const {code}of r.locales){const m=buildRegistryDocument(r,"e33g",code,{projection:quote,now});
    assert.equal(m.sections.filter(s=>s.tariffs).length,1);assert.equal(m.sections.filter(s=>s.timing).length,1);
    assert.match(html(m),/e33g-tariff-grid/);
  }
  assert.match(html(buildRegistryDocument(r,"knowledge_e33g_documents","ru")),/e33g-evidence-flow/);
  const family=buildRegistryDocument(r,"knowledge_e33g_family","ru",{projection:quote,now});
  assert.match(html(family),/e33g-family-roles/);assert.equal(family.tariffPrices,null);assert.equal(family.pricingHref,null);
  assert.match(html(family),/отдельная заявка/);
  assert.match(html(family),/12 000 000 IDR \(≈ \$725\)/);assert.match(html(family),/14 000 000 IDR \(≈ \$850\)/);
  const zh=buildRegistryDocument(r,"knowledge_e33g_documents","zh-Hans");
  assert.equal(zh.sections.find(s=>s.heading==="常见材料问题").faq,false);
  assert.equal(zh.sections.find(s=>s.heading==="常见问题").faq,true);
});
test("supplied marker PASS is not represented as native, legal or full semantic release certification",()=>{
  assert.equal(qa.fullSemanticParity,false);assert.equal(qa.publicReleaseReady,false);assert.equal(qa.nativeHumanReview,false);assert.equal(qa.legalVerification,false);
  assert.match(qa.sourceRevisionBinding,/supplier did not provide/);
  for(const x of qa.items.filter(x=>x.locale!=="ru"&&x.page==="e33g-documents.md"))assert.ok(x.canonicalGaps.some(y=>y.includes("6-month")));
  for(const x of qa.items.filter(x=>x.locale!=="ru"&&x.page==="e33g-requirements.md"))assert.ok(x.canonicalGaps.some(y=>y.includes("90-day")));
});
