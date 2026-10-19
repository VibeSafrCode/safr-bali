import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {CLIENT_CATALOG_SPLIT_PINS as pins} from './generated/client-catalog-split-pins';
import {CLIENT_CATALOG_LOCALES,CLIENT_CATALOG_RUNTIME_BYTES,CLIENT_CATALOG_RUNTIME_SHA256,type ClientVisaId,type ClientVisaArticle} from './client-catalog-model';
import {guard,same,frozen,isClientCatalogLocale} from './client-catalog-integrity';
import {decodeClientCatalogPinnedJson} from './client-catalog-pinned-json';

// Keep the define literal at the import site: a cross-module constant can be
// folded after chunk discovery and leave orphan Main article files in Yoga.
const loaders=(typeof __YOGA_MINI_APP__!=='undefined'&&__YOGA_MINI_APP__===true)?null:{
  e33g:()=>import('../../../shared/content/generated/client-catalog/e33g.v1.json'),
  d12:()=>import('../../../shared/content/generated/client-catalog/d12.v1.json'),
  'd1-d2':()=>import('../../../shared/content/generated/client-catalog/d1-d2.v1.json'),
  c1:()=>import('../../../shared/content/generated/client-catalog/c1.v1.json'),
  voa:()=>import('../../../shared/content/generated/client-catalog/voa.v1.json'),
};
export function requireClientVisaId(value:unknown):ClientVisaId{
  guard(typeof value==='string'&&Object.hasOwn(pins.visas,value),'CLIENT_CATALOG_UNKNOWN_VISA');return value as ClientVisaId;
}
/** A payload is accepted only against its generated external pin, never its own hash. */
export function createClientVisaPackLookup(input:unknown,visaId:unknown){
  const id=requireClientVisaId(visaId),pin=pins.visas[id],data=decodeClientCatalogPinnedJson(input,pin);
  guard(same(Object.keys(data),['schemaVersion','domain','source','visaId','contentId','locales','articles'])&&
    data.schemaVersion===1&&data.domain==='client-visa-pack'&&data.visaId===id&&data.contentId===pin.contentId&&
    same(data.source,{bytes:CLIENT_CATALOG_RUNTIME_BYTES,sha256:CLIENT_CATALOG_RUNTIME_SHA256})&&
    same(data.locales,CLIENT_CATALOG_LOCALES)&&Array.isArray(data.articles)&&data.articles.length===10,'CLIENT_VISA_PACK_SCHEMA');
  guard(same(data.articles.map((a:ClientVisaArticle)=>a.locale),CLIENT_CATALOG_LOCALES),'CLIENT_VISA_PACK_LOCALES');
  for(const a of data.articles)guard(a.contentId===pin.contentId&&isClientCatalogLocale(a.locale)&&a.dir===(a.locale==='ar'?'rtl':'ltr')&&typeof a.title==='string'&&a.title.length>0&&typeof a.bodyMarkdown==='string'&&a.bodyMarkdown.length>0&&/^[a-f0-9]{64}$/.test(a.bodySha256)&&/^[a-f0-9]{64}$/.test(a.metadataSha256)&&Array.isArray(a.sections)&&(a.faqSchema===null||Array.isArray(a.faqSchema))&&['directHtml','introHtml','factHtml'].every(k=>typeof a[k]==='string'),'CLIENT_VISA_PACK_ARTICLE');
  frozen(data);
  const articles=new Map<string,ClientVisaArticle>(data.articles.map((a:ClientVisaArticle)=>[a.locale,a]));
  return Object.freeze({article(locale:unknown):ClientVisaArticle{guard(isClientCatalogLocale(locale),'CLIENT_CATALOG_UNKNOWN_LOCALE');return articles.get(locale)!;}});
}
type Pack=ReturnType<typeof createClientVisaPackLookup>;
// Content-only cache, keyed by fixed visa/revision, never actor/session or locale.
const loaded=new Map<ClientVisaId,Pack>(),pending=new Map<ClientVisaId,Promise<void>>();
export function loadClientVisaPack(visaId:unknown):Promise<void>{
  const id=requireClientVisaId(visaId);if(!loaders)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const hit=pending.get(id);if(hit)return hit;
  const promise=loaders[id]().then(module=>{const pack=createClientVisaPackLookup(JSON.stringify(module.default,null,2)+'\n',id);loaded.set(id,pack);});
  pending.set(id,promise);return promise;
}
export function clientLoadedVisaArticle(visaId:unknown,locale:unknown):ClientVisaArticle{
  const id=requireClientVisaId(visaId);guard(isClientCatalogLocale(locale),'CLIENT_CATALOG_UNKNOWN_LOCALE');
  if(YOGA_MINI_APP)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const pack=loaded.get(id);guard(pack,'CLIENT_VISA_PACK_NOT_LOADED');return pack.article(locale);
}
