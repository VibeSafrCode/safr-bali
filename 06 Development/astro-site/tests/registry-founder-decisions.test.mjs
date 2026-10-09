import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {readRegistry,validateAuthoredRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {buildRegistryDocument} from "../scripts/registry-document.mjs";
import {removeApprovedInternalInstructions} from "../scripts/registry-presentation-decisions.mjs";
import {currentRegistryProjection} from "./fixtures/current-registry-projection.mjs";
const registry=readRegistry(),root=new URL("../../shared/content/",import.meta.url);
const html=m=>m.introHtml+m.directHtml+m.factHtml+m.sections.map(s=>s.html).join("");
const now=Date.parse("2026-10-03T12:00:00Z");
const projection=currentRegistryProjection();
test("Founder C1 cleanup removes only internal instructions, preserving customer copy and IDR",()=>{
  for(const id of ["c1","knowledge_c1_overview","knowledge_c1_extension"]){
    const m=buildRegistryDocument(registry,id,"ru",{projection,now});
    assert.doesNotMatch(html(m),/Indodax|pricing helper|USD-эквивалент должен выводиться/);
    assert.match(html(m),/2 000 000/);
    assert.equal(m.diagnostics.presentationApproval,"founder-editorial-2026-10-04-sync1");
  }
  const overview=html(buildRegistryDocument(registry,"knowledge_c1_overview","ru"));
  assert.match(overview,/Здесь показана конечная стоимость услуг SAFRWAY по этапам\./);
  const arbitrary="Цена не меняется. Indodax is named in an unrelated authored sentence.";
  assert.equal(removeApprovedInternalInstructions(arbitrary,[]),arbitrary);
});
test("instruction removal keeps existing canonical USD and never invents stale/outage USD",()=>{
  const fresh=buildRegistryDocument(registry,"c1","ru",{projection,now});
  assert.equal(fresh.price.usdSuffix,"(≈ $110)"); assert.match(html(fresh),/\$110/);
  assert.doesNotMatch(html(fresh),/Indodax|pricing helper/);
  for(const quote of [null,{...projection,fx:{status:"untrusted"}},{...projection,derived_expires_at:"2026-10-03T11:00:00Z"}]){
    const m=buildRegistryDocument(registry,"c1","ru",{projection:quote,now});
    assert.doesNotMatch(html(m),/\$110|Indodax|pricing helper/);
    assert.match(html(m),/data-registry-price="c1"/);
    if(quote)assert.match(html(m),/2 000 000 IDR/);
    else assert.doesNotMatch(html(m),/2 000 000 IDR/);
  }
});
test("E33G per-person presentation covers main/family across ten locales without rewriting originals or prices",()=>{
  assert.deepEqual(validateAuthoredRegistry(),{records:152,publishedBindings:44,previewOnly:152});
  for(const id of ["e33g","knowledge_e33g_family"])for(const {code}of registry.locales){
    const record=registry.records.find(r=>r.contentId===id),payload=code==="ru"?record.candidate.ru:record.candidate.translations[code];
    const raw=readFileSync(new URL(payload.bodyFile,root));
    assert.equal(createHash("sha256").update(raw).digest("hex"),payload.bodySha256);
    const m=buildRegistryDocument(registry,id,code,{projection,now});
    assert.equal(m.priceUnit,"per_person");assert.match(html(m),/data-price-unit="per_person"/);
    assert.match(html(m),/12[ ,.]000[ ,.]000|12 000 000/);assert.match(html(m),/14[ ,.]000[ ,.]000|14 000 000/);
    assert.match(html(m),/12 000 000 IDR \(≈ \$725\)/);
    assert.match(html(m),/14 000 000 IDR \(≈ \$850\)/);
    const outage=buildRegistryDocument(registry,id,code);
    assert.doesNotMatch(html(outage),/\$725|\$850/); // no invented rate without projection
    if(id==="knowledge_e33g_family"){assert.equal(m.price,null);assert.equal(m.tariffPrices,null);}
  }
  const ru=html(buildRegistryDocument(registry,"knowledge_e33g_family","ru"));
  assert.match(ru,/Цена оформления <bdi dir="ltr">E33G<\/bdi> указана за одного человека\./);
  assert.equal(buildRegistryDocument(registry,"knowledge_e33g_documents","ru").priceUnit,null);
});
test("Founder presentation evidence rejects source/revision drift instead of silently applying stale approval",()=>{
  const changed=structuredClone(registry);
  changed.records.find(r=>r.contentId==="c1").candidate.ru.bodySha256="0".repeat(64);
  assert.throws(()=>buildRegistryDocument(changed,"c1","ru"),/presentation approval drift/);
  assert.throws(()=>buildRegistryDocument(registry,"c1","ru",{readBody:file=>readFileSync(new URL(file,root),"utf8")+"\nchanged"}),/presentation approval drift/);
});
