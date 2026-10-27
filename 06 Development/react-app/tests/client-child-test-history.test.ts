import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';import {createHash} from 'node:crypto';
import {restoreCurrentChildTestBeforeYogaImports as restoreChildTestBeforeYogaImports} from './fixtures/client-current-history-qualification';
const source=fs.readFileSync(new URL('./client-account-children-ten-locale.test.tsx',import.meta.url),'utf8');
test('four accepted test-loader additions restore the full independently fixed354 predecessor',()=>{
 assert.equal(createHash('sha256').update(restoreChildTestBeforeYogaImports(source)).digest('hex'),'d16310c10824bb17bbff9393a232e739451b3eba6d0cbd9043711da0214e205e');
});
for(const[name,changed]of [
 ['missing insertion',source.replace('import * as yogaRuntime from "../src/runtime/yoga-mini-app";\n','')],
 ['duplicate insertion',source+'import * as yogaRuntime from "../src/runtime/yoga-mini-app";\n'],
 ['altered stub',source.replace('return yogaRuntime;','return {};')],
 ['unrelated assertion drift',source+'\n// altered exterior\n'],
])test('fixed whole-source boundary rejects '+name,()=>assert.throws(()=>restoreChildTestBeforeYogaImports(changed)));
test('old354 endpoint cannot masquerade as accepted post-loader source',()=>{
 assert.throws(()=>restoreChildTestBeforeYogaImports(restoreChildTestBeforeYogaImports(source)));
});
test('non-string source is rejected without coercing an object',()=>{
 let called=0;for(const value of [null,{},new Uint8Array(),{toString(){called++;return source;}}])assert.throws(()=>restoreChildTestBeforeYogaImports(value as never));
 assert.equal(called,0);
});
