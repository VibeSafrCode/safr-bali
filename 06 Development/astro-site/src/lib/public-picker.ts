// Server/build-only exact public picker copy. No raw candidate/source packet in customer output.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PUBLIC_ROUTE_LOCALES,publicLocaleDirection,type PublicRouteLocale} from './public-locale';
export const PUBLIC_PICKER_LOCALES=PUBLIC_ROUTE_LOCALES;
export type PublicPickerLocale=PublicRouteLocale;
export const PUBLIC_PICKER_KEYS=Object.freeze([
  "language.label",
  "language.change",
  "language.title",
  "language.close",
  "language.unavailable",
  "language.hintUnavailable",
  "language.hintSaved",
  "country.title",
  "country.close",
  "country.name",
  "country.search",
  "country.hint",
  "country.assessment",
  "country.contact",
  "country.empty",
  "country.available",
  "country.unavailable",
  "country.enquiryTemplate",
  "country.baliLabel"
] as const);
export type PublicPickerKey=typeof PUBLIC_PICKER_KEYS[number];
export const PUBLIC_PICKER_INPUT_SHA256='5a66f067d3b34a3081ca746af904881e54a4cb8ee3e480d934587abdcae074f8';
const assert=(ok:unknown,code:string)=>{if(!ok)throw Error(code);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function createPublicPickerLookup(bytes:Uint8Array){
  assert(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=256*1024,'PUBLIC_PICKER_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===PUBLIC_PICKER_INPUT_SHA256,'PUBLIC_PICKER_PIN_DRIFT');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}catch{throw Error('PUBLIC_PICKER_UTF8');}
  const input=JSON.parse(text);
  assert(buffer.equals(Buffer.from(JSON.stringify(input,null,2)+'\n')),'PUBLIC_PICKER_CANONICAL_BYTES');
  assert(same(Object.keys(input),['schemaVersion','domain','status','scope','locales','sourceEquivalence',
    'runtimeIntegrated','publicationAuthorized','nativeQa','legalQa','renderedQa','newLocaleRoutesActivated','entries'])
    &&input.schemaVersion===1&&input.domain==='public'&&input.status==='SOURCE_PINNED_PUBLIC_PICKER_SUBSET'
    &&input.scope==='PUBLIC_LANGUAGE_COUNTRY_PICKER_CAPTIONS_ONLY'&&same(input.locales,PUBLIC_PICKER_LOCALES)
    &&input.sourceEquivalence==='PASS_WITH_LIMITATIONS'&&input.runtimeIntegrated===false
    &&input.publicationAuthorized===false&&input.nativeQa==='NOT_RUN'&&input.legalQa==='NOT_RUN'
    &&input.renderedQa==='NOT_RUN'&&input.newLocaleRoutesActivated===false,'PUBLIC_PICKER_SOURCE_GATES');
  assert(Array.isArray(input.entries)&&input.entries.length===19,'PUBLIC_PICKER_WHITELIST');
  const values=new Map<PublicPickerKey,Readonly<Record<PublicPickerLocale,string>>>();
  for(const [index,row]of input.entries.entries()){
    const key=PUBLIC_PICKER_KEYS[index];
    assert(row.key===key&&same(Object.keys(row),['key','values'])&&row.values
      &&same(Object.keys(row.values),PUBLIC_PICKER_LOCALES)&&!values.has(key),'PUBLIC_PICKER_IDENTITIES');
    for(const locale of PUBLIC_PICKER_LOCALES){
      const value=row.values[locale],tokens=typeof value==='string'?(value.match(/\{[^{}]*\}/g)??[]):[];
      assert(typeof value==='string'&&value.length>0&&value.length<=2000&&value===value.trim()
        &&!/[\n\r\0<>]/u.test(value)
        &&(key==='country.enquiryTemplate'?same(tokens,['{country}']):tokens.length===0),'PUBLIC_PICKER_TEXT_OR_TOKEN_DRIFT');
    }
    values.set(key,Object.freeze({...row.values}));
  }
  return(key:PublicPickerKey,locale:PublicPickerLocale):string=>{
    assert(typeof key==='string'&&values.has(key),'PUBLIC_PICKER_UNKNOWN_KEY');
    assert(typeof locale==='string'&&(PUBLIC_PICKER_LOCALES as readonly string[]).includes(locale),'PUBLIC_PICKER_UNKNOWN_LOCALE');
    return values.get(key)![locale];
  };
}
function bundledInput():Record<string,string>|null{
  try{return import.meta.glob(['../../../shared/content/client-ui/public-picker.v1.json'],
    {query:'?raw',import:'default',eager:true}) as Record<string,string>;}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=bundledInput();
const inputBytes=bundled?Buffer.from(bundled['../../../shared/content/client-ui/public-picker.v1.json']??'','utf8')
  :readFileSync(new URL('../../../shared/content/client-ui/public-picker.v1.json',import.meta.url));
const lookup=createPublicPickerLookup(inputBytes);
export const publicPickerText=(key:PublicPickerKey,locale:PublicPickerLocale):string=>lookup(key,locale);
export const publicPickerDirection=(locale:unknown)=>publicLocaleDirection(locale);
