import {PUBLIC_ROUTE_LOCALES,localizedPublicRoute} from './public-locale';
import {getSourceProjectedPublicPages,type PublicSourceLocale} from './public-i18n';
import {publicBuildEntries} from '../../scripts/registry-publication.mjs';
import {standaloneUaeInputs} from './standalone-publication-inputs.mjs';
import {getPublicUaeCopy} from './public-editorial-live';
import {publicChromeText} from './public-chrome';
import {publicLegacyContentVersion,publicRegistryContentVersion,publicStandaloneContentVersion} from './public-content-version.mjs';

export function publicStandaloneSource(locale:PublicSourceLocale){
  const original=standaloneUaeInputs(locale==='ru'?'ru':'en');
  if(locale==='ru'||locale==='en')return original;
  const copy=getPublicUaeCopy(locale);
  return {...original,route:localizedPublicRoute('/uae/',locale),locale,title:copy.fullName,
    description:copy.description,heading:copy.fullName,
    backLabel:publicChromeText('uae.backLabel',locale),
    eyebrow:publicChromeText('uae.servicesEyebrow',locale),
    servicesHeading:publicChromeText('uae.servicesHeading',locale)};
}
export function publicSiteSourceEntries(){
  const legacy=PUBLIC_ROUTE_LOCALES.flatMap(locale=>getSourceProjectedPublicPages(locale).map(source=>({
    kind:'legacy' as const,locale,route:source.page.route,sourceRoute:source.sourceRoute,
    contentVersion:source.contentVersion,page:source.page,sourceKeys:source.sourceKeys,sourceInputs:source.sourceInputs,
  })));
  const registry=publicBuildEntries().map(page=>({kind:'registry' as const,locale:page.locale,route:page.route,
    sourceRoute:page.canonicalPath,contentVersion:publicRegistryContentVersion(page),page}));
  const standalone=PUBLIC_ROUTE_LOCALES.map(locale=>{const page=publicStandaloneSource(locale);
    return {kind:'standalone' as const,locale,route:page.route,sourceRoute:'/uae/',
      contentVersion:publicStandaloneContentVersion(page),page};});
  const entries=[...legacy,...registry,...standalone].sort((left,right)=>left.route.localeCompare(right.route,'en'));
  if(legacy.length!==450||registry.length!==610||standalone.length!==10||entries.length!==1070
    ||new Set(entries.map(row=>row.route)).size!==1070)throw Error('Public positive source inventory drift');
  // A source inventory is not publication, a Service/pricing store or legal QA.
  for(const row of entries){
    if(!PUBLIC_ROUTE_LOCALES.includes(row.locale)||!/^\/(?:[a-z0-9-]+\/)*$/.test(row.route)
      ||row.route.split('/').some((s:string)=>['admin','account','api','auth','private','preview','_registry','cabinet','login','mini-app'].includes(s)))
      throw Error('Private or unknown public source inventory');
  }
  return entries;
}
export const publicSourceContentVersion={legacy:publicLegacyContentVersion,registry:publicRegistryContentVersion,standalone:publicStandaloneContentVersion};
