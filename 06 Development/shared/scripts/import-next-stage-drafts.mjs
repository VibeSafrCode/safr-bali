// Bounded, repeatable local draft import. Never approvals, pricing writes,
// translations, public-build manifests, new services, routes or publication.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {markTranslationsStale} from "../src/service-registry.mjs";

export const nextStageRoutes = Object.freeze({
  d1:"/bali/visas/d1/",d2:"/bali/visas/d2/",
  d1_extension:"/bali/visas/d1/extension/",d2_extension:"/bali/visas/d2/extension/",
  e33g_next_term:"/bali/visas/e33g/next-term/",
  knowledge_e33g_extension:"/bali/knowledge/e33g/extension/",
  employment_review:"/bali/visas/e33g/employment-documents/",
  e33g_conversion:"/bali/visas/e33g/conversion/",
  family:"/bali/visas/family-kitas/",family_spouse:"/bali/visas/family-kitas/spouse/",
  family_child:"/bali/visas/family-kitas/child/",family_parent:"/bali/visas/family-kitas/parent/",
  partners:"/partners/",business:"/bali/business/",documents:"/bali/documents/",
});
const operation = (entityType,entityKey,optionCode)=>({entityType,entityKey,optionCodes:[optionCode]});
const approvedOperations = {
  d1_extension:operation("SERVICE","visa-extension","d1-extension"),
  d2_extension:operation("SERVICE","visa-extension","d2-extension"),
  e33g_extension:operation("SERVICE","visa-extension","e33g-extension"),
  employment_review:operation("SERVICE","consultation","e33g-document-review"),
  e33g_standard:operation("VISA","E33G","standard"),
  e33g_express:operation("VISA","E33G","express"),
  e33g_conversion_voa:operation("VISA","E33G","conversion-from-voa"),
  e33g_conversion_kitas:operation("VISA","E33G","conversion-from-kitas"),
  e33g_conversion_c1:operation("VISA","E33G","conversion-from-c1"),
  e33g_conversion_d12:operation("VISA","E33G","conversion-from-d12"),
};
for(const visa of ["d1","d2"])for(const term of ["one","two","five"])for(const speed of ["standard","express"]){
  const code=visa+"-"+term+"-year-"+speed;
  approvedOperations[code]=operation("VISA","D1/D2",code);
}
const refFields = ["entityType","entityKey","optionCodes"];
export const draftHash = bytes=>createHash("sha256").update(bytes).digest("hex");
export function nextStageIdentityBindings(manifest) {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.sourceBatch,"SYNC-FINAL-2026-10-05:NEXT-STAGE-DRAFTS");
  assert.equal(manifest.authority.newBusinessServiceEntities,false);
  assert.equal(manifest.sources.founder_final_handoff.sha256,
    "2e44ca1a120bc556920effcb0f1dfb0c593acf2888d9f5d305908ed106fe2fb7");
  assert.deepEqual(Object.keys(manifest.pricingOperations).sort(),Object.keys(approvedOperations).sort());
  const bindings=[];
  for(const [id,expected] of Object.entries(approvedOperations)){
    const actual=manifest.pricingOperations[id];
    assert.deepEqual(Object.fromEntries(refFields.map(key=>[key,actual[key]])),expected,"Unapproved option identity: "+id);
    bindings.push({entity_type:expected.entityType,entity_key:expected.entityKey,option_code:expected.optionCodes[0]});
  }
  // Amounts are deliberately never returned. This validates an identity
  // allowlist, not a price fallback, catalog seed or availability certificate.
  return bindings;
}
export function planNextStageDraftImport(registry,manifest,readSource) {
  nextStageIdentityBindings(manifest);
  assert.equal(registry.records.length,146);
  assert.deepEqual(manifest.entries.map(e=>e.contentId).sort(),Object.keys(nextStageRoutes).sort());
  const next=structuredClone(registry),changed=[],staleTranslations=[];
  const sourceByRoute=new Map(next.records.map(r=>[r.candidate.route,r.contentId]));
  for(const entry of manifest.entries){
    const index=next.records.findIndex(r=>r.contentId===entry.contentId);
    assert(index>=0,"No new content IDs");
    const original=next.records[index];
    assert.equal(original.published,null,"Never replace a published page");
    assert.equal(original.candidate.route,nextStageRoutes[entry.contentId],"Existing route drift");
    assert.equal(entry.route,original.candidate.route);
    assert.equal(entry.locale,"ru");assert.equal(entry.draft,true);
    assert.equal(entry.publication,"preview_only");assert.equal(entry.indexable,false);
    assert.match(entry.bodyFile,new RegExp("^registry-copy/"+entry.contentId+"_ru_sync1005\\.md$"));
    const bytes=readSource(entry.bodyFile),body=bytes.toString(),hash=draftHash(bytes),revision="sha256:"+hash;
    assert.equal(hash,entry.bodySha256,"Draft hash drift: "+entry.contentId);
    assert.notEqual(original.candidate.ru.status,"owner_approved_semantics","Do not replace accepted copy with a draft");
    const tokenIds=[...body.matchAll(/\{\{CATALOG_PRICE:([a-z0-9_-]+)\}\}/g)].map(m=>m[1]);
    for(const id of tokenIds)assert(entry.priceOperationIds.includes(id)&&manifest.pricingOperations[id],"Unknown catalog token: "+id);
    assert(!body.replace(/\{\{CATALOG_PRICE:([a-z0-9_-]+)\}\}/g,"").includes("{{CATALOG_PRICE:"),"Malformed catalog token");
    assert(!/(?:Rp|IDR)\s*[1-9][\d. ]{5,}|[1-9][\d. ]{5,}\s*(?:IDR|рупий)/i.test(body),"Independent price copy");
    const record=markTranslationsStale(original,revision);
    record.candidate.exposure="preview_only";
    record.candidate.ru={status:"draft",bodyFile:entry.bodyFile,bodySha256:hash,approvalEvidence:null,approvalRevision:null};
    for(const [locale,t] of Object.entries(record.candidate.translations)){
      if(t.sourceRevision!==revision){t.status="stale";t.qa="not_done";t.complete=false;staleTranslations.push(entry.contentId+"/"+locale);}
    }
    if(original.serviceId!==null)assert.equal(entry.serviceId,original.serviceId,"Preserve existing service identity");
    if(original.pricingRef!==null)assert.deepEqual(entry.pricingRef,original.pricingRef,"Preserve existing pricing identity");
    record.serviceId=entry.serviceId;
    record.pricingRef=entry.pricingRef;
    record.bindingStatus=entry.pricingRef?"seed_confirmed":entry.serviceId?"unresolved":
      ["business","documents"].includes(entry.contentId)?"unresolved":"not_applicable";
    record.bindingEvidence=[...new Set([...original.bindingEvidence,"shared/content/next-stage-decisions.v1.json: "+entry.contentId+"; authorized identity only, not live availability"])];
    record.mergeTargetId=null;record.duplicateRisk=null;
    if(entry.contentId==="partners")record.reuseRoutes=record.reuseRoutes.filter(p=>!["/account/referrals/","/account/points/"].includes(p));
    record.inlineLinkTargets=[...new Set([...body.matchAll(/\]\((\/[a-z0-9/-]+\/)\)/g)].map(m=>m[1]))].map(sourceRoute=>({
      sourceRoute,contentId:sourceByRoute.get(sourceRoute)??null,
      status:sourceByRoute.has(sourceRoute)?"resolved_content_id":"planned_unmapped",
    }));
    record.relatedContentIds=[...new Set([...record.relatedContentIds,...record.inlineLinkTargets.map(t=>t.contentId).filter(Boolean)])];
    next.records[index]=record;changed.push(entry.contentId);
  }
  // The existing overview already owns generic requirements. Preserve the
  // unused candidate identity/URL without publishing an indexable duplicate.
  const redundant=next.records.find(r=>r.contentId==="knowledge_e33g_requirements");
  const owner=next.records.find(r=>r.contentId==="knowledge_e33g_overview");
  assert(redundant&&owner&&redundant.published===null&&redundant.candidate.ru.bodyFile===null);
  redundant.mergeTargetId=owner.contentId;
  redundant.duplicateRisk="Founder decision 13: generic requirements intent owned by remote-worker-kitas; no second public indexable copy";
  redundant.reuseRoutes=[...new Set([...redundant.reuseRoutes,owner.candidate.route])];
  assert.equal(manifest.deferredConcepts.privateReferral.status,"SHELL_APPROVED_TERMS_PENDING");
  assert.equal(manifest.deferredConcepts.privateReferral.publicRegistryContentId,null);
  assert.deepEqual(next.records.map(r=>[r.contentId,r.candidate.route,r.published]),
    registry.records.map(r=>[r.contentId,r.candidate.route,r.published]),"Public/current identity boundary");
  return {registry:next,summary:{importedDrafts:changed.length,preservedRecords:next.records.length,
    preservedPublishedBindings:next.records.filter(r=>r.published).length*2,changedIds:changed,
    staleTranslations,mergedIntent:"knowledge_e33g_requirements -> knowledge_e33g_overview",
    noTranslationsCreated:true,noPublication:true,noPricingMutation:true}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const contentRoot=fileURLToPath(new URL("../content/",import.meta.url));
  const registry=JSON.parse(readFileSync(resolve(contentRoot,"service-registry.v1.json")));
  const manifest=JSON.parse(readFileSync(resolve(contentRoot,"next-stage-decisions.v1.json")));
  const plan=planNextStageDraftImport(registry,manifest,file=>readFileSync(resolve(contentRoot,file)));
  if(process.argv.includes("--apply")){
    // Authorized bulk mechanical rewrite of the one existing Registry only.
    writeFileSync(resolve(contentRoot,"service-registry.v1.json"),JSON.stringify(plan.registry,null,2)+"\n");
  }
  console.log(JSON.stringify(plan.summary));
}
