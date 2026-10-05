// Deterministic supplied-content import. No translation, network or publication.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve,relative} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";

export const syncPageIds = {
  "c1-main":"c1", "c1-extension":"c1_extension",
  "knowledge-c1-main":"knowledge_c1_overview", "knowledge-c1-extension":"knowledge_c1_extension",
  "knowledge-c1-price":"knowledge_c1_price", "evoa-main":"voa", "voa-evoa-extension":"voa_extension",
  "knowledge-evoa-online":"knowledge_evoa_online", "knowledge-evoa-extension":"knowledge_evoa_extension",
  "knowledge-evoa-vs-voa":"knowledge_evoa_vs_voa", "e33g-main":"e33g",
  "e33g-requirements":"knowledge_e33g_overview", "e33g-documents":"knowledge_e33g_documents",
  "e33g-family":"knowledge_e33g_family",
};
export const hashBytes = bytes => createHash("sha256").update(bytes).digest("hex");
export const canonicalJson = value => JSON.stringify(Array.isArray(value) ? value.map(v=>JSON.parse(canonicalJson(v))) :
  value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonicalJson(value[k]))])) : value);
export const metadataEnvelope = (body,meta) => hashBytes(Buffer.concat([Buffer.from(body),Buffer.from("\n" + canonicalJson(
  Object.fromEntries(["h1","seoTitle","metaDescription","directAnswer","factBlock"].map(k=>[k,meta[k]??null]))))]));

