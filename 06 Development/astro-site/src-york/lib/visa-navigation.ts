import {yorkRoutes} from './routes';
import {previewHref} from '../../../shared/src/preview-brand.mjs';

/** Navigation uses published shared cards, never invents a visa page. */
export function visaChoices(href:string,locale:'ru'|'en') {
  const route=previewHref(href,locale);
  const routes=yorkRoutes().filter(item=>item.locale===locale);
  const allowed=new Set(routes.map(item=>item.route));
  return (routes.find(item=>item.route===route)?.page?.cards??[])
    .filter(card=>allowed.has(card.href));
}
