// Root-owned, read-only source preparation. No Registry/Git/runtime writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const SKTT_OLD_RECORD_SHA256='ef2363b04cb2aa7e8d2b4db2a165c2a8772abf0e4e868eb55e07baa02578adb5';
export const SKTT_PACKETS=Object.freeze([
  {task:'040',file:'G02_BANK_SKTT_EXISTING_RU_EN_WHOLE_INTAKE_DEV4_040_EXACT.md',bytes:15710,sha256:'ad217bac7b792ce9c90e7371dd79fdcccc46801812eab39cf9b44eeaacffecc4',end:'END_BANK_SKTT_EXISTING_RU_EN_WHOLE_DEV4_040'},
  {task:'044',file:'G02_SKTT_EXISTING_RU_DE_FR_ES_REUSE_TRANSLATE_DEV4_044_ASSISTANT_EXACT.md',bytes:12423,sha256:'74dbfd0ecbf2a319542e172416e3a181536c77c4eda8e8510f77eea06ba55946',end:'END_SKTT_DE_FR_ES_DEV4_044'},
  {task:'045',file:'G02_SKTT_EXISTING_RU_ZH_JA_KO_REUSE_TRANSLATE_DEV4_045_ASSISTANT_EXACT.md',bytes:12090,sha256:'be750f2bb026b5a4546cccc692b884fa8e5262f0100b8e6b59ba983cb44513d9',end:'END_SKTT_ZH_JA_KO_DEV4_045'},
].map(Object.freeze));
export const SKTT_SPANS=Object.freeze([
  {locale:'ru',task:'040',seoLine:110,bodyLine:113,button:'Кнопка:'},
  {locale:'en',task:'040',seoLine:143,bodyLine:146,button:'Button:'},
  {locale:'de',task:'044',seoLine:23,bodyLine:28,button:'Schaltfläche:'},
  {locale:'fr',task:'044',seoLine:62,bodyLine:67,button:'Bouton :'},
  {locale:'es',task:'044',seoLine:101,bodyLine:106,button:'Botón:'},
  {locale:'zh-Hans',task:'045',seoLine:23,bodyLine:28,button:'按钮：'},
  {locale:'ja',task:'045',seoLine:62,bodyLine:67,button:'ボタン：'},
  {locale:'ko',task:'045',seoLine:101,bodyLine:106,button:'버튼:'},
].map(Object.freeze));

function scalar(value){
  assert.equal(typeof value,'string');
  assert.ok(!/[\r\n\u0000]/.test(value),'Unexpected source line boundary');
  assert.equal(Buffer.from(value,'utf8').toString('utf8'),value,'Invalid Unicode scalar');
}
function seoField(line,prefix,{markdownBreak=false}={}){
  assert.ok(line.startsWith(prefix),'Missing exact supplied SEO field');
  let value=line.slice(prefix.length);
  if(markdownBreak){assert.ok(value.endsWith('  '),'Missing source metadata line break');value=value.slice(0,-2);}
  assert.ok(value.trim().length,'Empty supplied SEO');return value;
}

