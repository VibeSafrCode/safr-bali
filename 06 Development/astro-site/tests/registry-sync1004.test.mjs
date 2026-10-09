import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildRegistryDocument} from "../scripts/registry-document.mjs";
import {readRegistry,validateAuthoredRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {hashBytes,metadataEnvelope,syncPageIds} from "../../shared/scripts/import-sync-bundle.mjs";

const root=new URL("../../shared/content/",import.meta.url);
const registry=readRegistry();
const read=file=>readFileSync(new URL(file,root));
const manifest=JSON.parse(read("registry-copy/sync1004_manifest.json"));
const reconciliation=JSON.parse(read("registry-copy/sync1004_reconciliation.json"));
const payloadFor=(r)=>({bodyFile:"registry-copy/"+syncPageIds[r.pageKey]+"_"+r.locale.toLowerCase().replaceAll("-","_")+"_sync1004.md",
  bodySha256:r.bodySha256,metadataFile:"registry-copy/"+syncPageIds[r.pageKey]+"_"+r.locale.toLowerCase().replaceAll("-","_")+"_sync1004.meta.json",
  metadataSha256:r.metadataSha256,sourceEnvelopeSha256:r.sourceEnvelopeSha256,
  sourceRevision:r.sourceRevision,complete:true,qa:"passed",qaMethod:"supplied_model_semantic"});
// Detached supplied models are rendered for all 140 records, including staged
// origin conflicts. This does not activate their revisions or approve release.
const supplied=structuredClone(registry);
for(const r of manifest.records){const record=supplied.records.find(x=>x.contentId===syncPageIds[r.pageKey]);
  record.candidate.revision=r.sourceRevision;
  if(r.locale==="ru")record.candidate.ru={...record.candidate.ru,...payloadFor(r)};
  else record.candidate.translations[r.locale]=payloadFor(r);
}

test("existing Registry identities/routes and byte-exact 140 body+metadata inputs",()=>{
  assert.equal(registry.records.length,152);assert.equal(validateAuthoredRegistry().publishedBindings,44);
  assert.equal(manifest.records.length,140);
  for(const r of manifest.records){const p=payloadFor(r),body=read(p.bodyFile),meta=read(p.metadataFile);
    assert.equal(hashBytes(body),r.bodySha256);assert.equal(hashBytes(meta),r.metadataSha256);
    if(r.locale==="ru")assert.equal(metadataEnvelope(body,JSON.parse(meta)),r.sourceEnvelopeSha256);
  }
});
test("all supplied render models preserve localized SEO/directAnswer/factBlock",()=>{
  for(const r of manifest.records){const p=payloadFor(r),meta=JSON.parse(read(p.metadataFile));
    const model=buildRegistryDocument(supplied,syncPageIds[r.pageKey],r.locale);
    assert.ok(model,r.pageKey+"/"+r.locale);assert.equal(model.title,meta.h1);assert.equal(model.seoTitle,meta.seoTitle);
    assert.equal(model.description,meta.metaDescription);assert.equal(model.dir,meta.direction);
    assert.equal(model.factHeading,meta.factBlock?.heading??model.factHeading);
    if(meta.directAnswer)assert.ok(model.directHtml);
    assert.doesNotMatch(model.introHtml+model.factHtml+model.sections.map(s=>s.html).join(""),/\{\{(?:USD|PRICE_IDR)/);
  }
});
test("both eVOA comparison tables survive in every supplied locale exactly once",()=>{
  for(const locale of registry.locales.map(l=>l.code)){
    const model=buildRegistryDocument(supplied,"knowledge_evoa_vs_voa",locale);
    assert.equal((model.factHtml.match(/<table>/g)??[]).length,1,locale);
    assert.equal((model.sections.map(s=>s.html).join("").match(/<table>/g)??[]).length,1,locale);
  }
});
test("bank wording is exact supplied Founder sentence, no eligibility rejection added",()=>{
  const sentence="Официально требуется банковская выписка за последние 3 месяца. Дополнительно мы запрашиваем выписку за 12 месяцев, основываясь на практике выдачи виз.";
  for(const id of ["e33g","knowledge_e33g_overview","knowledge_e33g_documents"]){
    const record=registry.records.find(r=>r.contentId===id);
    assert.ok(read(record.candidate.ru.bodyFile).toString().includes(sentence));
  }
});
test("per-person E33G note retained independently from family legal applicability",()=>{
  for(const id of ["e33g","knowledge_e33g_family"])for(const {code} of registry.locales){
    const model=buildRegistryDocument(registry,id,code);
    assert.equal(model.priceUnit,"per_person");
    assert.match(model.sections.map(s=>s.html).join(""),/data-price-unit="per_person"/);
  }
});
test("unreconciled RU source never replaces active newer Founder revision",()=>{
  for(const row of reconciliation.records){
    const record=registry.records.find(r=>r.contentId===row.contentId);
    assert.equal(record.candidate.revision,row.status==="SOURCE_ORIGIN_CONFLICT"?row.oldRevision:row.incomingRevision);
  }
  assert.ok(registry.records.every(r=>r.candidate.exposure==="preview_only"&&r.release==="not_authorized"));
});
test("structured metadata/body drift fails closed",()=>{
  assert.throws(()=>buildRegistryDocument(registry,"c1","ru",{readMetadata:()=>"{}"}),/approval drift/);
  assert.throws(()=>buildRegistryDocument(registry,"c1","ru",{readBody:()=>"# changed"}),/drift/);
});
test("extension uses its exact mutable canonical option, never issuance or generic minimum",()=>{
  const now=Date.parse("2026-10-04T12:00:00Z");
  const projection={projection_id:"test:extension",catalog_version_id:3,fx_snapshot_id:20,currency:"IDR",fx:{status:"fresh"},
    derived_expires_at:"2026-10-04T12:15:00Z",display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",
    items:[{entity_type:"SERVICE",entity_key:"visa-extension",option_code:"c1-extension",price_qualifier:"EXACT",amount_idr:"2100000",show_price:true,display_usd_approx:"115"},
      {entity_type:"SERVICE",entity_key:"visa-extension",option_code:"voa-extension",price_qualifier:"EXACT",amount_idr:"850000",show_price:true,display_usd_approx:"45"}]};
  for(const locale of registry.locales.map(x=>x.code)){
    const c1=buildRegistryDocument(registry,"c1_extension",locale,{projection,now});
    assert.equal(c1.price.idr,"2 100 000");assert.equal(c1.price.usdSuffix,"(≈ $115)");
    assert.match(c1.introHtml+c1.factHtml+c1.sections.map(s=>s.html).join(""),/2 100 000/);
    const voa=buildRegistryDocument(registry,"voa_extension",locale,{projection,now});
    assert.equal(voa.price.idr,"850 000");assert.equal(voa.price.usdSuffix,"(≈ $45)");
    const expired=buildRegistryDocument(registry,"voa_extension",locale,{projection,now:now+16*60000});
    assert.equal(expired.price.usdSuffix,"");assert.equal(expired.price.idr,"850 000");
    const missing=buildRegistryDocument(registry,"voa_extension",locale,{projection:{...projection,items:projection.items.slice(0,1)},now});
    assert.equal(missing.price,null);
    assert.equal(buildRegistryDocument(registry,"knowledge_c1_extension",locale,{projection,now}).price.idr,"2 100 000");
    assert.equal(buildRegistryDocument(registry,"knowledge_evoa_extension",locale,{projection,now}).price.idr,"850 000");
  }
});
