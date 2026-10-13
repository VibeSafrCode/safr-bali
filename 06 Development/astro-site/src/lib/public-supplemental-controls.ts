import {createHash} from 'node:crypto';
import input from '../../../shared/content/client-ui/public-supplemental-controls.v1.json';
import {PUBLIC_ROUTE_LOCALES,type PublicRouteLocale} from './public-locale';
export const PUBLIC_SUPPLEMENTAL_CONTROLS_SHA256='91a8c6139ede83115e29c4c1b62cb426075b6400f94ff37ddb96889a1d93260b';
if(createHash('sha256').update(JSON.stringify(input,null,2)+'\n').digest('hex')!==PUBLIC_SUPPLEMENTAL_CONTROLS_SHA256)
  throw Error('Public supplemental source projection drift');
const identities=Object.freeze({'registry.contentsAria':'public.live.registry.contentsAria','serviceApps.propertyLabel':'public.live.serviceApps.propertyLabel'} as const);
export type PublicSupplementalControl=keyof typeof identities;
const values=new Map(input.entries.map(row=>[row.key,Object.freeze({ru:row.ru,en:row.en,...row.translations})]));
export function publicSupplementalControl(key:PublicSupplementalControl,locale:PublicRouteLocale):string{
  if(!(PUBLIC_ROUTE_LOCALES as readonly string[]).includes(locale))throw Error('Unsupported public supplemental locale');
  if(typeof key!=='string'||!Object.hasOwn(identities,key))throw Error('Unknown public supplemental identity');
  const row=values.get(identities[key]),value=(row as Readonly<Record<string,unknown>>|undefined)?.[locale];
  if(typeof value!=='string'||!value)throw Error('Missing public supplemental source value');
  return value;
}
