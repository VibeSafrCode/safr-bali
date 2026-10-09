// Deterministic Founder-supplied editorial import. No translation, FX, network,
// publication, review claims or production mutations. Original MD stays exact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalJson,metadataEnvelope} from './import-sync-bundle.mjs';

export const D12_E28A_BATCH='D12_E28A_2026-10-09_v1';
export const D12_E28A_KIND='D12_E28A_FULL_MD_V1';
export const D12_E28A_GATES=['render','responsive','accessibility','crossSurfacePriceParity','sourceUncertaintyReview'];
export const d12E28APages=Object.freeze({
  d12_extension:{contentId:'d12_extension',route:'/bali/visas/d12/extension/',kind:'extension',parentId:'d12'},
  d12_documents:{contentId:'knowledge_d12_documents',route:'/bali/knowledge/d12/documents/',kind:'knowledge',parentId:null},
  d12_180_days:{contentId:'knowledge_d12_180',route:'/bali/knowledge/d12/180-days/',kind:'knowledge',parentId:null},
  e28a_requirements:{contentId:'knowledge_e28a_requirements',route:'/bali/knowledge/investor-kitas/e28a-requirements/',kind:'knowledge',parentId:null},
  e28a_extension:{contentId:'knowledge_e28a_extension',route:'/bali/knowledge/investor-kitas/extension/',kind:'knowledge',parentId:null},
  d12_main:{contentId:'d12',route:'/bali/visas/d12/',kind:'visa',parentId:'visas_bali'},
  e28a_main:{contentId:'investor',route:'/bali/visas/investor-kitas/',kind:'visa',parentId:'visas_bali'},
});
export const d12E28AEvidenceHashes=Object.freeze({
  'ALL_LOCALES_CONTENT_SEO_MANIFEST.json':'591c8ce207d01efd71a4f2ba090db94b86ccc261dece3c6166ca2f088d388287',
  'RU_APPROVAL_MANIFEST.json':'53f6694453d080ffc409d3ff132a96ab8a39e7cb5fa935885d77ada75cd3f13c',
  'PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md':'6caaa3fd1367a6af931f8da157c8747cf844473775623db329a61930666b79db',
  'QA_ALL_LOCALES.json':'8ca34db4b57ffeba39727b6c6c4524397702de29375aa525f4fe74e24f39f84d',
  'PROVENANCE/BATCH1_CONTENT_SEO_MANIFEST.json':'dc88f09e83e59e4744670414510fda555543159d3dbf1259bdb34d7695f011d4',
  'PROVENANCE/BATCH2_CONTENT_SEO_MANIFEST.json':'d9e4f9e36290ecf5502775ed2a4410e7db07c02d7b278f4499e04c80f8a765d5',
});
const sourcePack='registry-copy/d12e28a_source_pack/';
const qaFile='registry-copy/d12e28a_qa_import.json';
const occurrenceFile='registry-copy/d12e28a_price_occurrences.json';
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const d12E28ASha=value=>createHash('sha256').update(value).digest('hex');
const sha=d12E28ASha;
const baseName=(id,locale)=>'registry-copy/'+id+'_'+locale.toLowerCase().replaceAll('-','_')+'_d12e28a_20261009';
const sections=body=>{const starts=[...body.matchAll(/^## (.+)$/gm)];return starts.map((m,i)=>({heading:m[1],
  text:body.slice(m.index+m[0].length,starts[i+1]?.index??body.length).trim()}));};

/** Remove only the explicitly supplied editorial preamble. No body sections,
 * sources, CTA, tables or FAQ are filtered. Archive keeps every original byte. */
