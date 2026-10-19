import {VisaStatusHelp,hasVisaStatusHelp,statusHelpText as legacyStatusHelpText,type VisaStatusHelpProps,type StatusHelpKind,type StatusHelpLocale} from './VisaStatusHelp';
import {visaStatusOptions} from './visaEditorState';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientVisaLifeText,type ClientVisaLifeKey} from '../i18n/client-visa-life-copy';
import {clientVisaStatusLabel} from '../i18n/client-visa-presentation';

export function clientStatusHelpText(kind:StatusHelpKind,code:string,locale:StatusHelpLocale,ui?:ClientUiBindings){
 if(YOGA_MINI_APP||ui===undefined)return legacyStatusHelpText(kind,code,locale);
 const binding=requireClientUiBindings(ui);
 if(binding.locale==='ru'||binding.locale==='en')return legacyStatusHelpText(kind,code,binding.locale);
 const key=kind==='visa'
  ? `source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.visa.${hasVisaStatusHelp(code)?code:'fallback'}`
  : visaStatusOptions('external').includes(code)
   ? `source:06 Development/shared/content/visa-workflow-statuses.v1.json#help.external.${code}`
   : 'source:06 Development/react-app/src/components/visaEditorState.ts#help.external.fallback';
 return clientVisaLifeText(binding,key as ClientVisaLifeKey);
}

/** Main-only text adapter; it does not own business status, authorization or IDs. */
export function ClientVisaStatusHelp({ui,...props}:Omit<VisaStatusHelpProps,'presentation'>&{ui?:ClientUiBindings}){
 if(YOGA_MINI_APP||ui===undefined)return <VisaStatusHelp {...props}/>;
 const binding=requireClientUiBindings(ui);
 if(binding.locale==='ru'||binding.locale==='en')return <VisaStatusHelp {...props} locale={binding.locale}/>;
 const {kind,code,locale}=props;
 const statusLabel=kind==='external'?clientVisaStatusLabel('external',code,binding):code;
 return <VisaStatusHelp {...props} presentation={{
  explanation:clientStatusHelpText(kind,code,locale,binding),statusLabel,
  label:clientVisaLifeText(binding,'source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.aria',{code:statusLabel}),
  disclaimer:clientVisaLifeText(binding,'source:06 Development/react-app/src/components/VisaStatusHelp.tsx#help.disclaimer'),
 }}/>;
}
