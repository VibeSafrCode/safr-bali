import {ApiError} from '../api/client';
import {requireClientUiBindings,type ClientUiBindings} from './client-ui-bindings';

const drawer={close:'08fd5cb77ac8',open:'15321ec40383',closeSupport:'1b9feb6a2485',title:'75e107a9f4b8'} as const;
const panel={method:'110493f2fdde',invalidContact:'159bc38346f8',telegram:'1bd400d15136',lead:'3a7182b3289a',email:'419c229be8d2',phoneNumber:'462cdd7bd7d5',onTelegram:'7487f0c447f0',title:'75e107a9f4b8',phone:'7f5cd9fa2cce',message:'afa4c6eb9208',name:'bd8ead7c4713'} as const;
export function clientSupportDrawerText(ui:ClientUiBindings,key:keyof typeof drawer){
 return requireClientUiBindings(ui).text(`inline:06 Development/react-app/src/components/SupportDrawer.tsx#${drawer[key]}`);
}
export function clientSupportPanelText(ui:ClientUiBindings,key:keyof typeof panel){
 return requireClientUiBindings(ui).text(`inline:06 Development/react-app/src/components/SupportPanel.tsx#${panel[key]}`);
}
export function clientSupportApiError(ui:ClientUiBindings,caught:unknown){
 const key=caught instanceof ApiError
  ? caught.kind==='authentication'?'api.error.authentication'
   :caught.kind==='configuration'?'api.error.configuration'
   :caught.kind==='invalid_response'?'api.error.invalidResponse':'api.error.data'
  :'api.error.unknown';
 return requireClientUiBindings(ui).text(key);
}
