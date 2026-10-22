import {publicSiteSourceEntries} from './public-site-source';
import {applyPublicTenLocaleOwnerIndexing} from './public-ten-locale-publication.mjs';
import {applyPublicBankOwnerIndexing} from './public-bank-owner-indexing.mjs';
import {applyPublicVietnamOwnerIndexing} from './public-vietnam-owner-indexing.mjs';
import {applyPublicHospitalityOwnerIndexing} from './public-hospitality-owner-indexing.mjs';
import {applyPublicSkttOwnerIndexing} from './public-sktt-owner-indexing.mjs';
import {PUBLIC_ROUTE_LOCALES,type PublicRouteLocale,localizedPublicRoute} from './public-locale';
import {languageChoices} from '../../scripts/registry-language.mjs';
let cache:ReturnType<typeof publicSiteSourceEntries>|undefined;
function entries(){
 if(!cache)cache=publicSiteSourceEntries().map(source=>({...source,page:source.kind==='registry'&&source.page.contentId==='hospitality'?
  applyPublicHospitalityOwnerIndexing(source.kind,source.page,source.locale):source.kind==='registry'&&source.page.contentId==='sktt'?
  applyPublicSkttOwnerIndexing(source.kind,source.page,source.locale):source.kind==='registry'&&source.page.contentId==='vietnam'?
  applyPublicVietnamOwnerIndexing(source.kind,source.page,source.locale):source.kind==='registry'&&source.page.contentId==='bank'?
  applyPublicBankOwnerIndexing(source.kind,source.page,source.locale):applyPublicTenLocaleOwnerIndexing(source.kind,source.page,source.locale)}));
 return cache;
}
export function publicSiteEntries(){return entries().map(row=>({...row,page:JSON.parse(JSON.stringify(row.page))}));}
export function publicSitePageForRoute(route:string){
 const row=entries().find(x=>x.route===route);if(!row)throw Error('Unknown positive public route');
 return {...row,page:JSON.parse(JSON.stringify(row.page))};
}
export function publicSiteAlternates(route:string){
 const own=entries().find(row=>row.route===route);if(!own)return[];
 const same=entries().filter(row=>row.sourceRoute===own.sourceRoute);
 const values=same.map(row=>({locale:row.locale,href:row.route}));
 const ru=same.find(row=>row.locale==='ru');
 return ru?[...values,{locale:'x-default',href:ru.route}]:values;
}
export function publicSiteLanguageChoices(route:string){
 const alternates=publicSiteAlternates(route);
 return languageChoices.flatMap(([code,short,label])=>{
  const actual=alternates.find(row=>row.locale===code);return actual?[{code,short,label,href:actual.href}]:[];
 });
}
const countryWorlds=[['ID','bali'],['TH','thailand'],['RU','russia'],['NP','nepal'],['AE','uae']] as const;
export function publicSiteCountryRoutes(locale:PublicRouteLocale){
 if(!PUBLIC_ROUTE_LOCALES.includes(locale))throw Error('Unknown public country locale');
 const positive=new Set(entries().map(row=>row.route));
 return countryWorlds.map(([code,world])=>{const href=localizedPublicRoute('/'+world+'/',locale);return{code,href:positive.has(href)?href:null};});
}
export function publicSiteLegacyPages(locale:PublicRouteLocale){
 if(!PUBLIC_ROUTE_LOCALES.includes(locale))throw Error('Unknown public page locale');
 return publicSiteEntries().filter(row=>row.kind==='legacy'&&row.locale===locale).map(row=>row.page);
}
