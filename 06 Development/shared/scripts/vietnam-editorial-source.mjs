// Root-owned pure plan over received texts. No translation, I/O or release.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const vietnamSha=value=>createHash('sha256').update(value).digest('hex');
export const VIETNAM_KIND='W01_VIETNAM_NATIVE_FULL_V1';
export const VIETNAM_SOURCE_MODE='W01_NATIVE_REPAIRED_TEN_LOCALE_20261006';
export const VIETNAM_OLD_RECORD_SHA256='e1a891295dec22eb3084965f4c70e776c90bb3cc4b5767ba3678fe03d27087f2';
const frozen=rows=>Object.freeze(rows.map(Object.freeze));
const encoded=value=>JSON.stringify(value,null,2)+'\n';
export const VIETNAM_PACKETS=frozen([
  {key:'ru',file:'W01_VIETNAM_EXISTING_WHOLE_RU_INTAKE_DEV4_033_READY_TEXT.md',bytes:15235,sha256:'2fbc58f5549b1ddc7c510bc6060401b1dee4d4f85664f079bb4c166d14bcfb10'},
  {key:'en',file:'W01_VIETNAM_EXISTING_RU_TO_EN_DEV4_034_ASSISTANT_EXACT.md',bytes:11829,sha256:'fcf78e41d6879e9001002533608b8d463a2a7ea443b74061ad895ce642d171bf'},
  {key:'de',file:'W01_VIETNAM_EXISTING_RU_TO_DE_DEV4_035_ASSISTANT_EXACT.md',bytes:13982,sha256:'482a446d2f4e005d0b8e1cba5ad4cc47300d44ffdc87e0b276eae3133669e484'},
  {key:'fr',file:'W01_VIETNAM_FR_ES_HI_WITH_DE_FAQ_REPAIR_DEV4_036_DERIVED_REPAIRED_PART1.md',bytes:13016,sha256:'af485d491f20511835877a862815d6372b7df8cee4ab65053059bb9add59461e'},
  {key:'es',file:'W01_VIETNAM_FR_ES_HI_WITH_DE_FAQ_REPAIR_DEV4_036_DERIVED_REPAIRED_PART2.md',bytes:10844,sha256:'6e932d6be76c046afa87f076d93c79ac4161e9e9f73d2cc19c792ee27a7a2546'},
  {key:'hi',file:'W01_VIETNAM_FR_ES_HI_WITH_DE_FAQ_REPAIR_DEV4_036_DERIVED_REPAIRED_PART3.md',bytes:23255,sha256:'6a769d4c588dae2e81f14693d23232f52be4b7934fd11143669468755e5b3c52'},
  {key:'ar',file:'W01_VIETNAM_REMAINING_AR_ZH_JA_KO_DEV4_037_AR_SOURCE_WITH_GENUINE_NOTES_REPAIR.md',bytes:16117,sha256:'fd42963739be5381d153a139b44ae1b3e4e7cb38b5128b3b407a02bba10d24ba'},
  {key:'zh',file:'W01_VIETNAM_REMAINING_AR_ZH_JA_KO_DEV4_037_ZH_SOURCE_WITH_GENUINE_PRECISION_REPAIR.md',bytes:10037,sha256:'ac193e1106937b83cab0dfbfbce5eae5a78c752d2f2c3cd6c6f9acea33b68019'},
  {key:'jako',file:'W01_VIETNAM_REMAINING_AR_ZH_JA_KO_DEV4_037_JA_KO_SOURCE_WITH_GENUINE_PRECISION_REPAIR.md',bytes:24279,sha256:'46a7e73955b984b070ecc4df05afbd890faff2d85b78f00e222f9fc0da25f274'},
]);
export const VIETNAM_SPANS=frozen([
  {locale:'ru',packet:'ru',seoLine:11,bodyLine:19,button:'Кнопка: '},
  {locale:'en',packet:'en',seoLine:23,bodyLine:29,button:'Button: '},
  {locale:'de',packet:'de',seoLine:25,bodyLine:31,button:'Schaltfläche: '},
  {locale:'fr',packet:'fr',seoLine:27,bodyLine:33,button:'Bouton : '},
  {locale:'es',packet:'es',seoLine:5,bodyLine:11,button:'Botón: '},
  {locale:'hi',packet:'hi',seoLine:5,bodyLine:11,button:'बटन: '},
  {locale:'ar',packet:'ar',seoLine:17,bodyLine:23,button:'الزر: '},
  {locale:'zh-Hans',packet:'zh',seoLine:17,bodyLine:23,button:'按钮：'},
  {locale:'ja',packet:'jako',seoLine:19,bodyLine:25,button:'ボタン：'},
  {locale:'ko',packet:'jako',seoLine:159,bodyLine:165,button:'버튼: '},
]);
export const VIETNAM_LOCALES=Object.freeze(VIETNAM_SPANS.map(s=>s.locale));
const headings=Object.freeze([8,18,28,37,45,59,67,77,83,109]);
const questions=Object.freeze([85,89,93,97,101,105]);
const prose=Object.freeze([2,4,6,10,12,14,16,20,22,24,26,39,41,43,47,55,57,61,63,65,69,71,73,75,79,81,87,91,95,99,103,107,111]);
export const DE_ORIGINAL_FAQ6='Ja. Teilen Sie uns Ihr Abflugdatum mit und sagen Sie, ob bereits ein Antrag gestellt wurde oder ein Visum ausgestellt ist. Wir prüfen die Möglichkeiten und Einschränkungen, bevor wir den Leistungsumfang vereinbaren.';
export const DE_CORRECTED_FAQ6='Ja. Teilen Sie uns Ihr Abflugdatum mit und sagen Sie, ob bereits ein Antrag vorhanden ist oder ein Visum ausgestellt ist. Wir prüfen die Möglichkeiten und Einschränkungen, bevor wir den Leistungsumfang vereinbaren.';
function scalar(s){assert.equal(typeof s,'string');assert.ok(!/[\r\n\u0000]/.test(s),'Source line boundary');assert.equal(Buffer.from(s,'utf8').toString('utf8'),s,'Invalid Unicode');}
function field(line,label){assert.ok(line.startsWith(label),'Missing supplied SEO');const s=line.slice(label.length);assert.ok(s.trim(),'Empty supplied SEO');return s;}

