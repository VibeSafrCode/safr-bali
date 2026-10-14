// Read-only deterministic v82 Documents plan. The caller reviews/applies Map
// writes; this module has no writer, CLI, network, services or publication.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const DOCUMENTS_BATCH='DOCUMENTS_STAGE1_2026-10-09_v1';
export const DOCUMENTS_KIND='DOCUMENTS_STAGE1_FULL_JSON_V1';
export const DOCUMENTS_PACK='registry-copy/documents_source_pack/';
export const DOCUMENTS_SYNC=DOCUMENTS_PACK+'V82/';
export const DOCUMENTS_QA='registry-copy/documents_qa_import.json';
export const DOCUMENTS_HISTORY='registry-copy/documents_preimport_registry_records.json';
export const DOCUMENTS_GATES=Object.freeze(['render','responsive','accessibility','legalApplicability','fulfillmentEvidence','sourceUncertaintyReview']);
export const documentsSha=value=>createHash('sha256').update(value).digest('hex');
const sha=documentsSha,jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const documentsEvidenceHashes=Object.freeze({
  'CONTENT_IMPORT_STAGING.json':'9c180f31d9e8f2eeda1a0d743fb7efead65611450304b34216a504832aae4ad9',
  'ALL_LOCALES_CONTENT_SEO_MANIFEST.json':'29cae767ac1adf123d710e162c3037c6572876fec0d5e031c2c9a4d0feda475a',
  'SOURCE_RU_CONTENT_STAGING_MANIFEST.json':'70ae2574019ac85c1bc54786f805f3d562c3af66360a0febe9bc7245651323f8',
  'LOCKED_PREVIOUS_SHA256.json':'6d0c218d00b70142bc0241a213c5f1fa5bb3ebaa147a88df0a0ff5c00082e8ec',
  'QA/VALIDATION_REPORT.json':'39daccd35098b53a3811a9bab023176ea5717a247dd259dd6a758091f695f42a',
  'QA/QA_REPORT_RU.md':'ba3144770d452e6c6e130f6d199203eba0f055045aaa3edcf5d288b6c6de4685',
  'RESEARCH/SOURCE_REGISTER_RU.md':'7c358e6ece13228c123b49e9ef518e2d274b77b2b3e21731731f6449bf0e4a54',
  'RESEARCH/EDITORIAL_RISK_REGISTER_RU.md':'38018b7316f47712a9b967a5a197d416381e1d105a8b23129437438478373c40',
  'RESEARCH/INTENT_ARCHITECTURE_RU.md':'991ea0f66d252a2e79c07b9a3dd7f2b964b9222d540231c95e816ccd5a9420c6',
  'SCRIPTS/validate_complete.py':'c381756def900f550cd2bb634175a853559c51535c7f207dbe8f174ac9e4f2e2',
});
export const documentsSyncHashes=Object.freeze({
  'DOCUMENTS_RECOVERY_MANIFEST.json':'5fea558889c9ced84e0206d733ed249f2e80d85f3138f2f6a08246d585e294cb',
  'ROUTE_RECONCILIATION.json':'ac0a084514b6fa762f08f35507f53e9bcc0e91be2385eadc3fbcef4a94408bce',
});
export const documentsPages=Object.freeze({
  documents_hub:{contentId:'documents',suppliedContentId:'bali-documents-hub',route:'/bali/documents/',hint:'/bali/documents/',h2:7,h3:10,oldSha:'a5874fd5fdb895096a9709e85d1cf34c4dbdabf508fc3c309f27d61c0db89140'},
  certified_translation:{contentId:'translations',suppliedContentId:'bali-documents-certified-translation',route:'/bali/documents/certified-translations/',hint:'/bali/documents/certified-translation/',h2:10,h3:6,oldSha:'b1803e01795c4992a0f8db62847c403975a298382e71d0aafeb37a24b8b703cd'},
  apostille:{contentId:'apostille',suppliedContentId:'bali-documents-apostille',route:'/bali/documents/apostille/',hint:'/bali/documents/apostille/',h2:9,h3:6,oldSha:'46b8b377d424f259c371bcad0d72b1fe4cff7283b7e1d77db8b75899d52c4dbf'},
  legalization:{contentId:'legalization',suppliedContentId:'bali-documents-legalization',route:'/bali/documents/legalization/',hint:'/bali/documents/legalization/',h2:9,h3:6},
  corporate_documents:{contentId:'corporate_docs',suppliedContentId:'bali-documents-corporate',route:'/bali/documents/corporate/',hint:'/bali/documents/corporate/',h2:10,h3:9},
  apostille_vs_legalization:{contentId:'knowledge_apostille_vs_legalization',suppliedContentId:'bali-knowledge-apostille-vs-legalization',route:'/bali/knowledge/documents/apostille-vs-legalization/',hint:'/bali/knowledge/documents/apostille-vs-legalization/',h2:10,h3:6},
});
const faqHeadings={ru:'Частые вопросы',en:'Frequently asked questions',de:'Häufige Fragen','zh-Hans':'常见问题',ko:'자주 묻는 질문',fr:'Questions fréquentes',ja:'よくある質問',hi:'अक्सर पूछे जाने वाले प्रश्न',es:'Preguntas frecuentes',ar:'الأسئلة الشائعة'};
const pathPattern=/^\/(?:[a-z0-9-]+\/)*$/;
const sourceNames='(?:DOCUMENTS_HUB|CERTIFIED_TRANSLATION|APOSTILLE|LEGALIZATION|CORPORATE_DOCUMENTS|APOSTILLE_VS_LEGALIZATION)';
const contentPattern=new RegExp('^CONTENT/(?:RU|EN|DE|ZH-HANS|KO|FR|JA|HI|ES|AR)/'+sourceNames+'_[A-Z-]+_v1(?:_REVIEW)?\\.md$');
export function assertDocumentsPath(file) {
  assert.ok(typeof file==='string'&&file&&!file.startsWith('/')&&!file.includes('\\')&&/^[A-Za-z0-9_./-]+$/.test(file)&&
    !file.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe package path');
}
const permittedBundle=file=>Object.hasOwn(documentsEvidenceHashes,file)||contentPattern.test(file);
const boundedReader=(directory,permitted)=>{
  const root=resolve(directory),stat=lstatSync(root);
  assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&realpathSync(root)===root,'Refuse symlink bundle root');
  return file=>{
    assertDocumentsPath(file);assert.ok(permitted(file),'Not an allowed Documents source');
    let current=root;const parts=file.split('/');
    for(const [index,part] of parts.entries()) {
      current=join(current,part);const member=lstatSync(current);
      assert.ok(!member.isSymbolicLink(),'Refuse symlink bundle member');
      assert.ok(index===parts.length-1?member.isFile():member.isDirectory(),'Source must be a regular file');
    }
    return readFileSync(current);
  };
};
export const createDocumentsBundleReader=directory=>boundedReader(directory,permittedBundle);
export const createDocumentsSyncReader=directory=>boundedReader(directory,file=>Object.hasOwn(documentsSyncHashes,file));

