// Read-only planning of already received bank copy. No translation or publication.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {metadataEnvelope} from './import-sync-bundle.mjs';

export const BANK_EDITORIAL_KIND='BANK_NATIVE_DRAFT_TEN_LOCALE_V1';
export const BANK_SOURCE_MODE='NATIVE_TEXT_LF_FRAMED_BANK_20261003';
export const BANK_OLD_RECORD_SHA256='59695d4e8eecce3863cd611ae1867e61d0cdbcda98f40c8d3b58cb4e085e3935';
export const bankSha=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>JSON.stringify(value,null,2)+'\n';
const freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
export const BANK_PACKETS=freezeRows([
  {task:'040',file:'G02_BANK_SKTT_EXISTING_RU_EN_WHOLE_INTAKE_DEV4_040_EXACT.md',bytes:15710,sha256:'ad217bac7b792ce9c90e7371dd79fdcccc46801812eab39cf9b44eeaacffecc4',end:'END_BANK_SKTT_EXISTING_RU_EN_WHOLE_DEV4_040'},
  {task:'041',file:'G02_BANK_EXISTING_RU_DE_FR_ES_REUSE_TRANSLATE_DEV4_041_EXACT.md',bytes:12172,sha256:'e5e39da26ce198e478a6020b6922ca8d2b09b42434e8886957e0db916f265d6f',end:'END_BANK_DE_FR_ES_DEV4_041'},
  {task:'042',file:'G02_BANK_EXISTING_RU_ZH_JA_KO_REUSE_TRANSLATE_DEV4_042_EXACT.md',bytes:11439,sha256:'44756d700c6bc882e6b1def1a36a0b3056d948fecf3e56e547224d859708a8be',end:'END_BANK_ZH_JA_KO_DEV4_042'},
  {task:'043',file:'G02_BANK_EXISTING_RU_HI_AR_REUSE_TRANSLATE_DEV4_043_EXACT.md',bytes:12553,sha256:'4f477fba86dea7a99de8d88ec237990668ff96b69fc5625d3bc8bb5b4a8b0ac3',end:'END_BANK_HI_AR_DEV4_043'},
]);
// One-based observed spans in the pinned LF archives, not inferred translations.
export const BANK_SOURCE_SPANS=freezeRows([
  {locale:'ru',task:'040',seoLine:36,bodyLine:39,button:'Кнопка:'},
  {locale:'en',task:'040',seoLine:68,bodyLine:71,button:'Button:'},
  {locale:'de',task:'041',seoLine:23,bodyLine:28,button:'Schaltfläche:'},
  {locale:'fr',task:'041',seoLine:61,bodyLine:66,button:'Bouton :'},
  {locale:'es',task:'041',seoLine:99,bodyLine:104,button:'Botón:'},
  {locale:'zh-Hans',task:'042',seoLine:23,bodyLine:28,button:'按钮：'},
  {locale:'ja',task:'042',seoLine:61,bodyLine:66,button:'ボタン：'},
  {locale:'ko',task:'042',seoLine:99,bodyLine:104,button:'버튼:'},
  {locale:'hi',task:'043',seoLine:26,bodyLine:31,button:'बटन:'},
  {locale:'ar',task:'043',seoLine:64,bodyLine:69,button:'الزر:'},
]);
export const BANK_LOCALES=Object.freeze(BANK_SOURCE_SPANS.map(row=>row.locale));
const blankLines=Object.freeze([1,3,5,7,9,11,13,15,17,19,21,24]);
const paragraphLines=Object.freeze([2,4,8,10,14,16,20,23]);
function scalar(value){
  assert.equal(typeof value,'string');
  assert.ok(!/[\r\n\u0000]/.test(value),'Unexpected source line boundary');
  assert.equal(Buffer.from(value,'utf8').toString('utf8'),value,'Invalid Unicode scalar');
}
function field(line,prefix,{markdownBreak=false}={}){
  scalar(line);assert.ok(line.startsWith(prefix),'Missing exact supplied SEO field');
  let value=line.slice(prefix.length);
  if(markdownBreak){assert.ok(value.endsWith('  '),'Missing captured metadata line break');value=value.slice(0,-2);}
  assert.ok(value.trim().length,'Empty supplied SEO value');return value;
}

