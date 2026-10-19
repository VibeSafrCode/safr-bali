import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import type {ClientUiPreferenceSnapshot} from '../i18n/client-ui-preference';

/** Never use legacy errorRollback/offline promises for an uncertain CAS write. */
export function ClientUiSyncNotice({ui,preference,onRetry}: {
  ui:ClientUiBindings;preference:ClientUiPreferenceSnapshot;onRetry:()=>void;
}){
  const binding=requireClientUiBindings(ui),status=preference.status;
  if(status==='local'||status==='idle')return null;
  const failed=!['saving','saved'].includes(status);
  return <div className={`locale-sync-status ${failed?'error':status==='saved'?'success':'pending'}`}
    role={failed?'alert':'status'} aria-live={failed?'assertive':'polite'}>
    <span>{binding.text(status==='saving'?'shell.language.pendingSync':status==='saved'?'shell.language.success':'api.error.data')}</span>
    {failed&&preference.enabled&&<button type="button" onClick={onRetry}>{binding.text('shell.language.retry')}</button>}
  </div>;
}
