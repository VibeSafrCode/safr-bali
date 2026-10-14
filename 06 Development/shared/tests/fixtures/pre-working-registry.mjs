import {readFileSync} from 'node:fs';
import {restorePreWorkingRegistry,WORKING_HISTORY} from '../../scripts/import-working-bundle.mjs';
import {preReadyEditorialRegistry} from './pre-ready-editorial-registry.mjs';
// Exact preceding v82 snapshot; historical import pins are not relaxed.
export function preWorkingRegistry(current) {
  const preceding=preReadyEditorialRegistry(current);
  if(preceding.records.length!==159)return preceding;
  const history=JSON.parse(readFileSync(new URL('../../content/'+WORKING_HISTORY,import.meta.url)));
  return restorePreWorkingRegistry(preceding,history);
}
