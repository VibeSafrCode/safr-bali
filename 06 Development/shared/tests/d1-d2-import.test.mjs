import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {d1D2Pages,planD1D2Import,d1D2OccurrenceSha256} from "../scripts/import-d1-d2-bundle.mjs";
import {validateAuthoredRegistry} from "../scripts/validate-service-registry.mjs";
import {restorePreFamilyRegistry,registryBytes} from "./fixtures/pre-family-registry.mjs";

const contentRoot=new URL("../content/",import.meta.url);
const read=file=>readFileSync(new URL(file,contentRoot));
const sha=value=>createHash("sha256").update(value).digest("hex");
const sourcePack="registry-copy/d1d2_source_pack/";
const manifest=JSON.parse(read(sourcePack+"MANIFEST.json"));
const registry=JSON.parse(read("service-registry.v1.json"));
const historicalRegistry=restorePreFamilyRegistry(registry);
const approvals=JSON.parse(read("registry-approvals.v1.json"));
const build=JSON.parse(read("registry-d1-d2-build.v1.json"));
const buildFile="registry-d1-d2-build.v1.json";
const gateKeys=["render","responsive","accessibility","crossSurfacePriceParity","sourceUncertaintyReview"];
// This is the primary's actual 105-case/15-frame local receipt, not supplied model QA.
const actualReceiptSha256="47b11872f31b9f829af4067bd9b03871a8f610f89b595d64e2393f0099d0148f";
const getLocale=(key,locale)=>build.records.find(r=>r.pageKey===key).locales[locale];
const readBundle=file=>{
  const entry=manifest.records.find(r=>r.jsonFile===file || r.markdownFile===file);
  if(!entry)return read(sourcePack+file);
  const current=getLocale(entry.pageKey,entry.locale);
  return read(file.endsWith(".json")?current.sourceFile:current.bodyFile);
};
const occurrences=read("registry-copy/d1d2_price_occurrences.json");
const plan=()=>planD1D2Import({readBundle,occurrenceBytes:occurrences,registry:historicalRegistry,approvals});
const get=(value,path)=>path.replaceAll("[",".").replaceAll("]","").split(".").reduce((v,k)=>v[k],value);
const span=(value,s)=>{
  assert.equal(value.slice(s.utf16Start,s.utf16End),s.literal,"UTF16 price/unit span");
  assert.equal(Buffer.from(value).subarray(s.utf8ByteStart,s.utf8ByteEnd).toString(),s.literal,"UTF8 price/unit span");
};
const immutableBuild=value=>{
  const result=structuredClone(value);
  delete result.stage;delete result.publicationGates;delete result.renderEvidence;
  for(const record of result.records){
    delete record.publication.indexable;delete record.publication.gateStatus;
  }
  return result;
};
const assertActualReady=(value,readEvidence=read)=>{
  assert.equal(value.stage,"LOCAL_READY_NO_DEPLOY");
  assert.deepEqual(Object.keys(value.publicationGates).sort(),[...gateKeys].sort());
  for(const key of gateKeys)assert.equal(value.publicationGates[key],true,key+" requires actual QA");
  assert.equal(value.sourceManifestSha256,sha(read(sourcePack+"MANIFEST.json")));
  assert.equal(value.priceOccurrences.file,"registry-copy/d1d2_price_occurrences.json");
  assert.equal(value.priceOccurrences.sha256,d1D2OccurrenceSha256);
  assert.equal(sha(read(value.priceOccurrences.file)),d1D2OccurrenceSha256);
  assert.equal(value.renderEvidence.file,"registry-copy/d1d2_render_qa.json");
  assert.equal(value.renderEvidence.sha256,actualReceiptSha256,"Actual primary-reviewed receipt pin");
  const bytes=readEvidence(value.renderEvidence.file);
  assert.equal(sha(bytes),value.renderEvidence.sha256,"Actual receipt bytes must match the release pin");
  const receipt=JSON.parse(bytes);
  assert.equal(receipt.schemaVersion,1);assert.equal(receipt.status,"PASS");
  assert.equal(receipt.sourceManifestSha256,value.sourceManifestSha256);
  assert.equal(receipt.priceOccurrencesSha256,value.priceOccurrences.sha256);
  assert.deepEqual([...receipt.passedGates].sort(),[...gateKeys].sort());
  assert.equal(receipt.realSubmissions,false);assert.equal(receipt.personalProfileUsed,false);assert.equal(receipt.autoplay,false);
  assert.equal(receipt.browser.cases,105);assert.equal(receipt.browser.screenshots,15);
  assert.deepEqual(receipt.browser.errors,[]);assert.equal(receipt.browser.unexpectedMutations,0);
  assert.equal(receipt.browser.browserClosed,true);assert.equal(receipt.browser.ownedServerStopped,true);
  assert.match(receipt.browser.reportSha256,/^[a-f0-9]{64}$/);
  assert.equal(Object.keys(receipt.browser.screenshotHashes).length,15);
  for(const hash of Object.values(receipt.browser.screenshotHashes))assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(receipt.designer.status,"PASS_VISIBLE_AREAS");assert.equal(receipt.designer.framesReviewed,15);
  assert.deepEqual(receipt.designer.p0,[]);assert.deepEqual(receipt.designer.p1,[]);
  assert.equal(receipt.designer.productionDelta,"NO_DELTA");
  assert.equal(receipt.productionVerification,"PENDING_SEPARATE_RELEASE_GATE");
  assert(value.records.every(r=>r.publication.indexable===true && r.publication.gateStatus==="ACTUAL_SCOPED_RENDER_QA_PASS"));
};

