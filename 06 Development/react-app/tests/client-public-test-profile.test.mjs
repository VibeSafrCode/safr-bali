import assert from 'node:assert/strict';
import test from 'node:test';
import {PRIVATE_CLIENT_TESTS,PUBLIC_CLIENT_COMPANION,publicClientTestFiles} from '../scripts/client-public-test-profile.mjs';
const names=['ordinary.test.ts','second.test.ts',...PRIVATE_CLIENT_TESTS,PUBLIC_CLIENT_COMPANION,'browser.spec.ts','build.test.mjs'];
test('public profile retains every ordinary module except the exact three private-native modules',()=>{
 assert.deepEqual(publicClientTestFiles(names,'PUBLIC_DERIVATIVE'),['tests/ordinary.test.ts','tests/second.test.ts','tests/'+PUBLIC_CLIENT_COMPANION]);
 assert.deepEqual(PRIVATE_CLIENT_TESTS,['client-life-counts.test.ts','client-visa-external-source.test.ts','client-visa-life-copy.test.ts']);
});
test('public profile cannot silently fall back from a missing or unknown explicit contract',()=>{
 for(const contract of [undefined,'','PRIVATE_ORIGINALS','public_derivative'])assert.throws(()=>publicClientTestFiles(names,contract));
});
test('missing private declaration or public companion fails inventory rather than skipping evidence',()=>{
 for(const missing of [...PRIVATE_CLIENT_TESTS,PUBLIC_CLIENT_COMPANION])assert.throws(()=>publicClientTestFiles(names.filter(n=>n!==missing),'PUBLIC_DERIVATIVE'));
});
test('profile rejects duplicate names, path traversal and non-string inventory',()=>{
 for(const wrong of [[...names,names[0]],[...names,'../outside.test.ts'],[...names,{}],null])assert.throws(()=>publicClientTestFiles(wrong,'PUBLIC_DERIVATIVE'));
});
