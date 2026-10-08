import {getLocalizedPublicPages,getLocalizedPublicPage,type PublicLocale} from '../../src/lib/public-i18n';
import {publicBuildEntries,buildPublicRegistryModel} from '../../scripts/registry-publication.mjs';
import {YORK_DEMO_ROUTES,previewHref,previewSourceRoute,previewBrand} from '../../../shared/src/preview-brand.mjs';
import type {PublicPage} from '../../src/lib/public-catalog';

type YorkRoute={route:string;locale:PublicLocale;page?:PublicPage;entry?:ReturnType<typeof publicBuildEntries>[number];demo?:string;notFound?:boolean;};

export function yorkRoutes() {
  const registry=publicBuildEntries().filter(entry=>entry.locale==='ru'||entry.locale==='en');
  const seen=new Set(registry.map(entry=>entry.route));
  const legacy=(['ru','en'] as const).flatMap(locale=>getLocalizedPublicPages(locale)
    .filter(page=>!seen.has(page.route)).map(page=>({route:page.route,locale,page})));
  const inherited:YorkRoute[]=[...legacy,...registry.map(entry=>({route:entry.route,locale:entry.locale as PublicLocale,entry}))];
  for(const locale of ['ru','en'] as const) {
    const route=previewHref('/uae/',locale);
    if(!inherited.some(item=>item.route===route)) {
      const insurance=getLocalizedPublicPage('/uae/insurance/',locale);
      inherited.push({route,locale,page:{
        ...getLocalizedPublicPage('/',locale),route,kind:'direction',title:locale==='ru'?'ОАЭ':'United Arab Emirates',
        description:locale==='ru'?'Ваше пространство для поездки в ОАЭ.':'Your UAE travel space.',
        lead:'',body:'',cards:[{icon:'◈',title:insurance.title,summary:insurance.description,href:insurance.route,status:'available'}],
        relatedRoutes:[],breadcrumbs:[],managerContext:'',
      }});
    }
  }
  const extras=(['ru','en'] as const).flatMap(locale=>YORK_DEMO_ROUTES.map(source=>({route:previewHref(source,locale),locale,demo:source})));
  const result:YorkRoute[]=[...inherited,...extras.filter(extra=>!inherited.some(item=>item.route===extra.route)),
    {route:'/en/404/',locale:'en',notFound:true}];
  if(new Set(result.map(item=>item.route)).size!==result.length)throw new Error('York preview route collision');
  return result;
}

export function yorkRegistryModel(entry:Parameters<typeof buildPublicRegistryModel>[0]) {
  // This is the SAME approved body/fact/FAQ renderer, not a second editorial or price store.
  const model=buildPublicRegistryModel(entry);
  return {...model,languageChoices:model.languageChoices.filter((choice:{code:string})=>choice.code==='ru'||choice.code==='en')};
}

export function yorkDemoTitle(route:string,locale:PublicLocale) {
  const source=previewSourceRoute(route);
  if(source.startsWith('/owner/'))return locale==='ru'?'Лаборатория владельца':'Owner laboratory';
  if(source.startsWith('/influencer/'))return locale==='ru'?'Демо партнёра':'Partner demo';
  if(source.startsWith('/account/'))return locale==='ru'?'Демо клиента':'Customer demo';
  const titles:Record<string,[string,string]>={
    '/services/':['Услуги','Services'],'/about/':['О проекте','About'],
    '/stories/':['Истории','Stories'],'/contacts/':['Связаться с командой','Contact the team'],
    '/bot-demo/':['Демо бота','Bot demo'],
  };
  const brand=previewBrand('york-gangster');
  if(!brand)throw new Error('Missing synthetic preview brand');
  return titles[source]?.[locale==='ru'?0:1]??brand.displayName;
}
