// Bounded exact editorial import. No new service, referral terms, prices,
// credentials, network, submission, browser attestation or deployment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const PARTNERS_BATCH='PARTNERS_B2B_2026-10-09_v1';
export const PARTNERS_KIND='PARTNERS_B2B_FULL_JSON_V1';
export const PARTNERS_GATES=['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview'];
export const PARTNERS_PACK='registry-copy/partners_b2b_source_pack/';
export const PARTNERS_QA='registry-copy/partners_b2b_qa_import.json';
export const PARTNERS_HISTORY='registry-copy/partners_b2b_preimport_registry_records.json';
export const partnersSha=value=>createHash('sha256').update(value).digest('hex');
const sha=partnersSha,jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const partnersEvidenceHashes=Object.freeze({
  'MANIFEST.json':'01c595d6f7459c95ceba3a7c5c1a2325c0cdac719bc3276885a19605d2831f69',
  'SHA256SUMS.txt':'15160dcc436b9f8d49091d4ecab869a16f495a5970e741e2e32da0ac8be6899e',
  'CONTENT_IMPORT_STAGING.json':'8e4ae4139fa3c8452dfb102d58bcd22517c1fe82136dd7b9cf90d78c5c97faf7',
  'START_HERE_RU.md':'87329ab81bb5c697d93541016b7dc24043a606c71acc729a78aed139b067daf5',
  'CODEX_PROMPT_RELEASE_ALL_RU.md':'ef4de3be4faec656c4a8e8ae9dfd1160a588c218ad8935aa13ef242e2b1b359e',
  'QA/QA_REPORT_RU.md':'2601e28f411d7917b92b6ee1d60f9d8343768c9c78a30dc3a3f4df3d17a6172f',
  'QA/validate_bundle.py':'dca9498e8ced6fb6d2ddca499aa41b1b3167f1c2d6503dcfdcbc743a3c41844a',
  'SCRIPTS/verify_hashes.py':'592b658706631df3bb53820037320c56e5acc8e80ed1decb9dff50b85c1a50a9',
  'INTERNAL/EDITORIAL_SCOPE.md':'4c1030a3dcb766f0f4d21ee0629b9313331eb9d297814005d01a677375e69184',
  'INTERNAL/PRODUCT_SEO_TECH_SPEC.md':'0b4e67cacb82e2353e4266d532dfd6f41cbeed452c9b089f0db3627defdab3d2',
  'INTERNAL/REFERRAL_RELEASE_BLOCKER_RU.md':'cca6374706e659bef89d19e2273be0c4d6fd0602a28abd21354f798e9d74cbe3',
  'INTERNAL/RESEARCH_AND_DECISIONS.md':'fd58c6d7419f9c4e39d7823301d547639fd1a6b5f2143eb53cb46a24a5f452e1',
  'INTERNAL/VIBEDIZ_BRIEF_RU.md':'93086be533f490eafd40d64b9d976ebbe20381d3e40f958e1351d6f8d061896a',
});
const privateFiles=new Set(['SAFRWAY_CHAT_CONTEXT_CURRENT_v69.md','INTERNAL/REFERRAL_RU_PREVIEW_ONLY.md']);
const safePath=file=>assert.ok(typeof file==='string'&&file&&!file.startsWith('/')&&!file.includes('\\')&&!file.split('/').some(p=>p==='..'||p==='.'||!p),'Unsafe package path');
const checksumEntries=read=>{const bytes=Buffer.from(read('SHA256SUMS.txt'));assert.equal(sha(bytes),partnersEvidenceHashes['SHA256SUMS.txt']);
  const rows=bytes.toString().trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m);safePath(m[2]);return [m[2],m[1]];});
  assert.equal(rows.length,23);assert.equal(new Set(rows.map(r=>r[0])).size,23);return rows;};
