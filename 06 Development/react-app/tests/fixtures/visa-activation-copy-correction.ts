import assert from 'node:assert/strict';
import correction from './visa-activation-copy-correction.json';

export const visaActivationCopyCorrection = correction;
// This finite application correction follows the complete historical replay.
// It never repins a native response or changes any other source identity.
export function correctedVisaHelpValues(key: string, values: Record<string, string>): Record<string, string> {
  if (key !== correction.identity) return values;
  assert.deepEqual(values, correction.before, 'Historical activation-help input must remain exact');
  return {...correction.after};
}
