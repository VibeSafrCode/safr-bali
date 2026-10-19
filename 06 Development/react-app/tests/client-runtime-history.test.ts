import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';

const current = fs.readFileSync(new URL('../src/i18n/client-runtime.ts', import.meta.url), 'utf8');
test('Yoga-boundary reverse restores the entire historical354 source, not a new blessed pin', () => {
  assert.equal(createHash('sha256').update(restoreRuntimeBeforeYogaBoundary(current)).digest('hex'),
    '409d7dff1b4deadc91fc406426cf0f16f97c4c1a2de0c5e0264c2ee508a838a7');
});
for (const [name, value] of [
  ['module guard alteration', current.replace('YOGA_MINI_APP ? null', 'false ? null')],
  ['denial guard alteration', current.replace('CLIENT_UI_MAIN_BUILD_ONLY', 'changed')],
  ['unrelated exterior byte drift', current + '\n'],
] as const) test('historical reverse rejects ' + name, () => {
  assert.throws(() => restoreRuntimeBeforeYogaBoundary(value));
});
