// Public-only literal projection. Private replay/parsers never enter browser bundles.
import input from '../../../shared/content/client-ui/public-interactions.v1.json' with {type:'json'};

import {PUBLIC_INTERACTION_LOCALES,PUBLIC_INTERACTION_KEYS,PUBLIC_INTERACTION_INPUT_SHA,
 publicInteractionSha256,publicInteractionLocale,parameters,sameKeys,fail} from './public-interaction-contract.mjs';
export {PUBLIC_INTERACTION_LOCALES,PUBLIC_INTERACTION_KEYS,PUBLIC_INTERACTION_INPUT_SHA,
 publicInteractionSha256,publicInteractionLocale,publicInteractionDocumentLocale} from './public-interaction-contract.mjs';
const fields=['schemaVersion','domain','status','scope','locales','sourceEquivalence','runtimeIntegrated',
 'publicationAuthorized','nativeQa','legalQa','renderedQa','newLocaleRoutesActivated','entries'];
if(!sameKeys(input,fields)||publicInteractionSha256(JSON.stringify(input,null,2)+'\n')!==PUBLIC_INTERACTION_INPUT_SHA)
 fail('PUBLIC_INTERACTION_SOURCE_PIN');
if(input.schemaVersion!==1||input.domain!=='public'||input.status!=='SOURCE_PINNED_PUBLIC_INTERACTION_REUSE'
 ||input.scope!=='PUBLIC_CLIENT_INTERACTION_CAPTIONS_ONLY_NO_ADMIN_OR_ARTICLES'
 ||input.sourceEquivalence!=='PASS_WITH_LIMITATIONS'||input.runtimeIntegrated!==false
 ||input.publicationAuthorized!==false||input.nativeQa!=='NOT_RUN'||input.legalQa!=='NOT_RUN'
 ||input.renderedQa!=='NOT_RUN'||input.newLocaleRoutesActivated!==false
 ||JSON.stringify(input.locales)!==JSON.stringify(PUBLIC_INTERACTION_LOCALES)
 ||input.entries.length!==PUBLIC_INTERACTION_KEYS.length)fail('PUBLIC_INTERACTION_STAGE_OR_SCOPE');
const values=Object.create(null);
input.entries.forEach((entry,index)=>{
 if(!sameKeys(entry,['key','values'])||entry.key!==PUBLIC_INTERACTION_KEYS[index]
  ||!sameKeys(entry.values,PUBLIC_INTERACTION_LOCALES))fail('PUBLIC_INTERACTION_EXACT_KEYSET');
 const names=parameters[entry.key]??[];
 for(const locale of PUBLIC_INTERACTION_LOCALES){
  const text=entry.values[locale];
  if(typeof text!=='string'||text.length===0||/\u0000/.test(text))fail('PUBLIC_INTERACTION_VALUE');
  const tokens=[...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match=>match[1]);
  if(tokens.length!==names.length||[...tokens].sort().join('\0')!==[...names].sort().join('\0')
   ||/[{}]/.test(text.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g,'')))fail('PUBLIC_INTERACTION_TOKEN_DRIFT');
 }
 values[entry.key]=Object.freeze({...entry.values});
});
Object.freeze(values);

export function publicInteractionText(key,locale,variables={}){
 publicInteractionLocale(locale);
 if(typeof key!=='string'||!Object.hasOwn(values,key))fail('PUBLIC_INTERACTION_UNKNOWN_KEY');
 const names=parameters[key]??[];
 if(!sameKeys(variables,names)||Object.values(variables).some(value=>typeof value!=='string'
  &&typeof value!=='number'))fail('PUBLIC_INTERACTION_PARAMETER_KEYSET');
 const text=values[key][locale];
 // Functional replacement preserves dollar signs and significant surrounding whitespace.
 return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_,name)=>String(variables[name]));
}

/** Full source/stage/key/token validation above precedes every locale projection. */
export function publicInteractionCaptionPayload(locale){
 publicInteractionLocale(locale);
 return {schemaVersion:1,sourceSha256:PUBLIC_INTERACTION_INPUT_SHA,locale,
  values:Object.fromEntries(PUBLIC_INTERACTION_KEYS.map(key=>[key,values[key][locale]]))};
}
export function serializeInertPublicJson(payload){
 return JSON.stringify(payload).replace(/[<>&\u2028\u2029]/gu,
  char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
}
export function serializePublicInteractionCaptions(locale){
 return serializeInertPublicJson(publicInteractionCaptionPayload(locale));
}
