// Exact two-component Owner publication, not the full tourism/SPA hub.
// Body/source QA and private protected preview are not changed by this overlay.
import assert from 'node:assert/strict';
import nativeManifest from '../../shared/content/registry-hospitality-component-build.v1.json' with {type:'json'};
import localManifest from '../../shared/content/registry-hospitality-local-editorial-build.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-hospitality-editorial-public-build.v1.json' with {type:'json'};
import {adjacentSha as sha,prepareAdjacentBusinessSources} from '../../shared/scripts/adjacent-business-source.mjs';
import {encoded,HOSPITALITY_COMPONENTS,HOSPITALITY_LOCAL_LOCALES,assertHospitalityRetainedScope} from '../../shared/scripts/hospitality-local-editorial-source.mjs';
import {HOSPITALITY_LOCAL_SOURCE_ANCHOR,readHospitalityLocalEditorialInput} from './registry-hospitality-local-editorial-inputs.mjs';
import {HOSPITALITY_SOURCE_ANCHOR,readHospitalityEditorialInput} from './registry-hospitality-component-inputs.mjs';
import {validateHospitalityLocalOriginal,validateHospitalityLocalProjection} from './registry-hospitality-local-editorial-preview.mjs';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import {PUBLIC_LOCALES,validateRegistry} from '../../shared/src/service-registry.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {publicRegistryContentVersion} from '../src/lib/public-content-version.mjs';
import {editorialVerificationContract,PRIVATE_ORIGINALS} from './registry-editorial-verification-contract.mjs';
import {languageChoices} from './registry-language.mjs';
import {safeMarkdown,escapeHtml as escape,previewHref} from './registry-document.mjs';
export const HOSPITALITY_PUBLIC_ANCHOR='cd6e5b51db1750b73d198d1e87e78a6e73b8a8427bafb8679bff5442fcb67f0d';
function anchors({native=nativeManifest,local=localManifest,publicGrant=grant}={}){
 assert.equal(sha(encoded(native)),HOSPITALITY_SOURCE_ANCHOR,'Hospitality native manifest drift');
 assert.equal(sha(encoded(local)),HOSPITALITY_LOCAL_SOURCE_ANCHOR,'Hospitality local manifest drift');
 assert.equal(sha(encoded(publicGrant)),HOSPITALITY_PUBLIC_ANCHOR,'Hospitality publication grant drift');
 assert.equal(publicGrant.authority.publisher,'Founder');assert.equal(publicGrant.authority.decisionDate,'2026-10-22');
 assert.equal(publicGrant.authority.scope,'PUBLIC_HOSPITALITY_TWO_COMPONENTS_EXISTING_IDENTITY_TEN_LOCALES_NO_QA_PROMOTION');
 assert.deepEqual(publicGrant.sourceManifestSha256,{nativeFour:HOSPITALITY_SOURCE_ANCHOR,localSixteen:HOSPITALITY_LOCAL_SOURCE_ANCHOR});
 assert.deepEqual(publicGrant.sourceScope.components,HOSPITALITY_COMPONENTS);
 assert.equal(publicGrant.sourceScope.completeBroadTourismSpaIntent,false);assert.equal(publicGrant.sourceScope.sourceQaPromoted,false);
 assert.equal(native.publicationAuthorized,false);assert.equal(local.publicationAuthorized,false);
 assert.equal(publicGrant.records.length,1);const approved=publicGrant.records[0];
 assert.equal(approved.contentId,'hospitality');assert.equal(approved.canonicalPath,'/bali/business/hospitality-licenses/');
 assert.equal(approved.sourceRevision,'2026-10-10');assert.equal(approved.serviceId,null);assert.equal(approved.pricingRef,null);
 assert.deepEqual(Object.keys(approved.locales),PUBLIC_LOCALES);return {native,local,publicGrant,approved};
}
function scope(registry,options){
 const state=anchors(options);validateRegistry(registry);const record=assertHospitalityRetainedScope(registry,state.native);
 assert.equal(sha(encoded(record)),state.publicGrant.recordSha256);return {...state,record};
}
export function hospitalityBodyFaq(body){
 const lines=body.split('\n'),faq=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('### ')){
  let end=i+1;while(end<lines.length&&!/^#{1,3} /.test(lines[end]))end++;
  const answerMarkdown=lines.slice(i+1,end).join('\n').trim();assert.ok(answerMarkdown);
  faq.push({question:lines[i].slice(4),answerMarkdown});
 }
 assert.equal(faq.length,7,'Exactly supplied seven component FAQs required');return faq;
}
export function hospitalityNativeCustomerMetadata(component,locale,body,metadata,pin){
 // Explicit allowlist: native transport IDs, raw headers and proposed standalone
 // routes from original metadata never enter the public derivative.
 const fields=Object.fromEntries(['title','seoTitleLiteral','metaDescriptionLiteral','ctaLabelLiteral','h2','bullets','steps','tables'].map(key=>[key,metadata[key]]));
 return {schemaVersion:1,fullPayloadKind:'HOSPITALITY_NATIVE_CUSTOMER_COMPONENT_PROJECTION_V1',registryContentId:'hospitality',
  canonicalPath:'/bali/business/hospitality-licenses/',component,locale,direction:'ltr',sourceRevision:'2026-10-10',
  sourceOnly:true,completeBroadIntent:false,registryAssignmentConfirmed:false,publicationAuthorized:false,serviceId:null,pricingRef:null,
  ...fields,faq:hospitalityBodyFaq(body),customerBodySha256:sha(body),sourceArticleSha256:pin.sourceArticleSha256,
  sourceOriginalMetadataSha256:pin.metadataSha256,sourceProvenance:{kind:'RETAINED_ASSISTANT_CUSTOMER_COPY_PROJECTION',
   nativeSpeakerReview:false,legalVerification:false,browserReview:false}};
}
function nativeOriginals(state,reader){
 const responses=Object.fromEntries(state.native.sourcePackets.map(pin=>{const bytes=Buffer.from(reader(pin.file));assert.equal(sha(bytes),pin.sha256,'Hospitality native private bytes drift');return [pin.key,bytes];}));
 const actual=prepareAdjacentBusinessSources(responses);assert.equal(actual.articles.length,4);
 for(const article of actual.articles){
  const pin=state.native.variants.find(row=>row.component===article.artifactKey&&row.locale===article.locale);assert.ok(pin);
  assert.equal(sha(article.customerBody),pin.customerBodySha256);assert.equal(sha(article.sourceArticle),pin.sourceArticleSha256);
  assert.equal(sha(encoded(article.metadata)),pin.metadataSha256);
 }
 return actual.articles;
}
function componentData(registry,locale,pin,state,{readContent,readLocalSource},originals,articles){
 const bodyBytes=Buffer.from(readContent(pin.bodyFile)),metaBytes=Buffer.from(readContent(pin.metadataFile));
 assert.equal(sha(bodyBytes),pin.bodySha256,'Hospitality public body bytes drift');
 assert.equal(sha(metaBytes),pin.metadataSha256,'Hospitality public metadata bytes drift');
 const body=new TextDecoder('utf-8',{fatal:true}).decode(bodyBytes),metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metaBytes));
 assert.equal(metaBytes.toString('utf8'),encoded(metadata),'Canonical hospitality metadata bytes required');
 assert.ok(body.startsWith('# '+metadata.title+'\n'));assert.deepEqual(metadata.faq,hospitalityBodyFaq(body));
 assert.equal(metadata.publicationAuthorized,false);assert.equal(metadata.sourceOnly,true);assert.equal(metadata.completeBroadIntent,false);
 assert.equal(metadata.serviceId,null);assert.equal(metadata.pricingRef,null);assert.equal(metadata.registryAssignmentConfirmed,false);
 if(HOSPITALITY_LOCAL_LOCALES.includes(locale)){
  const source=state.local.variants.find(row=>row.component===pin.component&&row.locale===locale);assert.ok(source);
  for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceFile','sourceFileSha256'])assert.equal(pin[key],source[key]);
  assert.equal(pin.sourceKind,'LOCAL_MODEL_TRANSLATION_V1');
  (originals?validateHospitalityLocalOriginal:validateHospitalityLocalProjection)(registry,pin.component,locale,metadata,body,
   originals?{readSource:readLocalSource}:{});
 }else{
  assert.ok(['ru','en'].includes(locale));assert.equal(pin.sourceKind,'RETAINED_ASSISTANT_CUSTOMER_COPY_PROJECTION');
  const source=state.native.variants.find(row=>row.component===pin.component&&row.locale===locale);assert.ok(source);
  assert.equal(pin.bodySha256,source.customerBodySha256);assert.equal(pin.sourceArticleSha256,source.sourceArticleSha256);
  assert.equal(pin.sourceOriginalMetadataSha256,source.metadataSha256);
  assert.equal(metadata.fullPayloadKind,'HOSPITALITY_NATIVE_CUSTOMER_COMPONENT_PROJECTION_V1');
  assert.deepEqual(metadata.sourceProvenance,{kind:'RETAINED_ASSISTANT_CUSTOMER_COPY_PROJECTION',nativeSpeakerReview:false,legalVerification:false,browserReview:false});
  if(originals){
   const article=articles.find(row=>row.artifactKey===pin.component&&row.locale===locale);assert.ok(article);
   assert.equal(body,article.customerBody);assert.deepEqual(metadata,hospitalityNativeCustomerMetadata(pin.component,locale,body,article.metadata,source));
  }
 }
 return {pin,body,metadata};
}
function composition(state,locale){
 const p=state.approved.locales[locale];assert.ok(p,'Unknown hospitality locale');
 assert.deepEqual(p.components.map(row=>row.component),HOSPITALITY_COMPONENTS);
 assert.equal(p.compositionKind,'HOSPITALITY_TWO_COMPONENTS_V1');
 assert.equal(p.bodySha256,sha(encoded(p.components.map(row=>({component:row.component,bodySha256:row.bodySha256})))));
 assert.equal(p.metadataSha256,sha(encoded({title:p.title,seoTitle:p.seoTitle,description:p.description,
  components:p.components.map(row=>({component:row.component,metadataSha256:row.metadataSha256}))})));
 const bindings=['ru','en'].includes(locale)?state.native.sourcePackets.map(({file,sha256})=>({file,sha256})):
  p.components.map(row=>({file:row.sourceFile,sha256:row.sourceFileSha256}));
 assert.equal(p.sourceEnvelopeSha256,sha(encoded(bindings)));return p;
}
function entryFor(state,locale){
 const p=composition(state,locale);
 return {contentId:'hospitality',locale,dir:p.direction,route:p.route,canonicalPath:state.approved.canonicalPath,
  sourceRevision:state.approved.sourceRevision,bodySha256:p.bodySha256,metadataSha256:p.metadataSha256,
  sourceEnvelopeSha256:p.sourceEnvelopeSha256,serviceId:null,pricingRef:null,title:p.title,seoTitle:p.seoTitle,description:p.description,
  indexable:true,lastModified:state.approved.publication.lastModified,ownerApprovedHospitalityEditorial:true,
  componentScope:[...HOSPITALITY_COMPONENTS],completeBroadIntent:false};
}
export function validateHospitalityPublicEntry(registry,locale,entry,{asOf='2026-10-22',...options}={}){
 const state=scope(registry,options),expected=entryFor(state,locale),p=state.approved.locales[locale];
 for(const [key,value]of Object.entries(expected))assert.deepEqual(entry?.[key],value,'Hospitality public entry '+key+' drift');
 const language=registry.locales.find(row=>row.code===locale);assert.equal(p.direction,language.dir);
 assert.equal(p.route,language.prefix+state.approved.canonicalPath);
 assert.equal(publicRegistryContentVersion(entry),p.publicSourceVersion,'Hospitality public source version drift');
 return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',requiresSources:true,hasSubstantialContent:true,
  locale,availableLocales:PUBLIC_LOCALES,contentVersion:p.contentVersion,lastModified:state.approved.publication.lastModified,
  ownerApproval:{authority:'founder',approvedAt:state.publicGrant.authority.decisionDate,contentVersion:p.contentVersion}},{asOf});
}
function validateBuild(registry,{readContent=readEditorialInput,readNativeSource=readHospitalityEditorialInput,
 readLocalSource=readHospitalityLocalEditorialInput,...options}={},originals){
 const state=scope(registry,options),articles=originals?nativeOriginals(state,readNativeSource):null;
 return PUBLIC_LOCALES.map(locale=>{
  const pin=composition(state,locale);
  for(const component of pin.components)componentData(registry,locale,component,state,{readContent,readLocalSource},originals,articles);
  const entry=entryFor(state,locale);assert.equal(validateHospitalityPublicEntry(registry,locale,entry,options).indexable,true);return entry;
 });
}
export const validateHospitalityPublicOriginals=(registry,options)=>validateBuild(registry,options,true);
export const validateHospitalityPublicDerivative=(registry,options)=>validateBuild(registry,options,false);
const crumb={ru:'Навигация',en:'Breadcrumbs','zh-Hans':'路径导航',ko:'경로',fr:'Fil d’Ariane',de:'Seitennavigation',ja:'パンくずリスト',hi:'नेविगेशन',es:'Ruta de navegación',ar:'التنقل'};
export function buildHospitalityPublicModel(registry,entry,{targetHref,readContent=readEditorialInput,
 readNativeSource=readHospitalityEditorialInput,readLocalSource=readHospitalityLocalEditorialInput,contract=editorialVerificationContract()}={}){
 assert.equal(typeof targetHref,'function','Explicit public target resolver required');assert.notEqual(targetHref,previewHref);
 assert.equal(validateHospitalityPublicEntry(registry,entry?.locale,entry).indexable,true);
 const state=scope(registry),p=composition(state,entry.locale),originals=editorialVerificationContract(contract)===PRIVATE_ORIGINALS;
 const articles=originals?nativeOriginals(state,readNativeSource):null;
 const components=p.components.map(pin=>componentData(registry,entry.locale,pin,state,{readContent,readLocalSource},originals,articles));
 const sections=components.map(({pin,body,metadata})=>{
  const firstLine=body.indexOf('\n');assert.equal(body.slice(0,firstLine),'# '+metadata.title);
  // Keep all body words. The sole page H1 is neutral; component H1 becomes its
  // section H2 and the exact supplied nested headings shift one level.
  const html=safeMarkdown(body.slice(firstLine+1),{registry,locale:entry.locale,targetHref,
   literalStrong:['zh-Hans','ja'].includes(entry.locale),linkAliases:pin.component==='restaurant'?[state.native.alias]:[],
   onUnmapped:()=>{throw Error('Unmapped hospitality public link');}}).replace(/<(\/?)h([23])>/g,(_,close,level)=>'<'+close+'h'+(Number(level)+1)+'>');
  return {id:'hospitality-'+pin.component,heading:metadata.title,html,faq:false};
 });
 const faqSchema=components.flatMap(row=>row.metadata.faq.map(item=>{const answer=item.answerMarkdown.replace(/\*\*/g,'');return {
  question:item.question,questionTemplate:item.question,answer,answerTemplate:answer};}));
 return {contentId:'hospitality',locale:entry.locale,dir:entry.dir,commercial:false,title:p.title,titleHtml:escape(p.title),
  seoTitle:p.seoTitle,description:p.description,introHtml:'',directHtml:'<p>'+escape(p.description)+'</p>',factHtml:'',factHeading:'',
  sections,languages:languageChoices.map(([code,short,label])=>({code,short,label,href:targetHref('hospitality',code)})),wideFacts:false,related:[],relatedLabel:'',breadcrumbLabel:crumb[entry.locale],managerLabel:components[0].metadata.ctaLabelLiteral,
  ctaActions:components.map(row=>({label:row.metadata.ctaLabelLiteral,href:null,manager:true,intent:'manager_inquiry'})),
  faqSchema,price:null,priceUnit:null,familyApplicabilityNote:null,seoPriceTemplate:null,seoTitlePriceTemplate:null,
  componentScope:[...HOSPITALITY_COMPONENTS],completeBroadIntent:false,
  diagnostics:{sourceRevision:entry.sourceRevision,sourceKinds:'RETAINED_ASSISTANT4_PLUS_LOCAL_MODEL16',sourceQaPromoted:false}};
}