export function verifyPartnersArchive(read) {
  for(const [file,pin] of checksumEntries(read))assert.equal(sha(read(file)),pin,'Original archive drift: '+file);
  assert.equal(sha(read('MANIFEST.json')),partnersEvidenceHashes['MANIFEST.json']);return {archiveMembersVerified:23,manifestVerified:true};
}
export function publicPartnersBody(original,row) {
  assert.ok(!original.includes('\r'));const title='# '+row.seo.h1+'\n',start=original.indexOf(title);assert.ok(start>=0&&original.indexOf(title,start+1)<0,'Ambiguous client H1');
  return original.slice(start).split('## Content references for Codex')[0]
    .replace(/^\*\*[^*\n]{1,100}[:：]\*\*[^\n]*\n?/gm,'').replace(/^---\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
export function readPartnersStructure(row) {
  const body=row.bodyMarkdown,starts=[...body.matchAll(/^## (.+)$/gm)];assert.equal(starts.length,7);assert.equal((body.match(/^# /gm)??[]).length,1);
  assert.equal((body.match(/^### /gm)??[]).length,14);assert.equal((body.match(/^- /gm)??[]).length,4);assert.equal((body.match(/^[1-5]\. /gm)??[]).length,5);
  const faqBody=body.slice(starts[5].index+starts[5][0].length,starts[6].index),questions=[...faqBody.matchAll(/^### (.+)$/gm)];assert.equal(questions.length,9);assert.equal(row.faqCount,9);
  const faq=questions.map((m,i)=>({question:m[1],answerMarkdown:faqBody.slice(m.index+m[0].length,questions[i+1]?.index??faqBody.length).trim()}));assert.ok(faq.every(r=>r.answerMarkdown));
  assert.equal(row.cta.primaryAction,'existing_b2b_lead_or_contact_flow');assert.equal(row.cta.secondaryAction,'scroll_to_partner_services_section');
  assert.equal(row.cta.secondaryReferralDisplay,'only_if_referral_public_with_approved_terms');
  assert.ok(!/Content references for Codex|\*\*Status:|\]\([^)]*(?:referral|account\/partners)/i.test(body)&&!body.includes(row.cta.secondaryReferralCopy),'Internal referral/editorial leakage');
  assert.ok(!/\b(?:IDR|USD)\b|\$\d|\d\s*%|CATALOG_PRICE/.test(body),'No approved commercial amounts');
  return {directAnswer:body.slice(body.indexOf('\n')+1,starts[0].index).trim(),faq,faqHeading:starts[5][1],faqSectionIndex:5,servicesSectionIndex:1,servicesAnchor:'partner-services',
    cta:[{role:'primary',label:row.cta.primaryLabel,actionIntent:'existing_b2b_lead_or_contact_flow'},
      {role:'secondary',label:row.cta.secondaryAnchorLabel,actionIntent:'scroll_to_partner_services_section',href:'#partner-services'}],
    finalCta:{label:row.cta.finalLabel,actionIntent:'existing_b2b_lead_or_contact_flow'}};
}
const baseName=locale=>'registry-copy/partners_'+locale.toLowerCase().replaceAll('-','_')+'_partners_20261009';
export function planPartnersImport({readBundle,registry:inputRegistry,approvals:inputApprovals}) {
  const read=file=>Buffer.from(readBundle(file)),writes=new Map();
  for(const [file,pin] of Object.entries(partnersEvidenceHashes))assert.equal(sha(read(file)),pin,'Supplied evidence drift: '+file);
  for(const [file,pin] of checksumEntries(read).filter(([file])=>!privateFiles.has(file)))assert.equal(sha(read(file)),pin,'Sanitized archive drift: '+file);
  const supplied=JSON.parse(read('CONTENT_IMPORT_STAGING.json')),manifest=JSON.parse(read('MANIFEST.json'));
  assert.equal(supplied.schema,'safrway_editorial_staging_not_runtime_v1');assert.equal(supplied.records.length,10);assert.equal(manifest.recordCount,10);
  assert.equal(supplied.routeMustBeReconciledByCodex,true);assert.equal(supplied.referralSeparate.stage,'preview_only_not_indexable');assert.equal(manifest.referralStatus,'preview_only_not_indexable');
  assert.deepEqual(supplied.records.map(r=>r.locale).sort(),inputRegistry.locales.map(l=>l.code).sort());assert.equal(inputRegistry.records.length,153);
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),record=registry.records.find(r=>r.contentId==='partners');assert.ok(record);
  assert.equal(record.kind,'trust');assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.published,null,'Do not replace published content');assert.equal(record.candidate.route,'/partners/');
  const replay=record.candidate.ru.status==='owner_approved_semantics';
  if(!replay){assert.equal(record.candidate.ru.status,'draft');assert.equal(record.candidate.revision,'sha256:bb487a2da0008f44298b2beb2a1fa8fa5574010277611c048b838bc59024d484');}
  for(const other of registry.records.filter(r=>r.contentId!=='partners')){assert.notEqual(other.candidate.route,'/partners/','Occupied candidate route');for(const route of Object.values(other.published?.routes??{}))assert.ok(!/^(?:\/[a-z-]+)?\/partners\/$/.test(route),'Occupied published route');}
  const ruRow=supplied.records.find(r=>r.locale==='ru'),revision='sha256:'+sha(ruRow.bodyMarkdown),ruEnvelope=metadataEnvelope(Buffer.from(ruRow.bodyMarkdown),{h1:ruRow.seo.h1,seoTitle:ruRow.seo.title,metaDescription:ruRow.seo.description,directAnswer:readPartnersStructure(ruRow).directAnswer,factBlock:{heading:'',items:[]}});
  assert.equal(supplied.sourceSha256,ruRow.contentSha256);assert.equal(manifest.sourceSha256,ruRow.contentSha256);
  if(replay)assert.equal(record.candidate.revision,revision,'Do not replace newer approved source');
  record.title=ruRow.seo.h1;record.candidate={route:'/partners/',exposure:'preview_only',revision,ru:{},translations:{}};
  if(!approvals.entries.some(r=>r.contentId==='partners'&&r.revision===revision))approvals.entries.push({contentId:'partners',revision,public_content_sha256:sha(ruRow.bodyMarkdown),authority:'Founder',status:'OWNER_APPROVED_RU',
    scope:'Exact supplied Partners B2B ten-locale package; no referral terms, native/legal/browser certification or release',evidence:'Founder instructed inclusion in current approved sprint',approvedSourceSha256:ruRow.contentSha256,sourceJsonPackSha256:partnersEvidenceHashes['CONTENT_IMPORT_STAGING.json']});
  const qa={schemaVersion:1,batchId:PARTNERS_BATCH,status:'MODEL_REVIEWED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const entry={contentId:'partners',pageKey:'partners_b2b',sourceRevision:revision,approvedSourceRevision:'sha256:'+ruRow.contentSha256,canonicalPath:'/partners/',serviceId:null,pricingRef:null,
    publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'PENDING_ACTUAL_RENDER_QA'},locales:{}};
  for(const language of registry.locales) {
    const locale=language.code,row=supplied.records.find(r=>r.locale===locale);assert.equal(row.pageKey,'partners_b2b');assert.equal(row.sourceRevision,manifest.revision);assert.equal(row.sourceSha256,ruRow.contentSha256);
    assert.equal(row.routeHint,language.prefix+'/partners/');assert.equal(row.routeHintVerified,false);assert.equal(row.direction,language.dir);assert.equal(row.translationStatus,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
    assert.equal(row.publicationStage,'candidate_public_indexable_after_gate');assert.equal(row.bodyMarkdown.split('\n')[0],'# '+row.seo.h1);
    const original=read(row.contentFile),bodyBytes=Buffer.from(row.bodyMarkdown),wire=jsonBytes(row),base=baseName(locale);assert.equal(sha(original),row.contentSha256);assert.equal(publicPartnersBody(original.toString(),row),row.bodyMarkdown);
    // The supplied human revision and CTA object remain exact inside sourceRecord;
    // normalized runtime aliases use content-addressed revisions and safe CTA only.
    const meta={sourceRecord:row,fullPayloadKind:PARTNERS_KIND,resolvedContentId:'partners',pageKey:'partners_b2b',resolvedCanonicalPath:'/partners/',locale,direction:language.dir,
      bodyMarkdown:row.bodyMarkdown,h1:row.seo.h1,seo:{title:row.seo.title,description:row.seo.description},seoTitle:row.seo.title,metaDescription:row.seo.description,...readPartnersStructure(row),factBlock:{heading:'',items:[]},
      bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,bodySha256:sha(bodyBytes),bodyRevision:'sha256:'+sha(bodyBytes),sourceRevision:revision,approvedSourceRevision:entry.approvedSourceRevision,editorialSourceRevision:row.sourceRevision,sourceEnvelopeSha256:ruEnvelope,
      sourceFile:base+'.source.json',sourceFileSha256:sha(wire),sourceMarkdownFile:base+'.source.md',sourceMarkdownSha256:row.contentSha256,sourceJsonPackSha256:partnersEvidenceHashes['CONTENT_IMPORT_STAGING.json'],
      sourceJsonSerialization:'Exact logical supplied record; whole supplied JSON wire archived separately',quotePolicy:{fixedPriceApproved:false,businessServiceCreated:false,commercialTerms:'INDIVIDUAL_CASE_AND_AGREEMENT',referral:'INTERNAL_PREVIEW_ONLY_NO_PUBLIC_LINK'},
      approval:{status:locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA',nativeSpeakerReview:false,browserReview:false,legalVerification:false},
      sourceLimitations:['Supplied-content authorization is not independent native/legal/browser certification','No fixed price, partner privilege, account, automatic reward or public referral terms approved','PII and documents use existing protected CRM/support; analytics contain public attribution only']};
    meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta,finalCta:meta.finalCta}));
    const metaBytes=jsonBytes(meta),common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',metadataSha256:sha(metaBytes),sourceEnvelopeSha256:ruEnvelope};
    writes.set(base+'.md',bodyBytes);writes.set(base+'.source.md',original);writes.set(base+'.source.json',wire);writes.set(base+'.meta.json',metaBytes);
    if(locale==='ru')record.candidate.ru={status:'owner_approved_semantics',...common,approvalEvidence:'Exact Founder-supplied Partners ten-locale package; actual release gates separate',approvalRevision:revision};
    else record.candidate.translations[locale]={sourceRevision:revision,status:'translated',complete:true,qa:'passed',...common,qaMethod:'supplied_model_semantic',qaEvidence:'Exact source pins and supplied structural/model review; actual render/browser pending',qaFile:PARTNERS_QA,qaPage:'partners-b2b.md'};
    entry.locales[locale]={route:row.routeHint,direction:language.dir,...common,sourceFile:meta.sourceFile,sourceFileSha256:meta.sourceFileSha256,sourceMarkdownFile:meta.sourceMarkdownFile,sourceMarkdownSha256:meta.sourceMarkdownSha256,payloadRevision:meta.payloadRevision};
    qa.records.push({contentId:'partners',page:'partners-b2b.md',locale,bodySha256:'sha256:'+meta.bodySha256,sourceRevision:revision,sourceEnvelopeSha256:ruEnvelope,status:meta.approval.status,sourceOriginReconciled:true,nativeReview:false,browserReview:false,legalVerification:false});
  }
  const build={schemaVersion:1,version:PARTNERS_BATCH,stage:'IMPORTED_PENDING_RENDER_QA',fullPayloadKind:PARTNERS_KIND,authority:{publisher:'Founder',decisionDate:'2026-10-09',scope:'Exact ten Partners B2B localized payloads only; no referral publication or new business identity'},
    sourceJsonPack:{file:PARTNERS_PACK+'CONTENT_IMPORT_STAGING.json',sha256:partnersEvidenceHashes['CONTENT_IMPORT_STAGING.json']},sourceChecksumManifest:{file:PARTNERS_PACK+'SHA256SUMS.txt',sha256:partnersEvidenceHashes['SHA256SUMS.txt']},publicationGates:Object.fromEntries(PARTNERS_GATES.map(g=>[g,false])),records:[entry]};
  for(const file of Object.keys(partnersEvidenceHashes))writes.set(PARTNERS_PACK+file,read(file));
  writes.set(PARTNERS_QA,jsonBytes(qa));writes.set('registry-copy/partners_b2b_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:PARTNERS_BATCH,record:{contentId:'partners',suppliedEditorialKey:'partners_b2b',previousUnpublishedRoute:'/partners/',previousUnpublishedRevision:'sha256:bb487a2da0008f44298b2beb2a1fa8fa5574010277611c048b838bc59024d484',resolvedCanonicalRoute:'/partners/',sourceRevision:revision,editorialSourceRevision:ruRow.sourceRevision,approvedSourceRevision:entry.approvedSourceRevision,publishedConflict:false,redirectCreated:false,newBusinessEntity:false,referralPublished:false},precedence:'Explicit all-ten-locales main prompt and MANIFEST supersede stale internal RU-only/three-translations scope notes'}));
  if(!replay)writes.set(PARTNERS_HISTORY,jsonBytes({schemaVersion:1,sourceRegistryRecordCount:153,sourceRegistrySha256:sha(jsonBytes(inputRegistry)),removeAddedContentIds:[],records:inputRegistry.records.filter(r=>r.contentId==='partners')}));
  writes.set('registry-partners-build.v1.json',jsonBytes(build));writes.set('service-registry.v1.json',jsonBytes(registry));writes.set('registry-approvals.v1.json',jsonBytes(approvals));
  for(const before of inputRegistry.records)if(before.contentId!=='partners')assert.deepEqual(registry.records.find(r=>r.contentId===before.contentId),before,'Unrelated record changed');
  for(const before of inputApprovals.entries)assert.ok(approvals.entries.some(r=>canonicalJson(r)===canonicalJson(before)),'Existing approval lost');
  return {writes,registry,approvals,build,summary:{records:1,localizedPayloads:10,registryRecords:153,faq:90,newContentRecords:0,newBusinessEntities:0,newPricingOperations:0,publicReferralRecords:0,redirects:0,writes:writes.size,sourceJsonPackSha256:build.sourceJsonPack.sha256,pendingGates:PARTNERS_GATES}};
}
export function applyPartnersPlan(plan,contentRoot,{expectedRegistrySha256,expectedApprovalsSha256}={}) {
  assert.ok(lstatSync(contentRoot).isDirectory()&&!lstatSync(contentRoot).isSymbolicLink(),'Refuse symlink content root');
  for(const [file,bytes] of plan.writes){safePath(file);const target=resolve(contentRoot,file);assert.ok(!relative(contentRoot,target).startsWith('..'));
    for(let parent=target;parent!==resolve(contentRoot);parent=dirname(parent))if(existsSync(parent))assert.ok(!lstatSync(parent).isSymbolicLink(),'Refuse symlink target');
    if(existsSync(target))assert.equal(sha(readFileSync(target)),file==='service-registry.v1.json'?expectedRegistrySha256:file==='registry-approvals.v1.json'?expectedApprovalsSha256:sha(bytes),'Refuse unrelated/concurrent overwrite: '+file);}
  for(const [file,bytes] of plan.writes){const target=resolve(contentRoot,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2]);const bundle=resolve(process.argv[2]),contentRoot=fileURLToPath(new URL('../content/',import.meta.url));
  assert.ok(lstatSync(bundle).isDirectory()&&!lstatSync(bundle).isSymbolicLink(),'Refuse symlink bundle root');
  const readBundle=file=>{safePath(file);const target=resolve(bundle,file);assert.ok(!relative(bundle,target).startsWith('..'));
    for(let part=target;part!==bundle;part=dirname(part))assert.ok(!lstatSync(part).isSymbolicLink(),'Refuse symlink source');return readFileSync(target);};
  verifyPartnersArchive(readBundle);const registryBytes=readFileSync(resolve(contentRoot,'service-registry.v1.json')),approvalBytes=readFileSync(resolve(contentRoot,'registry-approvals.v1.json'));
  const plan=planPartnersImport({readBundle,registry:JSON.parse(registryBytes),approvals:JSON.parse(approvalBytes)});
  if(process.argv.includes('--apply'))applyPartnersPlan(plan,contentRoot,{expectedRegistrySha256:sha(registryBytes),expectedApprovalsSha256:sha(approvalBytes)});console.log(JSON.stringify(plan.summary));
}