export function planSyncImport(bundleRoot,contentRoot,{acceptOlderOrigin=false}={}) {
  const checked = file => {const path=resolve(bundleRoot,file); assert.ok(!relative(bundleRoot,path).startsWith("..") && path!==bundleRoot);return readFileSync(path);};
  const manifest=JSON.parse(checked("MANIFEST.json"));
  assert.equal(manifest.records.length,140);
  assert.equal(new Set(manifest.records.map(r=>r.pageKey+"/"+r.locale)).size,140);
  const registry=JSON.parse(readFileSync(resolve(contentRoot,"service-registry.v1.json")));
  const approvals=JSON.parse(readFileSync(resolve(contentRoot,"registry-approvals.v1.json")));
  const presentation=JSON.parse(readFileSync(resolve(contentRoot,"registry-presentation-approvals.v1.json")));
  const writes=new Map(),reconciliations=[],qa={version:"sync1004",status:"MODEL_REVIEWED_PENDING_RENDER_QA",records:[]};
  const allowedLocales=new Set(registry.locales.map(l=>l.code));
  const ruRecords=manifest.records.filter(r=>r.locale==="ru");
  const activeIds=new Set();
  for (const r of ruRecords) {
    const id=syncPageIds[r.pageKey],record=registry.records.find(x=>x.contentId===id);
    assert.ok(record,"Missing existing content identity");
    const current=record.candidate.ru.bodySha256;
    const sameOrigin=current===r.sourceOriginalSha256 || current===r.bodySha256;
    // A newer local Founder correction cannot be silently dropped by an older
    // supplier source. Save exact incoming assets but retain the active binding.
    const allowedOlderOrigin=acceptOlderOrigin && ["voa","knowledge_evoa_vs_voa"].includes(id);
    const blocked=!sameOrigin && !allowedOlderOrigin;
    reconciliations.push({contentId:id,oldRevision:record.candidate.revision,sourceOriginalSha256:r.sourceOriginalSha256,
      incomingRevision:r.sourceRevision,sourceEnvelopeSha256:r.sourceEnvelopeSha256,status:blocked?"SOURCE_ORIGIN_CONFLICT":"RECONCILED",
      authority:!sameOrigin && allowedOlderOrigin?"Founder 2026-10-04 explicitly accepted new supplied RU without 2-3h":null});
    if(blocked)continue;
    activeIds.add(id);
    record.candidate.revision=r.sourceRevision;
    record.candidate.ru={status:"owner_approved_semantics",bodyFile:"registry-copy/"+id+"_ru_sync1004.md",bodySha256:r.bodySha256,
      metadataFile:"registry-copy/"+id+"_ru_sync1004.meta.json",metadataSha256:r.metadataSha256,sourceEnvelopeSha256:r.sourceEnvelopeSha256,
      approvalEvidence:"Founder 2026-10-04 requested exact supplied import; documented cleanup and bank wording; not legal/public-release certification",
      approvalRevision:r.sourceRevision};
    if(!approvals.entries.some(a=>a.contentId===id && a.revision===r.sourceRevision))approvals.entries.push({contentId:id,revision:r.sourceRevision,
      public_content_sha256:r.bodySha256,authority:"Founder sync answers 2026-10-04",evidence:"sync1004 supplied approved RU + documented source derivation",scope:"editorial_semantics_only"});
  }
  for(const r of manifest.records){
    const id=syncPageIds[r.pageKey];assert.ok(id && allowedLocales.has(r.locale));
    const record=registry.records.find(x=>x.contentId===id),name=id+"_"+r.locale.toLowerCase().replaceAll("-","_")+"_sync1004";
    for(const [file,hash,suffix] of [[r.articleBodyFile,r.bodySha256,".md"],[r.metadataFile,r.metadataSha256,".meta.json"],[r.completeReferenceFile,r.completeReferenceSha256,"_reference.md"]]){
      const bytes=checked(file);assert.equal(hashBytes(bytes),hash,file);
      writes.set("registry-copy/"+name+suffix,bytes);
    }
    const source=checked(r.sourceFile),sourceMeta=JSON.parse(checked(r.sourceFile+".meta.json"));
    assert.equal("sha256:"+hashBytes(source),r.sourceRevision);
    assert.equal(metadataEnvelope(source,sourceMeta),r.sourceEnvelopeSha256);
    assert.equal(hashBytes(checked(r.sourceOriginalFile)),r.sourceOriginalSha256);
    const meta=JSON.parse(checked(r.metadataFile));
    assert.equal(meta.sourceRevision,r.sourceRevision);assert.equal(meta.bodySha256,r.bodySha256);
    assert.equal(meta.locale,r.locale);assert.equal(meta.direction,r.locale==="ar"?"rtl":"ltr");
    if(r.locale!=="ru") {
      qa.records.push({contentId:id,page:r.pageKey+".md",locale:r.locale,bodySha256:"sha256:"+r.bodySha256,sourceRevision:r.sourceRevision,
        sourceEnvelopeSha256:r.sourceEnvelopeSha256,status:"MODEL_REVIEWED_PENDING_RENDER_QA",nativeReview:false,legalVerification:false,
        sourceCaveats:r.sourceCaveats,sourceOriginReconciled:activeIds.has(id)});
      if(activeIds.has(id))record.candidate.translations[r.locale]={sourceRevision:r.sourceRevision,status:"translated",complete:true,qa:"passed",
        bodyFile:"registry-copy/"+name+".md",bodySha256:r.bodySha256,metadataFile:"registry-copy/"+name+".meta.json",
        metadataSha256:r.metadataSha256,sourceEnvelopeSha256:r.sourceEnvelopeSha256,qaMethod:"supplied_model_semantic",
        qaEvidence:"Supplied model review 2026-10-04; bundle integrity verified; rendering/legal/public release remain separate",
        qaFile:"registry-copy/sync1004_qa_import.json",qaPage:r.pageKey+".md"};
    }
    if(activeIds.has(id) && presentation.sourceBindings[id]?.[r.locale])presentation.sourceBindings[id][r.locale]=r.bodySha256;
  }
  writes.set("registry-copy/sync1004_manifest.json",checked("MANIFEST.json"));
  writes.set("registry-copy/sync1004_source_revisions.json",checked("AUDIT/SOURCE_REVISIONS.json"));
  writes.set("registry-copy/sync1004_qa_import.json",Buffer.from(JSON.stringify(qa,null,2)+"\n"));
  writes.set("registry-copy/sync1004_reconciliation.json",Buffer.from(JSON.stringify({records:reconciliations},null,2)+"\n"));
  presentation.version="founder-editorial-2026-10-04-sync1";
  writes.set("service-registry.v1.json",Buffer.from(JSON.stringify(registry,null,2)+"\n"));
  writes.set("registry-approvals.v1.json",Buffer.from(JSON.stringify(approvals,null,2)+"\n"));
  writes.set("registry-presentation-approvals.v1.json",Buffer.from(JSON.stringify(presentation,null,2)+"\n"));
  return {writes,registry,reconciliations,summary:{suppliedRecords:140,activatedRecords:activeIds.size*10,
    preservedIds:registry.records.length,preservedPublicBindings:registry.records.filter(r=>r.published).length*2,
    originConflicts:reconciliations.filter(r=>r.status==="SOURCE_ORIGIN_CONFLICT").map(r=>r.contentId),noTranslation:true,noPublication:true}};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const bundle=resolve(process.argv[2]),contentRoot=fileURLToPath(new URL("../content/",import.meta.url));
  const plan=planSyncImport(bundle,contentRoot,{acceptOlderOrigin:process.argv.includes("--accept-older-origin")});
  if(process.argv.includes("--apply")) {
    // Bulk mechanical import only: byte-exact supplied files + derived JSON.
    // No authored copy, supplied originals, runtime or external state is edited.
    for(const [file,bytes] of plan.writes) {
      const target=resolve(contentRoot,file);
      if(existsSync(target) && file.startsWith("registry-copy/") && !file.includes("sync1004_qa_import") && !file.includes("sync1004_reconciliation"))assert.equal(hashBytes(readFileSync(target)),hashBytes(bytes),"Refuse unrelated dirty overwrite: "+file);
      writeFileSync(target,bytes);
    }
  }
  console.log(JSON.stringify(plan.summary));
}
