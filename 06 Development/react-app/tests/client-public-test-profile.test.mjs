import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {PRIVATE_CLIENT_TESTS,PRIVATE_CLIENT_JSX_TESTS,PUBLIC_CLIENT_JSX_TESTS,PUBLIC_CLIENT_COMPANION,publicClientTestFiles} from '../scripts/client-public-test-profile.mjs';
const names=['ordinary.test.ts','second.test.ts',...PRIVATE_CLIENT_TESTS,...PRIVATE_CLIENT_JSX_TESTS,
 ...PUBLIC_CLIENT_JSX_TESTS,PUBLIC_CLIENT_COMPANION,'browser.spec.ts','build.test.mjs'];
test('public profile retains public TS and every explicitly public JSX, never private originals',()=>{
 const expected=['ordinary.test.ts','second.test.ts',...PUBLIC_CLIENT_JSX_TESTS].sort().concat(PUBLIC_CLIENT_COMPANION).map(n=>'tests/'+n);
 assert.deepEqual(publicClientTestFiles(names,'PUBLIC_DERIVATIVE'),expected);
 assert.deepEqual(PRIVATE_CLIENT_TESTS,['client-life-counts.test.ts','client-visa-external-source.test.ts','client-visa-life-copy.test.ts']);
 assert.equal(PUBLIC_CLIENT_JSX_TESTS.length,11);assert.equal(PRIVATE_CLIENT_JSX_TESTS.length,10);
 assert.equal(new Set([...PUBLIC_CLIENT_JSX_TESTS,...PRIVATE_CLIENT_JSX_TESTS]).size,21);
 for(const privateName of [...PRIVATE_CLIENT_TESTS,...PRIVATE_CLIENT_JSX_TESTS])assert(!expected.includes('tests/'+privateName));
 for(const inventory of [PRIVATE_CLIENT_TESTS,PRIVATE_CLIENT_JSX_TESTS,PUBLIC_CLIENT_JSX_TESTS])assert(Object.isFrozen(inventory));
});
test('public profile cannot silently fall back from a missing or unknown explicit contract',()=>{
 for(const contract of [undefined,'','PRIVATE_ORIGINALS','public_derivative'])assert.throws(()=>publicClientTestFiles(names,contract));
});
test('missing any public or private declaration or companion fails inventory rather than skipping evidence',()=>{
 for(const missing of [...PRIVATE_CLIENT_TESTS,...PRIVATE_CLIENT_JSX_TESTS,...PUBLIC_CLIENT_JSX_TESTS,PUBLIC_CLIENT_COMPANION])
  assert.throws(()=>publicClientTestFiles(names.filter(n=>n!==missing),'PUBLIC_DERIVATIVE'));
});
test('profile rejects duplicate names, path traversal and non-string inventory',()=>{
 for(const wrong of [[...names,names[0]],[...names,'../outside.test.ts'],[...names,'..\\outside.test.ts'],
  [...names,'bad\0.test.ts'],[...names,''],[...names,'.'],[...names,'..'],[...names,{}],null])
  assert.throws(()=>publicClientTestFiles(wrong,'PUBLIC_DERIVATIVE'));
});
test('unknown TSX or JSX cannot silently become an untested green gate',()=>{
 for(const name of ['future.test.tsx','future.test.jsx','visa-stay-controls.test.jsx'])
  assert.throws(()=>publicClientTestFiles([...names,name],'PUBLIC_DERIVATIVE'),/explicit public\/private classification/);
});
test('selection is deterministic and callers cannot mutate future results',()=>{
 const first=publicClientTestFiles([...names].reverse(),'PUBLIC_DERIVATIVE');
 assert.deepEqual(first,publicClientTestFiles(names,'PUBLIC_DERIVATIVE'));first.push('tests/forged.test.tsx');
 assert(!publicClientTestFiles(names,'PUBLIC_DERIVATIVE').includes('tests/forged.test.tsx'));
});
test('normal full unit gate includes TSX and does not replace required private inputs',()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['test:unit'],'tsx --test tests/*.test.ts tests/*.test.tsx');
 assert.equal(pkg.scripts['test:unit:public'],'node scripts/client-public-test-profile.mjs');
});
