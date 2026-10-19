import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from './client-visa-life-copy';
import {visaDatePresentation} from '../components/visaDatePresentation';
import type {VisaCase} from '../api/types';
import workflow from '../../../shared/content/visa-workflow-statuses.v1.json';
import {visaStatusLabel,type StatusKind} from '../components/visaEditorState';

function binding(value:ClientUiBindings){
 if(YOGA_MINI_APP)throw new Error('CLIENT_VISA_MAIN_BUILD_ONLY');
 return requireClientUiBindings(value);
}

/** Only known canonical codes have translated labels; unknown codes stay literal. */
export function clientVisaStatusLabel(kind:StatusKind,code:string,value:ClientUiBindings){
 const ui=binding(value);
 if(ui.locale==='ru'||ui.locale==='en')return visaStatusLabel(kind,code,ui.locale);
 if(kind==='lifecycle')throw new Error('CLIENT_VISA_CARD_LABEL_REQUIRED');
 if(!workflow[kind].some(item=>item.code===code))return code;
 const path='source:06 Development/shared/content/visa-workflow-statuses.v1.json#'+(kind==='external'?'external.label.':'service.')+code;
 return clientVisaLifeText(ui,path as ClientVisaLifeKey);
}

export function clientVisaCardStatus(code:string,value:ClientUiBindings){
 const ui=binding(value);
 const known=['NOT_ISSUED','ISSUED_NOT_ACTIVATED','ACTIVE','EXPIRING','EXTENSION_PROCESSING','EXTENDED','EXPIRED','CANCELLED','REFUSED'];
 if(!known.includes(code))return code;
 return clientVisaLifeText(ui,('source:06 Development/react-app/src/components/VisaCabinet.tsx#lifecycle.'+code) as ClientVisaLifeKey);
}

export function clientVisaFormatDate(value:string|null|undefined,ui:ClientUiBindings,fallback:string){
 const locale=binding(ui).locale;
 if(!value)return fallback;
 const date=new Date(`${value.slice(0,10)}T00:00:00+08:00`);
 if(!Number.isFinite(date.getTime()))return fallback;
 return new Intl.DateTimeFormat(locale==='ru'?'ru-RU':locale==='en'?'en-GB':locale,
  {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Makassar'}).format(date);
}

/** The core still selects the confirmed/estimated date and its precedence. */
export function clientVisaDatePresentation(item:Pick<VisaCase,'entered_on'|'entry_deadline'|'stay_end'|'expected_stay_end'>,value:ClientUiBindings){
 if(YOGA_MINI_APP)throw new Error('CLIENT_VISA_MAIN_BUILD_ONLY');
 const ui=requireClientUiBindings(value);
 if(ui.locale==='ru'||ui.locale==='en')return visaDatePresentation(item,ui.locale);
 const date=visaDatePresentation(item,'en');if(!date)return null;
 const labels={'Permitted to stay until':'permittedStayUntil','Enter by':'enterBy','Estimated stay until':'estimatedStayUntil'} as const;
 if(!Object.hasOwn(labels,date.label))throw new Error('CLIENT_VISA_DATE_SOURCE_DRIFT');
 const key=labels[date.label as keyof typeof labels];
 return {...date,label:clientVisaLifeText(ui,('source:06 Development/react-app/src/components/visaDatePresentation.ts#dates.'+key) as ClientVisaLifeKey)};
}
