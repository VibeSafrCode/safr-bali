import cards from '../../../shared/content/generated/client-catalog/cards.v1.json';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {CLIENT_CATALOG_SPLIT_PINS as pins} from './generated/client-catalog-split-pins';
import {CLIENT_CATALOG_LOCALES,CLIENT_CATALOG_RUNTIME_BYTES,CLIENT_CATALOG_RUNTIME_SHA256,type ClientCatalogLocale} from './client-catalog-model';
import {guard,same,frozen} from './client-catalog-integrity';
import {decodeClientCatalogPinnedJson} from './client-catalog-pinned-json';
import {createClientCatalogProjectionApi} from './client-catalog-projection';

/** A card projection explicitly references articles; it is not a full article API. */
export function createClientCardLookup(input:unknown){
  const data=decodeClientCatalogPinnedJson(input,pins.cards);
  guard(same(Object.keys(data),['schemaVersion','domain','source','locales','destinationIds','baseDestinations','bikes','fields','heldKeys','articleRefs'])&&
    data.schemaVersion===1&&data.domain==='client-catalog-cards'&&same(data.source,{bytes:CLIENT_CATALOG_RUNTIME_BYTES,sha256:CLIENT_CATALOG_RUNTIME_SHA256})&&
    same(data.locales,CLIENT_CATALOG_LOCALES)&&same(data.destinationIds,['bali','thailand','russia','nepal','uae'])&&
    same(data.baseDestinations.map((d:{id:string})=>d.id),data.destinationIds)&&same(data.heldKeys,[]),'CLIENT_CARDS_SCHEMA');
  const keys=Object.keys(data.fields);
  guard(keys.length===140&&same(keys,[...keys].sort())&&keys.every(key=>key.startsWith('catalog.')&&!key.split('.').some(p=>['__proto__','constructor','prototype'].includes(p))),'CLIENT_CARDS_KEYS');
  for(const key of keys){const row=data.fields[key];guard(row.recipe!=='registry_full_body'&&row.recipe!=='source_hold'&&same(Object.keys(row.values),CLIENT_CATALOG_LOCALES)&&CLIENT_CATALOG_LOCALES.every(l=>typeof row.values[l]==='string'),'CLIENT_CARDS_FIELD');}
  const ids=['e33g','d12','d1-d2','c1','voa'];
  guard(same(Object.keys(data.articleRefs),ids.map(id=>'catalog.bali.visas.'+id+'.content')),'CLIENT_CARDS_REFS');
  for(const id of ids){const ref={visaId:id,contentId:id==='d1-d2'?'d1_d2':id};
    const node=data.baseDestinations.find((d:{id:string})=>d.id==='bali').services.find((s:{id:string})=>s.id==='visas').children.find((n:{id:string})=>n.id===id);
    guard(node&&!Object.hasOwn(node,'content')&&same(node.articleRef,ref)&&same(data.articleRefs['catalog.bali.visas.'+id+'.content'],ref),'CLIENT_CARDS_ARTICLE_REF');
  }
  frozen(data);
  const text=(key:string,locale:ClientCatalogLocale):string=>{guard(Object.hasOwn(data.fields,key),'CLIENT_CATALOG_UNKNOWN_FIELD');return data.fields[key].values[locale];};
  return createClientCatalogProjectionApi(data,text);
}
const lookup=YOGA_MINI_APP?null:createClientCardLookup(JSON.stringify(cards,null,2)+'\n');
function requireLookup(){if(!lookup)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');return lookup;}
type Lookup=ReturnType<typeof createClientCardLookup>;
export const clientCardDestinations=(...args:Parameters<Lookup['destinations']>)=>requireLookup().destinations(...args);
export const clientCardActiveServices=(...args:Parameters<Lookup['activeServices']>)=>requireLookup().activeServices(...args);