// Low-level format parser; full intake below additionally requires all raw pins.
export function parseBankDraftPage(seoLines,lines,{locale}={}){
  const scope=BANK_SOURCE_SPANS.find(row=>row.locale===locale);assert.ok(scope,'Unknown bank locale');
  assert.ok(Array.isArray(seoLines)&&seoLines.length===2&&Array.isArray(lines)&&lines.length===26,'Incomplete supplied bank page');
  [...seoLines,...lines].forEach(scalar);
  for(const i of blankLines)assert.equal(lines[i],'','Unexpected source layout');
  for(const i of paragraphLines)assert.ok(lines[i].trim().length&&!/^#{1,6} |^\*\*/.test(lines[i]),'Missing literal paragraph');
  assert.ok(lines[0].startsWith('# ')&&lines[0].slice(2).trim(),'Missing customer H1');
  for(const i of [6,12,18])assert.ok(/^## [^#].+/.test(lines[i]),'Missing one of three supplied sections');
  assert.equal(lines.filter(line=>line.startsWith('# ')).length,1);
  assert.equal(lines.filter(line=>line.startsWith('## ')).length,3);
  const question=lines[22].match(/^\*\*([^*]+)\*\* {2}$/);
  assert.ok(question,'Missing bold FAQ or its captured trailing spaces');
  const prefix='**'+scope.button+'** ';
  assert.ok(lines[25].startsWith(prefix),'Missing exact supplied CTA field');
  const label=lines[25].slice(prefix.length);assert.ok(label.trim(),'Empty supplied CTA');
  const bodyMarkdown=lines.slice(0,25).join('\n')+'\n';
  return {bodyMarkdown,h1:lines[0].slice(2),
    seo:{title:field(seoLines[0],'**Title:** ',{markdownBreak:true}),description:field(seoLines[1],'**Description:** ')},
    // This source has no standalone short answer, fact block or FAQ heading.
    directAnswer:'',factBlock:null,faq:[{question:question[1],answerMarkdown:lines[23]}],faqHeading:null,
    cta:[{role:'primary',label,actionIntent:'existing_contact_flow'}],
    bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true};
}

export function extractBankDraftCorpus(archives){
  assert.ok(archives instanceof Map,'Explicit source archive map required');
  assert.deepEqual([...archives.keys()].sort(),BANK_PACKETS.map(row=>row.task).sort(),'Exact four source tasks required');
  const packets=new Map();
  for(const pin of BANK_PACKETS){
    const bytes=archives.get(pin.task);assert.ok(Buffer.isBuffer(bytes),'Literal archive bytes required');
    assert.equal(bytes.length,pin.bytes,'Source archive length drift');
    assert.equal(bankSha(bytes),pin.sha256,'Source archive hash drift');
    const archiveText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    assert.ok(archiveText.endsWith('\n'+pin.end+'\n'),'Incomplete received source ending');
    packets.set(pin.task,{pin,archiveText,lines:archiveText.split('\n')});
  }
  return BANK_SOURCE_SPANS.map(scope=>{
    const {pin,archiveText,lines}=packets.get(scope.task);
    const seoLines=lines.slice(scope.seoLine-1,scope.seoLine+1),bodyLines=lines.slice(scope.bodyLine-1,scope.bodyLine+25);
    const parsed=parseBankDraftPage(seoLines,bodyLines,{locale:scope.locale});
    return {...parsed,locale:scope.locale,direction:scope.locale==='ar'?'rtl':'ltr',
      provenance:{sourceCollection:'CONTENT_DRAFTS_RU_EN.md',section:4,contentId:'bank',sourceDate:'2026-10-03',
        task:scope.task,archiveFile:pin.file,archiveSha256:pin.sha256,archiveBytes:pin.bytes,
        nativeMessageIdentity:'RECORDED_IN_PRIVATE_INTAKE_RECEIPT',nativeMessageBodySha256:null,archiveFraming:'NATIVE_TEXT_LF_FRAMED',
        originalDownload:false,originalFileSha256:null,
        seoLines:[scope.seoLine,scope.seoLine+1],customerLines:[scope.bodyLine,scope.bodyLine+25],
        bodyLines:[scope.bodyLine,scope.bodyLine+24],ctaLine:scope.bodyLine+25},
      raw:{archiveText,seoLines,customerLines:bodyLines}};
  });
}

// Additive plan only. It cannot bind commercial operations or authorize release.
export function planBankEditorialImport(registry,archives){
  assert.ok(registry&&Array.isArray(registry.records)&&Array.isArray(registry.locales));
  const matches=registry.records.filter(row=>row.contentId==='bank');assert.equal(matches.length,1,'Existing bank identity required');
  const oldRecord=matches[0];assert.equal(bankSha(JSON.stringify(oldRecord)),BANK_OLD_RECORD_SHA256,'Pre-bank record drift');
  assert.equal(oldRecord.kind,'document');assert.equal(oldRecord.parentId,'documents');
  assert.equal(oldRecord.candidate.route,'/bali/documents/bank-account/');
  assert.equal(oldRecord.serviceId,null);assert.equal(oldRecord.pricingRef,null);
  assert.equal(oldRecord.bindingStatus,'unresolved');assert.equal(oldRecord.availability,'not_verified');
  const corpus=extractBankDraftCorpus(archives),ru=corpus.find(page=>page.locale==='ru');
  const revision='sha256:'+bankSha(ru.bodyMarkdown),record=structuredClone(oldRecord),files=[];
  const manifest={schemaVersion:1,fullPayloadKind:BANK_EDITORIAL_KIND,
    publicationGates:{ownerPublication:false,independentNativeReview:false,legalVerification:false,renderedReview:false},
    priorBankRecordSha256:BANK_OLD_RECORD_SHA256,sourcePackets:BANK_PACKETS.map(pin=>({...pin})),records:[]};
  const entry={contentId:'bank',canonicalPath:oldRecord.candidate.route,sourceRevision:revision,
    editorialSourceRevision:'CONTENT_DRAFTS_RU_EN.md#4/bank/2026-10-03',ruBodySha256:bankSha(ru.bodyMarkdown),locales:{}};
  record.candidate.revision=revision;
  for(const page of corpus){
    const language=registry.locales.find(row=>row.code===page.locale);assert.ok(language,'Registry locale missing');
    assert.equal(language.dir,page.direction);
    const {locale,direction,provenance,raw,...parsed}=page,stem='bank_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261003';
    const sourceFile='registry-copy/'+stem+'.source.json';
    const wire={schemaVersion:1,sourceMode:BANK_SOURCE_MODE,provenance,archiveText:raw.archiveText};
    const wireBytes=encoded(wire),bodySha256=bankSha(parsed.bodyMarkdown);
    const metadata={schemaVersion:1,fullPayloadKind:BANK_EDITORIAL_KIND,sourceMode:BANK_SOURCE_MODE,resolvedContentId:'bank',
      locale,direction,resolvedCanonicalPath:record.candidate.route,...parsed,seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,
      sourceRevision:revision,editorialSourceRevision:entry.editorialSourceRevision,sourceRuBodySha256:entry.ruBodySha256,bodySha256,
      sourceFile,sourceFileSha256:bankSha(wireBytes),sourceProvenance:provenance,
      serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
      approval:{status:locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA',legalVerification:false,
        fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
    metadata.sourceEnvelopeSha256=metadataEnvelope(parsed.bodyMarkdown,metadata);
    const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=encoded(metadata);
    const payload={status:locale==='ru'?'draft':'translated',bodyFile:'registry-copy/'+stem+'.md',bodySha256,
      metadataFile,metadataSha256:bankSha(metaBytes),sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,
      ...(locale==='ru'?{approvalEvidence:null,approvalRevision:null}:{sourceRevision:revision,complete:true,qa:'not_done',
        qaMethod:'supplied_model_semantic',qaEvidence:'Full received text; independent native/legal/rendered review not run'})};
    if(locale==='ru')record.candidate.ru=payload;else record.candidate.translations[locale]=payload;
    entry.locales[locale]={...payload,direction,sourceFile,sourceFileSha256:metadata.sourceFileSha256};
    files.push({path:payload.bodyFile,bytes:parsed.bodyMarkdown,private:false},
      {path:metadataFile,bytes:metaBytes,private:false},{path:sourceFile,bytes:wireBytes,private:true});
  }
  assert.deepEqual(Object.keys(entry.locales).sort(),[...BANK_LOCALES].sort());
  manifest.records.push(entry);
  return {oldRecord,record,manifest,files,summary:{identities:1,locales:10,publicProjectionFiles:20,privateSourceFiles:10,
    newServices:0,newPrices:0,published:false,independentNativeLegalRendered:'NOT_RUN'}};
}
