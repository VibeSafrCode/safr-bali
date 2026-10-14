// Derived attribution/navigation, not new service identities or release authority.
import assert from 'node:assert/strict';
const countries={bali:['ID','Бали','Bali'],thailand:['TH','Таиланд','Thailand'],uae:['AE','ОАЭ','UAE'],nepal:['NP','Непал','Nepal'],russia:['RU','Россия','Russia'],japan:['JP','Япония','Japan'],singapore:['SG','Сингапур','Singapore'],india:['IN','Индия','India'],vietnam:['VN','Вьетнам','Vietnam'],australia:['AU','Австралия','Australia'],usa:['US','США','USA'],'south-korea':['KR','Южная Корея','South Korea'],'south-africa':['ZA','ЮАР','South Africa'],germany:['DE','Германия','Germany'],france:['FR','Франция','France'],italy:['IT','Италия','Italy'],spain:['ES','Испания','Spain']};
const labels={visa:['Визы','Visas'],business:['Бизнес','Business'],documents:['Документы','Documents'],knowledge:['Знания','Knowledge'],partners:['Партнёрам','Partners'],housing:['Жильё','Housing'],bikes:['Байки','Bikes'],insurance:['Страховки','Insurance'],exchange:['Обмен','Exchange'],assistant:['Ассистент','Assistant'],guides:['Гайды','Guides']};
const worldIds={'south_korea':'south-korea','south_africa':'south-africa'};
// Existing approved assets in src/lib/destination-worlds.ts. Destination
// identity is independent of whether a photographic backdrop exists yet.
const backdropWorlds=new Set(['bali','thailand','uae','nepal','russia','vietnam']);
export function buildRegistryPageContext(registry,contentId,locale,{route,targetHref=()=>null,countryLabel=null,sectionLabel=null}={}) {
  const record=registry.records.find(row=>row.contentId===contentId),language=registry.locales.find(row=>row.code===locale);
  assert.ok(record&&language,'Unknown page context identity/locale');
  const canonicalPath=record.candidate.route,actualPath=route??record.published?.routes[locale]??language.prefix+canonicalPath;
  assert.match(actualPath,/^\/(?:[a-z0-9-]+\/)*$/,'Unsafe context path');
  const parts=canonicalPath.split('/').filter(Boolean),chromeLocale=locale==='ru'?'ru':'en',labelIndex=chromeLocale==='ru'?1:2;
  const world=record.kind==='world_visa';
  const destinationSlug=world?(worldIds[contentId]??contentId):(countries[parts[0]]?parts[0]:null);
  const country=destinationSlug?countries[destinationSlug]:null;
  const destinationRegion=world&&contentId==='schengen'?'SCHENGEN':null;
  const section=world||parts[0]==='visas'?'visa':parts[0]==='partners'?'partners':parts.includes('knowledge')?'knowledge':
    ({visas:'visa',documents:'documents',business:'business'})[parts[1]]??parts[1]??null;
  const jurisdiction=country?.[0]??null;
  const breadcrumbs=[];
  // Only emitted targets become links. Candidate hubs never leak to public nav.
  if(country){const href=targetHref(destinationSlug,locale);if(href&&href!==actualPath)breadcrumbs.push({label:countryLabel?countryLabel(destinationSlug,locale):country[labelIndex],href,lang:locale});}
  const parent=record.parentId?registry.records.find(row=>row.contentId===record.parentId):null;
  const sectionParent=section==='visa'&&!world&&country?.[0]==='ID'?'visas_bali':section==='business'?'business':section==='documents'?'documents':null;
  if(sectionParent){const href=targetHref(sectionParent,locale);if(href&&href!==actualPath&&!breadcrumbs.some(row=>row.href===href))breadcrumbs.push({label:sectionLabel?sectionLabel(section,locale):labels[section][chromeLocale==='ru'?0:1],href,lang:locale});}
  else if(parent&&parent.contentId==='home'){const href=targetHref('home',locale);if(href)breadcrumbs.push({label:'SAFRWAY',href,lang:locale});}
  const serviceSlug=record.serviceId??null;
  const sourceContext={...(country?{country:country[labelIndex]}:{}),...(section?{section}:{}),...(serviceSlug?{service:serviceSlug}:{}),content_id:contentId,source_revision:record.candidate.revision,path:actualPath,locale};
  return {destinationCountry:country?.[0]??null,destinationRegion,jurisdiction,section,serviceSlug,
    // A page without an approved destination backdrop uses the neutral shell.
    world:backdropWorlds.has(destinationSlug)?destinationSlug:null,breadcrumbs,sourceContext};
}
