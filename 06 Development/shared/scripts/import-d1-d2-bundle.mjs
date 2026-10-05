// Exact supplied editorial import only. No network, translation, runtime pricing
// calculation or publication. Source snapshots are evidence, not live prices.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, resolve, relative} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {canonicalJson} from "./import-sync-bundle.mjs";

export const d1D2Pages = {
  d1: {contentId:"d1", route:"/bali/visas/d1/", kind:"visa", parentId:"visas_bali"},
  d2: {contentId:"d2", route:"/bali/visas/d2/", kind:"visa", parentId:"visas_bali"},
  d1_d2: {contentId:"d1_d2", route:"/bali/visas/d1-d2/", kind:"comparison", parentId:"visas_bali"},
  d1_d2_extension: {contentId:"d1_d2_extension", route:"/bali/visas/d1-d2/extension/", kind:"extension", parentId:"d1_d2"},
  knowledge_extension: {contentId:"knowledge_d1_d2_extension", route:"/bali/knowledge/d1-d2/extension/", kind:"knowledge", parentId:null},
  knowledge_documents: {contentId:"knowledge_d1_d2_documents", route:"/bali/knowledge/d1-d2/documents/", kind:"knowledge", parentId:null},
};
export const d1D2OccurrenceSha256 = "5b3bfbeb105ef1543b7c6356e5579a2981fa557be64a6cf389e3434b77881b79";
const sha = value => createHash("sha256").update(value).digest("hex");
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+"\n");
const filename = (id,locale) => "registry-copy/"+id+"_"+locale.toLowerCase().replaceAll("-","_")+"_d1d2_20261005";
const evidencePrefix = "registry-copy/d1d2_source_pack/";
const pendingQaFile = "registry-copy/d1d2_qa_import.json";

export const d1D2EvidenceFiles = ["MANIFEST.json","INTEGRATION/REGISTRY_MAPPING.json","INTEGRATION/PRICE_BINDINGS.json",
  "INTEGRATION/CTA_LABELS.json","EDITORIAL/SEGMENT_MODEL.json","EDITORIAL/RU_SOURCE_REVISIONS.json",
  "EDITORIAL/SOURCE_CHANGES.json","QA/MODEL_REVIEW_EVIDENCE.json","QA/FINAL_VALIDATION.json",
  "QA/NUMERIC_LEXICAL_EXCEPTIONS.json","SOURCES/SOURCE_REGISTER.json",
  ...["RU","en","zh-Hans","ko","fr","de","ja","hi","es","ar"].map(l=>"EDITORIAL/STRINGS_"+l+".json")];

function newRecord(spec, source) {
  const extension = spec.kind === "extension";
  return {contentId:spec.contentId,kind:spec.kind,title:source.h1,parentId:spec.parentId,relatedContentIds:[],
    serviceId:extension?"visa-extension":null,
    pricingRef:extension?{entityType:"SERVICE",entityKey:"visa-extension",optionCodes:["d1-extension","d2-extension"]}:null,
    bindingStatus:extension?"seed_confirmed":"not_applicable",availability:"not_verified",
    bindingEvidence:extension?["shared/content/next-stage-decisions.v1.json: approved existing D1/D2 extension option identities; not live availability"]:[],
    published:null,candidate:{route:spec.route,exposure:"preview_only",revision:source.bodyRevision,ru:{},translations:{}},
    reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:"not_authorized",inlineLinkTargets:[]};
}