test("six complete supplied payloads × ten locales retain exact JSON/body/all fields and RU lineage",()=>{
  assert.equal(manifest.records.length,60);assert.equal(build.records.length,6);
  for(const r of manifest.records){
    const files=getLocale(r.pageKey,r.locale),wire=read(files.sourceFile),body=read(files.bodyFile),metaBytes=read(files.metadataFile);
    const supplied=JSON.parse(wire),meta=JSON.parse(metaBytes),ru=JSON.parse(read(getLocale(r.pageKey,"ru").sourceFile));
    assert.equal(sha(wire),r.jsonSha256);assert.equal(sha(body),r.markdownSha256);assert.equal(sha(metaBytes),files.metadataSha256);
    assert.equal(body.toString(),supplied.bodyMarkdown);
    for(const key of Object.keys(supplied))assert.deepEqual(meta[key],supplied[key],r.locale+"/"+r.pageKey+"/"+key);
    assert.equal(meta.bodySha256,r.markdownSha256);assert.equal(meta.sourceRevision,ru.bodyRevision);
    assert.equal(supplied.sourceBodyRevision,ru.bodyRevision);assert.equal(supplied.sourcePayloadRevision,ru.payloadRevision);
    assert.equal(meta.sourceEnvelopeSha256,sha(read(getLocale(r.pageKey,"ru").sourceFile)));
    assert.equal(files.route,registry.locales.find(l=>l.code===r.locale).prefix+d1D2Pages[r.pageKey].route);
    assert.equal(meta.seoTitle,supplied.seo.title);assert.equal(meta.metaDescription,supplied.seo.description);
    assert.equal(meta.direction,r.locale==="ar"?"rtl":"ltr");
    assert.equal(meta.approval.browserReview,false);assert.equal(meta.approval.nativeSpeakerReview,false);
  }
  const counts={d1:2,d2:2,d1_d2:3,d1_d2_extension:1,knowledge_extension:1,knowledge_documents:1};
  for(const r of manifest.records)assert.equal(JSON.parse(read(getLocale(r.pageKey,r.locale).metadataFile)).cta.length,counts[r.pageKey],"All CTA arrays retained, not forced to two");
  assert.deepEqual(validateAuthoredRegistry(),{records:154,publishedBindings:44,previewOnly:154});
});

