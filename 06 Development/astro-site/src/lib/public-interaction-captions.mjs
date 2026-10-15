// Browser-only reader: one exact locale; the full source is validated at build.
import {PUBLIC_INTERACTION_KEYS,PUBLIC_INTERACTION_INPUT_SHA,
 PUBLIC_INTERACTION_LOCALE_SHA,publicInteractionSha256,publicInteractionLocale,
 publicInteractionDocumentLocale,parameters,sameKeys,fail} from './public-interaction-contract.mjs';
export {publicInteractionLocale,publicInteractionDocumentLocale};
export function parsePublicInteractionCaptions(text,locale){
 publicInteractionLocale(locale);
 let payload;try{payload=JSON.parse(text);}catch{fail('PUBLIC_INTERACTION_CAPTION_JSON');}
 if(!sameKeys(payload,['schemaVersion','sourceSha256','locale','values'])||payload.schemaVersion!==1
  ||payload.sourceSha256!==PUBLIC_INTERACTION_INPUT_SHA||payload.locale!==locale
  ||!sameKeys(payload.values,PUBLIC_INTERACTION_KEYS))fail('PUBLIC_INTERACTION_CAPTION_SCOPE');
 for(const key of PUBLIC_INTERACTION_KEYS){
  const value=payload.values[key],names=parameters[key]??[];
  if(typeof value!=='string'||value.length===0||/\u0000/.test(value))fail('PUBLIC_INTERACTION_VALUE');
  const tokens=[...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]);
  if(tokens.length!==names.length||[...tokens].sort().join('\0')!==[...names].sort().join('\0')
   ||/[{}]/.test(value.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g,'')))fail('PUBLIC_INTERACTION_TOKEN_DRIFT');
 }
 if(publicInteractionSha256(JSON.stringify(payload))!==PUBLIC_INTERACTION_LOCALE_SHA[locale])
  fail('PUBLIC_INTERACTION_CAPTION_PIN');
 Object.freeze(payload.values);Object.freeze(payload);
 return (key,requestedLocale,variables={})=>{
  publicInteractionLocale(requestedLocale);
  if(requestedLocale!==locale)fail('PUBLIC_INTERACTION_CAPTION_LOCALE');
  if(typeof key!=='string'||!Object.hasOwn(payload.values,key))fail('PUBLIC_INTERACTION_UNKNOWN_KEY');
  const names=parameters[key]??[];
  if(!sameKeys(variables,names)||Object.values(variables).some(value=>typeof value!=='string'
   &&typeof value!=='number'))fail('PUBLIC_INTERACTION_PARAMETER_KEYSET');
  return payload.values[key].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_,name)=>String(variables[name]));
 };
}
const readers=new WeakMap();
export function publicInteractionText(key,locale,variables={},root=globalThis.document){
 const documentLocale=publicInteractionDocumentLocale(root?.documentElement);
 let current=readers.get(root);
 if(!current){
  const nodes=root.querySelectorAll('[data-public-interaction-captions]');
  if(nodes.length!==1||nodes[0].getAttribute('type')!=='application/json')
   fail('PUBLIC_INTERACTION_CAPTION_DOCUMENT');
  current={locale:documentLocale,read:parsePublicInteractionCaptions(nodes[0].textContent,documentLocale)};
  readers.set(root,current);
 }
 if(current.locale!==documentLocale)fail('PUBLIC_INTERACTION_CAPTION_LOCALE');
 return current.read(key,locale,variables);
}
