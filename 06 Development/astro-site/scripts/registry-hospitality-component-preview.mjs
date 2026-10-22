// Protected source components, not a broad hospitality body or publication overlay.
import assert from 'node:assert/strict';
import {prepareAdjacentBusinessSources,adjacentSha} from '../../shared/scripts/adjacent-business-source.mjs';
import {hospitalitySourceManifest,readHospitalityEditorialInput} from './registry-hospitality-component-inputs.mjs';
import {safeMarkdown,escapeHtml as escape,previewHref} from './registry-document.mjs';
import {HOSPITALITY_LOCAL_LOCALES} from '../../shared/scripts/hospitality-local-editorial-source.mjs';
import {hospitalityLocalManifest} from './registry-hospitality-local-editorial-inputs.mjs';
import {buildHospitalityLocalComponent} from './registry-hospitality-local-editorial-preview.mjs';
const encoded=value=>JSON.stringify(value,null,2)+'\n';
export const HOSPITALITY_COMPONENT_LOCALES=Object.freeze(['ru','en',...HOSPITALITY_LOCAL_LOCALES]);
const locales=HOSPITALITY_COMPONENT_LOCALES,components=['accommodation','restaurant'];
export const isHospitalityComponentRecord=record=>record?.contentId==='hospitality';
const eligible=(component,locale)=>components.includes(component)&&locales.includes(locale);
function scope(registry,manifest){
  const matches=registry.records.filter(isHospitalityComponentRecord);
  assert.equal(matches.length,1,'One existing hospitality identity required');
  assert.ok(!registry.records.some(row=>['accommodation','restaurant','bali_accommodation_licenses','bali_restaurant_licenses'].includes(row.contentId)),
    'Unreviewed separate hospitality identity');
  assert.equal(adjacentSha(encoded(matches[0])),manifest.recordSha256,'Hospitality identity drift');
  const intents=registry.routingPlan?.bali.filter(row=>row.contentId==='hospitality');
  assert.equal(adjacentSha(encoded(intents)),manifest.intentRowsSha256,'Hospitality intent drift');
  assert.equal(registry.records.find(row=>row.contentId===manifest.alias.contentId)?.candidate.route,
    manifest.alias.resolvedCanonicalRoute,'OSS canonical identity drift');
  for(const locale of locales)assert.equal(registry.locales.find(row=>row.code===locale)?.dir,locale==='ar'?'rtl':'ltr');
}
export function hospitalityComponentHref(component,locale){
  return eligible(component,locale)?previewHref('hospitality',locale)+'&component='+component:null;
}
export function buildHospitalityComponent(registry,component,locale,
  {editorialPreview=false,targetHref=previewHref,readSource=readHospitalityEditorialInput,readLocalSource,readBody,readMetadata}={}){
  // Refuse before opening any original for unknown/missing locale or public use.
  if(!eligible(component,locale)||editorialPreview!==true||targetHref!==previewHref)return null;
  const manifest=hospitalitySourceManifest();scope(registry,manifest);
  if(HOSPITALITY_LOCAL_LOCALES.includes(locale))return buildHospitalityLocalComponent(registry,component,locale,
    {editorialPreview,targetHref,readLocalSource,readBody,readMetadata});
  const responses=Object.fromEntries(manifest.sourcePackets.map(pin=>[pin.key,Buffer.from(readSource(pin.file))]));
  const actual=prepareAdjacentBusinessSources(responses);
  assert.deepEqual(actual.receivedLocales,manifest.receivedLocales);
  for(const item of actual.articles){
    const pin=manifest.variants.find(row=>row.component===item.artifactKey&&row.locale===item.locale);
    assert.ok(pin,'Unbound hospitality component');
    assert.equal(adjacentSha(item.sourceArticle),pin.sourceArticleSha256);
    assert.equal(adjacentSha(item.customerBody),pin.customerBodySha256);
    assert.equal(adjacentSha(encoded(item.metadata)),pin.metadataSha256);
  }
  const item=actual.articles.find(row=>row.artifactKey===component&&row.locale===locale);
  assert.ok(item);
  const alias=manifest.alias;
  const heading='# '+item.metadata.title+'\n';
  assert.ok(item.customerBody.startsWith(heading),'Exact component H1 required');
  // Shared Markdown deliberately clamps headings to h2+. Its existing callers
  // render the supplied H1 separately; preserve the same rule for components.
  const html='<h1>'+escape(item.metadata.title)+'</h1>'+safeMarkdown(item.customerBody.slice(heading.length),
    {registry,locale,linkAliases:component==='restaurant'?[alias]:[],
      targetHref:previewHref,onUnmapped:()=>{throw Error('Unmapped hospitality source link');}});
  return {contentId:'hospitality',component,locale,intentKey:manifest.components.find(row=>row.id===component).intentKey,
    sourceOnly:true,completeBroadIntent:false,publicationAuthorized:false,serviceId:null,pricingRef:null,
    title:item.metadata.title,seoTitle:item.metadata.seoTitleLiteral,description:item.metadata.metaDescriptionLiteral,
    ctaLabel:item.metadata.ctaLabelLiteral,customerBody:item.customerBody,html,
    sourceArticleSha256:item.metadata.sourceArticleSha256,customerBodySha256:item.metadata.customerBodySha256};
}
function document(locale,title,description,body){
  return '<!doctype html><html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow">'+
    '<meta name="description" content="'+escape(description)+'"><title>'+escape(title)+'</title>'+
    '<style>body{font:16px/1.6 system-ui;max-width:1000px;margin:auto;padding:24px}a{color:#155c45}'+
    'nav{display:flex;gap:16px;flex-wrap:wrap}article{overflow-wrap:anywhere}'+
    ':focus-visible{outline:3px solid #155c45;outline-offset:3px}</style></head><body>'+
    '<aside id="preview-notice">'+(locale==='ru'?'Закрытый preview · Не опубликовано · Отправка заявок отключена':
      'Protected preview · Not published · Lead submissions disabled')+'</aside>'+body+'</body></html>';
}
export function renderHospitalityComponentIndex(registry,locale){
  if(!locales.includes(locale))return null;
  const manifest=hospitalitySourceManifest();scope(registry,manifest);
  const rows=components.map(component=>{
    const source=HOSPITALITY_LOCAL_LOCALES.includes(locale)?hospitalityLocalManifest():manifest;
    const pin=source.variants.find(row=>row.component===component&&row.locale===locale);assert.ok(pin);
    return '<li><a href="'+escape(hospitalityComponentHref(component,locale))+'">'+escape(pin.title)+'</a></li>';
  }).join('');
  return document(locale,'Hospitality · source components','',
    '<nav><a href="/_registry/?locale='+locale+'">Registry</a></nav><main><h1>'+
    escape(HOSPITALITY_LOCAL_LOCALES.includes(locale)?'Hospitality · source components':registry.records.find(isHospitalityComponentRecord).title)+'</h1><ul>'+rows+'</ul></main>');
}
export function renderHospitalityComponentPreview(registry,component,locale,options={}){
  const model=buildHospitalityComponent(registry,component,locale,{...options,editorialPreview:true});
  if(!model)return null;
  const languages=locales.map(code=>'<a href="'+escape(hospitalityComponentHref(component,code))+'" lang="'+code+'">'+code+'</a>').join('');
  return document(locale,model.seoTitle,model.description,
    '<nav><a href="'+escape(previewHref('hospitality',locale))+'">Registry</a>'+languages+'</nav>'+
    '<main><article>'+model.html+'</article><button type="button" disabled aria-describedby="preview-notice">'+
    escape(model.ctaLabel)+'</button></main>');
}