test("deterministic importer preserves every old record/service/public binding/approval and adds only three editorial IDs",()=>{
  const before=structuredClone(registry),next=plan();assert.deepEqual(next.registry,historicalRegistry);assert.deepEqual(next.approvals,approvals);
  assert.deepEqual(registry,before,'Historical replay never mutates the current Registry');
  assert.throws(()=>planD1D2Import({readBundle,occurrenceBytes:occurrences,registry,approvals}),/Unexpected Registry baseline/);
  // Import never manufactures readiness. Only the separately reviewed build gate may differ.
  for(const [file,bytes] of next.writes)if(file!==buildFile)assert.deepEqual(file==="service-registry.v1.json"?registryBytes(historicalRegistry):read(file),bytes,"Idempotent file: "+file);
  assert.deepEqual(JSON.parse(next.writes.get(buildFile)),next.build);
  assert.equal(next.build.stage,"IMPORTED_PENDING_RENDER_QA");
  assert.deepEqual(next.build.publicationGates,Object.fromEntries(gateKeys.map(key=>[key,false])));
  assert(!Object.hasOwn(next.build,"renderEvidence"));
  assert(next.build.records.every(r=>r.publication.indexable===false && r.publication.gateStatus==="PENDING_ACTUAL_RENDER_QA"));
  assert.deepEqual(immutableBuild(build),immutableBuild(next.build),"No source/metadata/routes/identities/lastModified drift behind the release gates");
  assert.deepEqual(next.summary.newContentIds,["d1_d2_extension","knowledge_d1_d2_extension","knowledge_d1_d2_documents"]);
  assert.equal(registry.records.length,154);assert.equal(historicalRegistry.records.length,152);assert.equal(registry.records.filter(r=>r.published).length,22);
  const ids=Object.values(d1D2Pages).map(x=>x.contentId);
  for(const id of ids){
    const r=registry.records.find(r=>r.contentId===id);
    assert.equal(r.candidate.exposure,"preview_only");assert.equal(r.candidate.ru.status,"owner_approved_semantics");
    const pins=approvals.entries.filter(a=>a.contentId===id && a.revision===r.candidate.revision);
    assert.equal(pins.length,1);assert.equal(pins[0].status,"OWNER_DELEGATED_RU_APPROVAL");
    assert.equal(pins[0].public_content_sha256,r.candidate.ru.bodySha256);
  }
  for(const id of ["d1_extension","d2_extension"]){
    const r=registry.records.find(r=>r.contentId===id);assert.equal(r.mergeTargetId,"d1_d2_extension");
    assert.equal(r.candidate.ru.status,"draft");assert.equal(r.published,null);
    assert.deepEqual(r.pricingRef.optionCodes,[id.replace("_","-")]);
    assert(read(r.candidate.ru.bodyFile).length>0,"Original draft stays present");
  }
  assert(!registry.records.some(r=>r.candidate.route==="/bali/knowledge/d1-d2/d1-vs-d2/"));
  assert.equal(build.coveredNotDuplicated.automaticRedirect,false);assert.equal(build.coveredNotDuplicated.automaticDeletion,false);
  assert.deepEqual(registry.records.find(r=>r.contentId==="d1_d2_extension").pricingRef,
    {entityType:"SERVICE",entityKey:"visa-extension",optionCodes:["d1-extension","d2-extension"]});
});

