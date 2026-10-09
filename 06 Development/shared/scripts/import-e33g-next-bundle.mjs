// Exact Founder-supplied JSON/Markdown import. No translation, price/FX
// calculation, browser review, legal attestation, deployment or network.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const E33G_NEXT_BATCH='E33G_NEXT_STAGE_2026-10-09_v1';
export const E33G_NEXT_KIND='E33G_NEXT_FULL_JSON_V1';
export const E33G_NEXT_GATES=['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview'];
export const e33gNextPages=Object.freeze({
  '01_e33g_extension':{contentId:'e33g_next_term',suppliedContentId:'bali.visas.e33g.extension',route:'/bali/visas/e33g/extension/',oldRoute:'/bali/visas/e33g/next-term/',oldSha:'f910cdd0dccb0236ad5c7d368925e7d68aba8d1bdc7568a92186fe813352ac8e',faqSectionIndex:7},
  '02_e33g_next_term':{contentId:'knowledge_e33g_extension',suppliedContentId:'bali.knowledge.e33g.next-term',route:'/bali/knowledge/e33g/next-term/',oldRoute:'/bali/knowledge/e33g/extension/',oldSha:'2e8c71bc7435c2da0ec290624c59b5b010c072bf4ec2103e57d7624a11bfe0e0',faqSectionIndex:7},
  '03_e33g_status_change':{contentId:'e33g_conversion',suppliedContentId:'bali.visas.e33g.status-change',route:'/bali/visas/e33g/status-change/',oldRoute:'/bali/visas/e33g/conversion/',oldSha:'7bc89744a121205801496eb48fdbd8b27d54eac79a96559d48be3d6096ab1e7f',faqSectionIndex:9},
  '04_e33g_document_audit':{contentId:'employment_review',suppliedContentId:'bali.visas.e33g.document-audit',route:'/bali/visas/e33g/document-check/',oldRoute:'/bali/visas/e33g/employment-documents/',oldSha:'5da36b1d7ce3f1b19cad868d2a2648344564835115a90d957c168ce69c4f2578',faqSectionIndex:6},
});
export const e33gNextEvidenceHashes=Object.freeze({
  'CONTENT_LOCALIZED_IMPORT.json':'40b683353723fde13879edd3f3780852a90d1198b8fc89c1d9c3f8d6c5fa6f23',
  'CONTENT_MANIFEST.json':'fd9ac75737262872ddeb2deabf3d49c515061e55a97cec4f430f32c7e0867801',
  'QA/MACHINE_QA.json':'ffadb55590e1a8c8ebea2bc658fbc482af37e1fccd93476efdedae71f8160ee8',
  'QA/VALIDATION_REPORT.json':'79eb56e51cdcec14e9f67fdf34dbff684080756abcbc7dc92a515ce77bf54f09',
  'START_HERE_RU.md':'f46d9cb2ddb241d3e42a057913d7cede59a676b89f30919d22a490ae86016258',
  'CODEX_PROMPT_RELEASE_ALL_RU.md':'7d53d93a39a93459b4ae1b90b8b629e260653e163764e6cb2b39125ec40218fe',
  'SOURCES/E33G_ALIH_STATUS_SOURCE_REGISTER_RU.md':'3e72cd995d71bf0a04e7fc0fa3f03742e81504ac13ca969c6c0daf7e7a5dee56',
});
export const e33gNextPriceOperations=Object.freeze({
  e33g_extension:{entity_type:'SERVICE',entity_key:'visa-extension',option_code:'e33g-extension',sourceSnapshotIdr:12000000},
  e33g_standard:{entity_type:'VISA',entity_key:'E33G',option_code:'standard',sourceSnapshotIdr:12000000},
  e33g_express:{entity_type:'VISA',entity_key:'E33G',option_code:'express',sourceSnapshotIdr:14000000},
  employment_review:{entity_type:'SERVICE',entity_key:'consultation',option_code:'e33g-document-review',sourceSnapshotIdr:2000000},
  conversion_from_voa:{entity_type:'VISA',entity_key:'E33G',option_code:'conversion-from-voa',sourceSnapshotIdr:17000000},
  conversion_from_c1:{entity_type:'VISA',entity_key:'E33G',option_code:'conversion-from-c1',sourceSnapshotIdr:15000000},
  conversion_from_d12:{entity_type:'VISA',entity_key:'E33G',option_code:'conversion-from-d12',sourceSnapshotIdr:17000000},
  conversion_from_kitas:{entity_type:'VISA',entity_key:'E33G',option_code:'conversion-from-kitas',sourceSnapshotIdr:17500000},
});
export const e33gNextSha=value=>createHash('sha256').update(value).digest('hex');
const sha=e33gNextSha,jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sourcePack='registry-copy/e33g_next_source_pack/',qaFile='registry-copy/e33g_next_qa_import.json';
const occurrenceFile='registry-copy/e33g_next_price_occurrences.json';
const existingBusinessBindings={
  e33g_next_term:{serviceId:'visa-extension',pricingRef:{entityType:'SERVICE',entityKey:'visa-extension',optionCodes:['e33g-extension']}},
  knowledge_e33g_extension:{serviceId:null,pricingRef:null},
  e33g_conversion:{serviceId:'visa',pricingRef:{entityType:'VISA',entityKey:'E33G',optionCodes:['conversion-from-voa','conversion-from-kitas','conversion-from-c1','conversion-from-d12']}},
  employment_review:{serviceId:'consultation',pricingRef:{entityType:'SERVICE',entityKey:'consultation',optionCodes:['e33g-document-review']}},
};
const baseName=(id,locale)=>'registry-copy/'+id+'_'+locale.toLowerCase().replaceAll('-','_')+'_e33gnext_20261009';
const sectionRanges=body=>{const ms=[...body.matchAll(/^## (.+)$/gm)];return ms.map((m,i)=>({heading:m[1],start:m.index+m[0].length,end:ms[i+1]?.index??body.length}));};
const span=(field,start,end)=>({utf16Start:start,utf16End:end,utf8ByteStart:Buffer.byteLength(field.slice(0,start)),utf8ByteEnd:Buffer.byteLength(field.slice(0,end)),literal:field.slice(start,end)});

/** The supplied JSON builder's lossless public-body projection. Only the
 * original editorial preamble is absent; source MD is archived verbatim. */
export function publicE33GNextBody(original) {
  assert.ok(!original.includes('\r'),'Supplied source must use LF');
  const title=original.split('\n')[0].replace(/^# /,'').trim(),first=original.search(/^##\s+/m);
  assert.ok(original.startsWith('# ')&&first>0);assert.equal((original.match(/^# /gm)??[]).length,1);
  return '# '+title+'\n\n'+original.slice(first).trim()+'\n';
}
export function readE33GNextStructure(body,{faqSectionIndex}) {
  const sections=sectionRanges(body),first=sections[0],faqPart=sections[faqSectionIndex];assert.ok(first&&faqPart);
  const directAnswer=body.slice(first.start,first.end).trim();
  const text=body.slice(faqPart.start,faqPart.end),questions=[...text.matchAll(/^### (.+)$/gm)];assert.ok(questions.length);
  const faq=questions.map((m,i)=>({question:m[1],answerMarkdown:text.slice(m.index+m[0].length,questions[i+1]?.index??text.length).trim()}));
  assert.ok(faq.every(item=>item.answerMarkdown));
  const ctaLine=body.match(/^\*\*CTA:\*\*\s*(.+)$/m);assert.ok(ctaLine);
  const labels=[...ctaLine[1].matchAll(/`([^`]+)`/g)].map(m=>m[1]);assert.ok(labels.length===1||labels.length===2);
  const cta=labels.map((label,i)=>({role:i===0?'primary':'secondary',label,actionIntent:'message_manager'}));
  const tables=[...body.matchAll(/(?:^\|[^\n]*\n){2,}/gm)].map(m=>({markdown:m[0],rows:m[0].trimEnd().split('\n').length}));
  const links=[...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m=>({label:m[1],sourceHref:m[2]}));
  return {directAnswer,faq,faqHeading:faqPart.heading,faqSectionIndex,cta,tables,
    inlineLinkTargets:links.filter(l=>l.sourceHref.startsWith('/')),externalSources:links.filter(l=>/^https?:\/\//.test(l.sourceHref))};
}

// Reviewed source-order identities, NOT amount-based operation inference.
// The same 12m occurs for extension and initial standard; the same 17m occurs
// for VOA and D12. The unlabelled FAQ's 17m represents both operations.
const bodyIdentities={
  '01_e33g_extension':['e33g_extension','e33g_extension','e33g_standard','e33g_express','e33g_extension','e33g_express'],
  '02_e33g_next_term':['e33g_extension','e33g_standard','e33g_express','e33g_extension','e33g_standard','e33g_express','e33g_extension','e33g_standard','e33g_express'],
  '03_e33g_status_change':['conversion_from_voa','conversion_from_c1','conversion_from_d12','conversion_from_kitas','conversion_from_d12','conversion_from_kitas',['conversion_from_voa','conversion_from_d12'],'conversion_from_kitas'],
  '04_e33g_document_audit':['employment_review','employment_review','e33g_standard','e33g_express','e33g_standard','e33g_express','employment_review','employment_review','e33g_standard','e33g_express'],
};
const prices=new Set(Object.values(e33gNextPriceOperations).map(op=>op.sourceSnapshotIdr));
/** Recognize full grouped IDR, localized million shorthand, coordinated
 * implicit currency (12 / 14m), and credit amounts with omitted IDR. */
export function e33gNextMoneySpans(field) {
  const found=[];
  const full=/(?<![0-9A-Za-z])(?:IDR\s*)?\d{1,3}(?:[ ,\.\u00a0]\d{3}){2,3}(?:\s*IDR)?/gu;
  const short=/(?<![0-9A-Za-z])(?:2|12|14|15|17(?:[,.]5)?)\s*(?:млн|millions?|Mio\.?|millones|मिलियन|مليون)(?:\s*IDR)?/gu;
  for(const m of field.matchAll(full)){const amount=Number(m[0].replace(/\D/g,''));if(prices.has(amount))found.push({start:m.index,end:m.index+m[0].length,amount});}
  for(const m of field.matchAll(short)){const amount=Number(m[0].match(/\d+(?:[,.]\d+)?/)[0].replace(',','.'))*1e6;if(prices.has(amount))found.push({start:m.index,end:m.index+m[0].length,amount});}
  found.sort((a,b)=>a.start-b.start);
  const bare=/(?<![\p{L}\p{N}])(?:2|12|14|15|17(?:[,.]5)?)(?![\p{N}])/gu;
  for(const m of field.matchAll(bare)) {
    if(found.some(s=>m.index>=s.start&&m.index<s.end))continue;
    const next=found.find(s=>s.start>=m.index+m[0].length);
    if(!next)continue;
    const join=field.slice(m.index+m[0].length,next.start).replaceAll('*','').trim();
    if(!/^(?:\/|／|or|ou|o|et|y|bzw\.|oder|или|и|أو|و)$/.test(join))continue;
    const amount=Number(m[0].replace(',','.'))*1e6;if(prices.has(amount))found.push({start:m.index,end:m.index+m[0].length,amount});
  }
  found.sort((a,b)=>a.start-b.start);for(let i=1;i<found.length;i++)assert.ok(found[i-1].end<=found[i].start,'Overlapping money recognition');
  return found;
}
export function e33gNextPriceOccurrences(meta) {
  const body=meta.bodyMarkdown,money=e33gNextMoneySpans(body),identities=bodyIdentities[meta.pageKey];assert.ok(identities);
  assert.equal(money.length,identities.length,'Complete source monetary sequence: '+meta.pageKey+'/'+meta.locale);
  const bodyPins=money.map((m,i)=>{const ids=Array.isArray(identities[i])?identities[i]:[identities[i]];
    for(const id of ids)assert.equal(m.amount,e33gNextPriceOperations[id].sourceSnapshotIdr,'Source price identity sequence drift');
    return {...m,operationId:ids[0],...(ids.length>1?{operationIds:ids}:{})};});
  const output=[];
  const add=(fieldProperty,field,pins)=>{for(const pin of pins)output.push({pageKey:meta.pageKey,contentId:meta.resolvedContentId,locale:meta.locale,
    operationId:pin.operationId,...(pin.operationIds?{operationIds:pin.operationIds}:{}),fieldProperty,fieldSha256:sha(field),fieldSpan:span(field,pin.start,pin.end),
    usdWrapper:null,bodySha256:meta.bodySha256,sourceRevision:meta.sourceRevision});};
  add('bodyMarkdown',body,bodyPins);
  const mirror=(property,field,from)=>{const start=body.indexOf(field,from);assert.ok(start>=from,'Derived field not in supplied body: '+property);
    const pins=bodyPins.filter(p=>p.start>=start&&p.end<=start+field.length).map(p=>({...p,start:p.start-start,end:p.end-start}));
    assert.equal(pins.length,e33gNextMoneySpans(field).length,'Derived monetary mirror mismatch');add(property,field,pins);return start+field.length;};
  const sections=sectionRanges(body);mirror('directAnswer',meta.directAnswer,sections[0].start);
  let faqFrom=sections[meta.faqSectionIndex].start;
  for(const [i,item] of meta.faq.entries()){faqFrom=mirror('faq['+i+'].question',item.question,faqFrom);faqFrom=mirror('faq['+i+'].answerMarkdown',item.answerMarkdown,faqFrom);}
  let tableFrom=0;for(const [i,table] of meta.tables.entries())tableFrom=mirror('tables['+i+'].markdown',table.markdown,tableFrom);
  const seoId=meta.pageKey==='01_e33g_extension'?'e33g_extension':meta.pageKey==='03_e33g_status_change'?'conversion_from_c1':meta.pageKey==='04_e33g_document_audit'?'employment_review':null;
  for(const [property,field] of [['seo.title',meta.seo.title],['seo.description',meta.seo.description],['seoTitle',meta.seoTitle],['metaDescription',meta.metaDescription]]) {
    const spans=e33gNextMoneySpans(field);assert.ok(spans.length<=1);for(const m of spans){assert.ok(seoId);assert.equal(m.amount,e33gNextPriceOperations[seoId].sourceSnapshotIdr);}
    add(property,field,spans.map(m=>({...m,operationId:seoId})));
  }
  return output;
}

export function planE33GNextImport({readBundle,registry:inputRegistry,approvals:inputApprovals}) {
  const read=file=>Buffer.from(readBundle(file)),writes=new Map();
  for(const [file,pin] of Object.entries(e33gNextEvidenceHashes))assert.equal(sha(read(file)),pin,'Supplied evidence drift: '+file);
  const manifest=JSON.parse(read('CONTENT_MANIFEST.json')),supplied=JSON.parse(read('CONTENT_LOCALIZED_IMPORT.json'));
  const machine=JSON.parse(read('QA/MACHINE_QA.json')),report=JSON.parse(read('QA/VALIDATION_REPORT.json'));
  assert.equal(manifest.date,'2026-10-09');assert.equal(manifest.translation_status,'MODEL_REVIEWED_PENDING_RENDER_QA');
  assert.deepEqual(manifest.pages.map(p=>p.pageKey),Object.keys(e33gNextPages));assert.equal(supplied.length,40);
  assert.equal(new Set(supplied.map(r=>r.contentId+'/'+r.locale)).size,40);assert.deepEqual(machine.errors,[]);assert.deepEqual(report.errors,[]);assert.equal(report.pass,true);
  assert.deepEqual(Object.keys(manifest.locale_route_prefix).sort(),inputRegistry.locales.map(l=>l.code).sort());
  assert.equal(inputRegistry.records.length,152,'No new Registry records in this package');
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),sources=new Map(),reconciliation=[];
  for(const page of manifest.pages) {
    const spec=e33gNextPages[page.pageKey],record=registry.records.find(r=>r.contentId===spec.contentId);assert.ok(record);
    assert.equal(record.serviceId,existingBusinessBindings[spec.contentId].serviceId,'Preserve existing Service identity');
    assert.deepEqual(record.pricingRef,existingBusinessBindings[spec.contentId].pricingRef,'Preserve existing business operation identities');
    assert.equal(record.published,null,'Do not replace published content');assert.equal(page.contentId,spec.suppliedContentId);
    assert.equal(page.routeHint.split('`')[0],spec.route);assert.equal(page.translationCount,9);assert.equal(page.totalLocales,10);
    for(const other of registry.records.filter(r=>r.contentId!==record.contentId)) {
      assert.notEqual(other.candidate.route,spec.route,'Occupied candidate route');
      for(const route of Object.values(other.published?.routes??{}))assert.ok(!route.endsWith(spec.route),'Occupied published route');
    }
    let ruEnvelope=null;
    for(const language of registry.locales) {
      const locale=language.code,row=supplied.find(r=>r.contentId===spec.suppliedContentId&&r.locale===locale);assert.ok(row);
      const reportPage=report.pages[page.pageKey],sourcePin=locale==='ru'?reportPage.ru:reportPage.translations[manifest.locale_route_prefix[locale]];
      const source=read(sourcePin.path);assert.equal(sha(source),sourcePin.sha256);assert.equal(row.revisionSHA256,sourcePin.sha256);
      assert.equal(row.sourceRevisionSHA256,page.sourceSHA256);assert.equal(row.direction,language.dir);assert.equal(row.faqEmbeddedInBody,true);
      assert.equal(row.editorialStatus,locale==='ru'?'RU_APPROVED':'MODEL_REVIEWED_PENDING_RENDER_QA');
      assert.equal(row.pricingSource,'existing-catalog-and-business-admin');assert.equal(row.pricingRef,'RESOLVE_EXISTING_DO_NOT_INVENT');
      assert.equal(row.publicationState,'PREVIEW_PENDING_CODEX_RELEASE');assert.equal(row.sourceEditorialCheckDate,'2026-10-09');
      assert.equal(row.bodySHA256,sha(row.bodyMarkdown));assert.equal(publicE33GNextBody(source.toString()),row.bodyMarkdown);
      assert.equal(row.bodyMarkdown.match(/^# (.+)$/m)[1],row.title);
      for(const key of ['seoTitle','metaDescription','primaryIntent','ctaLabelField'])assert.ok(typeof row[key]==='string'&&row[key].trim());
      const structure=readE33GNextStructure(row.bodyMarkdown,spec);assert.equal(structure.faq.length,reportPage.ru.metrics.faq_count);
      const base=baseName(spec.contentId,locale),bodyBytes=Buffer.from(row.bodyMarkdown),sourceJsonBytes=jsonBytes(row);
      const ruRow=supplied.find(r=>r.contentId===spec.suppliedContentId&&r.locale==='ru'),revision='sha256:'+ruRow.bodySHA256;
      const meta={...row,fullPayloadKind:E33G_NEXT_KIND,pageKey:page.pageKey,resolvedContentId:spec.contentId,resolvedCanonicalPath:spec.route,
        h1:row.title,seo:{title:row.seoTitle,description:row.metaDescription},...structure,factBlock:{heading:'',items:[]},factBlockMarkdown:'',
        bodySha256:row.bodySHA256,bodyRevision:'sha256:'+row.bodySHA256,sourceRevision:revision,approvedSourceRevision:'sha256:'+page.sourceSHA256,
        bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,sourceFile:base+'.source.json',sourceFileSha256:sha(sourceJsonBytes),
        sourceMarkdownFile:base+'.source.md',sourceMarkdownSha256:sourcePin.sha256,originalBundleFile:sourcePin.path,
        sourceJsonSerialization:'Derived exact logical record; immutable whole supplied JSON wire is archived and SHA-pinned separately',
        sourceJsonPackSha256:e33gNextEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json'],
        approval:{status:locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA',nativeSpeakerReview:false,browserReview:false,legalVerification:false},
        sourceLimitations:['Founder delegated RU/editorial and translation authorization is not line-by-line/native/legal/browser certification',
          'Extension/category-change availability is case-specific and checked against the current official procedure; tariff is not a route guarantee',
          'Commercial amounts are bound exclusively to the existing editable catalog/FX projection at runtime']};
      if(locale==='ru')ruEnvelope=metadataEnvelope(bodyBytes,meta);assert.ok(ruEnvelope,'RU must precede translations');meta.sourceEnvelopeSha256=ruEnvelope;
      meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta}));
      sources.set(page.pageKey+'/'+locale,{meta,bodyBytes,source,sourceJsonBytes});
    }
    const ru=sources.get(page.pageKey+'/ru').meta;
    if(record.candidate.ru.status==='owner_approved_semantics') {assert.equal(record.candidate.revision,ru.sourceRevision,'Do not overwrite another approved revision');assert.equal(record.candidate.route,spec.route);}
    else {assert.equal(record.candidate.ru.status,'draft');assert.equal(record.candidate.revision,'sha256:'+spec.oldSha);assert.equal(record.candidate.route,spec.oldRoute);}
    reconciliation.push({contentId:spec.contentId,suppliedContentId:spec.suppliedContentId,previousDraftRoute:spec.oldRoute,
      resolvedCanonicalRoute:spec.route,previousDraftRevision:'sha256:'+spec.oldSha,approvedSourceRevision:ru.approvedSourceRevision,
      publicBodyRevision:ru.sourceRevision,publishedConflict:false,redirectCreated:false,status:'EXISTING_UNPUBLISHED_DRAFT_REPLACED_WITH_APPROVED_FULL_JSON'});
    record.title=ru.h1;record.candidate={route:spec.route,exposure:'preview_only',revision:ru.sourceRevision,ru:{},translations:{}};
    if(!approvals.entries.some(a=>a.contentId===spec.contentId&&a.revision===ru.sourceRevision))approvals.entries.push({contentId:spec.contentId,revision:ru.sourceRevision,
      public_content_sha256:ru.bodySha256,authority:'Founder',status:'OWNER_APPROVED_RU',scope:'Exact supplied editorial content and authorized translations; actual runtime/release gates remain separate',
      evidence:'Founder delegated RU approval and all10 locale implementation in supplied package 2026-10-09; not a personal line-by-line reading claim',
      approvedSourceSha256:page.sourceSHA256,sourceManifestSha256:e33gNextEvidenceHashes['CONTENT_MANIFEST.json'],sourceJsonPackSha256:e33gNextEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']});
  }
  const qa={schemaVersion:1,batchId:E33G_NEXT_BATCH,status:'MODEL_REVIEWED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const occurrences={schemaVersion:1,kind:'E33G_NEXT_EXACT_PRICE_OCCURRENCE_MAP',batchId:E33G_NEXT_BATCH,
    sourceManifestSha256:e33gNextEvidenceHashes['CONTENT_MANIFEST.json'],sourceJsonPackSha256:e33gNextEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json'],operations:e33gNextPriceOperations,
    runtimeAuthority:'Existing catalog/FX only. Snapshot amounts identify exact source literals and never supply rendered fallback prices',
    excluded:'60,000 USD annual income, 2,000 USD funds and 3/12-month statements are statutory/agency eligibility values, not commercial prices',occurrences:[]};
  const build={schemaVersion:1,version:E33G_NEXT_BATCH,stage:'IMPORTED_PENDING_RENDER_QA',fullPayloadKind:E33G_NEXT_KIND,
    authority:{publisher:'Founder',decisionDate:'2026-10-09',scope:'Delegated exact RU and all10 locale implementation; actual readiness tracked separately'},
    sourceManifest:{file:sourcePack+'CONTENT_MANIFEST.json',sha256:e33gNextEvidenceHashes['CONTENT_MANIFEST.json']},sourceManifestSha256:e33gNextEvidenceHashes['CONTENT_MANIFEST.json'],
    sourceJsonPack:{file:sourcePack+'CONTENT_LOCALIZED_IMPORT.json',sha256:e33gNextEvidenceHashes['CONTENT_LOCALIZED_IMPORT.json']},
    publicationGates:Object.fromEntries(E33G_NEXT_GATES.map(key=>[key,false])),records:[]};
  const routes=new Map(registry.records.map(r=>[r.candidate.route,r.contentId]));
  for(const page of manifest.pages) {
    const spec=e33gNextPages[page.pageKey],record=registry.records.find(r=>r.contentId===spec.contentId);
    const entry={contentId:spec.contentId,pageKey:page.pageKey,sourceRevision:record.candidate.revision,
      approvedSourceRevision:'sha256:'+page.sourceSHA256,canonicalPath:spec.route,serviceId:record.serviceId,pricingRef:record.pricingRef,
      publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'PENDING_ACTUAL_RENDER_QA'},locales:{}};
    for(const language of registry.locales) {
      const locale=language.code,{meta,bodyBytes,source,sourceJsonBytes}=sources.get(page.pageKey+'/'+locale),base=baseName(spec.contentId,locale);
      const metadataBytes=jsonBytes(meta),common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',metadataSha256:sha(metadataBytes),sourceEnvelopeSha256:meta.sourceEnvelopeSha256};
      writes.set(base+'.md',bodyBytes);writes.set(base+'.source.md',source);writes.set(base+'.source.json',sourceJsonBytes);writes.set(base+'.meta.json',metadataBytes);
      if(locale==='ru')record.candidate.ru={status:'owner_approved_semantics',...common,approvalEvidence:'Exact Founder-delegated supplied RU 2026-10-09; not independent legal/native/browser certification',approvalRevision:record.candidate.revision};
      else record.candidate.translations[locale]={sourceRevision:record.candidate.revision,status:'translated',complete:true,qa:'passed',...common,qaMethod:'supplied_model_semantic',
        qaEvidence:'Supplied model/static translation checks; exact source JSON/MD pins; actual site QA pending',qaFile,qaPage:page.pageKey.replaceAll('_','-')+'.md'};
      qa.records.push({contentId:spec.contentId,page:page.pageKey.replaceAll('_','-')+'.md',locale,bodySha256:'sha256:'+meta.bodySha256,sourceRevision:meta.sourceRevision,sourceEnvelopeSha256:meta.sourceEnvelopeSha256,
        status:meta.approval.status,sourceOriginReconciled:true,sourceFileSha256:meta.sourceFileSha256,sourceMarkdownSha256:meta.sourceMarkdownSha256,approvedSourceRevision:meta.approvedSourceRevision,nativeReview:false,browserReview:false,legalVerification:false});
      entry.locales[locale]={route:language.prefix+spec.route,direction:language.dir,...common,sourceFile:meta.sourceFile,sourceFileSha256:meta.sourceFileSha256,
        sourceMarkdownFile:meta.sourceMarkdownFile,sourceMarkdownSha256:meta.sourceMarkdownSha256,payloadRevision:meta.payloadRevision};
      occurrences.occurrences.push(...e33gNextPriceOccurrences(meta));
    }
    const ru=sources.get(page.pageKey+'/ru').meta;
    record.inlineLinkTargets=[...new Set(ru.inlineLinkTargets.map(l=>l.sourceHref))].map(sourceRoute=>({sourceRoute,contentId:routes.get(sourceRoute)??null,status:routes.has(sourceRoute)?'resolved_content_id':'planned_unmapped'}));
    record.relatedContentIds=[...new Set(record.inlineLinkTargets.map(l=>l.contentId).filter(id=>id&&id!==record.contentId))];
    build.records.push(entry);
  }
  for(const file of Object.keys(e33gNextEvidenceHashes))writes.set(sourcePack+file,read(file));
  const occurrenceBytes=jsonBytes(occurrences);writes.set(occurrenceFile,occurrenceBytes);build.priceOccurrences={file:occurrenceFile,sha256:sha(occurrenceBytes)};
  writes.set(qaFile,jsonBytes(qa));writes.set('registry-copy/e33g_next_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:E33G_NEXT_BATCH,records:reconciliation}));
  writes.set('registry-e33g-next-build.v1.json',jsonBytes(build));writes.set('service-registry.v1.json',jsonBytes(registry));writes.set('registry-approvals.v1.json',jsonBytes(approvals));
  assert.equal(registry.records.length,inputRegistry.records.length);
  const owned=new Set(Object.values(e33gNextPages).map(p=>p.contentId));
  for(const before of inputRegistry.records)if(!owned.has(before.contentId))assert.deepEqual(registry.records.find(r=>r.contentId===before.contentId),before,'Unrelated Registry record changed');
  for(const before of inputApprovals.entries)assert.ok(approvals.entries.some(a=>canonicalJson(a)===canonicalJson(before)),'Existing approval lost');
  return {writes,registry,approvals,build,summary:{records:4,localizedPayloads:40,registryRecords:registry.records.length,writes:writes.size,
    faq: [...sources.values()].reduce((n,s)=>n+s.meta.faq.length,0),tables:[...sources.values()].reduce((n,s)=>n+s.meta.tables.length,0),priceOccurrences:occurrences.occurrences.length,
    newRegistryRecords:0,redirects:0,sourceManifestSha256:build.sourceManifestSha256,sourceJsonPackSha256:build.sourceJsonPack.sha256,pendingGates:E33G_NEXT_GATES}};
}
export function applyE33GNextPlan(plan,contentRoot,{expectedRegistrySha256,expectedApprovalsSha256}={}) {
  for(const [file,bytes] of plan.writes) {
    const target=resolve(contentRoot,file);assert.ok(relative(contentRoot,target)&&!relative(contentRoot,target).startsWith('..'));
    if(!existsSync(target))continue;
    const expected=file==='service-registry.v1.json'?expectedRegistrySha256:file==='registry-approvals.v1.json'?expectedApprovalsSha256:sha(bytes);
    assert.equal(sha(readFileSync(target)),expected,'Refuse unrelated/concurrent overwrite: '+file);
  }
  for(const [file,bytes] of plan.writes){const target=resolve(contentRoot,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2],'Supply exact bundle directory');const bundle=resolve(process.argv[2]),contentRoot=fileURLToPath(new URL('../content/',import.meta.url));
  const registryBytes=readFileSync(resolve(contentRoot,'service-registry.v1.json')),approvalBytes=readFileSync(resolve(contentRoot,'registry-approvals.v1.json'));
  const plan=planE33GNextImport({readBundle:file=>{const path=resolve(bundle,file);assert.ok(relative(bundle,path)&&!relative(bundle,path).startsWith('..'));return readFileSync(path);},registry:JSON.parse(registryBytes),approvals:JSON.parse(approvalBytes)});
  if(process.argv.includes('--apply'))applyE33GNextPlan(plan,contentRoot,{expectedRegistrySha256:sha(registryBytes),expectedApprovalsSha256:sha(approvalBytes)});
  console.log(JSON.stringify(plan.summary));
}
