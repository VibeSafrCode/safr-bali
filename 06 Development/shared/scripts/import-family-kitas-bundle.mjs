// Exact editorial import only. No translations, business entities, family
// tariff, FX calculation, browser/legal attestation, deployment or network.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const FAMILY_BATCH='FAMILY_KITAS_2026-10-09_v1';
export const FAMILY_KIND='FAMILY_KITAS_FULL_JSON_V1';
export const FAMILY_GATES=['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview'];
export const familyPages=Object.freeze({
  'family-kitas':{contentId:'family',route:'/bali/visas/family-kitas/',oldRoute:'/bali/visas/family-kitas/',oldSha:'3ca39428c6ad559367a60af7c39f45a2ba6648f3c93894e6cdf2a6a479b24dab',faqSectionIndex:10,faqCount:7},
  'family-kitas-spouse':{contentId:'family_spouse',route:'/bali/visas/family-kitas/spouse/',oldRoute:'/bali/visas/family-kitas/spouse/',oldSha:'1c0bbb6ee2de3fc995647d61a4e5521aea05b24d34334d06692d238888fa7c79',faqSectionIndex:9,faqCount:5},
  'child-kitas':{contentId:'family_child',route:'/bali/visas/child-kitas/',oldRoute:'/bali/visas/family-kitas/child/',oldSha:'d618d40e17c5ffb8cfefcd4d32efcfdb4c79aad2016ca80c5014fa75548fb728',faqSectionIndex:10,faqCount:5},
  'family-kitas-parents':{contentId:'family_parent',route:'/bali/visas/family-kitas/parents/',oldRoute:'/bali/visas/family-kitas/parent/',oldSha:'b2ae8ca9b173085a304c990edefd2614d5d9ad95520d8fcea70d1fc27a39a6d5',faqSectionIndex:9,faqCount:5},
  'family-kitas-documents':{contentId:'knowledge_family_documents',route:'/bali/knowledge/family-kitas/documents/',oldRoute:null,oldSha:null,faqSectionIndex:12,faqCount:5},
});
export const familyEvidenceHashes=Object.freeze({
  'CONTENT_LOCALIZED_IMPORT.json':'6a4c90ad5c62c6ccde35b6c59ba6a43ac6021064cf7818a0ca8fea43c5b723fa',
  'SHA256SUMS.txt':'f97557c5d412513c1a984a8d183896e5a537760ab12246ba1c201cc868d4a88d',
  'START_HERE_RU.md':'920f2e910bf2c18efc8d63e3897556a18478cec95b76e63bbca380ea59964a02',
  'CODEX_PROMPT_RELEASE_ALL_RU.md':'6faa551379e3f523223d3cadd7f6141d4b5a9553964a1deb2ea68dae8d39b336',
  'QA/QA_REPORT_RU.md':'ed2bdca81611a49a7ad104f4cf6b809a976b9fb693784ecf8559cbbfbbddd6be',
  'QA/parity_results.json':'e165cb72f8a70dfda7baaaf2723a8a6d6826493a53ef3fdbe02252ef69b0dc65',
  'QA/validate_bundle.py':'ac26cdc47f187e64fa3ef01d545c043e7ba884e5737f84b0b4e43275497a0d34',
  'RESEARCH/FACT_BASE_AND_SOURCES.md':'286f290fe5dc91cd70b74e6c1014594badb51c2ab4a0ea9f7b2aedb33cc9e6cd',
  'RESEARCH/SEO_INTENT_AND_ROUTES.md':'40e6b6da6391e28cdb55c36c66514cfa1efa8390198935e0741f1a3132590498',
  'RESEARCH/E33G_FAMILY_CRITICAL_CORRECTION.md':'7f375819d580bd796fe86989ad048137f55f1bac982d6424c5eabfb2196998dc',
  'RESEARCH/E33G_FAMILY_LOCALE_PATCHES_EN_DE_ZH.md':'6db8c2320951f3fc0b9186b25f50bbfcf22023f76627fa7bc6e68ec1420738cd',
  'RESEARCH/E33G_FAMILY_LOCALE_PATCHES_KO_FR_JA.md':'d2a8a11aadbe68891be5cad9f56e15ece5797a0f2d8a7f79118b04797107c189',
  'RESEARCH/E33G_FAMILY_LOCALE_PATCHES_HI_ES_AR.md':'f77ebc738744bcd5b5d07a911330a58ba5826a4bdd10d93003230f5831e313c9',
});
export const familySha=value=>createHash('sha256').update(value).digest('hex');
const sha=familySha,jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const FAMILY_PACK='registry-copy/family_kitas_source_pack/';
export const FAMILY_QA='registry-copy/family_kitas_qa_import.json';
export const FAMILY_OCCURRENCES='registry-copy/family_kitas_price_occurrences.json';
export const familyPriceOperations=Object.freeze({
  e33g_standard:{entity_type:'VISA',entity_key:'E33G',option_code:'standard'},
  e33g_express:{entity_type:'VISA',entity_key:'E33G',option_code:'express'},
});
export function verifyFamilyArchive(readBundle) {
  const manifest=Buffer.from(readBundle('SHA256SUMS.txt'));assert.equal(sha(manifest),familyEvidenceHashes['SHA256SUMS.txt']);
  const entries=manifest.toString().trim().split('\n');assert.equal(entries.length,63);
  for(const line of entries){const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m);assert.ok(!m[2].startsWith('/')&&!m[2].split('/').includes('..'));assert.equal(sha(readBundle(m[2])),m[1],'Original archive member drift: '+m[2]);}
  return {archiveMembersVerified:63,sourceChecksumManifestSha256:familyEvidenceHashes['SHA256SUMS.txt']};
}
const baseName=(id,locale)=>'registry-copy/'+id+'_'+locale.toLowerCase().replaceAll('-','_')+'_family_20261009';
const sections=body=>{const ms=[...body.matchAll(/^## (.+)$/gm)];return ms.map((m,i)=>({heading:m[1],start:m.index+m[0].length,end:ms[i+1]?.index??body.length}));};
export function publicFamilyBody(original) {
  assert.ok(original.startsWith('# ')&&!original.includes('\r'));assert.equal((original.match(/^# /gm)??[]).length,1);
  const first=original.search(/^## /m);assert.ok(first>0);
  return original.split('\n')[0]+'\n\n'+original.slice(first).trim()+'\n';
}
export function readFamilyStructure(body,{faqSectionIndex,faqCount}) {
  const parts=sections(body),faqPart=parts[faqSectionIndex];assert.ok(parts[0]&&faqPart);
  const text=body.slice(faqPart.start,faqPart.end),questions=[...text.matchAll(/^### (.+)$/gm)];assert.equal(questions.length,faqCount);
  const faq=questions.map((m,i)=>({question:m[1],answerMarkdown:text.slice(m.index+m[0].length,questions[i+1]?.index??text.length).trim()}));
  assert.ok(faq.every(row=>row.answerMarkdown));
  const cta=[];
  for(const [role,pattern] of [['primary',/^\*\*(?:Основная кнопка|Primary button):\*\*\s*([^\n]+)/m],['secondary',/^\*\*(?:Дополнительная кнопка|Secondary button):\*\*\s*([^\n]+)/m]]) {
    const label=body.match(pattern)?.[1].trim();if(label)cta.push({role,label,actionIntent:role==='primary'?'family_case_check':'family_quote'});
  }
  assert.ok(cta.length>=1&&cta.length<=2);
  const tables=[...body.matchAll(/(?:^\|[^\n]*\n){2,}/gm)].map(m=>({markdown:m[0],rows:m[0].trimEnd().split('\n').length}));
  const links=[...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m=>({label:m[1],sourceHref:m[2]}));
  return {directAnswer:body.slice(parts[0].start,parts[0].end).trim(),faq,faqHeading:faqPart.heading,faqSectionIndex,cta,tables,
    inlineLinkTargets:links.filter(l=>l.sourceHref.startsWith('/')),externalSources:links.filter(l=>/^https?:\/\//.test(l.sourceHref))};
}
// These literals occur only in an explicit NOT-family-price explanation.
// Replace the whole coordinated unit so localized million multipliers cannot
// multiply the rendered full IDR amounts. Eligibility USD 2,000 stays exact.
const principalPair=/(?:IDR\s*)?12\/14\s*(?:млн|million(?:s)?|Millionen|백만|百万|मिलियन|millones|مليون)(?:\s*IDR)?|1200\s*万／1400\s*万\s*IDR/gu;
export function familyPriceOccurrences(meta) {
  const matches=[...meta.bodyMarkdown.matchAll(principalPair)];
  assert.equal(matches.length,meta.pageKey==='family-kitas-spouse'?1:0,'Reviewed principal-only reference sequence');
  for(const field of [meta.h1,meta.seo.title,meta.seo.description,meta.directAnswer,...meta.faq.flatMap(r=>[r.question,r.answerMarkdown])])assert.equal([...field.matchAll(principalPair)].length,0,'Unexpected commercial mirror');
  return matches.map(m=>({pageKey:meta.pageKey,contentId:meta.resolvedContentId,locale:meta.locale,fieldProperty:'bodyMarkdown',
    fieldSha256:sha(meta.bodyMarkdown),fieldSpan:{utf16Start:m.index,utf16End:m.index+m[0].length,
      utf8ByteStart:Buffer.byteLength(meta.bodyMarkdown.slice(0,m.index)),utf8ByteEnd:Buffer.byteLength(meta.bodyMarkdown.slice(0,m.index+m[0].length)),literal:m[0]},
    operationIds:['e33g_standard','e33g_express'],meaning:'PRINCIPAL_E33G_REFERENCE_NOT_DEPENDENT_PRICE',
    bodySha256:meta.bodySha256,sourceRevision:meta.sourceRevision}));
}
const newDocumentsRecord=()=>({contentId:'knowledge_family_documents',kind:'knowledge',title:'Документы для Family KITAS',parentId:'knowledge_hub',relatedContentIds:[],serviceId:null,pricingRef:null,
  bindingStatus:'not_applicable',availability:'not_verified',bindingEvidence:[],published:null,
  candidate:{route:familyPages['family-kitas-documents'].route,exposure:'preview_only',revision:'FAMILY_KITAS_PENDING',ru:{status:'missing',bodyFile:null,bodySha256:null,approvalEvidence:null,approvalRevision:null},translations:{}},
  reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]});

export function planFamilyImport({readBundle,registry:inputRegistry,approvals:inputApprovals}) {
  const read=file=>Buffer.from(readBundle(file)),writes=new Map();
  for(const [file,pin] of Object.entries(familyEvidenceHashes))assert.equal(sha(read(file)),pin,'Supplied evidence drift: '+file);
  const checksumEntries=read('SHA256SUMS.txt').toString().trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})  ([^\n]+)$/);assert.ok(m);assert.ok(!m[2].startsWith('/')&&!m[2].split('/').includes('..'));return [m[2],m[1]];});
  assert.equal(checksumEntries.length,63);assert.equal(new Set(checksumEntries.map(([file])=>file)).size,63);
  // Full original archive integrity is checked separately by the CLI. The
  // replayable sanitized plan excludes the private portable chat context.
  for(const [file,pin] of checksumEntries.filter(([file])=>file!=='SAFRWAY_CHAT_CONTEXT_CURRENT_v65.md'))assert.equal(sha(read(file)),pin,'Imported archive member drift: '+file);
  const supplied=JSON.parse(read('CONTENT_LOCALIZED_IMPORT.json')),report=JSON.parse(read('QA/parity_results.json'));
  assert.equal(supplied.bundle_id,'safrway-family-kitas-all-10-locales-2026-10-09');assert.equal(supplied.records.length,50);assert.equal(supplied.record_count,50);
  assert.equal(new Set(supplied.records.map(r=>r.content_key_proposed+'/'+r.locale)).size,50);
  assert.deepEqual([...supplied.languages].sort(),inputRegistry.locales.map(l=>l.code).sort());assert.equal(report.status,'PASS');assert.deepEqual(report.issues,[]);
  assert.equal(report.translated_pages,45);assert.equal(report.faq_translated_total,243);assert.equal(report.internal_link_occurrences,189);assert.equal(report.negative_tests.length,7);assert.ok(report.negative_tests.every(t=>t.detected));
  const replay=inputRegistry.records.some(r=>r.contentId==='knowledge_family_documents');assert.equal(inputRegistry.records.length,replay?153:152);
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),sourceRows=new Map(),reconciliation=[];
  if(!replay)registry.records.push(newDocumentsRecord());
  for(const [pageKey,spec] of Object.entries(familyPages)) {
    const record=registry.records.find(r=>r.contentId===spec.contentId);assert.ok(record);assert.equal(record.published,null,'Do not replace published content');
    assert.equal(record.serviceId,spec.oldRoute?'visa':null);assert.equal(record.pricingRef,null,'Family remains quote-only');
    for(const other of registry.records.filter(r=>r.contentId!==record.contentId)) {
      assert.notEqual(other.candidate.route,spec.route,'Occupied candidate route');
      for(const route of Object.values(other.published?.routes??{}))assert.ok(!route.endsWith(spec.route),'Occupied published route');
    }
    for(const language of registry.locales) {
      const locale=language.code,row=supplied.records.find(r=>r.content_key_proposed===pageKey&&r.locale===locale);assert.ok(row);
      assert.equal(row.existing_content_id,'RESOLVE_IN_LIVE_REGISTRY');assert.equal(row.existing_service_id,'RESOLVE_IF_APPLICABLE_DO_NOT_DERIVE_FROM_URL');
      assert.equal(row.pricing_ref,'QUOTE_ONLY_NO_APPROVED_FIXED_FAMILY_RATE');assert.equal(row.pricing_display,'INDIVIDUAL_QUOTE_EACH_DEPENDENT_NO_NUMERIC_ZERO');
      assert.equal(row.route_is_final,false);assert.equal(row.proposed_base_route,spec.route);assert.equal(row.proposed_localized_route,language.prefix+spec.route);
      assert.equal(row.html_lang,locale);assert.equal(row.direction,language.dir);assert.equal(row.body_contains_metadata,false);assert.equal(row.faq_rendering,'ALREADY_IN_BODY_DO_NOT_APPEND_DUPLICATE');
      const original=read(row.source_file),bodyBytes=Buffer.from(row.body_markdown),sourceJsonBytes=jsonBytes(row);
      assert.equal(sha(original),row.source_file_sha256);assert.equal(sha(bodyBytes),row.body_sha256);assert.equal(publicFamilyBody(original.toString()),row.body_markdown);
      const ruRow=supplied.records.find(r=>r.content_key_proposed===pageKey&&r.locale==='ru');assert.equal(row.canonical_ru_sha256,ruRow.source_file_sha256);
      assert.equal(row.body_markdown.match(/^# (.+)$/m)[1],row.h1);
      const structure=readFamilyStructure(row.body_markdown,spec),base=baseName(spec.contentId,locale),revision='sha256:'+ruRow.body_sha256;
      const meta={...row,fullPayloadKind:FAMILY_KIND,pageKey,resolvedContentId:spec.contentId,resolvedCanonicalPath:spec.route,
        bodyMarkdown:row.body_markdown,seoTitle:row.seo_title,metaDescription:row.seo_description,seo:{title:row.seo_title,description:row.seo_description},...structure,
        factBlock:{heading:'',items:[]},factBlockMarkdown:'',bodySha256:row.body_sha256,bodyRevision:'sha256:'+row.body_sha256,sourceRevision:revision,approvedSourceRevision:'sha256:'+ruRow.source_file_sha256,
        bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,sourceFile:base+'.source.json',sourceFileSha256:sha(sourceJsonBytes),sourceMarkdownFile:base+'.source.md',sourceMarkdownSha256:row.source_file_sha256,
        sourceJsonPackSha256:familyEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json'],sourceJsonSerialization:'Derived exact logical record; immutable whole supplied JSON wire is separately archived and SHA-pinned',
        quotePolicy:{familyRate:'INDIVIDUAL_PER_APPLICANT',familyFixedPriceApproved:false,principalReferenceOperations:['e33g_standard','e33g_express'],knowledgeCreatesOperation:false},
        approval:{status:locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA',nativeSpeakerReview:false,browserReview:false,legalVerification:false},
        sourceLimitations:['Founder supplied-content authorization is not independent legal/native/browser certification',
          'Each dependent, principal eligibility, category, duration, filing route and required documents need individual current-procedure review',
          'Family has no approved numeric fixed tariff; principal E33G reference prices use the existing editable catalog only']};
      const ruEnvelope=locale==='ru'?metadataEnvelope(bodyBytes,meta):sourceRows.get(pageKey+'/ru').meta.sourceEnvelopeSha256;meta.sourceEnvelopeSha256=ruEnvelope;
      meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta}));
      familyPriceOccurrences(meta);sourceRows.set(pageKey+'/'+locale,{meta,bodyBytes,original,sourceJsonBytes});
    }
    const ru=sourceRows.get(pageKey+'/ru').meta;
    if(replay){assert.equal(record.candidate.ru.status,'owner_approved_semantics');assert.equal(record.candidate.route,spec.route);assert.equal(record.candidate.revision,ru.sourceRevision);}
    else if(spec.oldRoute){assert.equal(record.candidate.ru.status,'draft');assert.equal(record.candidate.route,spec.oldRoute);assert.equal(record.candidate.revision,'sha256:'+spec.oldSha);}
    reconciliation.push({contentId:spec.contentId,suppliedEditorialKey:pageKey,previousUnpublishedRoute:spec.oldRoute,previousUnpublishedRevision:spec.oldSha?'sha256:'+spec.oldSha:null,
      resolvedCanonicalRoute:spec.route,publicBodyRevision:ru.sourceRevision,approvedSourceRevision:ru.approvedSourceRevision,publishedConflict:false,redirectCreated:false,
      serviceId:record.serviceId,pricingRef:null,status:spec.oldRoute?'EXISTING_UNPUBLISHED_DRAFT_REPLACED':'NEW_CONTENT_ID_ONLY_NO_BUSINESS_ENTITY'});
    record.title=ru.h1;record.candidate={route:spec.route,exposure:'preview_only',revision:ru.sourceRevision,ru:{},translations:{}};
    if(!approvals.entries.some(a=>a.contentId===spec.contentId&&a.revision===ru.sourceRevision))approvals.entries.push({contentId:spec.contentId,revision:ru.sourceRevision,public_content_sha256:ru.bodySha256,
      authority:'Founder',status:'OWNER_APPROVED_RU',scope:'Exact supplied content and authorized translations; actual renderer/browser/release gates remain separate',
      evidence:'Founder instructed inclusion of supplied Family KITAS all10 locale package in current sprint; not a personal line-by-line legal/native reading claim',
      approvedSourceSha256:ru.sourceMarkdownSha256,sourceJsonPackSha256:familyEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']});
  }
  const qa={schemaVersion:1,batchId:FAMILY_BATCH,status:'MODEL_REVIEWED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const occurrences={schemaVersion:1,kind:'FAMILY_KITAS_PRINCIPAL_ONLY_EXACT_PRICE_OCCURRENCE_MAP',batchId:FAMILY_BATCH,sourceJsonPackSha256:familyEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json'],operations:familyPriceOperations,
    runtimeAuthority:'Existing published catalog only; no family price, snapshot amount or FX calculation',excluded:'USD 2,000 example; under18/6/18 passport months; principal-only12-month banking history',occurrences:[]};
  const build={schemaVersion:1,version:FAMILY_BATCH,stage:'IMPORTED_PENDING_RENDER_QA',fullPayloadKind:FAMILY_KIND,
    authority:{publisher:'Founder',decisionDate:'2026-10-09',scope:'Exact supplied Family KITAS50 locale payloads; readiness is distinct from supplied-content authorization'},
    sourceJsonPack:{file:FAMILY_PACK+'CONTENT_LOCALIZED_IMPORT.json',sha256:familyEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']},sourceChecksumManifest:{file:FAMILY_PACK+'SHA256SUMS.txt',sha256:familyEvidenceHashes['SHA256SUMS.txt']},
    publicationGates:Object.fromEntries(FAMILY_GATES.map(key=>[key,false])),records:[]};
  const routes=new Map(registry.records.map(r=>[r.candidate.route,r.contentId]));
  for(const [pageKey,spec] of Object.entries(familyPages)) {
    const record=registry.records.find(r=>r.contentId===spec.contentId),entry={contentId:spec.contentId,pageKey,sourceRevision:record.candidate.revision,approvedSourceRevision:sourceRows.get(pageKey+'/ru').meta.approvedSourceRevision,
      canonicalPath:spec.route,serviceId:record.serviceId,pricingRef:null,quoteOnly:true,publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'PENDING_ACTUAL_RENDER_QA'},locales:{}};
    for(const language of registry.locales) {
      const locale=language.code,{meta,bodyBytes,original,sourceJsonBytes}=sourceRows.get(pageKey+'/'+locale),base=baseName(spec.contentId,locale),metaBytes=jsonBytes(meta);
      const common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',metadataSha256:sha(metaBytes),sourceEnvelopeSha256:meta.sourceEnvelopeSha256};
      writes.set(base+'.md',bodyBytes);writes.set(base+'.source.md',original);writes.set(base+'.source.json',sourceJsonBytes);writes.set(base+'.meta.json',metaBytes);
      if(locale==='ru')record.candidate.ru={status:'owner_approved_semantics',...common,approvalEvidence:'Exact Founder-supplied Family KITAS 2026-10-09; not independent legal/native/browser certification',approvalRevision:record.candidate.revision};
      else record.candidate.translations[locale]={sourceRevision:record.candidate.revision,status:'translated',complete:true,qa:'passed',...common,qaMethod:'supplied_model_semantic',qaEvidence:'Supplied static/model checks and exact JSON/MD source pins; actual site/browser QA pending',qaFile:FAMILY_QA,qaPage:pageKey+'.md'};
      qa.records.push({contentId:spec.contentId,page:pageKey+'.md',locale,bodySha256:'sha256:'+meta.bodySha256,sourceRevision:meta.sourceRevision,sourceEnvelopeSha256:meta.sourceEnvelopeSha256,
        status:meta.approval.status,sourceOriginReconciled:true,sourceFileSha256:meta.sourceFileSha256,sourceMarkdownSha256:meta.sourceMarkdownSha256,approvedSourceRevision:meta.approvedSourceRevision,nativeReview:false,browserReview:false,legalVerification:false});
      entry.locales[locale]={route:language.prefix+spec.route,direction:language.dir,...common,sourceFile:meta.sourceFile,sourceFileSha256:meta.sourceFileSha256,sourceMarkdownFile:meta.sourceMarkdownFile,sourceMarkdownSha256:meta.sourceMarkdownSha256,payloadRevision:meta.payloadRevision};
      occurrences.occurrences.push(...familyPriceOccurrences(meta));
    }
    const ru=sourceRows.get(pageKey+'/ru').meta;record.inlineLinkTargets=[...new Set(ru.inlineLinkTargets.map(l=>l.sourceHref))].map(sourceRoute=>({sourceRoute,contentId:routes.get(sourceRoute)??null,status:routes.has(sourceRoute)?'resolved_content_id':'planned_unmapped'}));
    record.relatedContentIds=[...new Set(ru.inlineLinkTargets.map(l=>routes.get(l.sourceHref)).filter(id=>id&&id!==spec.contentId))];build.records.push(entry);
  }
  // Sanitized package evidence only: private portable chat context is verified
  // as an archive member, but never copied into the repository or public body.
  for(const file of Object.keys(familyEvidenceHashes))writes.set(FAMILY_PACK+file,read(file));
  const occurrenceBytes=jsonBytes(occurrences);writes.set(FAMILY_OCCURRENCES,occurrenceBytes);build.priceOccurrences={file:FAMILY_OCCURRENCES,sha256:sha(occurrenceBytes)};
  writes.set(FAMILY_QA,jsonBytes(qa));writes.set('registry-copy/family_kitas_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:FAMILY_BATCH,records:reconciliation}));
  if(!replay)writes.set('registry-copy/family_kitas_preimport_registry_records.json',jsonBytes({schemaVersion:1,sourceRegistryRecordCount:152,sourceRegistrySha256:sha(jsonBytes(inputRegistry)),
    removeAddedContentIds:['knowledge_family_documents'],records:inputRegistry.records.filter(r=>Object.values(familyPages).some(p=>p.oldRoute&&p.contentId===r.contentId))}));
  writes.set('registry-family-kitas-build.v1.json',jsonBytes(build));writes.set('service-registry.v1.json',jsonBytes(registry));writes.set('registry-approvals.v1.json',jsonBytes(approvals));
  const owned=new Set(Object.values(familyPages).map(p=>p.contentId));for(const before of inputRegistry.records)if(!owned.has(before.contentId))assert.deepEqual(registry.records.find(r=>r.contentId===before.contentId),before,'Unrelated Registry record changed');
  for(const before of inputApprovals.entries)assert.ok(approvals.entries.some(a=>canonicalJson(a)===canonicalJson(before)),'Existing approval lost');
  return {writes,registry,approvals,build,summary:{records:5,localizedPayloads:50,registryRecords:registry.records.length,writes:writes.size,
    newContentRecords:replay?0:1,newBusinessEntities:0,familyFixedPrices:0,faq:[...sourceRows.values()].reduce((n,s)=>n+s.meta.faq.length,0),tables:[...sourceRows.values()].reduce((n,s)=>n+s.meta.tables.length,0),
    internalLinkOccurrences:[...sourceRows.values()].reduce((n,s)=>n+s.meta.inlineLinkTargets.length,0),principalOnlyPriceOccurrences:occurrences.occurrences.length,redirects:0,
    sourceJsonPackSha256:build.sourceJsonPack.sha256,pendingGates:FAMILY_GATES}};
}
export function applyFamilyPlan(plan,contentRoot,{expectedRegistrySha256,expectedApprovalsSha256}={}) {
  for(const [file,bytes] of plan.writes) {
    const target=resolve(contentRoot,file),rel=relative(contentRoot,target);assert.ok(rel&&!rel.startsWith('..'));
    if(!existsSync(target))continue;
    const expected=file==='service-registry.v1.json'?expectedRegistrySha256:file==='registry-approvals.v1.json'?expectedApprovalsSha256:sha(bytes);
    assert.equal(sha(readFileSync(target)),expected,'Refuse unrelated/concurrent overwrite: '+file);
  }
  for(const [file,bytes] of plan.writes){const target=resolve(contentRoot,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2],'Supply exact bundle directory');const bundle=resolve(process.argv[2]),contentRoot=fileURLToPath(new URL('../content/',import.meta.url));
  const registryBytes=readFileSync(resolve(contentRoot,'service-registry.v1.json')),approvalBytes=readFileSync(resolve(contentRoot,'registry-approvals.v1.json'));
  const readBundle=file=>{const path=resolve(bundle,file),rel=relative(bundle,path);assert.ok(rel&&!rel.startsWith('..'));return readFileSync(path);};
  verifyFamilyArchive(readBundle);
  const plan=planFamilyImport({readBundle,registry:JSON.parse(registryBytes),approvals:JSON.parse(approvalBytes)});
  if(process.argv.includes('--apply'))applyFamilyPlan(plan,contentRoot,{expectedRegistrySha256:sha(registryBytes),expectedApprovalsSha256:sha(approvalBytes)});
  console.log(JSON.stringify(plan.summary));
}