// Preserve the original JSON object bytes, including property order and
// indentation. The complete source JSON is retained separately as well.
export function documentsSourceEnvelopes(bytes) {
  const text=Buffer.from(bytes).toString('utf8'),parsed=JSON.parse(text),start=text.match(/^  "pages": \[/m);
  assert.ok(start&&Array.isArray(parsed.pages),'Missing source pages array');
  const out=[];let index=start.index+start[0].length;
  while(index<text.length) {
    while(/[\s,]/.test(text[index]))index++;
    if(text[index]===']')break;
    assert.equal(text[index],'{','Expected source JSON object');
    const begin=index;let depth=0,inString=false,escaped=false;
    for(;index<text.length;index++) {
      const char=text[index];
      if(inString) {if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue;}
      if(char==='"')inString=true;
      else if(char==='{')depth++;
      else if(char==='}'&&--depth===0){index++;break;}
    }
    assert.equal(depth,0,'Unterminated source envelope');
    const original=Buffer.from(text.slice(begin,index));
    assert.deepEqual(JSON.parse(original),parsed.pages[out.length],'Source envelope extraction drift');out.push(original);
  }
  assert.equal(out.length,parsed.pages.length,'Source envelope count drift');return out;
}

export function publicDocumentsBody(original,row) {
  assert.ok(!original.includes('\r'),'Unexpected source line endings');
  assert.equal(original,row.fullTextMarkdown,'Full JSON/Markdown source drift');
  const head=original.match(/^<!-- SAFRWAY EDITORIAL STAGING · NOT PUBLIC OUTPUT\n([\s\S]*?)-->\n/);
  assert.ok(head,'Missing exact staging envelope');
  const fields=Object.fromEntries(head[1].trim().split('\n').map(line=>{const cut=line.indexOf(': ');assert.ok(cut>0);return [line.slice(0,cut),line.slice(cut+2)];}));
  for(const [key,value] of Object.entries({pageKey:row.pageKey,contentId:row.contentId,locale:row.locale,status:row.status,pageType:row.pageType,routeCandidate:row.candidateRoute,sourceRevision:row.sourceRevision}))
    assert.equal(fields[key],value,'Staging field drift: '+key);
  if(row.locale==='ru')assert.equal(fields.servicePrice,row.pageType==='knowledge'?'INFORMATIONAL_NO_FIXED_PRICE':'INDIVIDUAL_QUOTE_NOT_APPROVED');
  else {assert.equal(fields.sourceSha256,row.sourceSha256);assert.equal(fields.direction,row.direction);assert.equal(fields.pricingMode,row.pricingMode);}
  const after=original.slice(head[0].length),prefix=after.match(/^\n?\*\*SEO Title:\*\* ([^\n]+)\n\*\*Meta Description:\*\* ([^\n]+)\n\n/);
  assert.ok(prefix,'SEO scaffold drift');assert.equal(prefix[1].trimEnd(),row.seo.title);assert.equal(prefix[2].trimEnd(),row.seo.metaDescription);
  let body=after.slice(prefix[0].length);assert.equal(body,row.bodyMarkdown,'Supplied body projection drift');
  assert.ok(body.startsWith('# '+row.seo.h1+'\n'),'Customer H1 drift');
  const cta='**CTA:** '+row.cta;assert.equal(body.split('\n').filter(line=>line.startsWith('**CTA:**')).length,1,'Ambiguous CTA scaffold');
  assert.ok(body.split('\n').includes(cta),'Manifest CTA drift');body=body.replace(cta+'\n','');
  assert.ok(!/<!--|-->|EDITORIAL STAGING|sourceSha256:|sourceRevision:|routeCandidate:|\*\*(?:SEO Title|Meta Description|CTA):\*\*/.test(body),'Staging leakage');
  assert.ok(!/CATALOG_PRICE|\{\{USD|\$\d|\b\d{3,}(?:[., ]?\d{3})*\s*IDR\b/.test(body),'Unapproved independent commercial price');
  return body;
}
const markdownLinks=body=>[...body.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)].map(match=>match[1]);
export function readDocumentsStructure(body,row) {
  const spec=documentsPages[row.pageKey],heads=[...body.matchAll(/^## (.+)$/gm)];
  assert.equal((body.match(/^# /gm)??[]).length,1);assert.equal(heads.length,spec.h2);assert.equal((body.match(/^### /gm)??[]).length,spec.h3);
  const faqIndex=heads.findIndex(head=>head[1]===faqHeadings[row.locale]);assert.ok(faqIndex>=0,'Missing locale FAQ');
  assert.equal(heads.filter(head=>head[1]===faqHeadings[row.locale]).length,1);
  const faqBody=body.slice(heads[faqIndex].index+heads[faqIndex][0].length,heads[faqIndex+1]?.index??body.length);
  const questions=[...faqBody.matchAll(/^### (.+)$/gm)];assert.equal(questions.length,row.faqCount);assert.equal(questions.length,6);
  const faq=questions.map((question,index)=>({question:question[1],answerMarkdown:faqBody.slice(question.index+question[0].length,questions[index+1]?.index??faqBody.length).trim()}));
  assert.ok(faq.every(question=>question.answerMarkdown),'Empty FAQ answer');
  const links=markdownLinks(body);assert.equal(links.filter(link=>link.startsWith('/')).length,row.internalLinkCount);
  assert.equal(links.filter(link=>link.startsWith('http')).length,row.externalLinkCount);
  return {directAnswer:body.slice(heads[0].index+heads[0][0].length,heads[1].index).trim(),factBlock:{heading:'',items:[]},faq,faqHeading:faqHeadings[row.locale],faqSectionIndex:faqIndex,
    cta:[{role:'primary',label:row.cta,actionIntent:'existing_contact_flow'}],links};
}
const baseName=(id,locale)=>'registry-copy/'+id+'_'+locale.toLowerCase().replaceAll('-','_')+'_documents_20261009';
const newShell=spec=>({contentId:spec.contentId,kind:spec.contentId.startsWith('knowledge_')?'knowledge':'document',title:'',parentId:'documents',relatedContentIds:[],
  serviceId:null,pricingRef:null,bindingStatus:spec.contentId.startsWith('knowledge_')?'not_applicable':'unresolved',availability:'not_verified',bindingEvidence:[],published:null,
  candidate:{route:spec.route,exposure:'preview_only',revision:'DOCUMENTS_PENDING',ru:{},translations:{}},reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]});

export function planDocumentsImport({readBundle,readSync,registry:inputRegistry,approvals:inputApprovals,history:inputHistory=null}) {
  const read=file=>{assertDocumentsPath(file);assert.ok(permittedBundle(file),'Not an allowed Documents source');return Buffer.from(readBundle(file));};
  const sync=file=>{assertDocumentsPath(file);assert.ok(Object.hasOwn(documentsSyncHashes,file),'Not an allowed v82 source');return Buffer.from(readSync(file));};
  const sourceBytes=new Map(),syncBytes=new Map();
  for(const [file,pin] of Object.entries(documentsEvidenceHashes)){const bytes=read(file);assert.equal(sha(bytes),pin,'Supplied evidence drift: '+file);sourceBytes.set(file,bytes);}
  for(const [file,pin] of Object.entries(documentsSyncHashes)){const bytes=sync(file);assert.equal(sha(bytes),pin,'v82 evidence drift: '+file);syncBytes.set(file,bytes);}
  const manifest=JSON.parse(sourceBytes.get('CONTENT_IMPORT_STAGING.json')),seoManifest=JSON.parse(sourceBytes.get('ALL_LOCALES_CONTENT_SEO_MANIFEST.json'));
  const recovery=JSON.parse(syncBytes.get('DOCUMENTS_RECOVERY_MANIFEST.json')),routeReconciliation=JSON.parse(syncBytes.get('ROUTE_RECONCILIATION.json'));
  const sourceEnvelopes=documentsSourceEnvelopes(sourceBytes.get('CONTENT_IMPORT_STAGING.json')),locks=JSON.parse(sourceBytes.get('LOCKED_PREVIOUS_SHA256.json'));
  assert.equal(manifest.schema,'EDITORIAL_STAGING_ONLY_NOT_RUNTIME');assert.equal(manifest.cluster,'documents');assert.equal(manifest.createdOn,'2026-10-09');
  assert.equal(manifest.publicationStatus,'NOT_DEPLOYED_OR_INDEXING_VERIFIED');assert.equal(manifest.pages.length,60);assert.equal(recovery.records.length,60);
  assert.equal(new Set(manifest.pages.map(row=>row.pageKey+'/'+row.locale)).size,60);assert.equal(new Set(manifest.pages.map(row=>row.contentFile)).size,60);
  assert.deepEqual([...new Set(manifest.pages.map(row=>row.pageKey))],Object.keys(documentsPages));
  assert.deepEqual(['ru',...manifest.targetLanguages].sort(),inputRegistry.locales.map(language=>language.code).sort());
  assert.deepEqual({...manifest,pages:undefined}, {...seoManifest,pages:undefined});
  const qaSource=JSON.parse(sourceBytes.get('QA/VALIDATION_REPORT.json'));
  assert.equal(qaSource.status,'PASS');assert.equal(qaSource.pages,60);assert.equal(qaSource.translations,54);assert.equal(qaSource.translatedFAQ,324);assert.deepEqual(qaSource.issues,[]);
  assert.equal(Object.keys(qaSource.negativeTests).length,17);assert.ok(Object.values(qaSource.negativeTests).every(Boolean));
  const sourceRows=new Map();
  for(const [index,row] of manifest.pages.entries()) {
    const spec=documentsPages[row.pageKey],language=inputRegistry.locales.find(item=>item.code===row.locale);assert.ok(spec&&language);
    const control=recovery.records.find(item=>item.pageKey===row.pageKey&&item.locale===row.locale);assert.ok(control,'Missing v82 recovery row');
    assert.equal(row.contentId,spec.suppliedContentId);assert.equal(row.direction,language.dir);assert.equal(row.candidateRoute,language.prefix+spec.hint);
    assert.equal(row.canonicalRouteCandidate,row.candidateRoute);assert.equal(row.pricingMode,row.pageType==='knowledge'?'information_only':'individual_quote');
    assert.equal(row.serviceId,'LOOKUP_EXISTING_DO_NOT_CREATE_AUTOMATICALLY');assert.equal(row.pricingRef,'LOOKUP_EXISTING_DO_NOT_CREATE_AUTOMATICALLY');
    assert.equal(row.status,row.locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');assert.equal(row.publishStatus,'NOT_DEPLOYED_OR_INDEXING_VERIFIED');
    const {fullTextMarkdown,bodyMarkdown,...seoRow}=row;assert.deepEqual(seoRow,seoManifest.pages[index],'SEO/source projection drift');
    const ru=manifest.pages.find(item=>item.pageKey===row.pageKey&&item.locale==='ru');assert.equal(row.sourceRevision,ru.sourceRevision);assert.equal(row.sourceSha256,ru.sourceSha256);
    for(const [key,value] of Object.entries({suppliedContentId:row.contentId,resolvedContentId:spec.contentId,sourceFile:row.contentFile,sourceRevision:row.sourceRevision,ruSourceSha256:row.sourceSha256,
      suppliedRoute:row.candidateRoute,resolvedRouteCandidate:language.prefix+spec.route,direction:language.dir,pricingMode:'individual_quote'}))assert.equal(control[key],value,'v82 recovery drift: '+key);
    assert.equal(control.identityDisposition,spec.oldSha?'REUSE_EXISTING':'PROPOSED_NEW_CONTENT_ID_NOT_CREATED');
    const original=read(row.contentFile);assert.equal(sha(original),control.sourceFileSha256,'Source Markdown drift: '+row.contentFile);
    if(locks[row.contentFile])assert.equal(sha(original),locks[row.contentFile],'Prior locked source drift');
    if(row.locale==='ru')assert.equal(sha(original),row.sourceSha256);
    const body=publicDocumentsBody(original.toString('utf8'),row);readDocumentsStructure(body,row);
    assert.deepEqual(markdownLinks(body).filter(link=>link.startsWith('/')),row.internalLinkCandidates,'Internal source links drift');
    sourceRows.set(row.pageKey+'/'+row.locale,{row,original,body,wire:sourceEnvelopes[index]});
  }
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),writes=new Map(),reconciliation=[],blockers=[];
  const specs=Object.values(documentsPages),oldSpecs=specs.filter(spec=>spec.oldSha),newSpecs=specs.filter(spec=>!spec.oldSha),owned=new Set(specs.map(spec=>spec.contentId));
  const present=newSpecs.filter(spec=>registry.records.some(record=>record.contentId===spec.contentId));
  assert.ok(present.length===0||present.length===3,'Partially occupied Documents identities');
  const replay=present.length===3;assert.equal(inputRegistry.records.length,replay?157:154,'Unexpected Registry baseline');
  for(const spec of specs) {
    const record=registry.records.find(item=>item.contentId===spec.contentId);
    if(spec.oldSha)assert.ok(record,'Missing existing Documents identity');
    if(record) {
      assert.equal(record.published,null,'Do not replace published content');assert.equal(record.candidate.route,spec.route,'Preserve existing canonical route');
      assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.release,'not_authorized');
      assert.notEqual(record.candidate.ru.status,'owner_approved_semantics','Do not replace approved copy with RU_REVIEW');
      if(record.serviceId!==null||record.pricingRef!==null)blockers.push({code:'EXISTING_DOCUMENTS_BINDING_CONFLICT',contentId:record.contentId,serviceId:record.serviceId,pricingRef:structuredClone(record.pricingRef),action:'Preserve existing binding; reconcile quote-only content before applying'});
    }
    for(const other of registry.records.filter(item=>item.contentId!==spec.contentId)) {
      assert.notEqual(other.candidate.route,spec.route,'Occupied candidate route');
      assert.ok(!other.reuseRoutes.some(route=>route===spec.route||route===spec.hint),'Occupied reuse route');
      for(const route of Object.values(other.published?.routes??{}))assert.ok(!registry.locales.some(language=>route===language.prefix+spec.route||route===language.prefix+spec.hint),'Occupied published route');
    }
  }
  if(blockers.length)return {writes,registry,approvals,build:null,reconciliation,blockers,summary:{blocked:true,localizedPayloads:60,newBusinessEntities:0,newPricingOperations:0,writes:0}};
  const oldRecords=replay?inputHistory?.records:oldSpecs.map(spec=>registry.records.find(record=>record.contentId===spec.contentId));
  assert.ok(oldRecords&&oldRecords.length===3,'Replay requires exact pre-import Documents history');
  for(const spec of oldSpecs)assert.equal(sha(canonicalJson(oldRecords.find(record=>record.contentId===spec.contentId))),spec.oldSha,'Existing draft baseline drift: '+spec.contentId);
  if(replay)for(const spec of specs) {
    const record=registry.records.find(item=>item.contentId===spec.contentId),original=spec.oldSha?oldRecords.find(item=>item.contentId===spec.contentId):newShell(spec);
    assert.deepEqual({...record,title:original.title,candidate:original.candidate,relatedContentIds:original.relatedContentIds,inlineLinkTargets:original.inlineLinkTargets},original,'Immutable Documents identity drift');
  }
  const historic=structuredClone(inputRegistry);historic.records=historic.records.filter(record=>!newSpecs.some(spec=>spec.contentId===record.contentId))
    .map(record=>structuredClone(oldRecords.find(old=>old.contentId===record.contentId)??record));
  const history=replay?structuredClone(inputHistory):{schemaVersion:1,sourceRegistryRecordCount:154,sourceRegistrySha256:sha(jsonBytes(historic)),removeAddedContentIds:newSpecs.map(spec=>spec.contentId),records:structuredClone(oldRecords)};
  if(replay){assert.equal(history.schemaVersion,1);assert.equal(history.sourceRegistryRecordCount,154);assert.deepEqual(history.removeAddedContentIds,newSpecs.map(spec=>spec.contentId));}
  else writes.set(DOCUMENTS_HISTORY,jsonBytes(history));
  if(!replay)newSpecs.forEach(spec=>registry.records.push(newShell(spec)));

  const aliases=new Map();assert.equal(routeReconciliation.aliases.length,50);
  for(const alias of routeReconciliation.aliases) {
    const language=registry.locales.find(item=>item.code===alias.locale),record=registry.records.find(item=>item.contentId===alias.contentId);assert.ok(language&&record,'Unknown link alias identity');
    assert.equal(alias.action,'LINK_RESOLUTION_ONLY');assert.equal(alias.redirect_authorized,false);assert.match(alias.source_route_hint,pathPattern);
    assert.equal(alias.resolved_candidate,language.prefix+record.candidate.route,'Alias canonical identity drift');
    assert.ok(!aliases.has(alias.source_route_hint),'Duplicate link alias');aliases.set(alias.source_route_hint,alias);
  }
  const resolveLink=(href,language)=>{
    const resolved=aliases.get(href)?.resolved_candidate??href;
    if(language.prefix)assert.ok(resolved.startsWith(language.prefix+'/'),'Wrong locale internal link');
    const route=language.prefix?resolved.slice(language.prefix.length):resolved;
    const target=registry.records.find(record=>record.candidate.route===route||Object.values(record.published?.routes??{}).includes(resolved));
    assert.ok(target,'Unmapped Documents link identity: '+href);
    return {sourceRoute:href,derivedRoute:language.prefix+target.candidate.route,contentId:target.contentId,resolvedCanonicalRoute:target.candidate.route,status:'resolved_content_id'};
  };
  const qa={schemaVersion:1,batchId:DOCUMENTS_BATCH,status:'MODEL_TRANSLATED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const build={schemaVersion:1,version:DOCUMENTS_BATCH,stage:'IMPORTED_RU_REVIEW_PENDING_RENDER_QA',fullPayloadKind:DOCUMENTS_KIND,
    authority:{scope:'v82 bounded local import; exact supplied RU_REVIEW and translations; no legal, native, browser, fulfillment or publication approval'},
    sourceManifest:{file:DOCUMENTS_PACK+'CONTENT_IMPORT_STAGING.json',sha256:documentsEvidenceHashes['CONTENT_IMPORT_STAGING.json']},
    routeReconciliation:{file:DOCUMENTS_SYNC+'ROUTE_RECONCILIATION.json',sha256:documentsSyncHashes['ROUTE_RECONCILIATION.json'],aliases:50},
    publicationGates:Object.fromEntries(DOCUMENTS_GATES.map(gate=>[gate,false])),records:[]};
  for(const [pageKey,spec] of Object.entries(documentsPages)) {
    const record=registry.records.find(item=>item.contentId===spec.contentId),ru=sourceRows.get(pageKey+'/ru');
    const normalized=new Map();
    for(const language of registry.locales) {
      const supplied=sourceRows.get(pageKey+'/'+language.code),inlineLinks=markdownLinks(supplied.body).filter(link=>link.startsWith('/')).map(link=>resolveLink(link,language));
      const linkMap=new Map(inlineLinks.map(link=>[link.sourceRoute,link.derivedRoute]));
      const body=supplied.body.replace(/\]\((\/[^)\s]+)\)/g,(match,href)=>']('+linkMap.get(href)+')');
      normalized.set(language.code,{...supplied,body,inlineLinks,structure:readDocumentsStructure(body,supplied.row)});
    }
    const ruDerived=normalized.get('ru'),revision='sha256:'+sha(ruDerived.body),old=oldRecords.find(item=>item.contentId===spec.contentId);
    record.relatedContentIds=[...new Set([...(old?.relatedContentIds??[]),...ruDerived.inlineLinks.map(link=>link.contentId)])];
    record.inlineLinkTargets=[...new Map([...(old?.inlineLinkTargets??[]),...ruDerived.inlineLinks.map(link=>({sourceRoute:link.resolvedCanonicalRoute,contentId:link.contentId,status:link.status}))].map(link=>[link.sourceRoute,link])).values()];
    record.title=ru.row.seo.h1;record.candidate={route:spec.route,exposure:'preview_only',revision,ru:{},translations:{}};
    const entry={contentId:spec.contentId,pageKey,sourceRevision:revision,editorialSourceRevision:ru.row.sourceRevision,sourceMarkdownSha256:ru.row.sourceSha256,canonicalPath:spec.route,serviceId:record.serviceId,pricingRef:record.pricingRef,
      publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'RU_REVIEW_PENDING_ACTUAL_RENDER_QA'},locales:{}};
    let ruEnvelope=null;
    for(const language of registry.locales) {
      const {row,original,wire,body,structure,inlineLinks}=normalized.get(language.code),bodyBytes=Buffer.from(body),base=baseName(spec.contentId,language.code);
      assert.deepEqual(inlineLinks.map(link=>link.contentId),ruDerived.inlineLinks.map(link=>link.contentId),'Localized link identity drift');
      const seo={title:row.seo.title,description:row.seo.metaDescription,h1:row.seo.h1};
      const meta={sourceRecord:row,fullPayloadKind:DOCUMENTS_KIND,resolvedContentId:spec.contentId,pageKey,locale:language.code,direction:language.dir,resolvedCanonicalPath:spec.route,
        bodyMarkdown:body,h1:row.seo.h1,seo,seoTitle:seo.title,metaDescription:seo.description,...structure,
        sourceLinkReconciliation:inlineLinks,
        inlineLinkReconciliation:[...new Map(inlineLinks.map(link=>[link.derivedRoute,{...link,sourceOriginalRoute:link.sourceRoute,sourceRoute:link.derivedRoute}])).values()],bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,
        bodySha256:sha(bodyBytes),bodyRevision:'sha256:'+sha(bodyBytes),sourceRevision:revision,editorialSourceRevision:row.sourceRevision,editorialSourceSha256:row.sourceSha256,
        sourceFile:base+'.source.json',sourceFileSha256:sha(wire),sourceMarkdownFile:DOCUMENTS_PACK+row.contentFile,sourceMarkdownSha256:sha(original),
        sourceManifestSha256:documentsEvidenceHashes['CONTENT_IMPORT_STAGING.json'],routeReconciliationSha256:documentsSyncHashes['ROUTE_RECONCILIATION.json'],
        pricingMode:row.pricingMode,
        quotePolicy:{fixedPriceApproved:false,businessServiceCreated:false,commercialTerms:row.pageType==='knowledge'?'INFORMATIONAL_NO_FIXED_PRICE':'INDIVIDUAL_QUOTE_NOT_APPROVED'},
        approval:{status:row.status,nativeSpeakerReview:false,browserReview:false,legalVerification:false},
        sourceLimitations:['RU_REVIEW remains draft; no semantic approval manufactured','Source checks do not certify legal applicability, native translation, fulfillment or browser/render QA','Existing Registry service/pricing, FX, currency formula and historical orders are preserved']};
      if(language.code==='ru')ruEnvelope=metadataEnvelope(bodyBytes,meta);assert.ok(ruEnvelope);meta.sourceEnvelopeSha256=ruEnvelope;
      meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta,inlineLinkReconciliation:meta.inlineLinkReconciliation}));
      const metadataBytes=jsonBytes(meta),common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',metadataSha256:sha(metadataBytes),sourceEnvelopeSha256:ruEnvelope};
      writes.set(base+'.md',bodyBytes);writes.set(base+'.source.json',wire);writes.set(base+'.meta.json',metadataBytes);writes.set(DOCUMENTS_PACK+row.contentFile,original);
      if(language.code==='ru')record.candidate.ru={status:'draft',...common,approvalEvidence:null,approvalRevision:null};
      else record.candidate.translations[language.code]={sourceRevision:revision,status:'translated',complete:true,qa:'not_done',...common,qaMethod:'supplied_model_semantic',
        qaEvidence:'MODEL_TRANSLATED_PENDING_RENDER_QA; native/legal/fulfillment/browser review not performed',qaFile:DOCUMENTS_QA,qaPage:pageKey.replaceAll('_','-')+'.md'};
      entry.locales[language.code]={route:language.prefix+spec.route,suppliedRouteHint:row.candidateRoute,direction:language.dir,...common,sourceFile:meta.sourceFile,sourceFileSha256:meta.sourceFileSha256,
        sourceMarkdownFile:meta.sourceMarkdownFile,sourceMarkdownSha256:meta.sourceMarkdownSha256,payloadRevision:meta.payloadRevision};
      qa.records.push({contentId:spec.contentId,page:pageKey.replaceAll('_','-')+'.md',locale:language.code,bodySha256:'sha256:'+meta.bodySha256,sourceRevision:revision,sourceEnvelopeSha256:ruEnvelope,
        status:row.status,sourceOriginReconciled:true,nativeReview:false,browserReview:false,legalVerification:false});
    }
    reconciliation.push({pageKey,contentId:spec.contentId,suppliedContentId:spec.suppliedContentId,suppliedRouteHint:spec.hint,resolvedCanonicalRoute:spec.route,
      sourceRevision:revision,editorialSourceRevision:ru.row.sourceRevision,sourceMarkdownSha256:ru.row.sourceSha256,redirectCreated:false,newBusinessEntity:false,publishedConflict:false,inlineLinks:ruDerived.inlineLinks});
    build.records.push(entry);
  }
  blockers.push({code:'DOCUMENTS_RELEASE_GATES_PENDING',action:'Protected preview only; RU_REVIEW, native/legal/fulfillment and actual render/RTL QA remain pending'});
  blockers.push({code:'DOCUMENTS_RECOVERY_KNOWLEDGE_PRICING_PROJECTION',contentId:'knowledge_apostille_vs_legalization',locales:10,
    suppliedPricingMode:'information_only',recoveryPricingMode:'individual_quote',action:'Preserve source informational intent and null Service/pricing; recovery projection is not runtime pricing authority'});
  for(const spec of oldSpecs) {
    const record=registry.records.find(item=>item.contentId===spec.contentId);
    if(record.mergeTargetId)blockers.push({code:'DOCUMENTS_HISTORICAL_MERGE_SUGGESTION',contentId:spec.contentId,mergeTargetId:record.mergeTargetId,action:'Historical suggestion retained; do not perform a merge'});
  }
  for(const [file,bytes] of sourceBytes)writes.set(DOCUMENTS_PACK+file,bytes);
  for(const [file,bytes] of syncBytes)writes.set(DOCUMENTS_SYNC+file,bytes);
  writes.set(DOCUMENTS_QA,jsonBytes(qa));writes.set('registry-copy/documents_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:DOCUMENTS_BATCH,records:reconciliation,aliases:routeReconciliation.aliases,blockers}));
  writes.set('registry-documents-build.v1.json',jsonBytes(build));writes.set('service-registry.v1.json',jsonBytes(registry));
  assert.deepEqual(approvals,inputApprovals,'No RU_REVIEW approval manufactured');
  for(const previous of inputRegistry.records)if(!owned.has(previous.contentId))assert.deepEqual(registry.records.find(record=>record.contentId===previous.contentId),previous,'Unrelated record changed');
  if(replay)for(const spec of specs)assert.deepEqual(registry.records.find(record=>record.contentId===spec.contentId),inputRegistry.records.find(record=>record.contentId===spec.contentId),'Replay candidate drift');
  for(const file of writes.keys())assertDocumentsPath(file);
  return {writes,registry,approvals,build,history,reconciliation,blockers,summary:{blocked:false,records:6,localizedPayloads:60,registryRecords:157,faq:360,translatedFaq:324,
    newContentRecords:replay?0:3,newBusinessEntities:0,newPricingOperations:0,redirects:0,publication:false,translationsAuthored:0,aliases:50,writes:writes.size,pendingGates:DOCUMENTS_GATES}};
}

export function restorePreDocumentsRegistry(registry,history) {
  assert.equal(history?.schemaVersion,1);assert.equal(history.sourceRegistryRecordCount,154);
  assert.deepEqual(history.removeAddedContentIds,Object.values(documentsPages).filter(spec=>!spec.oldSha).map(spec=>spec.contentId));
  assert.equal(history.records.length,3);
  for(const spec of Object.values(documentsPages).filter(spec=>spec.oldSha))
    assert.equal(sha(canonicalJson(history.records.find(record=>record.contentId===spec.contentId))),spec.oldSha,'Pre-import Documents history drift');
  const restored=structuredClone(registry);
  restored.records=restored.records.filter(record=>!history.removeAddedContentIds.includes(record.contentId))
    .map(record=>structuredClone(history.records.find(old=>old.contentId===record.contentId)??record));
  assert.equal(restored.records.length,154);
  assert.equal(sha(jsonBytes(restored)),history.sourceRegistrySha256,'Pre-import Registry restoration drift');
  return restored;
}
