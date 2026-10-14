import {standaloneUaeInputs} from './standalone-publication-inputs.mjs';
import {applyPublicOwnerIndexing} from './public-owner-indexing.mjs';
export const standaloneUaePublicPage=(locale,asOf=new Date())=>applyPublicOwnerIndexing('standalone',standaloneUaeInputs(locale),locale,asOf);
export const standalonePublicPages=()=>['ru','en'].map(locale=>standaloneUaePublicPage(locale));
export const standalonePublicAlternates=route=>{
  const pages=standalonePublicPages();
  return pages.some(p=>p.route===route)?[...pages.map(p=>({locale:p.locale,href:p.route})),{locale:'x-default',href:'/uae/'}]:[];
};
