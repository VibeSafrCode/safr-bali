// Finite SKTT-only local HI/AR source planner. No writer/native receipt claim,
// network, filesystem mutation, Service/price, publication grant or RU fallback.
import assert from 'node:assert/strict';
import {sha256 as sha} from './sktt-editorial-source-readiness.mjs';
import {encoded,SKTT_LOCALES} from './sktt-editorial-import.mjs';
export const SKTT_LOCAL_KIND='SKTT_LOCAL_MODEL_TRANSLATION_TWO_V1';
export const SKTT_LOCAL_MODE='LOCAL_MODEL_TRANSLATION_20261022';
export const SKTT_LOCAL_LOCALES=Object.freeze(['hi','ar']);
export const SKTT_NATIVE_RECORD_SHA='338c2697800c63e489b4b3714c641c94c613724876fa61bd2501f9446ce477b2';
export const SKTT_NATIVE_MANIFEST_SHA='c00f74b04ea319a6df2b878e8c31f1b37784a787755d3c3ed4d02f8056373adc';
export const SKTT_RU_SHA='a78609ef976aeb829222fde421010fc3afbbbb8b58fbaae3353151cd3a2e6344';
export const SKTT_ROOT_ACCEPTANCE_SHA='6eef17337d85211a15fc77841bf317441bda1f34ef5bc3da1d3083a608af3081';
export const SKTT_LOCAL_INPUT_PINS=Object.freeze({
 'hi.md':'14cf58d55978b50408306cfe53fc473b2c28a42bb25d5f3e682debfb632a7c73',
 'ar.md':'2fb2f491385f9e04b93b4e36fdf88e5efe0f24f68f509ee144d79c3f40280a38',
 'EDITORIAL_FIELDS.json':'a2b50e16747a5b68238e3e15c634c12b5a63b76c393408e623101984bd160757',
 'README.md':'d7e33572799c0e09c039500e8a55768e09912bb57bd2f447f5c0360cf306c284',
 'PEER_REVIEW.json':'acd905fbb870e6bc811d86f564919a9e7c3905d7411dd1718674574e9a018e6e',
});
function pinnedText(file,bytes){
 const pin=file==='ROOT_ACCEPTANCE.json'?SKTT_ROOT_ACCEPTANCE_SHA:SKTT_LOCAL_INPUT_PINS[file];
 assert.match(pin??'',/^[a-f0-9]{64}$/,'Actual Root source acceptance required');
 assert.ok(Buffer.isBuffer(bytes),'Exact original bytes required');
 assert.equal(sha(bytes),pin,'Local SKTT original drift: '+file);
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function parseSkttLocalPage(locale,inputs){
 assert.ok(SKTT_LOCAL_LOCALES.includes(locale),'Unbound local SKTT locale');
 assert.ok(inputs instanceof Map,'Explicit local originals required');
 const expected=[locale+'.md','EDITORIAL_FIELDS.json','README.md','PEER_REVIEW.json','ROOT_ACCEPTANCE.json'];
 assert.deepEqual([...inputs.keys()].sort(),expected.sort(),'Exact five local originals required');
 const text=Object.fromEntries([...inputs].map(([file,bytes])=>[file,pinnedText(file,bytes)]));
 const body=text[locale+'.md'],fields=JSON.parse(text['EDITORIAL_FIELDS.json']);
 const peer=JSON.parse(text['PEER_REVIEW.json']),root=JSON.parse(text['ROOT_ACCEPTANCE.json']);
 assert.equal(root.schema,'safr.sktt.local-two.root-source-acceptance.v1');
 assert.equal(root.status,'ROOT_MODEL_SEMANTIC_SOURCE_ACCEPTED_NOT_INTEGRATED_OR_PUBLISHED');
 assert.equal(root.contentId,'sktt');assert.equal(root.canonicalPath,'/bali/documents/sktt/');
 assert.deepEqual(root.acceptedLocales,SKTT_LOCAL_LOCALES);assert.equal(root.sourceRuBodySha256,SKTT_RU_SHA);
 assert.equal(root.peerReview.sha256,SKTT_LOCAL_INPUT_PINS['PEER_REVIEW.json']);
 assert.ok(Object.values(root.reviewQualifications).every(value=>value===false));
 assert.equal(fields.contentId,'sktt');assert.equal(fields.canonical,'/bali/documents/sktt/');
 assert.equal(fields.provenance,'LOCAL_MODEL_TRANSLATION_DRAFT');
 assert.equal(fields.source.language,'ru');assert.equal(fields.source.sha256,SKTT_RU_SHA);
 assert.deepEqual(Object.keys(fields.locales),SKTT_LOCAL_LOCALES);
 assert.equal(peer.status,'BOUNDED_ACK');assert.deepEqual(peer.findingCounts,{P1:0,P2:0});
 assert.equal(peer.source.sha256,SKTT_RU_SHA);
 assert.ok(peer.inputs.some(row=>row.path.endsWith('/'+locale+'.md')&&row.sha256===sha(inputs.get(locale+'.md'))));
 assert.ok(body.endsWith('\n')&&!body.includes('\r')&&!body.includes('\u0000'),'Literal UTF-8 LF source required');
 const lines=body.split('\n');assert.equal(lines.length,26,'Complete 25-line local body required');assert.equal(lines.at(-1),'');
 for(const i of [1,3,5,7,9,11,13,15,17,19,22])assert.equal(lines[i],'');
 assert.equal(lines[0],'# '+fields.locales[locale].h1);
 assert.equal(lines.filter(line=>line.startsWith('# ')).length,1);
 assert.equal(lines.filter(line=>line.startsWith('## ')).length,3);
 for(const i of [4,10,16])assert.match(lines[i],/^## [^#].+/);
 for(const i of [2,6,8,12,14,18])assert.ok(lines[i].trim()&&!/^#|^\*\*/.test(lines[i]));
 const local=fields.locales[locale];
 assert.equal(local.faq2.length,2);
 const faq=[20,23].map((i,n)=>{
  assert.equal(lines[i],'**'+local.faq2[n].question+'**');
  assert.equal(lines[i+1],local.faq2[n].answer);
  return {question:local.faq2[n].question,answerMarkdown:local.faq2[n].answer};
 });
 for(const value of [local.h1,local.seoTitle,local.metaDescription,local.ctaLabel])
  assert.ok(typeof value==='string'&&value.trim()&&!/[\r\n\u0000]/.test(value));
 return {bodyMarkdown:body,h1:local.h1,seo:{title:local.seoTitle,description:local.metaDescription},
  faq,faqHeading:null,bodyIncludesFaq:true,doNotRenderSeparateFaqAgain:true,
  directAnswer:'',factBlock:null,tables:[],cta:[{role:'primary',label:local.ctaLabel,actionIntent:'existing_contact_flow'}]};
}
export function skttLocalSourceWire(locale,inputs){
 parseSkttLocalPage(locale,inputs);
 return {schemaVersion:1,sourceMode:SKTT_LOCAL_MODE,contentId:'sktt',locale,
  originals:Object.fromEntries([locale+'.md','EDITORIAL_FIELDS.json','README.md','PEER_REVIEW.json','ROOT_ACCEPTANCE.json']
   .map(file=>[file,inputs.get(file).toString('utf8')]))};
}
export function skttLocalOriginalsFromWire(wire,locale){
 assert.deepEqual(Object.keys(wire),['schemaVersion','sourceMode','contentId','locale','originals']);
 assert.equal(wire.schemaVersion,1);assert.equal(wire.sourceMode,SKTT_LOCAL_MODE);
 assert.equal(wire.contentId,'sktt');assert.equal(wire.locale,locale);
 assert.ok(wire.originals&&typeof wire.originals==='object'&&!Array.isArray(wire.originals));
 const inputs=new Map(Object.entries(wire.originals).map(([file,text])=>{
  assert.equal(typeof text,'string');return [file,Buffer.from(text,'utf8')];
 }));
 parseSkttLocalPage(locale,inputs);return inputs;
}
export function skttLocalProjection(locale,inputs,{metadataEnvelope}={}){
 assert.equal(typeof metadataEnvelope,'function','Existing metadata envelope required');
 const parsed=parseSkttLocalPage(locale,inputs),direction=locale==='ar'?'rtl':'ltr';
 const stem='sktt_'+locale+'_local_model_20261022',sourceFile='registry-copy/'+stem+'.source.json';
 const sourceBytes=encoded(skttLocalSourceWire(locale,inputs));
 const metadata={schemaVersion:1,fullPayloadKind:SKTT_LOCAL_KIND,sourceMode:SKTT_LOCAL_MODE,
  resolvedContentId:'sktt',resolvedCanonicalPath:'/bali/documents/sktt/',locale,direction,...parsed,
  seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,sourceRevision:'sha256:'+SKTT_RU_SHA,
  editorialSourceRevision:'CONTENT_DRAFTS_RU_EN.md#5/sktt/2026-10-03',sourceRuBodySha256:SKTT_RU_SHA,
  bodySha256:sha(parsed.bodyMarkdown),sourceFile,sourceFileSha256:sha(sourceBytes),
  sourceProvenance:{kind:'LOCAL_MODEL_TRANSLATION_DRAFT',sourceLanguage:'ru',sourceDate:'2026-10-03',
   sourceRuBodySha256:SKTT_RU_SHA,originalBodySha256:sha(parsed.bodyMarkdown),
   editorialFieldsSha256:SKTT_LOCAL_INPUT_PINS['EDITORIAL_FIELDS.json'],draftReadmeSha256:SKTT_LOCAL_INPUT_PINS['README.md'],
   independentModelReviewSha256:SKTT_LOCAL_INPUT_PINS['PEER_REVIEW.json'],rootSourceAcceptanceSha256:SKTT_ROOT_ACCEPTANCE_SHA,
   nativeReceipt:null,nativeSpeakerReview:false,legalVerification:false,browserReview:false},
  serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
  approval:{status:'LOCAL_MODEL_SEMANTIC_ACK_PENDING_RENDER_QA',independentModelSemanticReview:true,
   legalVerification:false,fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
 metadata.sourceEnvelopeSha256=metadataEnvelope(parsed.bodyMarkdown,metadata);
 const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=encoded(metadata);
 const payload={status:'translated',bodyFile:'registry-copy/'+stem+'.md',bodySha256:metadata.bodySha256,
  metadataFile,metadataSha256:sha(metaBytes),sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,
  sourceRevision:'sha256:'+SKTT_RU_SHA,complete:true,qa:'not_done',qaMethod:'supplied_model_semantic',
  qaEvidence:'Local model translation with pinned independent model semantic ACK; native/legal/rendered review not certified'};
 return {payload,metadata,pin:{...payload,direction,sourceFile,sourceFileSha256:metadata.sourceFileSha256},
  files:[{path:payload.bodyFile,text:parsed.bodyMarkdown,private:false},{path:metadataFile,text:metaBytes,private:false},
   {path:sourceFile,text:sourceBytes,private:true}]};
}
export function planSkttLocalEditorialImport(registry,inputsByLocale,{metadataEnvelope}={}){
 assert.ok(registry&&Array.isArray(registry.records));
 assert.ok(inputsByLocale instanceof Map);assert.deepEqual([...inputsByLocale.keys()],SKTT_LOCAL_LOCALES);
 const matches=registry.records.filter(row=>row.contentId==='sktt');assert.equal(matches.length,1);
 const oldRecord=matches[0];assert.equal(sha(encoded(oldRecord)),SKTT_NATIVE_RECORD_SHA,'Retained native-eight record drift');
 const record=structuredClone(oldRecord),locales={},files=[];
 assert.deepEqual(Object.keys(record.candidate.translations),SKTT_LOCALES.filter(code=>code!=='ru'));
 for(const locale of SKTT_LOCAL_LOCALES){
  assert.equal(Object.hasOwn(record.candidate.translations,locale),false);
  const result=skttLocalProjection(locale,inputsByLocale.get(locale),{metadataEnvelope});
  assert.equal(registry.locales.find(row=>row.code===locale)?.dir,result.pin.direction);
  record.candidate.translations[locale]=result.payload;locales[locale]=result.pin;files.push(...result.files);
 }
 const manifest={schemaVersion:1,fullPayloadKind:'SKTT_MIXED_SOURCE_TEN_LOCALE_PREVIEW_V1',
  sourceMode:'NATIVE_EIGHT_PLUS_EXPLICIT_LOCAL_TWO',nativeSourceManifestSha256:SKTT_NATIVE_MANIFEST_SHA,
  retainedNativeRecordSha256:SKTT_NATIVE_RECORD_SHA,sourceRevision:'sha256:'+SKTT_RU_SHA,
  nativeReceivedLocales:[...SKTT_LOCALES],localModelLocales:[...SKTT_LOCAL_LOCALES],missingLocales:[],
  fullTenLocaleSourceComplete:true,sourceStage:'SOURCE_COMPLETE_PREVIEW_ONLY_NOT_PUBLICATION',
  rootSourceAcceptanceSha256:SKTT_ROOT_ACCEPTANCE_SHA,
  publicationGates:{ownerPublication:false,independentNativeReview:false,legalVerification:false,renderedReview:false},
  records:[{contentId:'sktt',canonicalPath:'/bali/documents/sktt/',locales,plannedRecordSha256:sha(encoded(record))}]};
 return {oldRecord,record,manifest,files,summary:{nativeReceivedLocales:8,localModelLocales:2,totalSourceLocales:10,
  fullTenLocaleSourceComplete:true,localOriginalsRequired:true,published:false,newServices:0,newPrices:0}};
}
