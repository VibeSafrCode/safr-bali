// Read-only, exact editorial PLAN. No apply function, CLI, publication, prices,
// services, translations, credentials, network or legal/browser attestation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const BUSINESS_BATCH='BUSINESS_STAGE1_2026-10-09_v1';
export const BUSINESS_KIND='BUSINESS_STAGE1_FULL_MD_V1';
export const BUSINESS_PACK='registry-copy/business_source_pack/';
export const BUSINESS_QA='registry-copy/business_qa_import.json';
export const BUSINESS_HISTORY='registry-copy/business_preimport_registry_records.json';
export const BUSINESS_GATES=Object.freeze(['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview']);
export const businessSha=value=>createHash('sha256').update(value).digest('hex');
const sha=businessSha,jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const businessEvidenceHashes=Object.freeze({
  'ALL_LOCALES_CONTENT_SEO_MANIFEST.json':'10e4c99247c6534b113c3639b9fe405dc5c6d24acf36a34d16de7709450bb938',
  'START_HERE_RU.md':'b4deed26e1ff7bd48068b77c9d668d2310804c98775e7a807924bd7e86b77a59',
  'CODEX_HANDOFF_RU.md':'bdb9a850b0c5fd5e567998f7a4e8e45c43fbdc51324f227ea352b2438fa034ff',
  'CODEX_PROMPT_RELEASE_ALL_RU.md':'65b71b1474c8500a07680a03b69a07fac07e766025d310f4e39ba60d11cbc7c3',
  'RESEARCH/SOURCE_LOCK_FROM_BATCH1.json':'b4d798e9592f5a9d8a69310f01e437a206a869f37e0ff44c0fcfabb3170e3da0',
  'QA/QA_RESULTS.json':'e770eb1863e416bf87d08cc0de1f119367bddc43c9467e37a6cfe93220e54553',
  'QA/QA_REPORT_RU.md':'1b782effb0963045e75b000c4cd57f1b12f9805577a62e82debefffcfae73963',
});
export const businessPages=Object.freeze({
  business_hub:{contentId:'business',suppliedContentId:'bali-business-hub',route:'/bali/business/',hint:'/bali/business/',oldTitle:'Бизнес в Индонезии',oldRevision:'sha256:dea292503210d29c9b2f5dfc35cd99649568597bb86066d973717aa98a7d1968',oldSha:'1be628e1b8f9359a4dba3fbde44791b1a754a9929738e726f2d5e5f6025847f6',h2:8,h3:10},
  pt_pma:{contentId:'pma',suppliedContentId:'bali-business-pt-pma',route:'/bali/business/company-registration/',hint:'/bali/business/pt-pma/',oldTitle:'Регистрация PT PMA',oldRevision:'SYNC-2:pma:draft1',oldSha:'9c77a7b7ff0a229af38508fd438c4dd4e9f169244643a9dba6a6ad50c5c7f458',h2:9,h3:10},
  oss:{contentId:'nib_oss',suppliedContentId:'bali-business-oss-licenses',route:'/bali/business/nib-oss/',hint:'/bali/business/oss-licenses/',oldTitle:'NIB, OSS и разрешения по деятельности',oldRevision:'SYNC-2:nib_oss:draft1',oldSha:'5619a0b725430eff154a07e1ca9e87cf0d3efbecf3441298abec62ea0a8ead1c',h2:9,h3:9},
  amendments:{contentId:'corporate_changes',suppliedContentId:'bali-business-company-changes',route:'/bali/business/corporate-changes/',hint:'/bali/business/company-changes/',oldTitle:'Изменения в компании',oldRevision:'SYNC-2:corporate_changes:draft1',oldSha:'560918fe214a68953c3049b94dae1e92f350cc78bff9dba4f0f175a506ec0fb1',h2:9,h3:6},
  closure:{contentId:'liquidation',suppliedContentId:'bali-business-company-closure',route:'/bali/business/company-liquidation/',hint:'/bali/business/company-closure/',oldTitle:'Закрытие компании',oldRevision:'SYNC-2:liquidation:draft1',oldSha:'8485209b5999b525ad127937fc21f59c19c3d3a78b427832a521c6c29f354274',h2:9,h3:6},
  capital:{contentId:'knowledge_pt_pma_capital',suppliedContentId:'bali-knowledge-pt-pma-capital',route:'/bali/knowledge/business/pt-pma-capital-2026/',hint:'/bali/knowledge/business/pt-pma-capital-2026/',h2:9,h3:6},
});
const faqHeadings={ru:'Частые вопросы',en:'Frequently asked questions',de:'Häufig gestellte Fragen','zh-Hans':'常见问题',ko:'자주 묻는 질문',fr:'Questions fréquentes',ja:'よくある質問',hi:'अक्सर पूछे जाने वाले प्रश्न',es:'Preguntas frecuentes',ar:'الأسئلة الشائعة'};
const pathPattern=/^\/(?:[a-z0-9-]+\/)*$/;
export function assertBusinessPath(file) {
  assert.ok(typeof file==='string'&&file&&!file.startsWith('/')&&!file.includes('\\')&&
    /^[A-Za-z0-9_./-]+$/.test(file)&&!file.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe package path');
}
const readableFiles=new Set(Object.keys(businessEvidenceHashes));
const permittedFile=file=>readableFiles.has(file)||/^CONTENT\/(?:RU|EN|DE|ZH-HANS|KO|FR|JA|HI|ES|AR)\/(?:BUSINESS_HUB|PT_PMA|OSS|AMENDMENTS|CLOSURE|CAPITAL)_[A-Z-]+_v1(?:_REVIEW)?\.md$/.test(file);
// Pure plans may inject an in-memory reader. Filesystem callers must use this
// bounded reader, which rejects symlinks at the root and every traversed member.
export function createBusinessBundleReader(directory) {
  const root=resolve(directory),stat=lstatSync(root);
  assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&realpathSync(root)===root,'Refuse symlink bundle root');
  return file=>{
    assertBusinessPath(file);assert.ok(permittedFile(file),'Not an allowed Business source');
    let current=root;const parts=file.split('/');
    for(const [index,part] of parts.entries()) {
      current=join(current,part);const member=lstatSync(current);
      assert.ok(!member.isSymbolicLink(),'Refuse symlink bundle member');
      assert.ok(index===parts.length-1?member.isFile():member.isDirectory(),'Source must be a regular file');
    }
    return readFileSync(current);
  };
}
export function publicBusinessBody(original,row) {
  assert.ok(!original.includes('\r'),'Unexpected source line endings');
  const head=original.match(/^<!-- SAFRWAY EDITORIAL STAGING · NOT PUBLIC OUTPUT\n([\s\S]*?)-->\n/);
  assert.ok(head,'Missing exact staging envelope');
  const fields=Object.fromEntries(head[1].trim().split('\n').map(line=>{const cut=line.indexOf(': ');assert.ok(cut>0);return [line.slice(0,cut),line.slice(cut+2)];}));
  for(const [key,value] of Object.entries({pageKey:row.pageKey,contentId:row.contentIdCandidate,locale:row.locale,status:row.locale==='ru'?'RU_REVIEW':row.status,routeCandidate:row.routeCandidate,sourceRevision:row.sourceRevision,servicePrice:'INDIVIDUAL_QUOTE_NOT_APPROVED'}))
    assert.equal(fields[key],value,'Staging field drift: '+key);
  if(row.locale!=='ru')assert.equal(fields.sourceSha256,row.sourceSha256);
  if(row.locale==='ar')assert.equal(fields.textDirection,'rtl');
  const after=original.slice(head[0].length),prefix=after.match(/^\n?\*\*SEO Title:\*\* ([^\n]+)\n\*\*Meta Description:\*\* ([^\n]+)\n\n/);
  assert.ok(prefix,'SEO scaffold drift');assert.equal(prefix[1].trimEnd(),row.seo.title,'SEO title drift');assert.equal(prefix[2].trimEnd(),row.seo.description,'SEO description drift');
  let body=after.slice(prefix[0].length);assert.ok(body.startsWith('# '+row.seo.h1+'\n'),'Customer H1 drift');
  const cta='**CTA:** '+row.seo.cta;assert.equal(body.split('\n').filter(line=>line.startsWith('**CTA:**')).length,1,'Ambiguous CTA scaffold');
  assert.ok(body.split('\n').includes(cta),'Manifest CTA drift');
  body=body.replace(cta+'\n','');
  assert.ok(!/<!--|-->|EDITORIAL STAGING|sourceSha256:|sourceRevision:|routeCandidate:|\*\*(?:SEO Title|Meta Description|CTA):\*\*/.test(body),'Staging leakage');
  assert.ok(!/CATALOG_PRICE|\{\{USD|\$\d/.test(body),'Unapproved independent commercial price');
  return body;
}
export function readBusinessStructure(body,row) {
  const spec=businessPages[row.pageKey],heads=[...body.matchAll(/^## (.+)$/gm)];
  assert.equal((body.match(/^# /gm)??[]).length,1);assert.equal(heads.length,spec.h2);assert.equal((body.match(/^### /gm)??[]).length,spec.h3);
  const faqIndex=heads.findIndex(h=>h[1]===faqHeadings[row.locale]);assert.ok(faqIndex>=0);
  assert.equal(heads.filter(h=>h[1]===faqHeadings[row.locale]).length,1);
  const faqBody=body.slice(heads[faqIndex].index+heads[faqIndex][0].length,heads[faqIndex+1]?.index??body.length);
  const questions=[...faqBody.matchAll(/^### (.+)$/gm)];assert.equal(questions.length,row.faqCount);assert.equal(questions.length,6);
  const faq=questions.map((question,index)=>({question:question[1],answerMarkdown:faqBody.slice(question.index+question[0].length,questions[index+1]?.index??faqBody.length).trim()}));
  assert.ok(faq.every(question=>question.answerMarkdown));
  const links=[...body.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)].map(match=>match[1]);
  assert.equal(links.length,row.markdownLinks);assert.equal(links.filter(link=>link.startsWith('/')).length,row.internalLinkCount);
  return {directAnswer:body.slice(heads[0].index+heads[0][0].length,heads[1].index).trim(),factBlock:{heading:'',items:[]},faq,faqHeading:faqHeadings[row.locale],faqSectionIndex:faqIndex,
    cta:[{role:'primary',label:row.seo.cta,actionIntent:'existing_contact_flow'}],links};
}
const baseName=(id,locale)=>'registry-copy/'+id+'_'+locale.toLowerCase().replaceAll('-','_')+'_business_20261009';
const originalCandidate=spec=>({route:spec.route,exposure:'preview_only',revision:spec.oldRevision,
  ru:{status:spec.contentId==='business'?'draft':'missing',bodyFile:spec.contentId==='business'?'registry-copy/business_ru_sync1005.md':null,
    bodySha256:spec.contentId==='business'?spec.oldRevision.slice(7):null,approvalEvidence:null,approvalRevision:null},translations:{}});
const originalRelated=spec=>spec.contentId==='business'?['documents','partners']:[];
const originalLinks=spec=>spec.contentId==='business'?[
  {sourceRoute:'/bali/documents/',contentId:'documents',status:'resolved_content_id'},
  {sourceRoute:'/partners/',contentId:'partners',status:'resolved_content_id'}]:[];
const originalRecord=(record,spec)=>({...structuredClone(record),title:spec.oldTitle,candidate:originalCandidate(spec),relatedContentIds:originalRelated(spec),inlineLinkTargets:originalLinks(spec)});

export function planBusinessImport({readBundle,registry:inputRegistry,approvals:inputApprovals}) {
  const read=file=>{assertBusinessPath(file);assert.ok(permittedFile(file),'Not an allowed Business source');return Buffer.from(readBundle(file));};
  const writes=new Map(),sourceRows=new Map();
  for(const [file,pin] of Object.entries(businessEvidenceHashes))assert.equal(sha(read(file)),pin,'Supplied evidence drift: '+file);
  const manifest=JSON.parse(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json')),lock=JSON.parse(read('RESEARCH/SOURCE_LOCK_FROM_BATCH1.json')),qaSource=JSON.parse(read('QA/QA_RESULTS.json'));
  assert.equal(manifest.stage,'BUSINESS_STAGE1_ALL_10_LOCALES');assert.equal(manifest.schema,'editorial-staging-not-runtime');assert.equal(manifest.generatedOn,'2026-10-09');
  assert.equal(manifest.publicationStatus,'EDITORIAL_STAGING_NOT_DEPLOYED');assert.equal(manifest.records.length,60);
  assert.deepEqual([...manifest.languages].sort(),inputRegistry.locales.map(language=>language.code).sort());
  assert.equal(new Set(manifest.records.map(row=>row.pageKey+'/'+row.locale)).size,60);assert.equal(new Set(manifest.records.map(row=>row.file)).size,60);
  assert.deepEqual([...new Set(manifest.records.map(row=>row.pageKey))],Object.keys(businessPages));
  assert.equal(qaSource.all10.total_records,60);assert.equal(qaSource.all10.translated_faq,324);assert.deepEqual(qaSource.all10.errors,[]);
  assert.deepEqual(qaSource.sourceHashLock,lock.sourceSha256);
  for(const row of manifest.records) {
    const spec=businessPages[row.pageKey],language=inputRegistry.locales.find(item=>item.code===row.locale);assert.ok(spec&&language);
    assert.equal(row.contentIdCandidate,spec.suppliedContentId);assert.equal(row.direction,language.dir);assert.equal(row.routeCandidate,language.prefix+spec.hint);
    assert.equal(row.status,row.locale==='ru'?'RU_REVIEW_OWNER_PREFERS_LIVE_SITE_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
    assert.equal(row.sourceSha256,lock.sourceSha256[row.pageKey]);assert.match(row.sourceRevision,/^[a-z0-9-]+-ru-2026-10-09-v1$/);
    const ru=manifest.records.find(item=>item.pageKey===row.pageKey&&item.locale==='ru');assert.equal(row.sourceRevision,ru.sourceRevision);
    const original=read(row.file);assert.equal(sha(original),row.locale==='ru'?row.sourceSha256:row.translationSha256,'Source Markdown drift: '+row.file);
    const body=publicBusinessBody(original.toString('utf8'),row),structure=readBusinessStructure(body,row);
    sourceRows.set(row.pageKey+'/'+row.locale,{row,original,body,structure});
  }
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),reconciliation=[],blockers=[];
  const existingSpecs=Object.values(businessPages).filter(spec=>spec.oldRevision),replay=inputRegistry.records.length===154;
  assert.ok([153,154].includes(inputRegistry.records.length),'Unexpected Registry baseline');
  for(const spec of existingSpecs) {
    const record=registry.records.find(item=>item.contentId===spec.contentId);assert.ok(record,'Missing existing content identity');
    if(record.serviceId!==null||record.pricingRef!==null)blockers.push({code:'EXISTING_BUSINESS_BINDING_CONFLICT',contentId:record.contentId,serviceId:record.serviceId,pricingRef:structuredClone(record.pricingRef),action:'Preserve existing binding; reconcile scope before applying this quote-only plan'});
  }
  if(blockers.length)return {writes,registry,approvals,build:null,reconciliation,blockers,summary:{blocked:true,localizedPayloads:60,newBusinessEntities:0,newPricingOperations:0,writes:0}};
  const owned=new Set(Object.values(businessPages).map(spec=>spec.contentId));
  for(const spec of existingSpecs) {
    const record=registry.records.find(item=>item.contentId===spec.contentId);assert.equal(record.published,null,'Do not replace published content');
    assert.equal(record.candidate.route,spec.route,'Preserve existing candidate canonical route');
    assert.equal(record.candidate.exposure,'preview_only');assert.notEqual(record.candidate.ru.status,'owner_approved_semantics','Do not replace approved copy with RU_REVIEW');
    assert.equal(sha(canonicalJson(replay?originalRecord(record,spec):record)),spec.oldSha,'Existing draft baseline drift: '+spec.contentId);
  }
  const capitalSpec=businessPages.capital,capital=registry.records.find(record=>record.contentId===capitalSpec.contentId);
  assert.equal(Boolean(capital),replay,'Only one authorized editorial Knowledge addition');
  const knowledgeShell={contentId:capitalSpec.contentId,kind:'knowledge',title:'',parentId:'business',relatedContentIds:[],serviceId:null,pricingRef:null,bindingStatus:'not_applicable',availability:'not_verified',bindingEvidence:[],published:null,
    candidate:{route:capitalSpec.route,exposure:'preview_only',revision:'BUSINESS_PENDING',ru:{},translations:{}},reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]};
  if(capital)assert.deepEqual({...capital,title:'',candidate:knowledgeShell.candidate,relatedContentIds:[],inlineLinkTargets:[]},knowledgeShell,'Knowledge immutable identity drift');
  for(const spec of Object.values(businessPages))for(const record of registry.records.filter(record=>record.contentId!==spec.contentId)) {
    assert.notEqual(record.candidate.route,spec.route,'Occupied candidate route');
    for(const route of Object.values(record.published?.routes??{}))assert.ok(!inputRegistry.locales.some(language=>route===language.prefix+spec.route),'Occupied published route');
  }
  const before=structuredClone(inputRegistry);
  const historic=structuredClone(inputRegistry);historic.records=historic.records.filter(record=>record.contentId!==capitalSpec.contentId)
    .map(record=>{const spec=existingSpecs.find(spec=>spec.contentId===record.contentId);return spec?originalRecord(record,spec):record;});
  assert.equal(historic.records.length,153);
  const history={schemaVersion:1,sourceRegistryRecordCount:153,sourceRegistrySha256:sha(jsonBytes(historic)),removeAddedContentIds:[capitalSpec.contentId],records:historic.records.filter(record=>existingSpecs.some(spec=>spec.contentId===record.contentId))};
  if(!replay)writes.set(BUSINESS_HISTORY,jsonBytes(history));
  if(!capital)registry.records.push(knowledgeShell);
  const qa={schemaVersion:1,batchId:BUSINESS_BATCH,status:'MODEL_TRANSLATED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const build={schemaVersion:1,version:BUSINESS_BATCH,stage:'IMPORTED_RU_REVIEW_PENDING_RENDER_QA',fullPayloadKind:BUSINESS_KIND,
    authority:{scope:'Exact supplied RU_REVIEW plus model translations; not semantic approval, legal/native/render QA or publication'},
    sourceManifest:{file:BUSINESS_PACK+'ALL_LOCALES_CONTENT_SEO_MANIFEST.json',sha256:businessEvidenceHashes['ALL_LOCALES_CONTENT_SEO_MANIFEST.json']},
    publicationGates:Object.fromEntries(BUSINESS_GATES.map(gate=>[gate,false])),records:[]};
  const hints=new Map(Object.values(businessPages).map(spec=>[spec.hint,spec.contentId]));
  const resolveLink=(href,language)=>{
    const route=language.prefix&&href.startsWith(language.prefix+'/')?href.slice(language.prefix.length):href;
    const id=hints.get(route)??registry.records.find(record=>record.candidate.route===route||Object.values(record.published?.routes??{}).includes(route))?.contentId??null;
    return {sourceRoute:href,sourceCanonicalHint:route,contentId:id,resolvedCanonicalRoute:id?registry.records.find(record=>record.contentId===id).candidate.route:null,status:id?'resolved_content_id':'planned_unmapped'};
  };
  for(const [pageKey,spec] of Object.entries(businessPages)) {
    const record=registry.records.find(item=>item.contentId===spec.contentId),ru=sourceRows.get(pageKey+'/ru'),revision='sha256:'+sha(ru.body);
    const linkPins=ru.structure.links.filter(link=>link.startsWith('/')).map(link=>resolveLink(link,inputRegistry.locales[0]));
    assert.ok(linkPins.every(link=>link.contentId),'Unmapped Business link identity');
    const inlineLinkTargets=[...(spec.oldRevision?originalLinks(spec):[]),...linkPins.map(link=>({sourceRoute:link.resolvedCanonicalRoute,contentId:link.contentId,status:link.status}))];
    record.inlineLinkTargets=[...new Map(inlineLinkTargets.map(link=>[link.sourceRoute,link])).values()];
    record.relatedContentIds=[...new Set([...(spec.oldRevision?originalRelated(spec):[]),...linkPins.map(link=>link.contentId)])];
    record.title=ru.row.seo.h1;record.candidate={route:spec.route,exposure:'preview_only',revision,ru:{},translations:{}};
    const entry={contentId:spec.contentId,pageKey,sourceRevision:revision,editorialSourceRevision:ru.row.sourceRevision,sourceMarkdownSha256:ru.row.sourceSha256,canonicalPath:spec.route,serviceId:null,pricingRef:null,
      publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'RU_REVIEW_PENDING_ACTUAL_RENDER_QA'},locales:{}};
    let ruEnvelope=null;
    for(const language of inputRegistry.locales) {
      const {row,original,body,structure}=sourceRows.get(pageKey+'/'+language.code),bodyBytes=Buffer.from(body),base=baseName(spec.contentId,language.code),wire=jsonBytes(row);
      const inlineLinks=structure.links.filter(link=>link.startsWith('/')).map(link=>resolveLink(link,language));
      assert.deepEqual(inlineLinks.map(link=>link.contentId),linkPins.map(link=>link.contentId),'Localized link identity drift');
      const meta={sourceRecord:row,fullPayloadKind:BUSINESS_KIND,resolvedContentId:spec.contentId,pageKey,locale:language.code,direction:language.dir,resolvedCanonicalPath:spec.route,
        bodyMarkdown:body,h1:row.seo.h1,seo:structuredClone(row.seo),seoTitle:row.seo.title,metaDescription:row.seo.description,...structure,
        inlineLinkReconciliation:inlineLinks,bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,bodySha256:sha(bodyBytes),bodyRevision:'sha256:'+sha(bodyBytes),sourceRevision:revision,
        editorialSourceRevision:row.sourceRevision,editorialSourceSha256:row.sourceSha256,sourceFile:base+'.source.json',sourceFileSha256:sha(wire),
        sourceMarkdownFile:BUSINESS_PACK+row.file,sourceMarkdownSha256:sha(original),sourceManifestSha256:businessEvidenceHashes['ALL_LOCALES_CONTENT_SEO_MANIFEST.json'],
        quotePolicy:{fixedPriceApproved:false,businessServiceCreated:false,commercialTerms:'INDIVIDUAL_QUOTE_NOT_APPROVED'},
        approval:{status:language.code==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA',nativeSpeakerReview:false,browserReview:false,legalVerification:false},
        sourceLimitations:['RU_REVIEW remains draft; no semantic approval manufactured','Supplied machine/source checks do not certify native, legal or actual browser/render QA','Existing service, catalog, FX, USD rounding and historical orders are unchanged']};
      if(language.code==='ru')ruEnvelope=metadataEnvelope(bodyBytes,meta);assert.ok(ruEnvelope);meta.sourceEnvelopeSha256=ruEnvelope;
      meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta,inlineLinkReconciliation:meta.inlineLinkReconciliation}));
      const metadataBytes=jsonBytes(meta),common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',metadataSha256:sha(metadataBytes),sourceEnvelopeSha256:ruEnvelope};
      writes.set(base+'.md',bodyBytes);writes.set(base+'.source.json',wire);writes.set(base+'.meta.json',metadataBytes);writes.set(BUSINESS_PACK+row.file,original);
      if(language.code==='ru')record.candidate.ru={status:'draft',...common,approvalEvidence:null,approvalRevision:null};
      else record.candidate.translations[language.code]={sourceRevision:revision,status:'translated',complete:true,qa:'not_done',...common,
        qaMethod:'supplied_model_semantic',qaEvidence:'MODEL_TRANSLATED_PENDING_RENDER_QA; actual render/browser/native QA not performed',qaFile:BUSINESS_QA,qaPage:pageKey.replaceAll('_','-')+'.md'};
      entry.locales[language.code]={route:language.prefix+spec.route,suppliedRouteHint:row.routeCandidate,direction:language.dir,...common,sourceFile:meta.sourceFile,sourceFileSha256:meta.sourceFileSha256,
        sourceMarkdownFile:meta.sourceMarkdownFile,sourceMarkdownSha256:meta.sourceMarkdownSha256,payloadRevision:meta.payloadRevision};
      qa.records.push({contentId:spec.contentId,page:pageKey.replaceAll('_','-')+'.md',locale:language.code,bodySha256:'sha256:'+meta.bodySha256,sourceRevision:revision,
        sourceEnvelopeSha256:ruEnvelope,status:meta.approval.status,sourceOriginReconciled:true,nativeReview:false,browserReview:false,legalVerification:false});
    }
    const mapping={pageKey,contentId:spec.contentId,suppliedContentId:spec.suppliedContentId,suppliedRouteHint:spec.hint,resolvedCanonicalRoute:spec.route,
      previousUnpublishedRevision:spec.oldRevision??null,sourceRevision:revision,editorialSourceRevision:ru.row.sourceRevision,sourceMarkdownSha256:ru.row.sourceSha256,
      publishedConflict:false,redirectCreated:false,newBusinessEntity:false,inlineLinks:linkPins};
    reconciliation.push(mapping);build.records.push(entry);
    if(spec.hint!==spec.route)blockers.push({code:'SUPPLIED_LINK_ALIAS_ADAPTER_PENDING',contentId:spec.contentId,sourceRoute:spec.hint,resolvedCanonicalRoute:spec.route,
      action:'Use exact source-to-content-ID reconciliation in a bounded renderer adapter; do not create redirects or replace current routes'});
  }
  blockers.push({code:'RU_REVIEW_AND_RENDER_GATES_PENDING',action:'Keep all content draft/preview-only; semantic approval and actual render/RTL QA are separate gates'});
  blockers.push({code:'LIQUIDATION_HISTORICAL_MERGE_SUGGESTION',contentId:'liquidation',mergeTargetId:registry.records.find(record=>record.contentId==='liquidation').mergeTargetId,
    action:'Preserve historical suggestion; resolve independent closure intent explicitly before future publication'});
  for(const file of Object.keys(businessEvidenceHashes))writes.set(BUSINESS_PACK+file,read(file));
  writes.set(BUSINESS_QA,jsonBytes(qa));writes.set('registry-copy/business_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:BUSINESS_BATCH,records:reconciliation,blockers}));
  writes.set('registry-business-build.v1.json',jsonBytes(build));writes.set('service-registry.v1.json',jsonBytes(registry));
  assert.deepEqual(approvals,inputApprovals,'No RU_REVIEW approval manufactured');
  for(const previous of before.records)if(!owned.has(previous.contentId))assert.deepEqual(registry.records.find(record=>record.contentId===previous.contentId),previous,'Unrelated record changed');
  for(const spec of existingSpecs) {
    const record=registry.records.find(record=>record.contentId===spec.contentId);assert.equal(sha(canonicalJson(originalRecord(record,spec))),spec.oldSha,'Existing identity/merge/pricing boundary drift');
    if(replay)assert.deepEqual(record,before.records.find(previous=>previous.contentId===spec.contentId),'Replay candidate drift');
  }
  if(replay)assert.deepEqual(registry.records.find(record=>record.contentId===capitalSpec.contentId),before.records.find(record=>record.contentId===capitalSpec.contentId),'Replay Knowledge identity drift');
  for(const file of writes.keys())assertBusinessPath(file);
  assert.equal(registry.records.length,154);
  return {writes,registry,approvals,build,history,reconciliation,blockers,summary:{blocked:false,records:6,localizedPayloads:60,registryRecords:154,faq:360,translatedFaq:324,
    newContentRecords:replay?0:1,newBusinessEntities:0,newPricingOperations:0,redirects:0,publication:false,translationsAuthored:0,writes:writes.size,pendingGates:BUSINESS_GATES}};
}
