import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {readRegistry,validateAuthoredRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {buildRegistryDocument} from "../scripts/registry-document.mjs";
const registry=readRegistry();
const root=new URL("../../shared/content/",import.meta.url);
const ids=["voa","voa_extension","knowledge_evoa_online","knowledge_evoa_extension","knowledge_evoa_vs_voa"];
const supplied=JSON.parse(readFileSync(new URL("registry-copy/evoa_translation_qa_supplied.json",root),"utf8"));
const imported=JSON.parse(readFileSync(new URL("registry-copy/evoa_translation_qa_import.json",root),"utf8"));
const reconciliation=JSON.parse(readFileSync(new URL("registry-copy/sync1004_reconciliation.json",root),"utf8"));
test("eVOA 50 supplied byte hashes retained; exact existing IDs, pricing authority and routes",()=>{
  assert.equal(validateAuthoredRegistry().records,146);
  for(const item of supplied.items){
    const id=ids[supplied.items.findIndex(x=>x.page===item.page)/10];
    // QA order is page-major but locale order differs from Registry order.
    const record=registry.records.find(r=>r.contentId===id);
    assert.ok(record,item.page);
    const suffix=item.locale.toLowerCase().replaceAll("-","_");
    const raw=readFileSync(new URL("registry-copy/"+id+"_"+suffix+"_evoa_supplied.md",root));
    assert.equal("sha256:"+createHash("sha256").update(raw).digest("hex"),item.bodySha256);
  }
  assert.equal(registry.records.find(r=>r.contentId==="voa").serviceId,"visa");
  assert.equal(registry.records.find(r=>r.contentId==="voa").candidate.route,"/bali/visas/voa/");
  assert.deepEqual(registry.records.find(r=>r.contentId==="voa_extension").pricingRef,
    {entityType:"SERVICE",entityKey:"visa-extension",optionCodes:["voa-extension"]});
  for(const id of ids)for(const {code}of registry.locales){
    const m=buildRegistryDocument(registry,id,code);
    assert.ok(m?.title&&m.seoTitle&&m.description);
    assert.ok(m.sections.length>=8);
    assert.equal(m.dir,code==="ar"?"rtl":"ltr");
    assert.equal(registry.records.find(r=>r.contentId===id).candidate.exposure,"preview_only");
    assert.doesNotMatch(m.introHtml+m.factHtml+m.sections.map(s=>s.html).join(""),/\{\{(?:USD|PRICE_IDR)/);
  }
});
test("blueprint boundaries, reversed fact/direct order and compact HI/AR preserve client sections",()=>{
  const ru=buildRegistryDocument(registry,"voa_extension","ru");
  const html=ru.introHtml+ru.directHtml+ru.factHtml+ru.sections.map(s=>s.html).join("");
  assert.match(ru.title,/Продление VOA/);
  assert.match(html,/850 000 IDR/);
  assert.doesNotMatch(html,/Source hierarchy|Competitor observations|ceil\(|Localization plan|semantic targets|public page must/);
  assert.ok(ru.sections.some(s=>s.heading==="Хотите остаться на Бали ещё на 30 дней?"));
  const en=buildRegistryDocument(registry,"voa_extension","en");
  assert.match(en.introHtml+en.factHtml+en.sections.map(s=>s.html).join(""),/850,000/);
  const enMetadata=JSON.parse(readFileSync(new URL(registry.records.find(r=>r.contentId==="voa_extension").candidate.translations.en.metadataFile,root)));
  assert.equal(enMetadata.directAnswer,null);assert.equal(en.directHtml,"");
  assert.match(en.sections.map(s=>s.html).join(""),/date of entry into Indonesia/);
  for(const locale of ["hi","ar"]){
    const compact=buildRegistryDocument(registry,"knowledge_evoa_online",locale);
    assert.ok(compact.sections[0].html.length>30);
    assert.ok(compact.factHtml.length>0);
    const comparison=buildRegistryDocument(registry,"knowledge_evoa_vs_voa",locale);
    assert.match(comparison.introHtml+comparison.sections.map(s=>s.html).join(""),/<table>/);
  }
  assert.equal(buildRegistryDocument(registry,"knowledge_evoa_vs_voa","en").wideFacts,true);
});
test("Founder accepts new supplied RU without peak estimate; explicit provenance and historical QA retained",()=>{
  for(const id of ["voa","knowledge_evoa_vs_voa"]){
    const record=registry.records.find(r=>r.contentId===id),m=buildRegistryDocument(registry,id,"ru");
    assert.doesNotMatch(m.introHtml+m.sections.map(s=>s.html).join(""),/2–3 часа/);
    for(const t of Object.values(record.candidate.translations))assert.equal(t.sourceRevision,record.candidate.revision);
    const row=reconciliation.records.find(x=>x.contentId===id);
    assert.equal(row.incomingRevision,record.candidate.revision);assert.equal(row.status,"RECONCILED");
    assert.match(row.authority,/Founder.*without 2-3h/);
  }
  assert.equal(imported.nativeHumanReview,false);
  assert.equal(imported.proPreReleaseReviewRequired,true);
});
const now=Date.parse("2026-10-03T12:00:00Z");
const quote={projection_id:"voa-test",catalog_version_id:2,fx_snapshot_id:10,currency:"IDR",fx:{status:"fresh"},derived_expires_at:"2026-10-03T12:15:00Z",display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",items:[{entity_type:"VISA",entity_key:"VOA",option_code:"standard",amount_idr:"800000",show_price:true,display_usd_approx:"45",fee_note:{en:"not a suffix"}}]};
test("VOA exact canonical projection is reused; no seed fallback, extension substitution or invented USD",()=>{
  const m=buildRegistryDocument(registry,"voa","ru",{projection:quote,now});
  assert.equal(m.price.idr,"800 000");assert.equal(m.price.usdSuffix,"(≈ $45)");
  assert.match(m.introHtml,/800 000 IDR/);assert.doesNotMatch(m.introHtml,/not a suffix/);
  for(const p of [null,{...quote,items:[]},{...quote,items:[...quote.items,...quote.items]},{...quote,fx:{status:"stale"}},{...quote,items:[{...quote.items[0],show_price:false}]},{...quote,items:[{...quote.items[0],amount_idr:"-1"}]}]){
    const failed=buildRegistryDocument(registry,"voa","ru",{projection:p,now});
    assert.equal(failed.price,null);assert.doesNotMatch(failed.introHtml,/800 000|\$45|\{\{/);
  }
  const expired=buildRegistryDocument(registry,"voa","ru",{projection:{...quote,derived_expires_at:"2026-10-03T11:00:00Z"},now});
  assert.equal(expired.price.usdSuffix,"");assert.doesNotMatch(expired.introHtml,/\$45/);
  assert.equal(buildRegistryDocument(registry,"voa_extension","ru",{projection:quote,now}).price,null);
});
test("QA file/page pointers are bounded and revision-scoped",()=>{
  for(const mutate of [t=>t.qaFile="../elsewhere.json",t=>t.qaPage="wrong-page.md",t=>t.qaFile="registry-copy/c1_translation_qa_t2.json"]){
    const r=structuredClone(registry);mutate(r.records.find(x=>x.contentId==="voa").candidate.translations.en);
    assert.throws(()=>validateAuthoredRegistry(r));
  }
});
