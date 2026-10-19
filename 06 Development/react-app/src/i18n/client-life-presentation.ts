import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from './client-visa-life-copy';
import type {ClientRuntimeVariables} from './client-runtime';
import {formatLifeDate,formatLifePrice,lifeCopy,lifeStatus,type LifeKind,type LifeLocale,type LifeService} from '../components/lifeServices';
import {compactLifePrice} from '../components/lifePriceDisplay';

type CopyKey=keyof typeof lifeCopy.ru;
const prefix='source:06 Development/react-app/src/components/lifeServices.ts#';
function mainBinding(value:ClientUiBindings){
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  return requireClientUiBindings(value);
}
/** Canonical RU/EN remain literal. Missing foreign source is an explicit error,
 * never a fallback, translated fragment, new data or a whole-screen-ready claim. */
export function clientLifeText(value:ClientUiBindings,key:CopyKey):string{
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value);if(!Object.hasOwn(lifeCopy.ru,key))throw new Error('CLIENT_LIFE_COPY_KEY');
  if(ui.locale==='ru'||ui.locale==='en')return lifeCopy[ui.locale][key];
  return clientVisaLifeText(ui,(prefix+'lifeCopy.'+key) as ClientVisaLifeKey);
}
export function clientLifeCopies(value:ClientUiBindings){
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value);
  return Object.fromEntries((Object.keys(lifeCopy.ru) as CopyKey[]).map(key=>[key,clientLifeText(ui,key)])) as Record<CopyKey,string>;
}
const reminder={label:'12856f5cde25',disabled:'7dd2c3fd6900',noEndDate:'88f02f01257c',notCurrent:'19b1746a0623',error:'20d4dd2aa195',saved:'98d3cdd891fd'} as const;
export function clientLifeReminderText(value:ClientUiBindings,key:keyof typeof reminder){
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value);if(!Object.hasOwn(reminder,key))throw new Error('CLIENT_LIFE_REMINDER_KEY');
  return clientVisaLifeText(ui,('inline:06 Development/react-app/src/components/LifeReminderPreference.tsx#'+reminder[key]) as ClientVisaLifeKey);
}
/** The existing core selects status. Only its finite canonical display result is
 * rebound; no second date/group/expiry calculation is introduced. */
export function clientLifeStatus(item:Pick<LifeService,'kind'|'start_date'|'end_date'>,today:string,value:ClientUiBindings){
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value),legacy=lifeStatus(item,today,'ru');
  const keys=['housingToday','bikeToday','today','ended','upcoming','endOnly','currentLabel'] as const;
  const key=keys.find(key=>lifeCopy.ru[key]===legacy);if(!key)throw new Error('CLIENT_LIFE_STATUS_SOURCE_DRIFT');
  return clientLifeText(ui,key);
}
export function clientLifeDateLabel(kind:LifeKind,boundary:'start'|'end',value:ClientUiBindings){
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value);
  if(kind==='other')return clientVisaLifeText(ui,('inline:06 Development/react-app/src/components/lifeServices.ts#'+(boundary==='start'?'b592fe33e88f':'98dc8b09d5a0')) as ClientVisaLifeKey);
  const key=kind==='housing'?(boundary==='start'?'housingStart':'housingEnd'):kind==='bike'?(boundary==='start'?'bikeStart':'bikeEnd'):boundary==='start'?'start':'end';
  return clientLifeText(ui,key);
}
export function formatClientLifeDate(value:string|null,binding:ClientUiBindings):string{
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(binding);if(ui.locale==='ru'||ui.locale==='en')return formatLifeDate(value,ui.locale as LifeLocale);
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return clientLifeText(ui,'unknown');
  const date=new Date(`${value}T12:00:00+08:00`);if(Number.isNaN(date.valueOf()))return clientLifeText(ui,'unknown');
  return new Intl.DateTimeFormat(ui.locale,{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Makassar'}).format(date);
}
export function clientLifeRentalSummary(item:LifeService,value:ClientUiBindings):string|null{
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  const ui=mainBinding(value);
  if(item.kind==='housing'&&item.housing_type){
    if(!['guesthouse','hotel','apartment','villa'].includes(item.housing_type))return null;
    return clientVisaLifeText(ui,(prefix+'names.'+item.housing_type) as ClientVisaLifeKey);
  }
  // Replays the existing accepted whole template. It is not new full-CLDR QA.
  if(item.kind==='bike'||item.kind==='other')return clientVisaLifeText(ui,'inline:06 Development/react-app/src/components/lifeServices.ts#f834793c5945',{item_quantity____1:item.quantity??1});
  return null;
}
/** UI adoption only. The server still owns the write and record versions. A
 * late response cannot replace newer manager data already read by the parent. */
export function clientLifeReminderUpdate(current:LifeService,next:LifeService,value:ClientUiBindings):LifeService{
  if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_MAIN_BUILD_ONLY');
  mainBinding(value);
  if(next.id!==current.id||next.user_id!==current.user_id||!Number.isSafeInteger(next.version)||!Number.isSafeInteger(current.version)||next.version<current.version)return current;
  return next;
}

const inline={noEndDate:'0720c7cd5e00',monthlyNoEnd:'0e9a80e83bff',rentalMonth:'38f02bc282e7',startsIn:'73a321f722ea',serviceMonth:'7595ff2569e7',elapsedDays:'800354722682',monthly:'ff799de8162e'} as const;
export function clientLifeInline(value:ClientUiBindings,key:keyof typeof inline,variables?:ClientRuntimeVariables):string{
 const ui=mainBinding(value);if(!Object.hasOwn(inline,key))throw new Error('CLIENT_LIFE_INLINE_KEY');
 return clientVisaLifeText(ui,('inline:06 Development/react-app/src/components/BaliLifeCabinet.tsx#'+inline[key]) as ClientVisaLifeKey,variables);
}
export function clientLifeUrgency(value:ClientUiBindings,level:'urgent'|'soon'):string{
 const ui=mainBinding(value);if(level!=='urgent'&&level!=='soon')throw new Error('CLIENT_LIFE_URGENCY_KEY');
 return clientVisaLifeText(ui,('life.urgency.'+level) as ClientVisaLifeKey);
}
export function clientLifeFxTooltip(value:ClientUiBindings):string{
 return clientVisaLifeText(mainBinding(value),'life.fxApproximationTooltip');
}
/** Preserve the canonical exact-decimal and compact-price calculations. Only
 * their finite unit suffix changes; stored amounts, FX and rounding do not. */
export function clientLifePrice(item:Pick<LifeService,'price_amount'|'price_currency'|'price_unit'>,value:ClientUiBindings,compact=false):string|null{
 const ui=mainBinding(value),locale=ui.locale==='ru'||ui.locale==='en'?ui.locale:'en';
 if(!['period','month','day','policy'].includes(item.price_unit))throw new Error('CLIENT_LIFE_PRICE_UNIT');
 const legacy=(compact?compactLifePrice:formatLifePrice)(item,locale);
 if(legacy===null||ui.locale==='ru'||ui.locale==='en')return legacy;
 const unit=lifeCopy.en[item.price_unit];if(!legacy.endsWith(' '+unit))throw new Error('CLIENT_LIFE_PRICE_SOURCE_DRIFT');
 return legacy.slice(0,-unit.length)+clientLifeText(ui,item.price_unit);
}