test("accepted SYNC14 build and 140 localized source pins are untouched; supplied model QA never becomes browser/native/legal QA",()=>{
  const current=JSON.parse(read("registry-public-build.v1.json"));assert.equal(current.records.length,14);
  for(const r of current.records){
    const record=registry.records.find(x=>x.contentId===r.contentId);assert.equal(record.candidate.revision,r.sourceRevision);
    for(const [locale,pin] of Object.entries(r.locales)){
      const payload=locale==="ru"?record.candidate.ru:record.candidate.translations[locale];
      assert.equal(sha(read(payload.bodyFile)),pin.bodySha256);assert.equal(sha(read(payload.metadataFile)),pin.metadataSha256);
      assert.equal(payload.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
    }
  }
  assert(!plan().writes.has("registry-public-build.v1.json"));
  assert(!plan().writes.has("registry-presentation-approvals.v1.json"));
  const qa=JSON.parse(read("registry-copy/d1d2_qa_import.json"));
  assert.equal(qa.records.length,60);assert.equal(qa.browserReview,false);assert.equal(qa.legalVerification,false);
  assert(qa.records.every(q=>q.browserReview===false && q.nativeReview===false && q.legalVerification===false));
});

test("actual D1 release readiness requires a separate hash-pinned source-bound browser/designer receipt",()=>{
  assertActualReady(build);
  for(const mutate of [
    value=>{value.publicationGates.render=false;},
    value=>{value.publicationGates.extra=true;},
    value=>{value.stage="IMPORTED_PENDING_RENDER_QA";},
    value=>{value.sourceManifestSha256="0".repeat(64);},
    value=>{value.priceOccurrences.sha256="0".repeat(64);},
    value=>{value.renderEvidence.file="registry-copy/d1d2_qa_import.json";},
    value=>{value.renderEvidence.sha256="0".repeat(64);},
    value=>{delete value.renderEvidence;},
    value=>{value.records[0].publication.indexable=false;},
  ]){
    const altered=structuredClone(build);mutate(altered);
    assert.throws(()=>assertActualReady(altered),"Release boolean flags are insufficient without exact source/receipt pins");
  }
  assert.throws(()=>assertActualReady(build,()=>read("registry-copy/d1d2_qa_import.json")),/receipt bytes/);
  assert.throws(()=>assertActualReady(build,()=>Buffer.from("{}")),/receipt bytes/);
});

test("58 semantic price coordinates ×10 locales pin exact fields, UTF8/UTF16 offsets and every FAQ/fact mirror",()=>{
  assert.equal(sha(occurrences),d1D2OccurrenceSha256);assert.equal(build.priceOccurrences.sha256,d1D2OccurrenceSha256);
  const map=JSON.parse(occurrences);assert.equal(map.occurrences.length,58);
  let checked=0,usd=0,mirrors=0;
  for(const occurrence of map.occurrences){
    assert(map.operations[occurrence.operationId]);
    for(const [locale,pin] of Object.entries(occurrence.locales)){
      const p=JSON.parse(read(getLocale(occurrence.pageKey,locale).sourceFile));
      const strings=JSON.parse(read(sourcePack+"EDITORIAL/STRINGS_"+(locale==="ru"?"RU":locale)+".json"));
      const unit=strings[occurrence.unitId],field=get(p,pin.fieldProperty);
      assert.equal(p.sourceUnitOrder[occurrence.field][occurrence.sourceUnitIndex],occurrence.unitId);
      assert.equal(p.bodyRevision,pin.bodyRevision);assert.equal(p.payloadRevision,pin.payloadRevision);
      assert.equal(sha(unit),pin.unitSha256);assert.equal(sha(field),pin.fieldSha256);
      span(unit,pin.unitSpan);span(field,pin.fieldSpan);
      if(pin.usdToken){span(unit,pin.usdToken.unitSpan);span(field,pin.usdToken.fieldSpan);usd++;}
      for(const mirror of pin.mirrors){
        const text=get(p,mirror.property);assert.equal(sha(text),mirror.fieldSha256);span(text,mirror.span);
        if(mirror.usdToken)span(text,mirror.usdToken.span??mirror.usdToken);
        mirrors++;
      }
      checked++;
    }
  }
  assert.equal(checked,580);assert.equal(usd,420);assert.equal(mirrors,270);
  assert.equal(map.operations["d1-extension-x2"].terms[0].operationId,"d1_extension");
  assert.deepEqual(map.operations["d1-d2-extension-equal"].variants.map(x=>x.operationId),["d1_extension","d2_extension"]);
  const hub9m=map.occurrences.filter(o=>o.pageKey==="d1_d2" && ["d1-two-year-standard","d2-two-year-standard"].includes(o.operationId));
  assert(hub9m.some(o=>o.operationId==="d1-two-year-standard") && hub9m.some(o=>o.operationId==="d2-two-year-standard"));
});

test("tampered full JSON, omitted locale, wrong approved route and edited price-coordinate map fail closed",()=>{
  const altered=file=>file==="CONTENT/en/d1.json"?Buffer.from(readBundle(file).toString().replace('"faq":','"omittedFaq":')):readBundle(file);
  assert.throws(()=>planD1D2Import({readBundle:altered,occurrenceBytes:occurrences,registry:historicalRegistry,approvals}),/JSON wire hash/);
  const missing=file=>file==="CONTENT/ar/d2.json"?Buffer.from("{}"):readBundle(file);
  assert.throws(()=>planD1D2Import({readBundle:missing,occurrenceBytes:occurrences,registry:historicalRegistry,approvals}),/JSON wire hash/);
  const wrong=structuredClone(historicalRegistry);wrong.records.find(r=>r.contentId==="d1").candidate.route="/bali/visas/d1-copy/";
  assert.throws(()=>planD1D2Import({readBundle,occurrenceBytes:occurrences,registry:wrong,approvals}),/Preserve existing canonical route/);
  assert.throws(()=>planD1D2Import({readBundle,occurrenceBytes:Buffer.from("{}"),registry:historicalRegistry,approvals}),/occurrence map drift/);
  const drift=structuredClone(registry);drift.records.find(r=>r.contentId==="business").title+=' changed';
  assert.throws(()=>restorePreFamilyRegistry(drift),/exact authorized replacements/);
});
