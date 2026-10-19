import projection from '../../../shared/content/client-ui/client-life-counts.v1.json';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';
const entries=YOGA_MINI_APP?null:projection.entries;

export type ClientLifeCountKey=keyof typeof projection.entries;
/** Count arithmetic stays in lifeCountdown/lifeProgress. This layer chooses a
 * received whole phrase, never English/Russian fragment order or a translation. */
function binding(value:ClientUiBindings){
 if(YOGA_MINI_APP)throw new Error('CLIENT_LIFE_COUNTS_MAIN_BUILD_ONLY');
 const ui=requireClientUiBindings(value);
 if(ui.locale==='ru'||ui.locale==='en')throw new Error('CLIENT_LIFE_COUNTS_FOREIGN_ONLY');
 return {ui,locale:ui.locale};
}
function integer(value:number){
 if(!Number.isSafeInteger(value)||value<0)throw new Error('CLIENT_LIFE_COUNT_DOMAIN');
 return value===0?0:value;
}
export function clientLifeCountNumber(value:ClientUiBindings,count:number):string{
 const {locale}=binding(value);
 return new Intl.NumberFormat(locale,{useGrouping:false,maximumFractionDigits:0}).format(integer(count));
}
export function clientLifeCountParts(value:ClientUiBindings,key:ClientLifeCountKey,count:number){
 if(!entries)throw new Error('CLIENT_LIFE_COUNTS_MAIN_BUILD_ONLY');
 const {ui,locale}=binding(value);integer(count);
 if(typeof key!=='string'||!Object.hasOwn(entries,key))throw new Error('CLIENT_LIFE_COUNT_KEY');
 if((key==='life.countdown.expired'||key==='life.termDays')&&count<1)throw new Error('CLIENT_LIFE_COUNT_DOMAIN');
 const category=new Intl.PluralRules(locale).select(count);
 const forms=entries[key][locale] as Readonly<Record<string,string>>;
 const template=forms[category];
 if(!Object.hasOwn(forms,category)||typeof template!=='string')throw new Error('CLIENT_LIFE_COUNT_SOURCE_GAP');
 const placeholder=key==='life.termDays'?'{progress_total}':'{count}';
 const parts=template.split(placeholder);
 if(parts.length!==2)throw new Error('CLIENT_LIFE_COUNT_SOURCE_SHAPE');
 const number=clientLifeCountNumber(ui,count),[before,after]=parts;
 return Object.freeze({before,number,after,text:before+number+after,category});
}
export function clientLifeCountText(value:ClientUiBindings,key:ClientLifeCountKey,count:number):string{
 return clientLifeCountParts(value,key,count).text;
}
