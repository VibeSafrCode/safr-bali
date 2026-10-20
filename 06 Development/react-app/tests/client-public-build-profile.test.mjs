import assert from 'node:assert/strict';
import test from 'node:test';
import {PRIVATE_CLIENT_BUILD_TESTS,PUBLIC_CLIENT_BUILD_COMPANION,publicClientBuildTestFiles} from '../scripts/client-public-build-test-profile.mjs';
import {CLIENT_BOOTSTRAP_COMPARATOR_IDS,clientBootstrapCodeComparator} from './fixtures/client-bootstrap-code-comparators.mjs';

const names=['ordinary.test.mjs','second.test.mjs',...PRIVATE_CLIENT_BUILD_TESTS,PUBLIC_CLIENT_BUILD_COMPANION,'browser.spec.mjs','unit.test.ts'];
test('public build profile retains every ordinary module except the exact private old-graph comparator',()=>{
 assert.deepEqual(PRIVATE_CLIENT_BUILD_TESTS,['client-bootstrap-boundary.test.mjs']);
 assert.deepEqual(publicClientBuildTestFiles(names,'PUBLIC_DERIVATIVE'),['tests/ordinary.test.mjs','tests/second.test.mjs','tests/'+PUBLIC_CLIENT_BUILD_COMPANION]);
});
test('public build profile requires its explicit contract and never falls back from private evidence',()=>{
 for(const contract of [undefined,'','PRIVATE_ORIGINALS','public_derivative'])assert.throws(()=>publicClientBuildTestFiles(names,contract));
});
test('missing private declaration, companion or ordinary build inventory fails closed',()=>{
 for(const missing of [...PRIVATE_CLIENT_BUILD_TESTS,PUBLIC_CLIENT_BUILD_COMPANION])assert.throws(()=>publicClientBuildTestFiles(names.filter(name=>name!==missing),'PUBLIC_DERIVATIVE'));
 assert.throws(()=>publicClientBuildTestFiles([...PRIVATE_CLIENT_BUILD_TESTS,PUBLIC_CLIENT_BUILD_COMPANION],'PUBLIC_DERIVATIVE'));
});
test('build profile rejects duplicate names, traversal and non-string inventory',()=>{
 for(const wrong of [[...names,names[0]],[...names,'../outside.test.mjs'],[...names,{}],null])assert.throws(()=>publicClientBuildTestFiles(wrong,'PUBLIC_DERIVATIVE'));
});
test('public bootstrap fixture exposes exactly five whole public predecessors and rejects unknown selectors',()=>{
 assert.deepEqual(CLIENT_BOOTSTRAP_COMPARATOR_IDS,['main','pwa','bindings','account','calculator']);assert(Object.isFrozen(CLIENT_BOOTSTRAP_COMPARATOR_IDS));
 for(const id of CLIENT_BOOTSTRAP_COMPARATOR_IDS){const source=clientBootstrapCodeComparator(id);assert.equal(typeof source,'string');assert(source.length>100);assert.doesNotMatch(source,/\/Users\/|\/private\/(?:tmp|var)\/|assistantId|threadId|wholeAssistant|packPath/);}
 for(const id of ['__proto__','constructor','compiled-main',null,{},'main '])assert.throws(()=>clientBootstrapCodeComparator(id));
});
