// Explicit build/test scope, not an automatic missing-file or CI fallback.
import assert from 'node:assert/strict';

export const PRIVATE_ORIGINALS='PRIVATE_ORIGINALS';
export const PUBLIC_DERIVATIVE='PUBLIC_DERIVATIVE';

export function editorialVerificationContract(value=process.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT??PRIVATE_ORIGINALS) {
  assert.ok([PRIVATE_ORIGINALS,PUBLIC_DERIVATIVE].includes(value),'Unknown editorial verification contract');
  return value;
}

export function editorialValidator(privateOriginals,publicDerivative,contract=editorialVerificationContract()) {
  return editorialVerificationContract(contract)===PRIVATE_ORIGINALS?privateOriginals:publicDerivative;
}
