// Finite local16 source projection. Pure data functions: no CLI, filesystem,
// network, native identity, legal certification, Registry mutation or publication.
import assert from 'node:assert/strict';
import {adjacentSha as sha} from './adjacent-business-source.mjs';
export const encoded=value=>JSON.stringify(value,null,2)+'\n';
export const HOSPITALITY_LOCAL_KIND='HOSPITALITY_LOCAL_MODEL_COMPONENTS_SIXTEEN_V1';
export const HOSPITALITY_LOCAL_MODE='LOCAL_MODEL_TRANSLATION_V1';
export const HOSPITALITY_LOCAL_LOCALES=Object.freeze(['zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const HOSPITALITY_COMPONENTS=Object.freeze(['accommodation','restaurant']);
export const HOSPITALITY_NATIVE_MANIFEST_SHA='e4adfe16faa1d835ff9b3158322da9bc28f9a1bdccdb5d0ba540d75b73e4b2ca';
export const HOSPITALITY_RECORD_SHA='1cb196b771b0fc872f05c4429dc4614532195357e66f6ec56070d738e8b3dc64';
export const HOSPITALITY_INTENTS_SHA='943f2860d2a05ebd29b60eef30695fdb9035bfa6deb3524182a6895d8a5a5a36';
export const HOSPITALITY_PEER_SHA='631ca67e4f26beaf33c06cfd04ebd036147cd59ff308738309a05207da71abf3';
export const HOSPITALITY_ROOT_ACCEPTANCE_SHA='7f75589c0d0ea102db09958dacb4a1057af5d2f5f65d99132670f96a7c0a468e';
export const HOSPITALITY_RU_SHA=Object.freeze({accommodation:'ebcf9cc030100e2c0c70b78fc138d6cf7ad954ea1b6eb7a4d1f46eee85ecfa81',restaurant:'229a236d5b18d4c283d8ef1e5c6426d675a281437b1670aa5d8fb12d401c19e2'});
export const HOSPITALITY_FIELDS_SHA=Object.freeze({accommodation:'f8d0cb027110859268612317d38d7195448e2b0916328652af9a120ef0d4d65b',restaurant:'6a984dc322edf4a2df536c1489dc61be10394a5dc298603281490732fc2b1771'});
export const HOSPITALITY_BODY_SHA=Object.freeze({
 accommodation:Object.freeze({'zh-Hans':'8bb4654390c30ac32ffc1d50b399fd2df4828061a539d99330420d9e27f25e63',ko:'fb4976ddecbdc7462bd1b13d2dcef9d041a8194006460285cf96e14372f66507',fr:'8bab0b49ff98261872098af0396d1f970076c9b8ef30581f707744922e10a3ed',de:'0d6b8c09b0c4d04db0c2a2dae67b4a5621867b903a6b89cba693557ce079172b',ja:'e954b1d5e23742e93d73ce92d962be8bbaa5b6f0e6ce2982ef8204bc89f1b51e',hi:'36b2bab293cfd0c723c88f8df43b80ea8bb21206a2acf77f12b216ea7e87e306',es:'d88171d9e0172bd6b3a863a16a4b8470ed5b42b17346357969ea27687f7d3150',ar:'a71bfd4cc6383146ff95c0a17ddd55e9212ad96c683e8a3f955771deb30bfe44'}),
 restaurant:Object.freeze({'zh-Hans':'8ee19465f965171519b59f272f0fbb965300ee0037dafc1adcbbfed2da8519d8',ko:'b61a138adebba35399932d685ef4b4b4300670c85a24d2dc9bd8d19636611674',fr:'bad6aebbf90bd09ddb15e3b98a4c183111c8ad6c307e3edc47b39ad4054e228a',de:'662e4be644e6967b7cf3efb12d60279fc32512eec8e5708b6aaf378033b06cc2',ja:'a17c3cbf632eb176c93dadb27e647cccf6c9095c6d7abeeb10b1779adc30c6f0',hi:'117a65285b8c525434a81493479feeacf55ab8b1c9cc0e418a81cc16129980a6',es:'af02b74af41ecec173dd23e52780fdfe901236525037928711bbc47767885307',ar:'acee3f7d5ea8b413139c33b0334565035ba9e8c8b4627ccf5ce82834a4a2910f'})
});
const keys=(value,wanted)=>assert.deepEqual(Object.keys(value??{}),wanted,'Exact local source shape required');
export function hospitalityLocalStem(component,locale){
 assert.ok(HOSPITALITY_COMPONENTS.includes(component)&&HOSPITALITY_LOCAL_LOCALES.includes(locale),'Unbound local hospitality variant');
 return 'hospitality_'+component+'_'+locale.toLowerCase().replaceAll('-','_')+'_local_model_20261022';
}
export function assertHospitalityRetainedScope(registry,nativeManifest){
 assert.equal(sha(encoded(nativeManifest)),HOSPITALITY_NATIVE_MANIFEST_SHA,'Retained native hospitality manifest drift');
 const records=registry.records.filter(row=>row.contentId==='hospitality');assert.equal(records.length,1);
 assert.equal(sha(encoded(records[0])),HOSPITALITY_RECORD_SHA,'Retained hospitality record drift');
 assert.ok(!registry.records.some(row=>['accommodation','restaurant','bali_accommodation_licenses','bali_restaurant_licenses'].includes(row.contentId)),'Separate hospitality identity refused');
 const intents=registry.routingPlan?.bali.filter(row=>row.contentId==='hospitality');
 assert.equal(sha(encoded(intents)),HOSPITALITY_INTENTS_SHA,'Retained hospitality intents drift');
 assert.equal(registry.records.find(row=>row.contentId==='nib_oss')?.candidate.route,'/bali/business/nib-oss/','OSS canonical identity drift');
 for(const locale of ['ru','en',...HOSPITALITY_LOCAL_LOCALES])assert.equal(registry.locales.find(row=>row.code===locale)?.dir,locale==='ar'?'rtl':'ltr','Hospitality locale direction drift');
 return records[0];
}
function pinnedText(bytes,pin){
 assert.ok(Buffer.isBuffer(bytes),'Exact local original bytes required');assert.equal(sha(bytes),pin,'Local hospitality original drift');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);assert.ok(text.isWellFormed()&&!text.includes('\0'));return text;
}
export function parseHospitalityLocalOriginals(component,locale,inputs){
 hospitalityLocalStem(component,locale);assert.ok(inputs instanceof Map);
 const expected=[locale+'.md','EDITORIAL_FIELDS.json','PEER_REVIEW.json','ROOT_ACCEPTANCE.json'];
 assert.deepEqual([...inputs.keys()].sort(),[...expected].sort(),'Exact four local original inputs required');
 const body=pinnedText(inputs.get(locale+'.md'),HOSPITALITY_BODY_SHA[component][locale]);
 const fields=JSON.parse(pinnedText(inputs.get('EDITORIAL_FIELDS.json'),HOSPITALITY_FIELDS_SHA[component]));
 const peer=JSON.parse(pinnedText(inputs.get('PEER_REVIEW.json'),HOSPITALITY_PEER_SHA));
 const root=JSON.parse(pinnedText(inputs.get('ROOT_ACCEPTANCE.json'),HOSPITALITY_ROOT_ACCEPTANCE_SHA));
 assert.equal(root.schema,'safr.hospitality.local16.root-source-acceptance.v1');
 assert.equal(root.status,'ROOT_ACCEPTED_LOCAL_MODEL_SOURCE16_NOT_INTEGRATED_OR_PUBLISHED');
 assert.equal(root.contentId,'hospitality');assert.equal(root.existingCanonicalPath,'/bali/business/hospitality-licenses/');
 assert.deepEqual(root.components,HOSPITALITY_COMPONENTS);assert.deepEqual(root.acceptedLocales,HOSPITALITY_LOCAL_LOCALES);
 assert.equal(root.translationMode,'NEW_LOCAL_MODEL_TRANSLATION_V1');assert.equal(root.peerReview.sha256,HOSPITALITY_PEER_SHA);
 assert.equal(root.sourceRuBodySha256[component],HOSPITALITY_RU_SHA[component]);
 assert.equal(root.sourcePacketGrantsPublication,false);assert.equal(root.nativeLegalBrowserRenderedReview,'NOT_RUN');
 assert.equal(peer.status,'BOUNDED_ACK');assert.deepEqual(peer.findingCounts,{P1:0,P2:0});
 assert.equal(peer.qualifications.nativeSpeakerReview,'NOT_REVIEWED');assert.equal(peer.qualifications.legalReview,'NOT_REVIEWED');
 assert.equal(peer.qualifications.browserAndRenderingReview,'NOT_REVIEWED');
 assert.equal(fields.componentId,component);assert.equal(fields.sourceMode,'REUSE_EXACT_ACCEPTED_RU_SOURCE_NOT_NEW_LAW_RESEARCH');
 assert.equal(fields.publicationAuthorized,false);assert.equal(fields.nativeSpeakerReview,'NOT_RUN');assert.equal(fields.legalReview,'NOT_RUN');
 const rows=component==='accommodation'?fields.locales:fields.translations;
 assert.deepEqual(rows.map(row=>row.locale),HOSPITALITY_LOCAL_LOCALES);
 assert.equal(component==='accommodation'?fields.sourceRuBodySha256:fields.sourceBodySha256,HOSPITALITY_RU_SHA[component]);
 const item=rows.find(row=>row.locale===locale);assert.equal(item.bodyFile,locale+'.md');assert.equal(item.bodySha256,sha(body));
 for(const [suffix,pin] of [[locale+'.md',HOSPITALITY_BODY_SHA[component][locale]],['EDITORIAL_FIELDS.json',HOSPITALITY_FIELDS_SHA[component]]])
  assert.equal(root.exactInputs.find(row=>row.component===component&&row.path.endsWith('/'+suffix))?.sha256,pin);
 const peerPacket=peer.packets.find(packet=>packet.component===component);assert.ok(peerPacket);
 assert.equal(peerPacket.reviews.find(row=>row.locale===locale)?.sha256,sha(body));
 assert.ok(body.endsWith('\n')&&!body.includes('\r'),'Exact UTF-8 LF body required');
 const lines=body.split('\n');assert.equal(lines.length,75);assert.equal(lines[0],'# '+item.title);
 const count=pattern=>lines.filter(line=>pattern.test(line)).length;
 assert.equal(count(/^# /),1);assert.equal(count(/^## /),9);assert.equal(count(/^### /),7);
 assert.equal(count(/^- /),6);assert.equal(count(/^\d+\. /),6);assert.equal(count(/^\|/),0);
 const links=[...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match=>match[1]);
 assert.deepEqual(links,component==='restaurant'?['/bali/business/oss-nib-licensing/']:[]);
 const required=component==='accommodation'?['KBLI 55','KBLI 2025','OSS/NIB','PBG/SLF','PT PMA']:['KBLI 2025','OSS/NIB','PBG','SLF','SLHS','PT PMA','BKPM № 5/2025'];
 for(const term of required)assert.ok(body.includes(term),'Required supplied hospitality reference absent');
 const faq=[50,53,56,59,62,65,68].map(index=>{
  assert.match(lines[index],/^### .+/);assert.ok(lines[index+1].trim()&&!/^#/.test(lines[index+1]));
  return {question:lines[index].slice(4),answerMarkdown:lines[index+1]};
 });
 for(const value of [item.title,item.seoTitle,item.description,item.cta])assert.ok(typeof value==='string'&&value.trim()&&!/[\r\n\u0000]/.test(value));
 return {customerBody:body,title:item.title,seoTitle:item.seoTitle,description:item.description,ctaLabel:item.cta,
  direction:locale==='ar'?'rtl':'ltr',faq,links};
}
export function hospitalityLocalSourceWire(component,locale,inputs){
 parseHospitalityLocalOriginals(component,locale,inputs);
 return {schemaVersion:1,sourceMode:HOSPITALITY_LOCAL_MODE,registryContentId:'hospitality',component,locale,
  originals:Object.fromEntries([locale+'.md','EDITORIAL_FIELDS.json','PEER_REVIEW.json','ROOT_ACCEPTANCE.json'].map(file=>[file,inputs.get(file).toString('utf8')]))};
}
export function hospitalityLocalOriginalsFromWire(wire,component,locale){
 keys(wire,['schemaVersion','sourceMode','registryContentId','component','locale','originals']);
 assert.equal(wire.schemaVersion,1);assert.equal(wire.sourceMode,HOSPITALITY_LOCAL_MODE);assert.equal(wire.registryContentId,'hospitality');
 assert.equal(wire.component,component);assert.equal(wire.locale,locale);
 assert.ok(wire.originals&&typeof wire.originals==='object'&&!Array.isArray(wire.originals));
 const inputs=new Map(Object.entries(wire.originals).map(([file,text])=>{assert.equal(typeof text,'string');return [file,Buffer.from(text,'utf8')];}));
 parseHospitalityLocalOriginals(component,locale,inputs);return inputs;
}
export function hospitalityLocalProjection(component,locale,inputs){
 const item=parseHospitalityLocalOriginals(component,locale,inputs),stem=hospitalityLocalStem(component,locale);
 const bodyFile='registry-copy/'+stem+'.md',metadataFile='registry-copy/'+stem+'.meta.json',sourceFile='registry-copy/'+stem+'.source.json';
 const sourceBytes=encoded(hospitalityLocalSourceWire(component,locale,inputs));
 const metadata={schemaVersion:1,fullPayloadKind:HOSPITALITY_LOCAL_KIND,sourceMode:HOSPITALITY_LOCAL_MODE,
  registryContentId:'hospitality',canonicalPath:'/bali/business/hospitality-licenses/',component,locale,direction:item.direction,
  sourceRevision:'2026-10-10',sourceRuBodySha256:HOSPITALITY_RU_SHA[component],nativeSourceManifestSha256:HOSPITALITY_NATIVE_MANIFEST_SHA,
  sourceOnly:true,completeBroadIntent:false,registryAssignmentConfirmed:false,publicationAuthorized:false,serviceId:null,pricingRef:null,
  title:item.title,seoTitleLiteral:item.seoTitle,metaDescriptionLiteral:item.description,ctaLabelLiteral:item.ctaLabel,
  h2:9,faq:item.faq,bullets:6,steps:6,tables:0,links:item.links,customerBodySha256:sha(item.customerBody),
  sourceArticleSha256:null,sourceFile,sourceFileSha256:sha(sourceBytes),
  sourceProvenance:{kind:HOSPITALITY_LOCAL_MODE,sourceLanguage:'ru',originalBodySha256:sha(item.customerBody),
   editorialFieldsSha256:HOSPITALITY_FIELDS_SHA[component],independentModelReviewSha256:HOSPITALITY_PEER_SHA,rootSourceAcceptanceSha256:HOSPITALITY_ROOT_ACCEPTANCE_SHA,
   nativeReceipt:null,nativeSpeakerReview:false,legalVerification:false,browserReview:false},
  approval:{status:'LOCAL_MODEL_SEMANTIC_ACK_PENDING_RENDER_QA',independentModelSemanticReview:true,nativeSpeakerReview:false,legalVerification:false,browserReview:false}};
 const metadataBytes=encoded(metadata),pin={component,locale,direction:item.direction,bodyFile,bodySha256:sha(item.customerBody),metadataFile,metadataSha256:sha(metadataBytes),
  sourceFile,sourceFileSha256:sha(sourceBytes),sourceRuBodySha256:HOSPITALITY_RU_SHA[component],title:item.title,seoTitle:item.seoTitle,description:item.description,ctaLabel:item.ctaLabel};
 return {item,metadata,pin,files:[{path:bodyFile,text:item.customerBody,private:false},{path:metadataFile,text:metadataBytes,private:false},{path:sourceFile,text:sourceBytes,private:true}]};
}
export function planHospitalityLocalEditorialImport(registry,inputsByVariant,nativeManifest){
 const record=assertHospitalityRetainedScope(registry,nativeManifest);assert.ok(inputsByVariant instanceof Map);
 assert.deepEqual([...inputsByVariant.keys()],HOSPITALITY_COMPONENTS.flatMap(component=>HOSPITALITY_LOCAL_LOCALES.map(locale=>component+'/'+locale)));
 const variants=[],files=[];
 for(const component of HOSPITALITY_COMPONENTS)for(const locale of HOSPITALITY_LOCAL_LOCALES){
  const result=hospitalityLocalProjection(component,locale,inputsByVariant.get(component+'/'+locale));variants.push(result.pin);files.push(...result.files);
 }
 const manifest={schemaVersion:1,kind:HOSPITALITY_LOCAL_KIND,sourceMode:HOSPITALITY_LOCAL_MODE,registryContentId:'hospitality',canonicalPath:'/bali/business/hospitality-licenses/',
  nativeSourceManifestSha256:HOSPITALITY_NATIVE_MANIFEST_SHA,recordSha256:HOSPITALITY_RECORD_SHA,intentRowsSha256:HOSPITALITY_INTENTS_SHA,
  nativeReceivedLocales:['ru','en'],localModelLocales:[...HOSPITALITY_LOCAL_LOCALES],receivedLocales:['ru','en',...HOSPITALITY_LOCAL_LOCALES],missingLocales:[],
  fullTenLocaleSourceComplete:true,sourceStage:'SOURCE_COMPLETE_PREVIEW_ONLY_NOT_PUBLICATION',sourceRevision:'2026-10-10',
  sourceRuBodySha256:{...HOSPITALITY_RU_SHA},independentModelReviewSha256:HOSPITALITY_PEER_SHA,rootSourceAcceptanceSha256:HOSPITALITY_ROOT_ACCEPTANCE_SHA,
  components:structuredClone(nativeManifest.components),alias:structuredClone(nativeManifest.alias),publicationAuthorized:false,registryAssignmentConfirmed:false,
  gates:{nativeLanguageReview:false,legalReview:false,renderedReview:false,commercialAvailability:false,publication:false},variants};
 return {retainedRecord:structuredClone(record),manifest,files,summary:{nativeVariants:4,localModelVariants:16,totalVariants:20,sourceLocales:10,registryChanged:false,published:false,newServices:0,newPrices:0}};
}
