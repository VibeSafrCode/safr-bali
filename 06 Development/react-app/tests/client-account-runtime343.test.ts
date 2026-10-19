import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {
  ACCOUNT_RUNTIME_KEYS,ACCOUNT_RUNTIME_LOCALES,projectAccountRuntime,
} from '../../shared/scripts/client-account-runtime-projection.mjs';
import {CLIENT_PATH_KEYS} from '../../shared/scripts/client-path-runtime-projection.mjs';
import {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';
import {restoreAcceptedSourceHistory} from './fixtures/client-source-history';
import {createClientRuntimeLookup,clientRuntimeText,CLIENT_RUNTIME_KEYS} from '../src/i18n/client-runtime';
const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
const currentRaw=fs.readFileSync(new URL('../../shared/content/client-ui/client-runtime.v1.json',import.meta.url));
const currentRuntime=JSON.parse(currentRaw.toString('utf8'));
const runtimeRaw=Buffer.from(json({...currentRuntime,entries:Object.fromEntries(Object.entries(currentRuntime.entries).filter(([key])=>!CLIENT_PATH_KEYS.includes(key)))}));
assert.equal(sha(runtimeRaw),'aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a','Exact historical343 reconstructed from additive354');
const runtime=JSON.parse(runtimeRaw.toString('utf8'));
const rows=ACCOUNT_RUNTIME_KEYS.map(key=>({key,values:runtime.entries[key]}));
const base={...runtime,entries:Object.fromEntries(Object.entries(runtime.entries).filter(([key])=>!ACCOUNT_RUNTIME_KEYS.includes(key)))};
const baseBytes=Buffer.from(json(base));

test('exact four-key derivative preserves all3390 old literal values',()=>{
  assert.equal(sha(baseBytes),'071f7d8593b482f469a2e68c36bbe29a68eb62fcb63a5a3b44ede8ba03f58c1b');
  const result=projectAccountRuntime(baseBytes,rows);
  assert.ok(result.bytes.equals(runtimeRaw));assert.equal(result.newValues,40);assert.equal(result.oldValuesPreserved,3390);
  assert.equal(sha(runtimeRaw),'aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a');
});
test('all40 accepted customer values resolve exactly, with no foreign fallback',()=>{
  assert.equal(sha(json(rows)),'36623ead5c7707dcbb067ab2acb25b49b44f2a338f147b7a64b6b6ae43d6f301');
  assert.equal(CLIENT_RUNTIME_KEYS.length,354);
  for(const key of Object.keys(runtime.entries))assert.ok(CLIENT_RUNTIME_KEYS.includes(key as never));
  for(const row of rows)for(const locale of ACCOUNT_RUNTIME_LOCALES)
    assert.equal(clientRuntimeText(locale as never,row.key as never),row.values[locale]);
  assert.throws(()=>clientRuntimeText('zh-cn' as never,rows[0].key as never));
  assert.throws(()=>clientRuntimeText('ar','admin.title' as never));
});
test('only fixed SHA, byte bound and keycount changed in browser lookup',()=>{
  const current=restoreRuntimeBeforeYogaBoundary(fs.readFileSync(new URL('../src/i18n/client-runtime.ts',import.meta.url),'utf8'));
  const historical=current.replace('098aa0534cdebbaeaec997dc5d4eefad6bbf59557a20c2147afb735ffd5a9b20','aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a')
    .replace('CLIENT_RUNTIME_BYTES = 197058','CLIENT_RUNTIME_BYTES = 188811').replace('keys.length === 354','keys.length === 343');
  assert.equal(sha(historical),'cb71213e4e60cb209e8a4dc7ee85e87291ddf2106bf420d161d70833f97ff871');
  const restored=historical.replace('aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a','071f7d8593b482f469a2e68c36bbe29a68eb62fcb63a5a3b44ede8ba03f58c1b')
    .replace('CLIENT_RUNTIME_BYTES = 188811','CLIENT_RUNTIME_BYTES = 184398').replace('keys.length === 343','keys.length === 339');
  assert.equal(sha(restored),'00b63be3bba797407af045739a4f716003482257c81fbe62017b0809fd3c42b4');
});
test('browser fixed pin rejects changed text, altered size and old339 input',()=>{
  const changed=JSON.parse(currentRaw.toString('utf8'));changed.entries[rows[0].key].en='X'+changed.entries[rows[0].key].en.slice(1);
  assert.throws(()=>createClientRuntimeLookup(json(changed)));
  assert.throws(()=>createClientRuntimeLookup(Buffer.concat([currentRaw,Buffer.from('\n')])));
  assert.throws(()=>createClientRuntimeLookup(runtimeRaw));
  assert.throws(()=>createClientRuntimeLookup(baseBytes));
});
test('source/app/auth/admin/preview caller remains unchanged in this source-only stage',()=>{
  assert.equal(sha(restoreAcceptedSourceHistory('callerAccount',fs.readFileSync(new URL('../src/surfaces/AccountApp.tsx',import.meta.url),'utf8'))),'a0f9af0c4dfbb9a26692c893729098fd782f66ef2a48bdc026e8adc562a5dc6f');
  assert.equal(sha(restoreAcceptedSourceHistory('callerApi',fs.readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8'))),'463d2699503349aa78a0d4d5a061ebbde04294f56c6b579c7c7904463608e478');
});
const altered=(mutate:(copy:any[])=>void)=>{const copy=JSON.parse(JSON.stringify(rows));mutate(copy);return copy;};
for(const [name,mutate]of [
  ['missing identity',(r:any[])=>r.pop()],
  ['duplicate identity',(r:any[])=>{r[1]=r[0];}],
  ['foreign Admin identity',(r:any[])=>{r[0].key='admin.title';}],
  ['QA metadata in customer row',(r:any[])=>{r[0].qa='PASS';}],
  ['foreign locale',(r:any[])=>{r[0].values.fa='x';}],
  ['missing locale',(r:any[])=>{delete r[0].values.ar;}],
  ['empty value',(r:any[])=>{r[0].values.ar='';}],
  ['HTML value',(r:any[])=>{r[0].values.ar='<b>SAFRWAY</b>';}],
  ['unpaired surrogate',(r:any[])=>{r[0].values.ar='SAFRWAY\uD800';}],
  ['significant edge drift',(r:any[])=>{r[0].values.ar+=' ';}],
  ['placeholder drift',(r:any[])=>{r[0].values.ar+=' {actor}';}],
  ['protected brand drift',(r:any[])=>{r[0].values.ar=r[0].values.ar.replace('SAFRWAY','Other');}],
] as const)test('reject '+name,()=>assert.throws(()=>projectAccountRuntime(baseBytes,altered(mutate))));