export function parseVietnamDraftPage(seoLines,lines,{locale,notesLines}={}){
  const scope=VIETNAM_SPANS.find(s=>s.locale===locale);assert.ok(scope,'Unknown Vietnam locale');
  assert.ok(Array.isArray(seoLines)&&seoLines.length===2&&Array.isArray(lines)&&lines.length===114,'Incomplete Vietnam page');
  assert.ok(Array.isArray(notesLines)&&notesLines.length===11,'Incomplete editorial notes');
  [...seoLines,...lines,...notesLines].forEach(scalar);
  assert.ok(/^# [^#].+/.test(lines[0]),'Missing H1');
  for(const i of headings)assert.ok(/^## [^#].+/.test(lines[i]),'Missing customer section');
  for(const i of prose)assert.ok(lines[i].trim()&&!/^#{1,6} /.test(lines[i]),'Missing full paragraph');
  const table=lines.slice(30,36);assert.equal(table.length,6);
  for(const row of table){assert.ok(/^\|.+\|$/.test(row),'Missing complete comparison row');assert.equal(row.split('|').length,4,'Comparison columns changed');}
  assert.ok(/^\|[- :|]+\|$/.test(table[1]),'Missing table separator');
  for(let i=49;i<=53;i++)assert.ok(/^- .+/.test(lines[i]),'Missing preparation bullet');
  const faq=questions.map(i=>{assert.ok(/^### [^#].+/.test(lines[i]),'Missing FAQ question');assert.equal(lines[i+1],'');assert.ok(lines[i+2].trim(),'Missing FAQ answer');return {question:lines[i].slice(4),answerMarkdown:lines[i+2]};});
  assert.equal(lines.filter(l=>l.startsWith('# ')).length,1);assert.equal(lines.filter(l=>l.startsWith('## ')).length,10);
  assert.equal(lines.filter(l=>l.startsWith('### ')).length,6);assert.equal(lines.filter(l=>l.startsWith('|')).length,6);assert.equal(lines.filter(l=>l.startsWith('- ')).length,5);
  const prefix='**'+scope.button;assert.ok(lines[113].startsWith(prefix)&&lines[113].endsWith('**'),'Missing literal CTA');
  const label=lines[113].slice(prefix.length,-2);assert.ok(label.trim(),'Empty CTA');
  assert.ok(/^#{2,3} .+/.test(notesLines[0]),'Missing separate editorial notes heading');
  for(let i=1;i<=4;i++)assert.ok(notesLines[i+1].startsWith(i+'. '),'Missing source entry');
  for(const i of [1,6,8,10])assert.equal(notesLines[i],'','Editorial notes layout changed');
  for(const i of [7,9])assert.ok(notesLines[i].trim(),'Missing source disclaimer');
  const sourceUrls=notesLines.join('\n').match(/https?:\/\/[^`\s)]+/g)??[];
  assert.equal(sourceUrls.length,3,'The fourth source never supplied a URL');
  return {bodyMarkdown:lines.slice(0,113).join('\n')+'\n',h1:lines[0].slice(2),
    seo:{title:field(seoLines[0],'**Title:** '),description:field(seoLines[1],'**Description:** ')},
    directAnswer:'',factBlock:null,faq,faqHeading:lines[83].slice(3),bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,
    tables:[{heading:lines[28].slice(3),markdown:table.join('\n'),dataRows:4,columns:2}],
    cta:[{role:'primary',label,actionIntent:'existing_contact_flow'}],
    privateEditorialNotes:notesLines.join('\n')+'\n',sourceEntryCount:4,sourceUrls};
}

export function extractVietnamDraftCorpus(archives){
  assert.ok(archives instanceof Map,'Explicit source archive map required');
  assert.deepEqual([...archives.keys()].sort(),VIETNAM_PACKETS.map(p=>p.key).sort(),'All nine exact source packets required');
  const packets=new Map();
  for(const pin of VIETNAM_PACKETS){
    const bytes=archives.get(pin.key);assert.ok(Buffer.isBuffer(bytes),'Literal source bytes required');
    assert.equal(bytes.length,pin.bytes,'Source archive length drift');assert.equal(vietnamSha(bytes),pin.sha256,'Source archive hash drift');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);assert.ok(text.endsWith('\n'),'Incomplete LF archive');
    packets.set(pin.key,{pin,text,lines:text.split('\n')});
  }
  return VIETNAM_SPANS.map(scope=>{
    const packet=packets.get(scope.packet),lines=packet.lines,body=lines.slice(scope.bodyLine-1,scope.bodyLine+113),notes=lines.slice(scope.bodyLine+116,scope.bodyLine+127);
    const components=[scope.packet],repairs=[];
    if(scope.locale==='de'){
      const replacement=packets.get('fr').lines[16];assert.equal(replacement,DE_CORRECTED_FAQ6,'Received DE repair drift');
      assert.equal(body[107],DE_ORIGINAL_FAQ6,'DE base answer drift');body[107]=replacement;components.push('fr');
      repairs.push({scope:'FAQ6 answer only',originalSha256:vietnamSha(DE_ORIGINAL_FAQ6),replacementSha256:vietnamSha(replacement),sourcePacket:'fr',sourceLine:17});
    }
    const parsed=parseVietnamDraftPage([lines[scope.seoLine-1],lines[scope.seoLine+1]],body,{locale:scope.locale,notesLines:notes});
    return {...parsed,locale:scope.locale,direction:scope.locale==='ar'?'rtl':'ltr',
      provenance:{contentId:'vietnam',source:'SAFRWAY_VIETNAM_MAIN_RU_v1_REVIEW.md',sourceDate:'2026-10-06',sourceStatus:'RU_REVIEW',
        sourceCandidateRoute:'/visas/vietnam/',components:components.map(key=>({...packets.get(key).pin})),repairs,
        seoLines:[scope.seoLine,scope.seoLine+2],customerLines:[scope.bodyLine,scope.bodyLine+113],bodyLines:[scope.bodyLine,scope.bodyLine+112],
        notesLines:[scope.bodyLine+117,scope.bodyLine+127],archiveFraming:'NATIVE_LF_ARCHIVE_AND_ADDRESS_ONLY_DERIVATIVES',originalDownload:false,originalFileSha256:null},
      rawArchives:Object.fromEntries(components.map(key=>[key,packets.get(key).text]))};
  });
}

export function planVietnamEditorialImport(registry,archives,{metadataEnvelope}={}){
  assert.equal(typeof metadataEnvelope,'function','Existing Registry envelope helper required');
  assert.ok(Array.isArray(registry?.records)&&Array.isArray(registry.locales));
  const rows=registry.records.filter(r=>r.contentId==='vietnam');assert.equal(rows.length,1,'Existing single Vietnam identity required');
  const oldRecord=rows[0];assert.equal(vietnamSha(JSON.stringify(oldRecord)),VIETNAM_OLD_RECORD_SHA256,'Pre-Vietnam record drift');
  assert.equal(oldRecord.kind,'world_visa');assert.equal(oldRecord.parentId,'world_visas');assert.equal(oldRecord.candidate.route,'/visas/vietnam/');
  for(const key of ['serviceId','pricingRef','published'])assert.equal(oldRecord[key],null);
  assert.equal(oldRecord.bindingStatus,'unresolved');assert.equal(oldRecord.availability,'not_verified');assert.equal(oldRecord.release,'not_authorized');
  const corpus=extractVietnamDraftCorpus(archives),ru=corpus.find(p=>p.locale==='ru'),revision='sha256:'+vietnamSha(ru.bodyMarkdown),record=structuredClone(oldRecord),files=[];
  assert.deepEqual([...registry.locales.map(l=>l.code)].sort(),[...VIETNAM_LOCALES].sort(),'Exactly the platform ten locales required');
  const manifest={schemaVersion:1,fullPayloadKind:VIETNAM_KIND,sourceMode:VIETNAM_SOURCE_MODE,priorRecordSha256:VIETNAM_OLD_RECORD_SHA256,
    publicationGates:{ownerPublication:false,independentNativeReview:false,legalVerification:false,renderedReview:false},sourcePackets:VIETNAM_PACKETS.map(p=>({...p})),records:[]};
  const entry={contentId:'vietnam',canonicalPath:oldRecord.candidate.route,sourceRevision:revision,
    editorialSourceRevision:'SAFRWAY_VIETNAM_MAIN_RU_v1_REVIEW.md/2026-10-06',ruBodySha256:vietnamSha(ru.bodyMarkdown),locales:{}};
  record.candidate.revision=revision;
  for(const page of corpus){
    const language=registry.locales.find(l=>l.code===page.locale);assert.equal(language.dir,page.direction);
    const {locale,direction,provenance,rawArchives,privateEditorialNotes,...parsed}=page,stem='vietnam_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261006';
    const sourceFile='registry-copy/'+stem+'.source.json',sourceWire={schemaVersion:1,sourceMode:VIETNAM_SOURCE_MODE,provenance,archives:rawArchives,privateEditorialNotes};
    const sourceBytes=encoded(sourceWire),bodySha256=vietnamSha(parsed.bodyMarkdown),metadata={schemaVersion:1,fullPayloadKind:VIETNAM_KIND,sourceMode:VIETNAM_SOURCE_MODE,
      resolvedContentId:'vietnam',resolvedCanonicalPath:oldRecord.candidate.route,locale,direction,...parsed,seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,
      sourceRevision:revision,editorialSourceRevision:entry.editorialSourceRevision,sourceRuBodySha256:entry.ruBodySha256,bodySha256,
      sourceFile,sourceFileSha256:vietnamSha(sourceBytes),sourceProvenance:provenance,sourceNotesSha256:vietnamSha(privateEditorialNotes),sourceNotesPrivate:true,
      serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
      approval:{status:locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA',legalVerification:false,fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
    metadata.sourceEnvelopeSha256=metadataEnvelope(parsed.bodyMarkdown,metadata);assert.match(metadata.sourceEnvelopeSha256,/^[a-f0-9]{64}$/);
    const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=encoded(metadata),payload={status:locale==='ru'?'draft':'translated',bodyFile:'registry-copy/'+stem+'.md',bodySha256,
      metadataFile,metadataSha256:vietnamSha(metaBytes),sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,
      ...(locale==='ru'?{approvalEvidence:null,approvalRevision:null}:{sourceRevision:revision,complete:true,qa:'not_done',qaMethod:'supplied_model_semantic',qaEvidence:'Whole received native text and exact author repairs; independent native/legal/rendered review not run'})};
    if(locale==='ru')record.candidate.ru=payload;else record.candidate.translations[locale]=payload;
    entry.locales[locale]={...payload,direction,sourceFile,sourceFileSha256:metadata.sourceFileSha256};
    files.push({path:payload.bodyFile,text:parsed.bodyMarkdown,private:false},{path:metadataFile,text:metaBytes,private:false},{path:sourceFile,text:sourceBytes,private:true});
  }
  assert.deepEqual(Object.keys(entry.locales).sort(),[...VIETNAM_LOCALES].sort());manifest.records.push(entry);
  return {oldRecord,record,manifest,files,summary:{identities:1,locales:10,publicProjectionFiles:20,privateSourceFiles:10,newServices:0,newPrices:0,imported:false,published:false,independentNativeLegalRendered:'NOT_RUN'}};
}
