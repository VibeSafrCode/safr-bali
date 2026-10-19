import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Test-only reverse of the accepted Yoga/Main module-exclusion boundary.
// The external historical354 pin remains fixed; arbitrary current bytes cannot
// bless themselves. No customer data, runtime implementation or pin is edited.
export function restoreRuntimeBeforeYogaBoundary(source: string): string {
  assert.equal(typeof source, 'string');
  const reverse = (current: string, previous: string) => {
    assert.equal(source.split(current).length, 2, 'Exact unique Yoga runtime boundary span');
    source = source.replace(current, previous);
  };
  reverse("import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';\n", '');
  reverse('// Yoga deliberately retains its existing RUEN UI. Compile-time exclusion is\n'
    + '// explicit: disabling React effects alone cannot prevent module evaluation.\n'
    + '// Main still validates the same fixed source bytes before any lookup.\n'
    + 'const lookup = YOGA_MINI_APP ? null :\n'
    + '  createClientRuntimeLookup(JSON.stringify(projection, null, 2) + "\\n");\n'
    + 'export const CLIENT_RUNTIME_KEYS = lookup?.keys ?? Object.freeze([] as ClientRuntimeKey[]);',
    'const lookup = createClientRuntimeLookup(JSON.stringify(projection, null, 2) + "\\n");\n'
    + 'export const CLIENT_RUNTIME_KEYS = lookup.keys;');
  reverse('  if(!lookup)throw new Error("CLIENT_UI_MAIN_BUILD_ONLY");\n', '');
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '409d7dff1b4deadc91fc406426cf0f16f97c4c1a2de0c5e0264c2ee508a838a7',
    'Exact independently retained historical354 module');
  return source;
}
