// Server/build-only customer captions. No raw candidate or audit packet is shipped to clients.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PUBLIC_ROUTE_LOCALES,publicLocaleInfo,type PublicRouteLocale} from './public-locale';
import {getBotVisaCopy} from './visa-bot-copy';
import {getPublicOtherVisaCopy} from './public-editorial-live';
export const PUBLIC_COMPONENT_LOCALES=PUBLIC_ROUTE_LOCALES;
export type PublicComponentLocale=PublicRouteLocale;
export const PUBLIC_COMPONENT_KEYS=Object.freeze([
  "public.allVisaOptions",
  "public.askCurrentPrice",
  "visa.priceBeforePayment",
  "service.soonAria",
  "service.soonLabel",
  "workspace.backServices",
  "workspace.comingSoon",
  "workspace.preparing",
  "workspace.checkAvailability",
  "workspace.availabilityMessage",
  "country.back",
  "country.eyebrow",
  "country.travelSpace",
  "country.question",
  "country.preparing",
  "country.startHelp",
  "country.askAssistant",
  "home.vietnamName",
  "home.uaeHelp",
  "home.vietnamHelp",
  "home.phoneTitle",
  "home.phoneCountry",
  "home.vietnamDescription",
  "home.vietnamMessage",
  "home.vietnamButton",
  "bike.back",
  "bike.eyebrow",
  "bike.title",
  "bike.description",
  "bike.requestTitle",
  "bike.requestDescription",
  "bike.requestNote",
  "bike.message",
  "bike.button",
  "label.insurance",
  "label.visas",
  "label.exchange",
  "label.guides",
  "label.yachts"
] as const);
export type PublicComponentKey=typeof PUBLIC_COMPONENT_KEYS[number];
export const PUBLIC_COMPONENT_INPUT_SHA256='6ba073e0520e7f04caa0efc00e3a3537823c24f2f1344dabf80f7a95949bf72c';
const contracts={
  "public.allVisaOptions": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "public.askCurrentPrice": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "visa.priceBeforePayment": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "service.soonAria": {
    "tokens": [],
    "leading": " ",
    "trailing": "",
    "newlines": 0
  },
  "service.soonLabel": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "workspace.backServices": {
    "tokens": [
      "{country__name____parts_0_}"
    ],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "workspace.comingSoon": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "workspace.preparing": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "workspace.checkAvailability": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "workspace.availabilityMessage": {
    "tokens": [
      "{app_label}",
      "{country__name}"
    ],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.back": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.eyebrow": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.travelSpace": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.question": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.preparing": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.startHelp": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "country.askAssistant": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.vietnamName": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.uaeHelp": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.vietnamHelp": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.phoneTitle": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.phoneCountry": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.vietnamDescription": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.vietnamMessage": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "home.vietnamButton": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.back": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.eyebrow": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.title": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.description": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.requestTitle": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.requestDescription": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.requestNote": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "bike.message": {
    "tokens": [],
    "leading": "",
    "trailing": " ",
    "newlines": 2
  },
  "bike.button": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "label.insurance": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "label.visas": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "label.exchange": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "label.guides": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  },
  "label.yachts": {
    "tokens": [],
    "leading": "",
    "trailing": "",
    "newlines": 0
  }
} as const;
const assert=(ok:unknown,code:string)=>{if(!ok)throw Error(code);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const scalar=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=3000
  &&!/[\r\0<>]/u.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
export function createPublicComponentLookup(bytes:Uint8Array){
  assert(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=256*1024,'PUBLIC_COMPONENT_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===PUBLIC_COMPONENT_INPUT_SHA256,'PUBLIC_COMPONENT_PIN_DRIFT');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}catch{throw Error('PUBLIC_COMPONENT_UTF8');}
  const input=JSON.parse(text);
  assert(buffer.equals(Buffer.from(JSON.stringify(input,null,2)+'\n')),'PUBLIC_COMPONENT_CANONICAL_BYTES');
  assert(same(Object.keys(input),['schemaVersion','domain','status','scope','locales','sourceEquivalence',
    'runtimeIntegrated','publicationAuthorized','nativeQa','legalQa','renderedQa','newLocaleRoutesActivated','entries'])
    &&input.schemaVersion===1&&input.domain==='public'&&input.status==='SOURCE_PINNED_PUBLIC_COMPONENT_SUBSET'
    &&input.scope==='PUBLIC_RENDER_COMPONENT_CAPTIONS_ONLY_NO_ADMIN_OR_ARTICLES'&&same(input.locales,PUBLIC_COMPONENT_LOCALES)
    &&input.sourceEquivalence==='PASS_WITH_LIMITATIONS'&&input.runtimeIntegrated===false
    &&input.publicationAuthorized===false&&input.nativeQa==='NOT_RUN'&&input.legalQa==='NOT_RUN'
    &&input.renderedQa==='NOT_RUN'&&input.newLocaleRoutesActivated===false,'PUBLIC_COMPONENT_SOURCE_GATES');
  assert(Array.isArray(input.entries)&&input.entries.length===PUBLIC_COMPONENT_KEYS.length,'PUBLIC_COMPONENT_WHITELIST');
  const values=new Map<PublicComponentKey,Readonly<Record<PublicComponentLocale,string>>>();
  for(const [index,row]of input.entries.entries()){
    const key=PUBLIC_COMPONENT_KEYS[index],contract=contracts[key];
    assert(row.key===key&&same(Object.keys(row),['key','values'])&&row.values
      &&same(Object.keys(row.values),PUBLIC_COMPONENT_LOCALES)&&!values.has(key),'PUBLIC_COMPONENT_IDENTITIES');
    for(const locale of PUBLIC_COMPONENT_LOCALES){
      const value=row.values[locale];
      assert(scalar(value),'PUBLIC_COMPONENT_SCALAR');
      const tokens=(value.match(/\{[^{}]+\}/g)??[]).sort();
      assert(same(tokens,contract.tokens)&&!/[{}]/u.test(value.replace(/\{[^{}]+\}/g,''))
        &&value.match(/^\s*/u)![0]===contract.leading&&value.match(/\s*$/u)![0]===contract.trailing
        // The received bike message adds one intro LF in each new locale. Preserve those exact bytes.
        &&(value.match(/\n/g)??[]).length===(key==='bike.message'&&locale!=='ru'&&locale!=='en'?3:contract.newlines),
        'PUBLIC_COMPONENT_TEXT_OR_TOKEN_DRIFT');
    }
    values.set(key,Object.freeze({...row.values}));
  }
  return(key:PublicComponentKey,locale:PublicComponentLocale):string=>{
    assert(typeof key==='string'&&values.has(key),'PUBLIC_COMPONENT_UNKNOWN_KEY');
    publicLocaleInfo(locale);
    return values.get(key)![locale];
  };
}
function bundledInput():Record<string,string>|null{
  try{return import.meta.glob(['../../../shared/content/client-ui/public-component.v1.json'],
    {query:'?raw',import:'default',eager:true}) as Record<string,string>;}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=bundledInput();
const inputBytes=bundled?Buffer.from(bundled['../../../shared/content/client-ui/public-component.v1.json']??'','utf8')
  :readFileSync(new URL('../../../shared/content/client-ui/public-component.v1.json',import.meta.url));
const lookup=createPublicComponentLookup(inputBytes);
/** Exact received scalar/template; replacement is one-pass and cannot reinterpret inserted tokens. */
export function publicComponentText(key:PublicComponentKey,locale:PublicComponentLocale,variables:Readonly<Record<string,string>>={}):string{
  const text=lookup(key,locale),expected=[...new Set(contracts[key].tokens.map(token=>token.slice(1,-1)))].sort();
  assert(variables&&same(Object.keys(variables).sort(),expected),'PUBLIC_COMPONENT_TEMPLATE_VARIABLES');
  assert(Object.values(variables).every(value=>scalar(value)),'PUBLIC_COMPONENT_TEMPLATE_SCALAR');
  return text.replace(/\{([^{}]+)\}/g,(_match,name)=>variables[name]);
}
/** Preserve original RU/EN search folding; use each actual new locale, never RU as default. */
export function publicComponentSearchTag(locale:PublicComponentLocale):string{
  publicLocaleInfo(locale);
  return locale==='ru'?'ru-RU':locale==='en'?'en-US':locale;
}
/** Never evaluate RU/EN-only legacy visa/D12 bodies for a new locale or shadowed Registry route. */
export function publicPageVisaCopy(route:string,locale:PublicComponentLocale){
  publicLocaleInfo(locale);
  if(route==='/bali/visas/other-visa/')return getPublicOtherVisaCopy(locale);
  if(locale==='ru'||locale==='en')return getBotVisaCopy(route,locale);
  if(/^\/bali\/visas\/(e33g|d12|d1-d2|c1|voa|investor-kitas)\/$/.test(route))
    throw Error('PUBLIC_COMPONENT_REGISTRY_VISA_ROUTE_REQUIRED');
  return null;
}
