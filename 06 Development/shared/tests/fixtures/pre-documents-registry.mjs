import {restorePreDocumentsRegistry} from '../../scripts/import-documents-bundle.mjs';
import {preWorkingRegistry} from './pre-working-registry.mjs';
import {publicPreimportHistory} from './pre-ready-editorial-registry.mjs';
// Restore exact preceding bytes for historical import tests, never relax their
// original hashes/counts to accommodate newly imported Documents records.
export function preDocumentsRegistry(current) {
  current=preWorkingRegistry(current);
  if(current.records.length!==157)return structuredClone(current);
  const history=publicPreimportHistory('documents');
  return restorePreDocumentsRegistry(current,history);
}
