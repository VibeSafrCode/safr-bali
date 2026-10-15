import {activeDestinations} from '../../../react-app/src/catalog';
import {getLocalizedPublicPage,type PublicLocale} from '../../src/lib/public-i18n';
import {previewHref,previewSourceRoute} from '../../../shared/src/preview-brand.mjs';
import {yorkRoutes} from './routes';
import {yogaPublicPage} from '../../../shared/src/yoga-content-policy.mjs';
import {yogaDisplayCopy,yogaVisiblePage} from './brand-copy';

export const YORK_INFORMATION_ROUTES=Object.freeze(['/services/','/about/','/stories/','/contacts/']);

export function isYorkInformationRoute(route:string) {
  return YORK_INFORMATION_ROUTES.includes(previewSourceRoute(route));
}

/** Read the actual generated routes, never turn a preparatory catalog item into
 * a page or introduce a second authored content or pricing store. */
export function yorkInformation(route:string,locale:PublicLocale) {
  const source=previewSourceRoute(route);
  if(!isYorkInformationRoute(route))throw new Error('Unknown Yoga information route');
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  const labels:Record<string,string>={
    '/services/':t('Услуги','Services'),
    '/about/':t('О проекте','About'),
    '/stories/':t('Гайды и материалы','Guides & stories'),
    '/contacts/':t('Связаться с командой','Contact the team'),
  };
  const routes=yorkRoutes().filter(item=>item.locale===locale);
  const allowed=new Set(routes.map(item=>item.route));
  const groups=activeDestinations(locale).flatMap(country=>{
    const destination=routes.find(item=>item.route===previewHref('/'+country.id+'/',locale))?.page;
    if(!destination)return [];
    const cards=destination.cards.filter(card=>allowed.has(card.href));
    return cards.length?[{id:country.id,name:country.name,href:destination.route,cards}]:[];
  });
  const reading=routes.flatMap(item=>{
    if(item.entry?.contentId.startsWith('knowledge_'))return [{
      href:item.route,title:yogaDisplayCopy(item.entry.title,item.route),summary:yogaDisplayCopy(item.entry.description,item.route),
      contentId:item.entry.contentId,sourceRevision:item.entry.sourceRevision,
    }];
    if(item.page?.kind==='article'&&item.route.includes('/guides/'))return [{
      href:item.route,title:item.page.title,summary:item.page.description,
      contentId:'',sourceRevision:'',
    }];
    return [];
  });
  return {source,title:labels[source],home:yogaVisiblePage(yogaPublicPage(getLocalizedPublicPage('/',locale))),groups,reading};
}
