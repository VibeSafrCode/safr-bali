// Server/build-only public captions. No candidate, client inventory or raw audit source is bundled.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const PUBLIC_VISA_WORKSPACE_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const);
export type PublicVisaWorkspaceLocale=typeof PUBLIC_VISA_WORKSPACE_LOCALES[number];
export const PUBLIC_VISA_WORKSPACE_KEYS=Object.freeze([
  "public.live.visaWorkspace.purposeLegend",
  "public.live.visaWorkspace.catalogTab",
  "public.live.visaWorkspace.processStep3Copy",
  "public.live.visaWorkspace.durationUndecidedValue",
  "public.live.visaWorkspace.durationUpToMonth",
  "public.live.visaWorkspace.purposeHoliday",
  "public.live.visaWorkspace.tripRequestButton",
  "public.live.visaWorkspace.tabsAria",
  "public.live.visaWorkspace.durationMoreThan2MonthsValue",
  "public.live.visaWorkspace.processStep3Title",
  "public.live.visaWorkspace.durationOver2MonthsLabel",
  "public.live.visaWorkspace.tripPurposeQuestion",
  "public.live.visaWorkspace.purposeRemoteWork",
  "public.live.visaWorkspace.processStep2Copy",
  "public.live.visaWorkspace.processStep1Copy",
  "public.live.visaWorkspace.processEyebrow",
  "public.live.visaWorkspace.tripEyebrow",
  "public.live.visaWorkspace.statusDescription",
  "public.live.visaWorkspace.processStep1Title",
  "public.live.visaWorkspace.noscriptCatalogLink",
  "public.live.visaWorkspace.duration1To2Months",
  "public.live.visaWorkspace.tripAssistantNote",
  "public.live.visaWorkspace.notSureYet",
  "public.live.visaWorkspace.durationLegend",
  "public.live.visaWorkspace.purposeBusiness",
  "public.live.visaWorkspace.processStep2Title",
  "public.live.visaWorkspace.processTitle",
  "public.live.visaWorkspace.statusAccountButton",
  "public.live.visaWorkspace.statusTitle",
  "public.live.visaWorkspace.heroDescription",
  "public.live.visaWorkspace.findVisaTab",
  "public.live.visaWorkspace.heroEyebrow",
  "public.live.visaWorkspace.heroTitle",
  "public.live.visaWorkspace.statusTab",
  "public.live.visaWorkspace.backLink"
] as const);
export type PublicVisaWorkspaceKey=typeof PUBLIC_VISA_WORKSPACE_KEYS[number];
export const PUBLIC_VISA_WORKSPACE_INPUT_SHA256='80928ac5b292813054b5ec5a9d5bd68be2fb904bb28d6f067cc5a3bbeb8451c9';

const requireValue=(value:unknown,code:string):void=>{if(!value)throw Error(code);};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const scalar=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=2000
  &&value===value.trim()&&!/[\n\r\0{}<>]/u.test(value)
  &&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

