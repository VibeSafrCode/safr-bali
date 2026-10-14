// Public-only literal projection. Private replay/parsers never enter browser bundles.
import input from '../../../shared/content/client-ui/public-interactions.v1.json' with {type:'json'};

export const PUBLIC_INTERACTION_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const PUBLIC_INTERACTION_KEYS=Object.freeze([
  "analytics.saveFailed",
  "visa.sessionSaved",
  "visa.requestTemplate",
  "bike.documentTitle",
  "support.errorMessage",
  "support.errorTelegram",
  "support.errorEmail",
  "support.contact",
  "support.close",
  "support.errorName",
  "support.errorPhone",
  "theme.title",
  "theme.dark",
  "theme.auto",
  "theme.light",
  "video.pause",
  "video.openYouTube",
  "video.resume",
  "video.watch",
  "video.return",
  "support.telegramHint",
  "support.phone",
  "support.messageUs",
  "support.direct",
  "support.onTelegram",
  "support.descriptionCompact",
  "support.phoneHint",
  "support.replyQuestion",
  "support.telegram",
  "support.phoneMethod",
  "support.telegramAria",
  "support.description",
  "video.previous",
  "video.heading",
  "video.playlist",
  "video.back",
  "video.next",
  "support.title",
  "support.eyebrow",
  "support.formClose",
  "support.failed",
  "support.message",
  "support.name",
  "support.sending",
  "support.sent",
  "support.submit"
]);
export const PUBLIC_INTERACTION_INPUT_SHA='4120b1d225a7e8f08b63f16cea9df3804defa4847166e38d556478c79792c472';
const fail=code=>{throw Error(code);};
const sameKeys=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)
 &&Object.keys(object).sort().join('\0')===[...keys].sort().join('\0');
const parameters=Object.freeze({
 'theme.title':Object.freeze(['names_preference_','names_next_']),
 'visa.requestTemplate':Object.freeze(['values_purpose______','values_duration______']),
});
// Synchronous SHA-256 of the canonical projection keeps the immutable byte pin
// usable in an ordinary browser module without Node, fetch, async readiness or secrets.
export function publicInteractionSha256(text){
 const bytes=new TextEncoder().encode(text),length=bytes.length;
 const padded=new Uint8Array(((length+9+63)>>6)<<6);padded.set(bytes);padded[length]=0x80;
 const view=new DataView(padded.buffer);
 view.setUint32(padded.length-8,Math.floor(length*8/0x100000000));
 view.setUint32(padded.length-4,(length*8)>>>0);
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const w=new Uint32Array(64),rotate=(value,bits)=>(value>>>bits)|(value<<(32-bits));
 for(let offset=0;offset<padded.length;offset+=64){
  for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++){
   const a=w[i-15],b=w[i-2],s0=rotate(a,7)^rotate(a,18)^(a>>>3),s1=rotate(b,17)^rotate(b,19)^(b>>>10);
   w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
  }
  let [a,b,c,d,e,f,g,z]=h;
  for(let i=0;i<64;i++){
   const s1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g);
   const t1=(z+s1+choice+k[i]+w[i])>>>0;
   const s0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c);
   const t2=(s0+majority)>>>0;
   z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  [a,b,c,d,e,f,g,z].forEach((value,i)=>{h[i]=(h[i]+value)>>>0;});
 }
 return [...h].map(value=>value.toString(16).padStart(8,'0')).join('');
}
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

export function publicInteractionLocale(locale){
 if(typeof locale!=='string'||!PUBLIC_INTERACTION_LOCALES.includes(locale))fail('PUBLIC_INTERACTION_UNKNOWN_LOCALE');
 return locale;
}
/** Caption locale is explicit; unsupported aliases never fall back silently. */
export function publicInteractionDocumentLocale(root){
 return publicInteractionLocale(root?.dataset?.uiLocale??root?.lang);
}
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
