// Local16 protected component model. Publication is a separate Root overlay.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adjacentSha as sha} from '../../shared/scripts/adjacent-business-source.mjs';
import {encoded,HOSPITALITY_LOCAL_KIND,HOSPITALITY_LOCAL_MODE,HOSPITALITY_LOCAL_LOCALES,HOSPITALITY_COMPONENTS,
 assertHospitalityRetainedScope,hospitalityLocalOriginalsFromWire,hospitalityLocalProjection} from '../../shared/scripts/hospitality-local-editorial-source.mjs';
import {hospitalitySourceManifest} from './registry-hospitality-component-inputs.mjs';
import {hospitalityLocalManifest,readHospitalityLocalEditorialInput} from './registry-hospitality-local-editorial-inputs.mjs';
import {safeMarkdown,escapeHtml as escape,previewHref} from './registry-document.mjs';
const readPublic=file=>readFileSync(new URL('../../shared/content/'+file,import.meta.url));
function localPin(registry,component,locale,manifest){
 assert.ok(HOSPITALITY_COMPONENTS.includes(component)&&HOSPITALITY_LOCAL_LOCALES.includes(locale),'Unknown local hospitality variant');
 hospitalityLocalManifest(manifest);assertHospitalityRetainedScope(registry,hospitalitySourceManifest());
 const pin=manifest.variants.find(row=>row.component===component&&row.locale===locale);assert.ok(pin);return pin;
}
export function validateHospitalityLocalProjection(registry,component,locale,metadata,body,{manifest=hospitalityLocalManifest()}={}){
 const pin=localPin(registry,component,locale,manifest);
 assert.equal(typeof body,'string');assert.equal(sha(body),pin.bodySha256,'Hospitality local body drift');
 assert.equal(sha(encoded(metadata)),pin.metadataSha256,'Hospitality local metadata drift');
 assert.equal(metadata.fullPayloadKind,HOSPITALITY_LOCAL_KIND);assert.equal(metadata.sourceMode,HOSPITALITY_LOCAL_MODE);
 assert.equal(metadata.component,component);assert.equal(metadata.locale,locale);assert.equal(metadata.direction,locale==='ar'?'rtl':'ltr');
 assert.equal(metadata.sourceFile,pin.sourceFile);assert.equal(metadata.sourceFileSha256,pin.sourceFileSha256);
 assert.equal(metadata.sourceOnly,true);assert.equal(metadata.publicationAuthorized,false);assert.equal(metadata.registryAssignmentConfirmed,false);
 assert.equal(metadata.serviceId,null);assert.equal(metadata.pricingRef,null);assert.equal(metadata.sourceArticleSha256,null);
 assert.equal(metadata.sourceProvenance.nativeReceipt,null);assert.equal(metadata.sourceProvenance.nativeSpeakerReview,false);
 assert.equal(metadata.approval.legalVerification,false);assert.equal(metadata.approval.browserReview,false);
 assert.equal(body.split('\n')[0],'# '+metadata.title);assert.equal(metadata.faq.length,7);
 return pin;
}
export function validateHospitalityLocalOriginal(registry,component,locale,metadata,body,
 {manifest=hospitalityLocalManifest(),readSource=readHospitalityLocalEditorialInput}={}){
 const pin=validateHospitalityLocalProjection(registry,component,locale,metadata,body,{manifest});
 const raw=Buffer.from(readSource(pin.sourceFile));assert.equal(sha(raw),pin.sourceFileSha256,'Hospitality local private source bytes drift');
 const wire=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));assert.equal(raw.toString('utf8'),encoded(wire));
 const originals=hospitalityLocalOriginalsFromWire(wire,component,locale),actual=hospitalityLocalProjection(component,locale,originals);
 assert.equal(body,actual.item.customerBody);assert.deepEqual(metadata,actual.metadata);assert.deepEqual(pin,actual.pin);
 return pin;
}
export function buildHospitalityLocalComponent(registry,component,locale,
 {editorialPreview=false,targetHref=previewHref,readBody=readPublic,readMetadata=readPublic,readLocalSource=readHospitalityLocalEditorialInput}={}){
 if(!HOSPITALITY_COMPONENTS.includes(component)||!HOSPITALITY_LOCAL_LOCALES.includes(locale)||editorialPreview!==true||targetHref!==previewHref)return null;
 const manifest=hospitalityLocalManifest(),pin=localPin(registry,component,locale,manifest);
 const body=Buffer.from(readBody(pin.bodyFile)).toString('utf8'),rawMeta=Buffer.from(readMetadata(pin.metadataFile));
 assert.equal(sha(rawMeta),pin.metadataSha256,'Literal hospitality local metadata bytes drift');
 const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(rawMeta));assert.equal(rawMeta.toString('utf8'),encoded(metadata));
 validateHospitalityLocalOriginal(registry,component,locale,metadata,body,{manifest,readSource:readLocalSource});
 const heading='# '+metadata.title+'\n';assert.ok(body.startsWith(heading));
 const html='<h1>'+escape(metadata.title)+'</h1>'+safeMarkdown(body.slice(heading.length),{registry,locale,literalStrong:['zh-Hans','ja'].includes(locale),
  linkAliases:component==='restaurant'?[manifest.alias]:[],targetHref:previewHref,onUnmapped:()=>{throw Error('Unmapped hospitality local source link');}});
 return {contentId:'hospitality',component,locale,intentKey:manifest.components.find(row=>row.id===component).intentKey,
  sourceOnly:true,completeBroadIntent:false,publicationAuthorized:false,serviceId:null,pricingRef:null,
  title:metadata.title,seoTitle:metadata.seoTitleLiteral,description:metadata.metaDescriptionLiteral,
  ctaLabel:metadata.ctaLabelLiteral,customerBody:body,html,dir:metadata.direction,faq:structuredClone(metadata.faq),
  sourceArticleSha256:null,customerBodySha256:metadata.customerBodySha256};
}