/** Fixed pin and exact35-key allowlist; no re-pin argument, source override or fallback. */
export function createPublicVisaWorkspaceLookup(bytes:Uint8Array){
  requireValue(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=512*1024,'PUBLIC_VISA_WORKSPACE_INPUT_BOUNDARY');
  const buffer=Buffer.from(bytes);
  requireValue(sha(buffer)===PUBLIC_VISA_WORKSPACE_INPUT_SHA256,'PUBLIC_VISA_WORKSPACE_INPUT_PIN_DRIFT');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}
  catch{throw Error('PUBLIC_VISA_WORKSPACE_INVALID_UTF8');}
  const input=JSON.parse(text);
  requireValue(buffer.equals(Buffer.from(JSON.stringify(input,null,2)+'\n')),'PUBLIC_VISA_WORKSPACE_NONCANONICAL_INPUT');
  requireValue(same(Object.keys(input),['schemaVersion','domain','status','scope','locales','sourceEquivalence',
    'runtimeIntegrated','publicationAuthorized','nativeQa','legalQa','renderedQa','newLocaleRoutesActivated','entries'])
    &&input.schemaVersion===1&&input.domain==='public'&&input.status==='SOURCE_PINNED_PUBLIC_VISA_WORKSPACE_SUBSET'
    &&input.scope==='PUBLIC_VISA_WORKSPACE_CAPTIONS_ONLY_NO_ADMIN_OR_ARTICLES'
    &&same(input.locales,PUBLIC_VISA_WORKSPACE_LOCALES)&&input.sourceEquivalence==='PASS_WITH_LIMITATIONS'
    &&input.runtimeIntegrated===false&&input.publicationAuthorized===false&&input.nativeQa==='NOT_RUN'
    &&input.legalQa==='NOT_RUN'&&input.renderedQa==='NOT_RUN'&&input.newLocaleRoutesActivated===false,
    'PUBLIC_VISA_WORKSPACE_SOURCE_GATES');
  requireValue(Array.isArray(input.entries)&&input.entries.length===PUBLIC_VISA_WORKSPACE_KEYS.length,'PUBLIC_VISA_WORKSPACE_WHITELIST');
  const entries=new Map<PublicVisaWorkspaceKey,Readonly<Record<PublicVisaWorkspaceLocale,string>>>();
  for(const[index,row]of input.entries.entries()){
    const key=PUBLIC_VISA_WORKSPACE_KEYS[index];
    requireValue(row.key===key&&!entries.has(key)&&same(Object.keys(row),['key','values'])
      &&row.values&&same(Object.keys(row.values),PUBLIC_VISA_WORKSPACE_LOCALES),'PUBLIC_VISA_WORKSPACE_IDENTITY_OR_LOCALE_DRIFT');
    requireValue(PUBLIC_VISA_WORKSPACE_LOCALES.every(locale=>scalar(row.values[locale])),'PUBLIC_VISA_WORKSPACE_TEXT_OR_TOKEN_DRIFT');
    entries.set(key,Object.freeze({...row.values}));
  }
  return(key:PublicVisaWorkspaceKey,locale:PublicVisaWorkspaceLocale):string=>{
    requireValue(typeof key==='string'&&entries.has(key),'PUBLIC_VISA_WORKSPACE_UNKNOWN_KEY');
    requireValue(PUBLIC_VISA_WORKSPACE_LOCALES.includes(locale),'PUBLIC_VISA_WORKSPACE_UNKNOWN_LOCALE');
    return entries.get(key)![locale];
  };
}

function bundledInput():Record<string,string>|null{
  try{return import.meta.glob(['../../../shared/content/client-ui/public-visa-workspace.v1.json'],
    {query:'?raw',import:'default',eager:true}) as Record<string,string>;}
  catch(error){if(typeof import.meta.glob!=='function')return null;throw error;}
}
const bundled=bundledInput();
const bytes=bundled?Buffer.from(bundled['../../../shared/content/client-ui/public-visa-workspace.v1.json']??'','utf8')
  :readFileSync(new URL('../../../shared/content/client-ui/public-visa-workspace.v1.json',import.meta.url));
const lookup=createPublicVisaWorkspaceLookup(bytes);

/** Customer scalar only. Source-stage QA/approval fields are never returned. */
export function publicVisaWorkspaceText(key:PublicVisaWorkspaceKey,locale:PublicVisaWorkspaceLocale):string{
  return lookup(key,locale);
}

/** Same controls, counts/order and default selection. Values and labels intentionally differ. */
export function publicVisaWorkspaceOptions(locale:PublicVisaWorkspaceLocale){
  const text=(key:PublicVisaWorkspaceKey)=>publicVisaWorkspaceText(key,locale);
  return Object.freeze({
    durations:Object.freeze([
      text('public.live.visaWorkspace.durationUndecidedValue'),
      text('public.live.visaWorkspace.durationUpToMonth'),
      text('public.live.visaWorkspace.duration1To2Months'),
      text('public.live.visaWorkspace.durationMoreThan2MonthsValue'),
    ]),
    durationLabels:Object.freeze([
      text('public.live.visaWorkspace.notSureYet'),
      text('public.live.visaWorkspace.durationUpToMonth'),
      text('public.live.visaWorkspace.duration1To2Months'),
      text('public.live.visaWorkspace.durationOver2MonthsLabel'),
    ]),
    purposes:Object.freeze([
      text('public.live.visaWorkspace.purposeHoliday'),
      text('public.live.visaWorkspace.purposeBusiness'),
      text('public.live.visaWorkspace.purposeRemoteWork'),
      text('public.live.visaWorkspace.notSureYet'),
    ]),
  });
}