// Same literal-field convention as the existing bank source parser, but the
// SKTT source has one intro and TWO FAQ pairs. Never trim its Markdown breaks.
export function parseSkttDraftPage(seoLines,lines,{locale}={}){
  const scope=SKTT_SPANS.find(row=>row.locale===locale);assert.ok(scope,'Unreceived locale');
  assert.ok(Array.isArray(seoLines)&&seoLines.length===2&&Array.isArray(lines)&&lines.length===27,'Incomplete supplied SKTT page');
  [...seoLines,...lines].forEach(scalar);
  for(const i of [1,3,5,7,9,11,13,15,17,19,22,25])assert.equal(lines[i],'','Source layout drift');
  for(const i of [2,6,8,12,14,18,21,24])assert.ok(lines[i].trim().length&&!/^#{1,6} |^\*\*/.test(lines[i]),'Missing literal paragraph');
  assert.ok(/^# [^#].+/.test(lines[0]),'Missing H1');
  for(const i of [4,10,16])assert.ok(/^## [^#].+/.test(lines[i]),'Missing supplied section');
  assert.equal(lines.filter(line=>line.startsWith('# ')).length,1);
  assert.equal(lines.filter(line=>line.startsWith('## ')).length,3);
  const faq=[20,23].map(i=>{const match=lines[i].match(/^\*\*([^*]+)\*\* {2}$/);assert.ok(match,'Missing FAQ or literal trailing spaces');return {question:match[1],answerMarkdown:lines[i+1]};});
  const prefix='**'+scope.button+'** ';assert.ok(lines[26].startsWith(prefix),'Missing exact supplied CTA');
  const label=lines[26].slice(prefix.length);assert.ok(label.trim(),'Empty supplied CTA');
  return {bodyMarkdown:lines.slice(0,26).join('\n')+'\n',h1:lines[0].slice(2),
    seo:{title:seoField(seoLines[0],'**Title:** ',{markdownBreak:true}),description:seoField(seoLines[1],'**Description:** ')},
    faq,faqHeading:null,bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,
    directAnswer:'',factBlock:null,tables:[],cta:[{role:'primary',label,actionIntent:'existing_contact_flow'}]};
}

export function extractSkttReceivedEight(archives){
  assert.ok(archives instanceof Map,'Explicit received archives required');
  assert.deepEqual([...archives.keys()].sort(),SKTT_PACKETS.map(row=>row.task).sort(),'Exact three pinned packets required');
  const packets=new Map();
  for(const pin of SKTT_PACKETS){
    const bytes=archives.get(pin.task);assert.ok(Buffer.isBuffer(bytes),'Literal received bytes required');
    assert.equal(bytes.length,pin.bytes,'Archive length drift');assert.equal(sha256(bytes),pin.sha256,'Archive hash drift');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    assert.ok(text.endsWith('\n'+pin.end+'\n'),'Incomplete received ending');
    packets.set(pin.task,{pin,lines:text.split('\n')});
  }
  return SKTT_SPANS.map(scope=>{
    const {pin,lines}=packets.get(scope.task),seoLines=lines.slice(scope.seoLine-1,scope.seoLine+1),customerLines=lines.slice(scope.bodyLine-1,scope.bodyLine+26);
    const parsed=parseSkttDraftPage(seoLines,customerLines,{locale:scope.locale});
    return {...parsed,locale:scope.locale,direction:'ltr',source:{collection:'CONTENT_DRAFTS_RU_EN.md',section:5,contentId:'sktt',sourceDate:'2026-10-03',task:scope.task,
      archiveFile:pin.file,archiveSha256:pin.sha256,archiveBytes:pin.bytes,archiveFraming:'NATIVE_TEXT_LF_FRAMED',originalDownload:false,originalFileSha256:null,
      seoLines:[scope.seoLine,scope.seoLine+1],bodyLines:[scope.bodyLine,scope.bodyLine+25],ctaLine:scope.bodyLine+26}};
  });
}

export function planSkttReceivedEight(registry,archives){
  assert.ok(registry&&Array.isArray(registry.records)&&Array.isArray(registry.locales));
  const matches=registry.records.filter(r=>r.contentId==='sktt');assert.equal(matches.length,1,'Existing SKTT identity required');
  const record=matches[0];assert.equal(sha256(JSON.stringify(record)),SKTT_OLD_RECORD_SHA256,'Existing SKTT record drift');
  assert.equal(record.kind,'document');assert.equal(record.parentId,'documents');
  assert.equal(record.candidate.route,'/bali/documents/sktt/');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
  const pages=extractSkttReceivedEight(archives);
  for(const page of pages){const locale=registry.locales.find(r=>r.code===page.locale);assert.ok(locale,'Unknown Registry locale');assert.equal(locale.dir,page.direction);}
  const missingLocales=registry.locales.map(r=>r.code).filter(code=>!pages.some(page=>page.locale===code));
  assert.deepEqual([...missingLocales].sort(),['ar','hi'],'Current missing source scope changed');
  return {schemaVersion:1,kind:'SKTT_RECEIVED_EIGHT_SOURCE_READINESS_ONLY',contentId:'sktt',canonicalPath:record.candidate.route,
    existingRecordSha256:SKTT_OLD_RECORD_SHA256,sourcePackets:SKTT_PACKETS.map(p=>({...p})),pages,missingLocales,
    fullTenLocaleSourceComplete:false,registryMutated:false,newServices:0,newPrices:0,
    independentNativeReview:false,legalVerification:false,commercialFulfillmentVerified:false,rendered:false,imported:false,published:false,
    publicPublicationOverlay:'NOT_BUILT_SOURCE_STAGE_ONLY',livePublicPages:'NOT_OBSERVED_BY_THIS_SOURCE_PLAN'};
}
