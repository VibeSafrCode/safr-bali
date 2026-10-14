// Server/build-only exact public 404 labels. No candidate/AUDIT data is read at runtime.
// Source flags are evidence at capture, not a fabricated native/legal/rendered QA pass.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {languageChoices} from './registry-language.mjs';

if(typeof window!=='undefined')throw Error('PUBLIC_NOT_FOUND_SERVER_ONLY');
export const NOT_FOUND_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const NOT_FOUND_KEYS=Object.freeze(['title','heading','description','eyebrow','body','directions','home']);
export const NOT_FOUND_INPUT_SHA256='7063fa9c71ff07d1e9f59bdbb2fe616e6404b241ac9ae844beebcde43109bcbf';
export const NOT_FOUND_SOURCE_INPUTS=Object.freeze({
  originalCaller:'d7b88a229d35cb07f9bd6a2e1d0aed123fb82dd44508e93eed790468f30eca60',
  candidate:'c7a9e9b1de0188369bd6f0bfd7d4b741d6d905be4d394b04f8ea9afd4fdbb7ed',
  readyMd:'9316f74aec17fba65167aeb2fa7f5ffa8353a61bff15eefb41bf22c42a6cf882',
});
export const NOT_FOUND_READY_SOURCE=Object.freeze({
  taskId:'PUBLIC_NOT_FOUND_UI_9_LOCALES_DEV4_013',
  file:'AUDIT/GPT_COLLABORATION_2026-10-11/PUBLIC_NOT_FOUND_UI_9_LOCALES_DEV4_013_LITERAL_READY_TEXT.md',
  bytes:6466,sha256:NOT_FOUND_SOURCE_INPUTS.readyMd,
  acquisition:'NATIVE_ORDINARY_TEXT_FILE_FALLBACK',originalDownload:false,
  sourceKeys:Object.freeze(['public.live.notFound.description','public.live.notFound.eyebrow',
    'public.live.notFound.body','public.live.notFound.directions','public.live.notFound.home']),
});
export const NOT_FOUND_TITLE_SOURCE_REFS=Object.freeze([
  Object.freeze({key:'title',sourceKey:'literal:06 Development/astro-site/src/pages/404.astro#af9d33066ad6',
    ru:'Страница не найдена',en:null,taskId:'I02_UI_020',
    sourceSha256:'449f7766949b4ed7907d45e0d80df48d682d7338cd023083a75a5e63664e6dc6'}),
  Object.freeze({key:'heading',sourceKey:'literal:06 Development/astro-site/src/pages/404.astro#e2e0cfa630aa',
    ru:'Такой страницы нет',en:null,taskId:'I02_UI_020',
    sourceSha256:'d9575c92ffc7f0357daea84d92dce8b4ff0a99a9f0c684cc60c191e85b723982'}),
]);
export const NOT_FOUND_ORIGINAL_RU=Object.freeze({
  title:'Страница не найдена',heading:'Такой страницы нет',
  description:'Запрошенная страница SAFRWAY не найдена. Вернитесь к каталогу направлений или на главную страницу.',
  eyebrow:'Ошибка 404',
  body:'Адрес мог измениться или в нём есть ошибка. Откройте каталог и выберите нужное направление.',
  directions:'К направлениям',home:'На главную',
});
const assert=(ok,code)=>{if(!ok)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const guardLocale=locale=>assert(typeof locale==='string'&&NOT_FOUND_LOCALES.includes(locale),'PUBLIC_NOT_FOUND_UNKNOWN_LOCALE');
const scalar=value=>typeof value==='string'&&value.length>0&&value.length<=512
  &&value===value.trim()&&!/[\r\n\0{}<>]/u.test(value)
  &&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const decode=bytes=>{
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{throw Error('PUBLIC_NOT_FOUND_INVALID_UTF8');}
};

/** Replay exact ordinary text fallback as data; no scripts/commands/authority from GPT are executed. */
export function replayNotFoundReadyMd(bytes){
  assert(bytes instanceof Uint8Array&&bytes.byteLength===NOT_FOUND_READY_SOURCE.bytes,'PUBLIC_NOT_FOUND_READY_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===NOT_FOUND_READY_SOURCE.sha256,'PUBLIC_NOT_FOUND_READY_PIN_DRIFT');
  const text=decode(buffer);
  assert(text.endsWith('END_'+NOT_FOUND_READY_SOURCE.taskId+'\n')&&!text.includes('\0'),'PUBLIC_NOT_FOUND_READY_FOOTER');
  const headings=[...text.matchAll(/^## (public\.live\.notFound\.[^\n]*)$/gm)].map(match=>match[1]);
  assert(same(headings,NOT_FOUND_READY_SOURCE.sourceKeys),'PUBLIC_NOT_FOUND_READY_IDENTITY');
  const blocks=[...text.matchAll(/^## (public\.live\.notFound\.[^\n]*)\n+```json\n([\s\S]*?)\n```/gm)];
  assert(blocks.length===5,'PUBLIC_NOT_FOUND_READY_COMPLETENESS');
  return Object.freeze(blocks.map((block,index)=>{
    const values=JSON.parse(block[2]);
    assert(block[1]===NOT_FOUND_READY_SOURCE.sourceKeys[index]&&same(Object.keys(values),NOT_FOUND_LOCALES.slice(1))
      &&block[2]===JSON.stringify(values,null,2),'PUBLIC_NOT_FOUND_READY_LOCALE_OR_JSON_DRIFT');
    assert(Object.values(values).every(scalar),'PUBLIC_NOT_FOUND_READY_INVALID_SCALAR');
    return Object.freeze({key:block[1].split('.').at(-1),sourceKey:block[1],values:Object.freeze({...values})});
  }));
}

/** Fixed external pin: callers cannot re-pin changed bytes or introduce aliases/prototype keys. */
export function createNotFoundLookup(bytes){
  assert(bytes instanceof Uint8Array&&bytes.byteLength===6275,'PUBLIC_NOT_FOUND_INPUT_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===NOT_FOUND_INPUT_SHA256,'PUBLIC_NOT_FOUND_INPUT_PIN_DRIFT');
  const input=JSON.parse(decode(buffer));
  assert(buffer.equals(Buffer.from(JSON.stringify(input,null,2)+'\n')),'PUBLIC_NOT_FOUND_NONCANONICAL_BYTES');
  assert(same(Object.keys(input),['schemaVersion','domain','status','scope','locales','sourceInputs','sourceEquivalence',
    'nativeQa','legalQa','renderedQa','publicationAuthorized','entries'])
    &&input.schemaVersion===1&&input.domain==='public'&&input.status==='SOURCE_PINNED_PUBLIC_NOT_FOUND_SUBSET'
    &&input.scope==='PUBLIC_ERROR_PAGE_COPY_ONLY'&&same(input.locales,NOT_FOUND_LOCALES)
    &&same(input.sourceInputs,NOT_FOUND_SOURCE_INPUTS)&&input.sourceEquivalence==='PENDING_INDEPENDENT_REVIEW_AT_CAPTURE'
    &&input.nativeQa==='NOT_RUN'&&input.legalQa==='NOT_RUN'&&input.renderedQa==='NOT_RUN'
    &&input.publicationAuthorized===false,'PUBLIC_NOT_FOUND_SOURCE_LINEAGE_OR_GATES');
  assert(Array.isArray(input.entries)&&input.entries.length===7,'PUBLIC_NOT_FOUND_KEY_WHITELIST');
  const rows=new Map();
  for(const[index,row]of input.entries.entries()){
    assert(same(Object.keys(row),['key','values'])&&row.key===NOT_FOUND_KEYS[index]&&!rows.has(row.key)
      &&row.values&&same(Object.keys(row.values),NOT_FOUND_LOCALES),'PUBLIC_NOT_FOUND_IDENTITY_OR_LOCALE_DRIFT');
    assert(NOT_FOUND_LOCALES.every(locale=>scalar(row.values[locale])),'PUBLIC_NOT_FOUND_INVALID_SCALAR');
    assert(row.values.ru===NOT_FOUND_ORIGINAL_RU[row.key],'PUBLIC_NOT_FOUND_ORIGINAL_RU_DRIFT');
    rows.set(row.key,Object.freeze({...row.values}));
  }
  return (key,locale)=>{
    assert(typeof key==='string'&&rows.has(key),'PUBLIC_NOT_FOUND_UNKNOWN_KEY');
    guardLocale(locale);
    return rows.get(key)[locale];
  };
}
function bundledInput(){
  try{return import.meta.glob(['../../shared/content/client-ui/public-not-found.v1.json'],
    {query:'?raw',import:'default',eager:true});}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=bundledInput();
const bytes=bundled?Buffer.from(bundled['../../shared/content/client-ui/public-not-found.v1.json']??'','utf8')
  :readFileSync(new URL('../../shared/content/client-ui/public-not-found.v1.json',import.meta.url));
export const notFoundText=createNotFoundLookup(bytes);
const prefixes=Object.freeze({ru:'',en:'/en','zh-Hans':'/zh-cn',ko:'/ko',fr:'/fr',de:'/de',ja:'/ja',hi:'/hi',es:'/es',ar:'/ar'});
const choices=Object.freeze(languageChoices.map(([code,short,label])=>{
  guardLocale(code);
  return Object.freeze({code,short,label,href:prefixes[code]+'/404/'});
}));
assert(same(choices.map(row=>row.code),NOT_FOUND_LOCALES),'PUBLIC_NOT_FOUND_PICKER_LOCALE_DRIFT');
export function notFoundRoute(locale){guardLocale(locale);return prefixes[locale]+'/404/';}
export function notFoundHomeRoute(locale){guardLocale(locale);return prefixes[locale]+'/';}
export function notFoundLanguageChoices(){return choices.map(row=>({...row}));}
export const NOT_FOUND_FOREIGN_ERROR_PATHS=Object.freeze(NOT_FOUND_LOCALES.slice(1).map(locale=>
  Object.freeze({locale,segment:prefixes[locale].slice(1),route:notFoundRoute(locale)})));
