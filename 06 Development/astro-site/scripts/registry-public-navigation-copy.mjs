// Server/build-only emitted breadcrumb labels. No raw candidate, audit packet, prose or prices.
// Source-stage receipt flags do not authorize publication or claim native/legal/rendered QA.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

if(typeof window!=='undefined')throw Error('REGISTRY_NAVIGATION_SERVER_ONLY');
export const SUPPORTEDLOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
export const REGISTRY_NAVIGATION_INPUT_SHA256='4a6b4a17c19876728a90561a525c6052ca3ff59b3505ee0957fae14a04b0b4f9';
export const REGISTRY_NAVIGATION_SOURCE_INPUTS=Object.freeze({
  "candidate": "c7a9e9b1de0188369bd6f0bfd7d4b741d6d905be4d394b04f8ea9afd4fdbb7ed",
  "publicDictionary": "f460406e4623997cf1a960ff0cbfb9d6d9f0772fe633df246290a8b7a80cd943",
  "publicChrome": "45d203211332f788cdc8e9febde27a5016350806232faaa4c836c146a8421ad2",
  "sourcePacketIndex": "c2c590451f6532d5023a242b3c380d9956ce748802bbcacdbcb5be56d28cffd5",
  "receivedReadyMd": "f1dd207e44ecee75dbdfdff0a4f8f33e71242e764cf806b2363d01353a317997"
});
// Source provenance only; Browser download/native completion receipts are separate evidence.
export const REGISTRY_NAVIGATION_READY_SOURCE=Object.freeze({
  taskId:'PUBLIC_REGISTRY_SECTION_LABELS_8_LOCALES_DEV3_024',
  file:'AUDIT/GPT_COLLABORATION_2026-10-11/PUBLIC_REGISTRY_SECTION_LABELS_8_LOCALES_DEV3_024_DOWNLOADED_EXACT.md',
  bytes:4187,sha256:REGISTRY_NAVIGATION_SOURCE_INPUTS.receivedReadyMd,
  sourceKeys:Object.freeze(['public.registryNavigation.section.business','public.registryNavigation.section.documents']),
  independentReviewAtCapture:'PENDING_AT_DEV3_024_IMPORT',
});
export const REGISTRY_NAVIGATION_SOURCE_REFS=Object.freeze([
  {
    "key": "country.bali",
    "ru": "Бали",
    "en": "Bali",
    "taskId": "I02_UI_003",
    "sourceKey": "catalog.destination.bali.name",
    "sourceSha256": "749545e2bde8dc80cea158d4f07f6af930112936c5f86cc8e2c8125641c540b2",
    "assistantTextSha256": "c6b534ac9d014b4794786442af49754b9426e5738f9400d3c0111cf41964802d",
    "projectionSource": "publicDictionary",
    "projectionKey": "catalog.destination.bali.name"
  },
  {
    "key": "country.thailand",
    "ru": "Таиланд",
    "en": "Thailand",
    "taskId": "I02_UI_003",
    "sourceKey": "catalog.destination.thailand.name",
    "sourceSha256": "9d43f491649ac0e781cfbab3898a791701f03d7845520e77b044566a5272e745",
    "assistantTextSha256": "c6b534ac9d014b4794786442af49754b9426e5738f9400d3c0111cf41964802d",
    "projectionSource": "publicDictionary",
    "projectionKey": "catalog.destination.thailand.name"
  },
  {
    "key": "country.russia",
    "ru": "Россия",
    "en": "Russia",
    "taskId": "I02_UI_003",
    "sourceKey": "catalog.destination.russia.name",
    "sourceSha256": "d283c58e8625cbabe0959030a603234bc3113ccab91a24e74d6f9f40a186f0ea",
    "assistantTextSha256": "c6b534ac9d014b4794786442af49754b9426e5738f9400d3c0111cf41964802d",
    "projectionSource": "publicDictionary",
    "projectionKey": "catalog.destination.russia.name"
  },
  {
    "key": "country.nepal",
    "ru": "Непал",
    "en": "Nepal",
    "taskId": "I02_UI_003",
    "sourceKey": "catalog.destination.nepal.name",
    "sourceSha256": "f1360c3941896429caeadc341ed940e14f8fd3e5089fb11bd9f2d3357d0cb9b0",
    "assistantTextSha256": "c6b534ac9d014b4794786442af49754b9426e5738f9400d3c0111cf41964802d",
    "projectionSource": "publicDictionary",
    "projectionKey": "catalog.destination.nepal.name"
  },
  {
    "key": "country.uae",
    "ru": "ОАЭ",
    "en": "UAE",
    "taskId": "I02_UI_010",
    "sourceKey": "inline:06 Development/astro-site/src/components/HomeExperience.astro#0408e0cf6cc8",
    "sourceSha256": "8d1bed5704ace6b1c8083d03d0763afdd0e1f15376898d44d9f3f1080188f060",
    "assistantTextSha256": "78715c4702c2070011bdcffd6ead4dcb835647e9e086a74891307eae47ec7eca",
    "projectionSource": "publicChrome",
    "projectionKey": "uae.shortName"
  },
  {
    "key": "section.visa",
    "ru": "Визы",
    "en": "Visas",
    "taskId": "I02_UI_005",
    "sourceKey": "catalog.thailand.visas.name",
    "sourceSha256": "2aa8c9a14d213b6d45b867dd94cab730e52a257e52c0af9b9c46ae538df0bfea",
    "assistantTextSha256": "cd8fe52892bd689bd461c9a6ac314f8b67beaed4d53298d713323a9992b68918",
    "projectionSource": "publicDictionary",
    "projectionKey": "catalog.thailand.visas.name"
  },
  {
    "key": "section.business",
    "ru": "Бизнес",
    "en": "Business",
    "taskId": "PUBLIC_REGISTRY_SECTION_LABELS_8_LOCALES_DEV3_024",
    "sourceKind": "RECEIVED_READY_MD",
    "sourceKey": "public.registryNavigation.section.business",
    "readyMdSha256": "f1dd207e44ecee75dbdfdff0a4f8f33e71242e764cf806b2363d01353a317997",
    "projectionSource": "receivedReadyMd",
    "projectionKey": "public.registryNavigation.section.business"
  },
  {
    "key": "section.documents",
    "ru": "Документы",
    "en": "Documents",
    "taskId": "PUBLIC_REGISTRY_SECTION_LABELS_8_LOCALES_DEV3_024",
    "sourceKind": "RECEIVED_READY_MD",
    "sourceKey": "public.registryNavigation.section.documents",
    "readyMdSha256": "f1dd207e44ecee75dbdfdff0a4f8f33e71242e764cf806b2363d01353a317997",
    "projectionSource": "receivedReadyMd",
    "projectionKey": "public.registryNavigation.section.documents"
  }
].map(row=>Object.freeze(row)));
export const REGISTRY_NAVIGATION_MISSING_SECTIONS=Object.freeze([]);
const countryKeys=Object.freeze({bali:'country.bali',thailand:'country.thailand',russia:'country.russia',nepal:'country.nepal',uae:'country.uae'});
const sectionKeys=Object.freeze({visa:'section.visa',business:'section.business',documents:'section.documents'});
const requestedSections=Object.freeze(['visa','business','documents']);
const inputKeys=Object.freeze(REGISTRY_NAVIGATION_SOURCE_REFS.map(row=>row.key));
const assert=(ok,code)=>{if(!ok)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const localeGuard=locale=>assert(typeof locale==='string'&&SUPPORTEDLOCALES.includes(locale),'REGISTRY_NAVIGATION_UNKNOWN_LOCALE');
const scalar=value=>typeof value==='string'&&value.length>0&&value.length<=200
  &&value===value.trim()&&!/[\r\n\0{}<>]/u.test(value)
  &&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

/** Replay actual pinned ready MD as data only. Administrative QA/context never becomes customer copy.
 * This does not fetch a file or assert its Browser/native acquisition or independent review.
 */
export function replayRegistryNavigationReadyMd(bytes){
  assert(bytes instanceof Uint8Array&&bytes.byteLength===REGISTRY_NAVIGATION_READY_SOURCE.bytes,'REGISTRY_NAVIGATION_READY_MD_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===REGISTRY_NAVIGATION_READY_SOURCE.sha256,'REGISTRY_NAVIGATION_READY_MD_PIN_DRIFT');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}
  catch{throw Error('REGISTRY_NAVIGATION_READY_MD_UTF8');}
  assert(!text.includes('\0')&&text.endsWith('END_'+REGISTRY_NAVIGATION_READY_SOURCE.taskId+'\n'),'REGISTRY_NAVIGATION_READY_MD_FOOTER');
  const headings=[...text.matchAll(/^## (public\.registryNavigation\.[^\n]*)$/gm)].map(match=>match[1]);
  assert(same(headings,REGISTRY_NAVIGATION_READY_SOURCE.sourceKeys),'REGISTRY_NAVIGATION_READY_MD_SOURCE_IDENTITIES');
  const blocks=[...text.matchAll(/^## (public\.registryNavigation\.section\.(?:business|documents))\n+```json\n([\s\S]*?)\n```/gm)];
  assert(blocks.length===2,'REGISTRY_NAVIGATION_READY_MD_COMPLETENESS');
  return Object.freeze(blocks.map((block,index)=>{
    const sourceKey=REGISTRY_NAVIGATION_READY_SOURCE.sourceKeys[index],values=JSON.parse(block[2]);
    assert(block[1]===sourceKey&&same(Object.keys(values),SUPPORTEDLOCALES.slice(2))
      &&block[2]===JSON.stringify(values,null,2),'REGISTRY_NAVIGATION_READY_MD_JSON_OR_LOCALE_DRIFT');
    assert(Object.values(values).every(scalar),'REGISTRY_NAVIGATION_READY_MD_INVALID_SCALAR');
    return Object.freeze({key:index===0?'section.business':'section.documents',sourceKey,values:Object.freeze({...values})});
  }));
}

/** Fixed external byte and lineage pins. No caller-controlled re-pin, trimming or fallback. */
export function createRegistryNavigationLookup(bytes){
  assert(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=64*1024,'REGISTRY_NAVIGATION_INPUT_BOUNDARY');
  const buffer=Buffer.from(bytes);
  assert(hash(buffer)===REGISTRY_NAVIGATION_INPUT_SHA256,'REGISTRY_NAVIGATION_INPUT_PIN_DRIFT');
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}
  catch{throw Error('REGISTRY_NAVIGATION_INVALID_UTF8');}
  const input=JSON.parse(text);
  assert(buffer.equals(Buffer.from(JSON.stringify(input,null,2)+'\n')),'REGISTRY_NAVIGATION_NONCANONICAL_BYTES');
  assert(same(Object.keys(input),['schemaVersion','domain','status','scope','locales','sourceInputs','sourceEquivalence',
    'runtimeIntegrated','publicationAuthorized','nativeQa','legalQa','renderedQa','newLocaleRoutesActivated','entries','independentSourceReview'])
    &&input.schemaVersion===1&&input.domain==='public'&&input.status==='SOURCE_PINNED_REGISTRY_NAVIGATION_SUBSET'
    &&input.scope==='PUBLIC_BREADCRUMB_COUNTRY_SECTION_LABELS_ONLY'
    &&same(input.locales,SUPPORTEDLOCALES)&&same(input.sourceInputs,REGISTRY_NAVIGATION_SOURCE_INPUTS)
    &&input.sourceEquivalence==='PASS_WITH_LIMITATIONS'&&input.runtimeIntegrated===false
    &&input.publicationAuthorized===false&&input.nativeQa==='NOT_RUN'&&input.legalQa==='NOT_RUN'
    &&input.renderedQa==='NOT_RUN'&&input.newLocaleRoutesActivated===false
    &&input.independentSourceReview===REGISTRY_NAVIGATION_READY_SOURCE.independentReviewAtCapture,
    'REGISTRY_NAVIGATION_SOURCE_LINEAGE_OR_GATES');
  assert(Array.isArray(input.entries)&&input.entries.length===inputKeys.length,'REGISTRY_NAVIGATION_KEY_WHITELIST');
  const rows=new Map();
  for(const[index,row]of input.entries.entries()){
    const expected=REGISTRY_NAVIGATION_SOURCE_REFS[index];
    assert(same(Object.keys(row),['key','values'])&&row.key===expected.key&&!rows.has(row.key)
      &&row.values&&same(Object.keys(row.values),SUPPORTEDLOCALES),'REGISTRY_NAVIGATION_IDENTITY_OR_LOCALE_DRIFT');
    assert(SUPPORTEDLOCALES.every(locale=>scalar(row.values[locale])),'REGISTRY_NAVIGATION_INVALID_DISPLAY_SCALAR');
    // A same-RU, wrong-English alias is not the requested pair.
    assert(row.values.ru===expected.ru&&row.values.en===expected.en,'REGISTRY_NAVIGATION_ORIGINAL_PAIR_DRIFT');
    rows.set(row.key,Object.freeze({...row.values}));
  }
  return (key,locale)=>{
    assert(typeof key==='string'&&rows.has(key),'REGISTRY_NAVIGATION_UNKNOWN_KEY');
    localeGuard(locale);
    return rows.get(key)[locale];
  };
}
function bundledInput(){
  try{return import.meta.glob(['../../shared/content/client-ui/public-registry-navigation.v1.json'],
    {query:'?raw',import:'default',eager:true});}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=bundledInput();
const bytes=bundled?Buffer.from(bundled['../../shared/content/client-ui/public-registry-navigation.v1.json']??'','utf8')
  :readFileSync(new URL('../../shared/content/client-ui/public-registry-navigation.v1.json',import.meta.url));
const lookup=createRegistryNavigationLookup(bytes);

export function registryNavigationCountryLabel(slug,locale){
  assert(typeof slug==='string'&&Object.hasOwn(countryKeys,slug),'REGISTRY_NAVIGATION_UNKNOWN_COUNTRY');
  localeGuard(locale);
  return lookup(countryKeys[slug],locale);
}
export function registryNavigationSectionLabel(section,locale){
  assert(typeof section==='string'&&requestedSections.includes(section),'REGISTRY_NAVIGATION_UNKNOWN_SECTION');
  localeGuard(locale);
  assert(Object.hasOwn(sectionKeys,section),'REGISTRY_NAVIGATION_SECTION_SOURCE_NOT_RECEIVED');
  return lookup(sectionKeys[section],locale);
}