export function publicD12E28ABody(source) {
  assert.equal(typeof source,'string');assert.ok(!source.includes('\r'),'Source must use supplied LF');
  const h1=source.match(/^# (.+)\n/);assert.ok(h1,'Exactly one leading H1 is required');
  assert.equal((source.match(/^# /gm)??[]).length,1);
  const firstSection=source.indexOf('\n## ');assert.ok(firstSection>0);
  const prefix=source.slice(h1[0].length,firstSection+1);
  if(!/^\*\*Status:\*\*/m.test(prefix))return {body:source,archivalMetadata:'',fields:{}};
  const allowed=new Set(['Status','Content ID (proposed)','URL candidate','Type','Source revision','Editorial verification','SEO Title','Meta Description']);
  const fields={};
  for(const line of prefix.split('\n')) {
    if(!line.trim())continue;
    const match=line.match(/^\*\*([^*]+):\*\*\s*(.+?)\s*$/);
    assert.ok(match&&allowed.has(match[1]),'Refuse to remove customer text from editorial prefix');
    assert.ok(!Object.hasOwn(fields,match[1]),'Duplicate editorial field');fields[match[1]]=match[2];
  }
  assert.deepEqual(Object.keys(fields).sort(),[...allowed].sort(),'Incomplete supplied metadata prefix');
  return {body:h1[0]+'\n'+source.slice(firstSection+1),archivalMetadata:prefix,fields};
}

export function readD12E28AStructure(body,{faqSectionIndex}) {
  const parts=sections(body),faqPart=parts[faqSectionIndex];assert.ok(faqPart);
  const questions=[...faqPart.text.matchAll(/^### (.+)$/gm)];assert.ok(questions.length>0);
  const faq=questions.map((m,i)=>({question:m[1],answerMarkdown:faqPart.text.slice(m.index+m[0].length,
    questions[i+1]?.index??faqPart.text.length).trim()}));
  assert.ok(faq.every(item=>item.answerMarkdown));
  const links=[...body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m=>({label:m[1],sourceHref:m[2]}));
  const cta=[...body.matchAll(/^\*\*(Primary CTA|Secondary CTA|Основной CTA|Вторичный CTA):\*\*\s*(.+?)\s*$/gm)]
    .map(m=>({role:/Primary|Основной/.test(m[1])?'primary':'secondary',label:m[2],actionIntent:'message_manager'}));
  const tables=[...body.matchAll(/(?:^\|[^\n]*\n){2,}/gm)].map(m=>({markdown:m[0],rows:m[0].trimEnd().split('\n').length}));
  return {faq,faqHeading:faqPart.heading,faqSectionIndex,cta,tables,
    inlineLinkTargets:links.filter(l=>l.sourceHref.startsWith('/')),externalSources:links.filter(l=>/^https?:\/\//.test(l.sourceHref))};
}

export const d12E28APriceOperations=Object.freeze({
  'd12-one-year-standard':{entity_type:'VISA',entity_key:'D12',option_code:'one-year-standard',sourceSnapshotIdr:7500000},
  'd12-one-year-express':{entity_type:'VISA',entity_key:'D12',option_code:'one-year-express',sourceSnapshotIdr:9500000},
  'd12-two-year-standard':{entity_type:'VISA',entity_key:'D12',option_code:'two-year-standard',sourceSnapshotIdr:10500000},
  'd12-two-year-express':{entity_type:'VISA',entity_key:'D12',option_code:'two-year-express',sourceSnapshotIdr:13000000},
  d12_extension:{entity_type:'SERVICE',entity_key:'visa-extension',option_code:'d12-extension',sourceSnapshotIdr:7000000},
  'e28a-two-year-standard':{entity_type:'VISA',entity_key:'E28A',option_code:'two-year-standard',sourceSnapshotIdr:16000000},
  conversion_from_d12:{entity_type:'VISA',entity_key:'E33G',option_code:'conversion-from-d12',sourceSnapshotIdr:17000000},
});
const operationsByAmount=new Map(Object.entries(d12E28APriceOperations).map(([id,spec])=>[spec.sourceSnapshotIdr,id]));
const amountPattern=/(?<![\d.,])(?:IDR\s*)?(?:\d{1,3}(?:[ ,.\u00a0]\d{3}){1,4}|\d{7,12})(?:\s*IDR)?(?![\dA-Za-z])/g;
const shorthandPattern=/(?:IDR\s+7\s+million|7\s+(?:млн|million|Mio\.?)\s*IDR)/gi;
const span=(field,start,end)=>({utf16Start:start,utf16End:end,utf8ByteStart:Buffer.byteLength(field.slice(0,start)),
  utf8ByteEnd:Buffer.byteLength(field.slice(0,end)),literal:field.slice(start,end)});
export function d12E28APriceOccurrences(meta) {
  const fields=[['bodyMarkdown',meta.bodyMarkdown],['seo.title',meta.seo.title],['seo.description',meta.seo.description],
    ['directAnswer',meta.directAnswer],...meta.faq.flatMap((item,i)=>[['faq['+i+'].question',item.question],['faq['+i+'].answerMarkdown',item.answerMarkdown]])];
  const occurrences=[];
  for(const [fieldProperty,field] of fields) {
    const candidates=[...field.matchAll(amountPattern)].filter(m=>/IDR/i.test(m[0])).map(m=>({match:m,amount:Number(m[0].replace(/\D/g,''))}));
    candidates.push(...[...field.matchAll(shorthandPattern)].map(match=>({match,amount:7000000})));
    for(const {match:m,amount} of candidates.sort((a,b)=>a.match.index-b.match.index)) {
      const operationId=operationsByAmount.get(amount);if(!operationId)continue; // statutory shares/balances are not service prices
      assert.ok(!operationId.startsWith('d12')||meta.pageKey.startsWith('d12'),'D12 occurrence in wrong page');
      const end=m.index+m[0].length;
      const usd=field.slice(end).match(/^[ \t]*[(（][^()（）\n]*(\{\{USD[_A-Z0-9]*\}\})[^()（）\n]*[)）]/);
      const usdSpan=usd?span(field,end,end+usd[0].length):null;
      occurrences.push({pageKey:meta.pageKey,contentId:meta.resolvedContentId,locale:meta.locale,operationId,
        fieldProperty,fieldSha256:sha(field),fieldSpan:span(field,m.index,end),usdWrapper:usdSpan,
        bodySha256:meta.bodySha256,sourceRevision:meta.sourceRevision});
    }
  }
  return occurrences;
}

function newRecord(spec,h1) {return {contentId:spec.contentId,kind:spec.kind,title:h1,parentId:spec.parentId,relatedContentIds:[],
  serviceId:null,pricingRef:null,bindingStatus:'not_applicable',availability:'not_verified',bindingEvidence:[],published:null,
  candidate:{route:spec.route,exposure:'preview_only',revision:'pending',ru:{},translations:{}},reuseRoutes:[],mergeTargetId:null,
  duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]};}

export function planD12E28AImport({readBundle,registry:inputRegistry,approvals:inputApprovals}) {
  const read=file=>Buffer.from(readBundle(file)),writes=new Map();
  for(const [file,expected] of Object.entries(d12E28AEvidenceHashes))assert.equal(sha(read(file)),expected,'Supplied evidence drift: '+file);
  const supplied=JSON.parse(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json')),approval=JSON.parse(read('RU_APPROVAL_MANIFEST.json'));
  const suppliedQa=JSON.parse(read('QA_ALL_LOCALES.json'));
  assert.equal(supplied.pack,'SAFRWAY_D12_E28A_ALL_LOCALES_2026-10-09');assert.equal(supplied.created_utc_date,'2026-10-09');
  assert.deepEqual(supplied.pages.map(p=>p.key),Object.keys(d12E28APages));assert.equal(supplied.pages.length,7);
  assert.deepEqual(Object.keys(supplied.languages).sort(),inputRegistry.locales.map(l=>l.code).sort());
  assert.equal(approval.status,'RU_APPROVED');assert.equal(approval.date_approved,'2026-10-09');assert.equal(approval.files.length,7);
  assert.deepEqual(suppliedQa.issues,[]);assert.equal(suppliedQa.entries.length,63);
  for(const filename of ['PROVENANCE/BATCH1_CONTENT_SEO_MANIFEST.json','PROVENANCE/BATCH2_CONTENT_SEO_MANIFEST.json']) {
    for(const prior of JSON.parse(read(filename)).entries)for(const [oldLocale,pin] of Object.entries(prior.locales)) {
      const locale=oldLocale==='zh-cn'?'zh-Hans':oldLocale;
      assert.equal(supplied.pages.find(p=>p.key===prior.content_key).locales[locale].sha256,pin.sha256,'Prior translation revision drift');
    }
  }
  const registry=structuredClone(inputRegistry),approvals=structuredClone(inputApprovals),sources=new Map(),reconciliation=[];
  const expectedNewIds=['d12_extension','knowledge_e28a_requirements','knowledge_e28a_extension'];
  for(const page of supplied.pages) {
    const spec=d12E28APages[page.key],approved=approval.files.find(a=>a.key===page.key);assert.ok(approved);
    assert.equal(page.route_candidate,spec.route);assert.equal(approved.route_candidate,spec.route);
    assert.equal(page.source_ru_revision,approved.approved_sha256);
    const ruOriginal=read(page.locales.ru.file);assert.equal(sha(ruOriginal),approved.approved_sha256);
    assert.equal(page.locales.ru.file,'RU/'+approved.approved_filename);
    const ruPublic=publicD12E28ABody(ruOriginal.toString()),faqSectionIndex=sections(ruPublic.body).findIndex(s=>s.heading==='Частые вопросы');
    assert.ok(faqSectionIndex>=0);
    for(const locale of registry.locales.map(l=>l.code)) {
      const pin=page.locales[locale],language=registry.locales.find(l=>l.code===locale);assert.ok(pin);
      const source=read(pin.file);assert.equal(sha(source),pin.sha256,'Exact supplied Markdown: '+pin.file);
      assert.equal(pin.url_candidate,language.prefix+spec.route);assert.equal(pin.direction,language.dir);
      assert.equal(pin.status,locale==='ru'?'RU_APPROVED':'MODEL_TRANSLATED_PENDING_SITE_QA');
      for(const field of ['title','description','h1'])assert.ok(typeof pin[field]==='string'&&pin[field].trim());
      const extracted=publicD12E28ABody(source.toString());assert.equal(extracted.body.match(/^# (.+)$/m)[1],pin.h1);
      const structure=readD12E28AStructure(extracted.body,{faqSectionIndex});
      assert.equal(structure.faq.length,readD12E28AStructure(ruPublic.body,{faqSectionIndex}).faq.length);
      if(locale!=='ru') {
        const qa=suppliedQa.entries.find(q=>q.key===page.key&&q.locale===locale);assert.ok(qa);
        assert.equal(qa.sha256,pin.sha256);assert.equal(qa.faq,structure.faq.length);
        assert.equal(qa.internal_links,structure.inlineLinkTargets.length);assert.equal(qa.external_links,structure.externalSources.length);
        assert.equal(qa.table_lines,structure.tables.reduce((n,t)=>n+t.rows,0));
      }
      sources.set(page.key+'/'+locale,{pin,source,...extracted,...structure});
    }
    let record=registry.records.find(r=>r.contentId===spec.contentId);
    if(!record){assert.ok(expectedNewIds.includes(spec.contentId));record=newRecord(spec,page.locales.ru.h1);registry.records.push(record);}
    assert.equal(record.candidate.route,spec.route,'Preserve canonical route');
    const revision='sha256:'+sha(ruPublic.body);
    if(record.candidate.ru.status==='owner_approved_semantics')assert.equal(record.candidate.revision,revision,'Refuse conflicting approved candidate');
    const previousRegistryRevision=expectedNewIds.includes(spec.contentId)?'NEW_EDITORIAL_ID':'SYNC-2:'+spec.contentId+':draft1';
    if(record.candidate.revision!==revision&&record.candidate.revision!=='pending')assert.equal(record.candidate.revision,previousRegistryRevision,'Unexpected pre-import source revision');
    reconciliation.push({contentId:spec.contentId,previousRegistryRevision,
      suppliedPredecessorSha256:approved.source_sha256,approvedSourceSha256:approved.approved_sha256,
      publicBodyRevision:revision,status:'FINAL_FOUNDER_APPROVED_SOURCE_IMPORTED',predecessorBytesAvailable:false,
      evidence:'RU_APPROVAL_MANIFEST final SHA + later translation authorization; historical predecessor claim retained, not certified from unavailable bytes'});
    record.title=page.locales.ru.h1;
    record.candidate={route:spec.route,exposure:'preview_only',revision,ru:{},translations:{}};
    if(spec.contentId==='d12_extension'||spec.contentId==='investor') {
      const extension=spec.contentId==='d12_extension',serviceId=extension?'visa-extension':'visa';
      const pricingRef={entityType:extension?'SERVICE':'VISA',entityKey:extension?'visa-extension':'E28A',optionCodes:[extension?'d12-extension':'two-year-standard']};
      assert.ok(record.serviceId===null||record.serviceId===serviceId);assert.ok(record.pricingRef===null||canonicalJson(record.pricingRef)===canonicalJson(pricingRef));
      record.serviceId=serviceId;record.pricingRef=pricingRef;record.bindingStatus='seed_confirmed';
      const evidence='Founder 2026-10-09: approved D12 extension/E28A operation; existing Service slug; catalog/admin integration is a separate actual gate';
      if(!record.bindingEvidence.includes(evidence))record.bindingEvidence.push(evidence);
    }
    if(!approvals.entries.some(a=>a.contentId===spec.contentId&&a.revision===revision))approvals.entries.push({contentId:spec.contentId,
      revision,public_content_sha256:sha(ruPublic.body),authority:'Founder',status:'OWNER_APPROVED_RU',
      scope:'Exact supplied editorial content and authorized translations; actual runtime and release evidence remain separate',
      evidence:'Founder RU approval 2026-10-09 and later translation authorization in three batches',
      approvedSourceSha256:approved.approved_sha256,sourceManifestSha256:sha(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json'))});
  }
  const routes=new Map(registry.records.map(r=>[r.candidate.route,r.contentId]));
  const qa={schemaVersion:1,batchId:D12_E28A_BATCH,status:'MODEL_REVIEWED_PENDING_RENDER_QA',nativeReview:false,browserReview:false,legalVerification:false,records:[]};
  const occurrences={schemaVersion:1,kind:'D12_E28A_EXACT_PRICE_OCCURRENCE_MAP',batchId:D12_E28A_BATCH,
    sourceManifestSha256:sha(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json')),operations:d12E28APriceOperations,
    runtimeAuthority:'Existing editable catalog/FX projection only; sourceSnapshotIdr identifies editorial operations, never rendered fallback prices',
    excluded:'Statutory investment thresholds, disputed bank balances and other non-service amounts are never bound',occurrences:[]};
  const build={schemaVersion:1,version:D12_E28A_BATCH,stage:'IMPORTED_PENDING_RENDER_QA',fullPayloadKind:D12_E28A_KIND,
    authority:{publisher:'Founder',decisionDate:'2026-10-09',scope:'Exact supplied D12/E28A content, translations and indexable release authorized; actual readiness tracked separately'},
    sourceManifest:{file:sourcePack+'ALL_LOCALES_CONTENT_SEO_MANIFEST.json',sha256:sha(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json'))},
    sourceManifestSha256:sha(read('ALL_LOCALES_CONTENT_SEO_MANIFEST.json')),
    approvalEvidence:{file:sourcePack+'RU_APPROVAL_MANIFEST.json',sha256:sha(read('RU_APPROVAL_MANIFEST.json')),
      translationAuthorizationFile:sourcePack+'PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md',translationAuthorizationSha256:sha(read('PROVENANCE/TRANSLATION_AUTHORIZATION_RU.md'))},
    publicationGates:Object.fromEntries(D12_E28A_GATES.map(key=>[key,false])),records:[]};
  for(const page of supplied.pages) {
    const spec=d12E28APages[page.key],record=registry.records.find(r=>r.contentId===spec.contentId),ru=sources.get(page.key+'/ru');
    let ruEnvelope=null;
    const entry={contentId:spec.contentId,pageKey:page.key,sourceRevision:record.candidate.revision,
      approvedSourceRevision:'sha256:'+page.source_ru_revision,canonicalPath:spec.route,serviceId:record.serviceId,pricingRef:record.pricingRef,
      publication:{indexable:false,lastModified:'2026-10-09',gateStatus:'PENDING_ACTUAL_RENDER_QA'},locales:{}};
    for(const locale of registry.locales.map(l=>l.code)) {
      const item=sources.get(page.key+'/'+locale),base=baseName(spec.contentId,locale),bodyBytes=Buffer.from(item.body);
      const intro=item.body.slice(item.body.indexOf('\n')+1,item.body.indexOf('\n## ')).trim();
      const directAnswer=intro||sections(item.body)[0].text;
      const meta={fullPayloadKind:D12_E28A_KIND,pageKey:page.key,resolvedContentId:spec.contentId,resolvedCanonicalPath:spec.route,
        locale,direction:item.pin.direction,h1:item.pin.h1,seo:{title:item.pin.title,description:item.pin.description},
        seoTitle:item.pin.title,metaDescription:item.pin.description,directAnswer,factBlock:{heading:'',items:[]},factBlockMarkdown:'',
        bodyMarkdown:item.body,bodyRevision:'sha256:'+sha(bodyBytes),bodySha256:sha(bodyBytes),sourceRevision:record.candidate.revision,
        approvedSourceRevision:'sha256:'+page.source_ru_revision,sourceFile:base+'.source.md',sourceFileSha256:item.pin.sha256,
        originalBundleFile:item.pin.file,archivalEditorialMetadata:item.archivalMetadata,
        archivalEditorialFields:item.fields,faq:item.faq,faqHeading:item.faqHeading,faqSectionIndex:item.faqSectionIndex,
        cta:item.cta,tables:item.tables,inlineLinkTargets:item.inlineLinkTargets,externalSources:item.externalSources,
        approval:{status:locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA',nativeSpeakerReview:false,browserReview:false,legalVerification:false},
        sourceLimitations:['D12 bank balance and sponsor requirements checked for actual eVisa route; nationality is independent of content language',
          'Supplied translations passed model/static review; actual runtime, Designer and release evidence tracked separately']};
      const envelope=metadataEnvelope(bodyBytes,meta);if(locale==='ru')ruEnvelope=envelope;
      assert.ok(ruEnvelope,'Registry locale order must begin with RU');meta.sourceEnvelopeSha256=ruEnvelope;
      meta.payloadRevision='sha256:'+sha(canonicalJson({bodyMarkdown:meta.bodyMarkdown,seo:meta.seo,h1:meta.h1,faq:meta.faq,cta:meta.cta}));
      const metadataBytes=jsonBytes(meta),common={bodyFile:base+'.md',bodySha256:meta.bodySha256,metadataFile:base+'.meta.json',
        metadataSha256:sha(metadataBytes),sourceEnvelopeSha256:ruEnvelope};
      writes.set(base+'.source.md',item.source);writes.set(base+'.md',bodyBytes);writes.set(base+'.meta.json',metadataBytes);
      if(locale==='ru')record.candidate.ru={status:'owner_approved_semantics',...common,
        approvalEvidence:'Exact Founder-approved supplied RU 2026-10-09; not independent legal/native/browser certification',approvalRevision:record.candidate.revision};
      else record.candidate.translations[locale]={sourceRevision:record.candidate.revision,status:'translated',complete:true,qa:'passed',...common,
        qaMethod:'supplied_model_semantic',qaEvidence:'Supplied model semantic/static QA; later explicit translation authorization; actual site QA pending',
        qaFile,qaPage:page.key.replaceAll('_','-')+'.md'};
      qa.records.push({contentId:spec.contentId,page:page.key.replaceAll('_','-')+'.md',locale,bodySha256:'sha256:'+meta.bodySha256,
        sourceRevision:record.candidate.revision,sourceEnvelopeSha256:ruEnvelope,status:locale==='ru'?'OWNER_APPROVED_RU':'MODEL_REVIEWED_PENDING_RENDER_QA',
        sourceOriginReconciled:true,sourceFileSha256:item.pin.sha256,approvedSourceRevision:meta.approvedSourceRevision,
        nativeReview:false,browserReview:false,legalVerification:false});
      entry.locales[locale]={route:registry.locales.find(l=>l.code===locale).prefix+spec.route,...common,sourceFile:meta.sourceFile,
        sourceFileSha256:meta.sourceFileSha256,payloadRevision:meta.payloadRevision,direction:meta.direction};
      occurrences.occurrences.push(...d12E28APriceOccurrences(meta));
    }
    const internal=ru.inlineLinkTargets.map(l=>l.sourceHref);
    record.inlineLinkTargets=[...new Set(internal)].map(sourceRoute=>({sourceRoute,contentId:routes.get(sourceRoute)??null,
      status:routes.has(sourceRoute)?'resolved_content_id':'planned_unmapped'}));
    record.relatedContentIds=[...new Set(internal.map(route=>routes.get(route)).filter(id=>id&&id!==record.contentId))];
    build.records.push(entry);
  }
  for(const old of inputRegistry.records) {
    const next=registry.records.find(r=>r.contentId===old.contentId);assert.deepEqual(next.published,old.published,'Public route preservation');
    if(!Object.values(d12E28APages).some(p=>p.contentId===old.contentId))assert.deepEqual(next,old,'Unrelated Registry record changed');
    if(!['investor'].includes(old.contentId)){assert.deepEqual(next.pricingRef,old.pricingRef);assert.equal(next.serviceId,old.serviceId);}
  }
  for(const file of Object.keys(d12E28AEvidenceHashes))writes.set(sourcePack+file,read(file));
  const occurrenceBytes=jsonBytes(occurrences);writes.set(occurrenceFile,occurrenceBytes);
  build.priceOccurrences={file:occurrenceFile,sha256:sha(occurrenceBytes)};
  writes.set(qaFile,jsonBytes(qa));writes.set('registry-copy/d12e28a_source_reconciliation.json',jsonBytes({schemaVersion:1,batchId:D12_E28A_BATCH,
    historicalTranslationPermission:'NOT_GRANTED retained in source manifest; superseded by subsequent explicit authorization',records:reconciliation}));
  writes.set('registry-d12-e28a-build.v1.json',jsonBytes(build));
  writes.set('service-registry.v1.json',jsonBytes(registry));writes.set('registry-approvals.v1.json',jsonBytes(approvals));
  return {writes,registry,approvals,build,qa,occurrences,summary:{contentPages:7,locales:10,sourceFiles:70,fullPublicBodies:70,
    translationsAuthored:0,newContentIds:expectedNewIds,records:registry.records.length,priceOccurrences:occurrences.occurrences.length,
    modelQa:'PASSED_SUPPLIED_STATIC_SEMANTIC',runtimeQa:'PENDING',publication:false}};
}

export function applyD12E28APlan(plan,contentRoot,{expectedRegistrySha256,expectedApprovalsSha256}={}) {
  for(const [file,bytes] of plan.writes) {
    const target=resolve(contentRoot,file);assert.ok(relative(contentRoot,target)&&!relative(contentRoot,target).startsWith('..'));
    if(!existsSync(target))continue;
    const expected=file==='service-registry.v1.json'?expectedRegistrySha256:file==='registry-approvals.v1.json'?expectedApprovalsSha256:sha(bytes);
    assert.equal(sha(readFileSync(target)),expected,'Refuse unrelated/concurrent overwrite: '+file);
  }
  for(const [file,bytes] of plan.writes){const target=resolve(contentRoot,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2],'Supply bundle directory');const bundle=resolve(process.argv[2]);
  const contentRoot=fileURLToPath(new URL('../content/',import.meta.url));
  const registryBytes=readFileSync(resolve(contentRoot,'service-registry.v1.json')),approvalBytes=readFileSync(resolve(contentRoot,'registry-approvals.v1.json'));
  const plan=planD12E28AImport({readBundle:file=>{const path=resolve(bundle,file);assert.ok(relative(bundle,path)&&!relative(bundle,path).startsWith('..'));return readFileSync(path);},
    registry:JSON.parse(registryBytes),approvals:JSON.parse(approvalBytes)});
  if(process.argv.includes('--apply'))applyD12E28APlan(plan,contentRoot,{expectedRegistrySha256:sha(registryBytes),expectedApprovalsSha256:sha(approvalBytes)});
  console.log(JSON.stringify(plan.summary));
}
