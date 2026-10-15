import {restorePreWorkingRegistry} from '../../scripts/import-working-bundle.mjs';
import {preReadyEditorialRegistry,publicPreimportHistory} from './pre-ready-editorial-registry.mjs';
// Exact preceding v82 snapshot; historical import pins are not relaxed.
export function preWorkingRegistry(current) {
  const preceding=preReadyEditorialRegistry(current);
  if(preceding.records.length!==159)return preceding;
  const history=publicPreimportHistory('working');
  return restorePreWorkingRegistry(preceding,history);
}
