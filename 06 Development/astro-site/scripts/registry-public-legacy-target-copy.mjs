import {createHash} from 'node:crypto';
import dictionary from '../../shared/content/generated/i18n/public.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';

// Same exact source anchor as the whole legacy-page projection. Only already
// positive legacy targets are eligible; this does not authorize another route.
const expected='f460406e4623997cf1a960ff0cbfb9d6d9f0772fe633df246290a8b7a80cd943';
if(createHash('sha256').update(JSON.stringify(dictionary,null,2)+'\n').digest('hex')!==expected)
  throw Error('Related legacy public dictionary drift');
const entries=Object.freeze(Object.fromEntries(Object.entries(dictionary.entries).map(([key,row])=>
  [key,Object.freeze({...row})])));
const targets=Object.freeze({
  visas_bali:Object.freeze({route:'/bali/visas/',template:'template.service.title',
    variables:Object.freeze({service:'catalog.bali.visas.name',destination:'catalog.destination.bali.name'})}),
  all_indonesia:Object.freeze({route:'/bali/guides/all-indonesia/',template:'template.item.title',
    variables:Object.freeze({item:'catalog.bali.guides.all-indonesia.name',service:'catalog.bali.guides.name',destination:'catalog.destination.bali.name'})}),
});
export function publicLegacyTargetCopy(contentId,locale,sourceRoute){
  if(typeof contentId!=='string'||typeof locale!=='string'||!PUBLIC_LOCALES.includes(locale))
    throw Error('Unknown related legacy identity or locale');
  if(!Object.hasOwn(targets,contentId))return null;
  const target=targets[contentId];
  if(target.route!==sourceRoute)throw Error('Related legacy source route drift');
  const read=key=>{
    const value=entries[key]?.[locale];
    if(typeof value!=='string'||!value||value.includes('\0'))throw Error('Missing related legacy source value');
    return value;
  };
  const label=read(target.template).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_token,key)=>{
    if(!Object.hasOwn(target.variables,key))throw Error('Unknown related title placeholder');
    return read(target.variables[key]);
  });
  return {label,lang:locale};
}
