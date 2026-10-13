import {createHash} from 'node:crypto';
import input from '../../../shared/content/client-ui/public-editorial-live.v1.json';
import {getBotVisaCopy} from './visa-bot-copy';

// Public-only received copy; original bot/pricing/customer data are untouched.
export const PUBLIC_EDITORIAL_LOCALES=Object.freeze(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const);
export type PublicEditorialLocale=typeof PUBLIC_EDITORIAL_LOCALES[number];
export const PUBLIC_EDITORIAL_INPUT_SHA256='6036f877797ed3bd209a3e770bab7168664013fa218b436ff0ef8fb139a35d7f';
const hash=createHash('sha256').update(JSON.stringify(input,null,2)+'\n').digest('hex');
if(hash!==PUBLIC_EDITORIAL_INPUT_SHA256)throw Error('Public editorial live source projection drift');
const rows=new Map(input.entries.map(row=>[row.key,row]));
const keys=Object.freeze([
  'catalog.bali.guides.all-indonesia.content','catalog.bali.visas.other-visa.content',
  'public.live.visa.disclaimer.conditionsMayChange','public.live.visa.disclaimer.verifyBeforePayment','public.live.visa.disclaimer.writeNext',
  'public.live.uae.fullName','public.live.uae.description','public.live.uae.service.staysLabel','public.live.uae.service.assistantLabel',
  'public.live.uae.services.comingSoonNote','public.live.uae.services.availabilityEnquiryTemplate','public.live.uae.insurance.descriptionSuffix',
] as const);
export type PublicEditorialKey=typeof keys[number];
function assertLocale(locale:string):asserts locale is PublicEditorialLocale{
  if(!(PUBLIC_EDITORIAL_LOCALES as readonly string[]).includes(locale))throw Error('Unsupported public editorial locale');
}
export function publicEditorialText(key:PublicEditorialKey,locale:PublicEditorialLocale):string{
  assertLocale(locale);
  if(!(keys as readonly string[]).includes(key))throw Error('Unknown public editorial identity');
  const row=rows.get(key),value=locale==='ru'||locale==='en'?row?.[locale]
    :(row?.translations as Record<string,string>|undefined)?.[locale];
  if(typeof value!=='string'||!value)throw Error('Missing public editorial source value');
  return value;
}
export function getPublicUaeCopy(locale:PublicEditorialLocale){
  assertLocale(locale);
  return {fullName:publicEditorialText('public.live.uae.fullName',locale),description:publicEditorialText('public.live.uae.description',locale),
    staysLabel:publicEditorialText('public.live.uae.service.staysLabel',locale),assistantLabel:publicEditorialText('public.live.uae.service.assistantLabel',locale),
    soonNote:publicEditorialText('public.live.uae.services.comingSoonNote',locale),insuranceDescriptionSuffix:publicEditorialText('public.live.uae.insurance.descriptionSuffix',locale)};
}
export function publicUaeAvailabilityMessage(label:string,locale:PublicEditorialLocale){
  return publicEditorialText('public.live.uae.services.availabilityEnquiryTemplate',locale).replace(/\$\{app\.label\}/g,()=>label);
}
export function getPublicOtherVisaCopy(locale:PublicEditorialLocale){
  assertLocale(locale);
  // Exact existing RU/EN result, including non-rendered priceCopy fields.
  if(locale==='ru'||locale==='en')return getBotVisaCopy('/bali/visas/other-visa/',locale)!;
  const fullBody=publicEditorialText('catalog.bali.visas.other-visa.content',locale).replace(/\\n/g,'\n').trim();
  const paragraphs=fullBody.split(/\n\n/);
  return {key:'Другая виза' as const,fullBody,title:paragraphs[0],lead:paragraphs[1]??'',paragraphs:paragraphs.slice(2),
    disclaimers:['conditionsMayChange','verifyBeforePayment','writeNext'].map(id=>publicEditorialText(('public.live.visa.disclaimer.'+id) as PublicEditorialKey,locale)),
    // No invented static price; this branch never renders the price container.
    priceCopy:{} as Record<string,string>};
}