export function planD1D2Import({readBundle,occurrenceBytes,registry:inputRegistry,approvals:inputApprovals}) {
  const read = file => Buffer.from(readBundle(file));
  const manifestBytes=read("MANIFEST.json"), supplied=JSON.parse(manifestBytes);
  assert.equal(supplied.schemaVersion,1); assert.equal(supplied.batchId,"D1_D2_2026-10-05_v1");
  assert.equal(supplied.approvalEvidence,"2026-10-05T10:36:43Z");
  assert.deepEqual(supplied.pages,Object.keys(d1D2Pages));
  assert.deepEqual(supplied.locales,inputRegistry.locales.map(l=>l.code));
  assert.equal(supplied.records.length,60);
  assert.equal(new Set(supplied.records.map(r=>r.pageKey+"/"+r.locale)).size,60);
  assert.equal(sha(occurrenceBytes),d1D2OccurrenceSha256,"Prepared operation/occurrence map drift");
  const occurrenceMap=JSON.parse(occurrenceBytes), modelBytes=read("EDITORIAL/SEGMENT_MODEL.json"),model=JSON.parse(modelBytes);
  assert.equal(occurrenceMap.sourceEvidence.manifestSha256,sha(manifestBytes));
  assert.equal(occurrenceMap.sourceEvidence.segmentModelSha256,sha(modelBytes));
  assert.equal(occurrenceMap.sourceEvidence.priceBindingsSha256,sha(read("INTEGRATION/PRICE_BINDINGS.json")));
  assert.equal(occurrenceMap.occurrences.length,58);
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),writes=new Map();
  assert.ok([146,149].includes(registry.records.length),"Unexpected Registry baseline");
  const sources=new Map();
  for(const r of supplied.records) {
    assert.ok(d1D2Pages[r.pageKey] && supplied.locales.includes(r.locale));
    assert.equal(r.jsonFile,"CONTENT/"+r.locale+"/"+r.pageKey+".json");
    assert.equal(r.markdownFile,"CONTENT/"+r.locale+"/"+r.pageKey+".md");
    const wire=read(r.jsonFile),md=read(r.markdownFile),p=JSON.parse(wire);
    assert.equal(sha(wire),r.jsonSha256,"Supplied JSON wire hash: "+r.jsonFile);
    assert.equal(sha(md),r.markdownSha256,"Supplied body hash: "+r.markdownFile);
    assert.equal(md.toString("utf8"),p.bodyMarkdown,"Exact bodyMarkdown parity");
    assert.equal(p.pageKey,r.pageKey);assert.equal(p.locale,r.locale);assert.equal(p.sourceLocale,"ru");
    assert.equal(p.direction,r.locale==="ar"?"rtl":"ltr");
    assert.equal(p.routeProposal,inputRegistry.locales.find(l=>l.code===r.locale).prefix+d1D2Pages[r.pageKey].route);
    for(const key of ["sourceBodyRevision","sourcePayloadRevision","bodyRevision","payloadRevision"])assert.equal(p[key],r[key],key);
    assert.equal(p.bodyRevision,"sha256:"+sha(md));
    assert.deepEqual(p.sourceUnitOrder,model[r.pageKey].fields);
    assert.deepEqual(p.structure,r.structure);
    const dictionary=JSON.parse(read("EDITORIAL/STRINGS_"+(r.locale==="ru"?"RU":r.locale)+".json"));
    const fields=Object.fromEntries(Object.entries(p.sourceUnitOrder).map(([field,ids])=>[field,
      ids.map(id=>{assert.equal(typeof dictionary[id],"string",id);return dictionary[id];}).join("\n\n")+(["body","fact"].includes(field)?"\n":"")]));
    assert.deepEqual(fields,{title:p.seo.title,description:p.seo.description,h1:p.h1,fact:p.factSourceMarkdown,body:p.bodyMarkdown,cta:p.ctaSourceMarkdown},"Lossless source-unit composition");
    assert.equal(p.payloadRevision,"sha256:"+sha(canonicalJson(fields)),"Payload hash is not body hash");
    assert.equal(p.approval.status,r.locale==="ru"?"OWNER_DELEGATED_RU_APPROVAL":"MODEL_REVIEWED_PENDING_RENDER_QA");
    assert.equal(p.approval.nativeSpeakerReview,false);assert.equal(p.approval.browserReview,false);
    assert.ok(Array.isArray(p.faq) && p.faq.every(f=>f.question && f.answerMarkdown));
    assert.ok(Array.isArray(p.cta) && p.cta.length>0);
    sources.set(r.pageKey+"/"+r.locale,{r,p,wire,md});
  }
  const newIds=["d1_d2_extension","knowledge_d1_d2_extension","knowledge_d1_d2_documents"];
  for(const [key,spec] of Object.entries(d1D2Pages)) {
    const source=sources.get(key+"/ru");
    let record=registry.records.find(x=>x.contentId===spec.contentId);
    if(!record) {assert.ok(newIds.includes(spec.contentId));record=newRecord(spec,source.p);registry.records.push(record);}
    assert.equal(record.candidate.route,spec.route,"Preserve existing canonical route");
    if(record.candidate.ru.status==="owner_approved_semantics")assert.equal(record.candidate.revision,source.p.bodyRevision,"Refuse conflicting approved candidate");
    record.title=source.p.h1;
    record.candidate={route:spec.route,exposure:"preview_only",revision:source.p.bodyRevision,ru:{},translations:{}};
    if(!approvals.entries.some(a=>a.contentId===spec.contentId && a.revision===source.p.bodyRevision))approvals.entries.push({
      contentId:spec.contentId,revision:source.p.bodyRevision,public_content_sha256:source.r.markdownSha256,
      authority:"Founder",status:"OWNER_DELEGATED_RU_APPROVAL",scope:"editorial_semantics_only_not_render_or_legal_verification",
      evidence:"Founder delegated RU approval 2026-10-05T10:36:43Z; exact D1/D2 supplied payload; not fictional manual/native/browser review",
      sourceFileSha256:source.r.jsonSha256,sourcePayloadRevision:source.p.payloadRevision});
  }
  assert.equal(registry.records.length,149);
  const routeToId=new Map(registry.records.map(r=>[r.candidate.route,r.contentId]));
  const qa={schemaVersion:1,batchId:supplied.batchId,status:"MODEL_REVIEWED_PENDING_RENDER_QA",nativeReview:false,
    browserReview:false,legalVerification:false,sourceEvidence:evidencePrefix+"QA/MODEL_REVIEW_EVIDENCE.json",records:[]};
  const build={schemaVersion:1,version:supplied.batchId,stage:"IMPORTED_PENDING_RENDER_QA",
    authority:{publisher:"Founder",approvalEvidence:supplied.approvalEvidence,scope:"Exact supplied D1/D2 content import; publication after separate actual gates"},
    fullPayloadKind:"D1_D2_FULL_JSON_V1",sourceManifestSha256:sha(manifestBytes),
    priceOccurrences:{file:"registry-copy/d1d2_price_occurrences.json",sha256:d1D2OccurrenceSha256,runtimeSource:"existing editable catalog and existing FX; snapshot prices are not authoritative"},
    publicationGates:{render:false,responsive:false,accessibility:false,crossSurfacePriceParity:false,sourceUncertaintyReview:false},
    coveredNotDuplicated:{plannedRoute:"/bali/knowledge/d1-d2/d1-vs-d2/",mergeTargetId:"d1_d2",automaticRedirect:false,automaticDeletion:false},records:[]};
  for(const [key,spec] of Object.entries(d1D2Pages)) {
    const record=registry.records.find(r=>r.contentId===spec.contentId),ru=sources.get(key+"/ru");
    record.relatedContentIds=ru.p.relatedContent.map(x=>{assert.ok(d1D2Pages[x.pageKey]);return d1D2Pages[x.pageKey].contentId;});
    record.inlineLinkTargets=[...new Set(ru.p.inlineLinkTargets.map(x=>x.sourceHref))].map(sourceRoute=>({sourceRoute,
      contentId:routeToId.get(sourceRoute)??null,status:routeToId.has(sourceRoute)?"resolved_content_id":"planned_unmapped"}));
    const entry={contentId:spec.contentId,pageKey:key,sourceRevision:ru.p.bodyRevision,sourcePayloadRevision:ru.p.payloadRevision,
      canonicalPath:spec.route,serviceId:record.serviceId,pricingRef:record.pricingRef,
      publication:{indexable:false,lastModified:supplied.date,gateStatus:"PENDING_ACTUAL_RENDER_QA"},locales:{}};
    for(const locale of supplied.locales) {
      const {r,p,wire,md}=sources.get(key+"/"+locale),base=filename(spec.contentId,locale);
      assert.equal(p.sourceBodyRevision,ru.p.bodyRevision);assert.equal(p.sourcePayloadRevision,ru.p.payloadRevision);
      const meta={...p,fullPayloadKind:"D1_D2_FULL_JSON_V1",resolvedContentId:spec.contentId,resolvedCanonicalPath:spec.route,
        sourceRevision:ru.p.bodyRevision,bodySha256:r.markdownSha256,
        seoTitle:p.seo.title,metaDescription:p.seo.description,factBlock:p.factBlockMarkdown,
        sourceFile:base+".source.json",sourceFileSha256:r.jsonSha256,sourceEnvelopeSha256:ru.r.jsonSha256,
        priceOccurrenceFile:build.priceOccurrences.file};
      const metaBytes=jsonBytes(meta);
      writes.set(base+".source.json",wire);writes.set(base+".md",md);writes.set(base+".meta.json",metaBytes);
      const common={bodyFile:base+".md",bodySha256:r.markdownSha256,metadataFile:base+".meta.json",metadataSha256:sha(metaBytes),sourceEnvelopeSha256:ru.r.jsonSha256};
      if(locale==="ru")record.candidate.ru={status:"owner_approved_semantics",...common,
        approvalEvidence:"Founder delegated supplied RU approval 2026-10-05T10:36:43Z; not legal/native/browser certification",approvalRevision:ru.p.bodyRevision};
      else record.candidate.translations[locale]={sourceRevision:ru.p.bodyRevision,status:"translated",complete:true,qa:"passed",...common,
        qaMethod:"supplied_model_semantic",qaEvidence:"MODEL_REVIEWED_PENDING_RENDER_QA; supplied semantic review passed; render pending; no native/legal verification",
        qaFile:pendingQaFile,qaPage:key.replaceAll("_","-")+".md"};
      qa.records.push({contentId:spec.contentId,page:key.replaceAll("_","-")+".md",locale,bodySha256:"sha256:"+r.markdownSha256,
        sourceRevision:ru.p.bodyRevision,sourceEnvelopeSha256:ru.r.jsonSha256,status:locale==="ru"?"OWNER_DELEGATED_RU_APPROVAL":"MODEL_REVIEWED_PENDING_RENDER_QA",
        sourceOriginReconciled:true,sourceFileSha256:r.jsonSha256,sourcePayloadRevision:ru.p.payloadRevision,
        nativeReview:false,browserReview:false,legalVerification:false,sourceCaveats:p.sourceLimitations});
      entry.locales[locale]={route:registry.locales.find(l=>l.code===locale).prefix+spec.route,...common,
        sourceFile:base+".source.json",sourceFileSha256:r.jsonSha256,payloadRevision:p.payloadRevision,direction:p.direction};
    }
    build.records.push(entry);
  }
  for(const id of ["d1_extension","d2_extension"]) {
    const record=registry.records.find(r=>r.contentId===id);assert.ok(record && record.published===null);
    assert.equal(record.candidate.ru.status,"draft");
    record.mergeTargetId="d1_d2_extension";
    record.duplicateRisk="Separate preserved candidate; shared D1/D2 extension owns public editorial intent. No automatic redirect or deletion.";
  }
  const owned=new Set([...Object.values(d1D2Pages).map(x=>x.contentId),"d1_extension","d2_extension"]);
  for(const old of inputRegistry.records) {
    const next=registry.records.find(r=>r.contentId===old.contentId);
    assert.deepEqual(next.published,old.published,"Existing public bindings unchanged");
    assert.deepEqual(next.pricingRef,old.pricingRef,"Existing business identities unchanged");
    assert.equal(next.serviceId,old.serviceId);
    if(!owned.has(old.contentId))assert.deepEqual(next,old,"Unrelated record changed");
  }
  for(const file of d1D2EvidenceFiles)writes.set(evidencePrefix+file,read(file));
  writes.set(build.priceOccurrences.file,Buffer.from(occurrenceBytes));
  writes.set(pendingQaFile,jsonBytes(qa));
  writes.set("registry-d1-d2-build.v1.json",jsonBytes(build));
  writes.set("service-registry.v1.json",jsonBytes(registry));
  writes.set("registry-approvals.v1.json",jsonBytes(approvals));
  return {writes,registry,approvals,build,qa,summary:{records:149,contentPages:6,locales:10,sourceFiles:60,exactBodies:60,
    fullMetadata:60,newContentIds:newIds,existingPublishedBindings:registry.records.filter(r=>r.published).length*2,
    priceOccurrences:58,localizedOccurrences:580,translationsAuthored:0,renderQa:"PENDING",publication:false}};
}

export function applyD1D2Plan(plan,contentRoot,{expectedRegistrySha256,expectedApprovalsSha256}={}) {
  // Preflight ALL writes before touching anything; immutable imported artifacts
  // and a concurrently changed Registry never get silently overwritten.
  for(const [file,bytes] of plan.writes) {
    const target=resolve(contentRoot,file);assert.ok(!relative(contentRoot,target).startsWith(".."));
    if(!existsSync(target))continue;
    const actual=sha(readFileSync(target));
    const expected=file==="service-registry.v1.json"?expectedRegistrySha256:file==="registry-approvals.v1.json"?expectedApprovalsSha256:sha(bytes);
    assert.equal(actual,expected,"Refuse unrelated/concurrent overwrite: "+file);
  }
  for(const [file,bytes] of plan.writes) {const target=resolve(contentRoot,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const bundle=resolve(process.argv[2]),occurrenceArgument=process.argv.indexOf("--occurrences");
  assert.ok(occurrenceArgument>0,"Use --occurrences <prepared map>");
  const contentRoot=fileURLToPath(new URL("../content/",import.meta.url));
  const registryBytes=readFileSync(resolve(contentRoot,"service-registry.v1.json")),approvalBytes=readFileSync(resolve(contentRoot,"registry-approvals.v1.json"));
  const plan=planD1D2Import({readBundle:file=>{const path=resolve(bundle,file);assert.ok(!relative(bundle,path).startsWith(".."));return readFileSync(path);},
    occurrenceBytes:readFileSync(resolve(process.argv[occurrenceArgument+1])),registry:JSON.parse(registryBytes),approvals:JSON.parse(approvalBytes)});
  if(process.argv.includes("--apply"))applyD1D2Plan(plan,contentRoot,{expectedRegistrySha256:sha(registryBytes),expectedApprovalsSha256:sha(approvalBytes)});
  console.log(JSON.stringify(plan.summary));
}
