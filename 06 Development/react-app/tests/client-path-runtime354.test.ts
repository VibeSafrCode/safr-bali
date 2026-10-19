import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {CLIENT_PATH_KEYS,CLIENT_PATH_LOCALES,projectClientPathRuntime} from '../../shared/scripts/client-path-runtime-projection.mjs';
import {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';
import {CLIENT_RUNTIME_KEYS,CLIENT_RUNTIME_SHA256,CLIENT_RUNTIME_BYTES,createClientRuntimeLookup,clientRuntimeText,clientRuntimeDirection} from '../src/i18n/client-runtime';
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
const current=fs.readFileSync(new URL('../../shared/content/client-ui/client-runtime.v1.json',import.meta.url));
const data=JSON.parse(current.toString('utf8'));
const rows=CLIENT_PATH_KEYS.map(key=>({key,values:data.entries[key]}));
const base=Buffer.from(json({...data,entries:Object.fromEntries(Object.entries(data.entries).filter(([key])=>!CLIENT_PATH_KEYS.includes(key)))}));
const oldModulePin='cb71213e4e60cb209e8a4dc7ee85e87291ddf2106bf420d161d70833f97ff871';

test('eleven accepted identities preserve all3430 baseline values and customer-only354 schema',()=>{
  assert.equal(sha(base),'aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a');
  assert.equal(sha(json(rows)),'e4274c1447d4f1184708e3df9a0c276f1259783e1a5b958d317022f18660c7f3');
  const r=projectClientPathRuntime(base,rows);assert.ok(r.bytes.equals(current));
  assert.equal(r.oldValuesPreserved,3430);assert.equal(r.newForeignValues,88);assert.equal(r.newValues,110);assert.equal(r.newTranslations,0);
  assert.equal(sha(current),'098aa0534cdebbaeaec997dc5d4eefad6bbf59557a20c2147afb735ffd5a9b20');
  assert.equal(current.length,197058);assert.equal(CLIENT_RUNTIME_BYTES,current.length);assert.equal(CLIENT_RUNTIME_SHA256,sha(current));
  assert.equal(CLIENT_RUNTIME_KEYS.length,354);assert.deepEqual(Object.keys(data),['schemaVersion','domain','locales','entries']);
  assert.ok(!CLIENT_PATH_KEYS.includes('theme.bali.locative'));assert.ok(!CLIENT_PATH_KEYS.includes('ui.common.details'));
});
for(const locale of CLIENT_PATH_LOCALES)test('all11 literal accepted values and locative interpolation resolve: '+locale,()=>{
  for(const row of rows)assert.equal(clientRuntimeText(locale as never,row.key as never),row.values[locale]);
  assert.equal(clientRuntimeDirection(locale as never),locale==='ar'?'rtl':'ltr');
  for(const key of ['theme.bali.locative',...CLIENT_PATH_KEYS.filter(k=>k.startsWith('theme.'))]){
    const location=clientRuntimeText(locale as never,key as never),template=data.entries['managerCard.description'][locale];
    assert.equal(clientRuntimeText(locale as never,'managerCard.description',{location}),template.replace('{location}',location));
  }
  assert.throws(()=>clientRuntimeText(locale as never,'managerCard.description',{country:'synthetic'}));
  assert.throws(()=>clientRuntimeText(locale as never,'managerCard.description',{location:'synthetic',country:'synthetic'}));
});
test('semantic details reuse keeps target RUEN identity, not a silent exact alias',()=>{
  assert.equal(data.entries['catalog.details'].ru,'Подробнее');assert.equal(data.entries['catalog.details'].en,'More details');
  assert.notEqual(data.entries['catalog.details'].en,'Learn more');assert.ok(!Object.hasOwn(data.entries,'ui.common.details'));
});
test('only fixed hash, bound and keycount changed in browser lookup',()=>{
  const text=restoreRuntimeBeforeYogaBoundary(fs.readFileSync(new URL('../src/i18n/client-runtime.ts',import.meta.url),'utf8'));
  const old=text.replace(CLIENT_RUNTIME_SHA256,'aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a').replace('CLIENT_RUNTIME_BYTES = 197058','CLIENT_RUNTIME_BYTES = 188811').replace('keys.length === 354','keys.length === 343');
  assert.equal(sha(old),oldModulePin);
});
test('current fixed pin rejects same-size accepted-text drift, invalid UTF8 and old343',()=>{
  const edited=JSON.parse(current.toString('utf8'));const key=CLIENT_PATH_KEYS[0];edited.entries[key].en='X'+edited.entries[key].en.slice(1);
  const sameSize=Buffer.from(json(edited));assert.equal(sameSize.length,current.length);assert.throws(()=>createClientRuntimeLookup(sameSize),/PIN_DRIFT/);
  const bad=Buffer.from(current);bad[100]=255;assert.throws(()=>createClientRuntimeLookup(bad));assert.throws(()=>createClientRuntimeLookup(base));
});

// The two historical tests have exact, additive, version-bound derivatives.
// Compare entire files against their separately hash-pinned predecessor, not
// merely a new assertion count or a freshly blessed current test hash.
test('all historical343 and child26 assertions survive only explicit additive derivatives',()=>{
  const root=process.env.SAFR_TEST_PATH_BASE;assert.ok(root&&path.isAbsolute(root));
  const pairs:{file:string;pin:string;edits:[string,string][]}[]=[
    {file:'client-account-runtime343.test.ts',pin:'f997296da50cefadc35d62a9e7a0d10c09961c6165ef36e64e2424a174d534a8',edits:[
      ["import {createClientRuntimeLookup,clientRuntimeText,CLIENT_RUNTIME_KEYS} from '../src/i18n/client-runtime';","import {CLIENT_PATH_KEYS} from '../../shared/scripts/client-path-runtime-projection.mjs';\nimport {createClientRuntimeLookup,clientRuntimeText,CLIENT_RUNTIME_KEYS} from '../src/i18n/client-runtime';"],
      ["const runtimeRaw=fs.readFileSync(new URL('../../shared/content/client-ui/client-runtime.v1.json',import.meta.url));","const currentRaw=fs.readFileSync(new URL('../../shared/content/client-ui/client-runtime.v1.json',import.meta.url));\nconst currentRuntime=JSON.parse(currentRaw.toString('utf8'));\nconst runtimeRaw=Buffer.from(json({...currentRuntime,entries:Object.fromEntries(Object.entries(currentRuntime.entries).filter(([key])=>!CLIENT_PATH_KEYS.includes(key)))}));\nassert.equal(sha(runtimeRaw),'aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a','Exact historical343 reconstructed from additive354');"],
      ['  assert.equal(CLIENT_RUNTIME_KEYS.length,343);','  assert.equal(CLIENT_RUNTIME_KEYS.length,354);\n  for(const key of Object.keys(runtime.entries))assert.ok(CLIENT_RUNTIME_KEYS.includes(key as never));'],
      ["  const restored=current.replace('aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a','071f7d8593b482f469a2e68c36bbe29a68eb62fcb63a5a3b44ede8ba03f58c1b')","  const historical=current.replace('098aa0534cdebbaeaec997dc5d4eefad6bbf59557a20c2147afb735ffd5a9b20','aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a')\n    .replace('CLIENT_RUNTIME_BYTES = 197058','CLIENT_RUNTIME_BYTES = 188811').replace('keys.length === 354','keys.length === 343');\n  assert.equal(sha(historical),'cb71213e4e60cb209e8a4dc7ee85e87291ddf2106bf420d161d70833f97ff871');\n  const restored=historical.replace('aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a','071f7d8593b482f469a2e68c36bbe29a68eb62fcb63a5a3b44ede8ba03f58c1b')"],
      ["  const changed=JSON.parse(runtimeRaw.toString('utf8'));changed.entries[rows[0].key].en='X'+changed.entries[rows[0].key].en.slice(1);","  const changed=JSON.parse(currentRaw.toString('utf8'));changed.entries[rows[0].key].en='X'+changed.entries[rows[0].key].en.slice(1);"],
      ["  assert.throws(()=>createClientRuntimeLookup(Buffer.concat([runtimeRaw,Buffer.from('\\n')])));","  assert.throws(()=>createClientRuntimeLookup(Buffer.concat([currentRaw,Buffer.from('\\n')])));\n  assert.throws(()=>createClientRuntimeLookup(runtimeRaw));"],
      // Later accepted Yoga module exclusion is an explicit test-only reverse;
      // preserve every earlier assertion and the independently pinned donor.
      ["import {CLIENT_PATH_KEYS} from '../../shared/scripts/client-path-runtime-projection.mjs';", "import {CLIENT_PATH_KEYS} from '../../shared/scripts/client-path-runtime-projection.mjs';\nimport {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';"],
      ["  const current=fs.readFileSync(new URL('../src/i18n/client-runtime.ts',import.meta.url),'utf8');", "  const current=restoreRuntimeBeforeYogaBoundary(fs.readFileSync(new URL('../src/i18n/client-runtime.ts',import.meta.url),'utf8'));"],
      ["import {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';", "import {restoreRuntimeBeforeYogaBoundary} from './fixtures/client-runtime-history';\nimport {restoreAcceptedSourceHistory} from './fixtures/client-source-history';"],
      ["  assert.equal(sha(fs.readFileSync(new URL('../src/surfaces/AccountApp.tsx',import.meta.url))),'a0f9af0c4dfbb9a26692c893729098fd782f66ef2a48bdc026e8adc562a5dc6f');", "  assert.equal(sha(restoreAcceptedSourceHistory('callerAccount',fs.readFileSync(new URL('../src/surfaces/AccountApp.tsx',import.meta.url),'utf8'))),'a0f9af0c4dfbb9a26692c893729098fd782f66ef2a48bdc026e8adc562a5dc6f');"],
      ["  assert.equal(sha(fs.readFileSync(new URL('../src/api/client.ts',import.meta.url))),'463d2699503349aa78a0d4d5a061ebbde04294f56c6b579c7c7904463608e478');", "  assert.equal(sha(restoreAcceptedSourceHistory('callerApi',fs.readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8'))),'463d2699503349aa78a0d4d5a061ebbde04294f56c6b579c7c7904463608e478');"],
    ]},
    {file:'client-account-children-ten-locale.test.tsx',pin:'83d4c78aee49b9a10a3fe203a40b128f81b110407d9af70fe4365a0c0b6700ea',edits:[
      ['import {CLIENT_RUNTIME_LOCALES, clientRuntimeText} from "../src/i18n/client-runtime";','import {CLIENT_RUNTIME_LOCALES, clientRuntimeText} from "../src/i18n/client-runtime";\nimport {CLIENT_PATH_KEYS} from "../../shared/scripts/client-path-runtime-projection.mjs";'],
      ['assert.equal(sha(fs.readFileSync(path.join(app,"../shared/content/client-ui/client-runtime.v1.json"))),"aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a");','const currentRuntime=JSON.parse(fs.readFileSync(path.join(app,"../shared/content/client-ui/client-runtime.v1.json"),"utf8"));\nassert.equal(Object.keys(currentRuntime.entries).length,354);\nassert.equal(sha(JSON.stringify({...currentRuntime,entries:Object.fromEntries(Object.entries(currentRuntime.entries).filter(([key])=>!CLIENT_PATH_KEYS.includes(key)))},null,2)+"\\n"),"aaf20e52c1f845a02541be40fda4cc8e9aea805c80eedfd3299fa33e2a44b18a","All3430 child baseline values reconstructed exactly");'],
    ]},
  ];
  for(const item of pairs){let expected=fs.readFileSync(path.join(root,'react-app/tests',item.file),'utf8');assert.equal(sha(expected),item.pin);
    for(const[old,next]of item.edits){assert.equal(expected.split(old).length,2,'Exactly one historical span');expected=expected.replace(old,next);}
    assert.equal(fs.readFileSync(new URL(item.file,import.meta.url),'utf8'),expected);
  }
});
const altered=(mutate:(copy:any[])=>void)=>{const copy=JSON.parse(JSON.stringify(rows));mutate(copy);return copy;};
for(const[name,mutate]of [
  ['missing key',(r:any[])=>r.pop()],['duplicate key',(r:any[])=>{r[1]=r[0];}],
  ['old Bali duplicate',(r:any[])=>{r[0].key='theme.bali.locative';}],['Admin key',(r:any[])=>{r[0].key='admin.title';}],
  ['review metadata',(r:any[])=>{r[0].qa='PASS';}],['customer metadata',(r:any[])=>{r[0].values.review='PASS';}],
  ['missing AR',(r:any[])=>{delete r[0].values.ar;}],['foreign locale',(r:any[])=>{r[0].values.fa='x';}],
  ['blank',(r:any[])=>{r[0].values.ar=' ';}],['HTML',(r:any[])=>{r[0].values.ar='<b>x</b>';}],
  ['surrogate',(r:any[])=>{r[0].values.ar='x\uD800';}],['edge whitespace',(r:any[])=>{r[0].values.ar+=' ';}],
  ['manager country instead of location',(r:any[])=>{r[4].values.ar=r[4].values.ar.replace('{location}','{country}');}],
  ['extra placeholder',(r:any[])=>{r[0].values.ar+=' {count}';}],['protected token',(r:any[])=>{r[4].values.ar=r[4].values.ar.replace('Telegram/CRM','Other');}],
  ['inherited values',(r:any[])=>{r[0].values=Object.assign(Object.create({extra:'x'}),r[0].values);}],
  ['accessor',(r:any[])=>{Object.defineProperty(r[0].values,'ru',{get(){throw Error('Getter must not execute');},enumerable:true});}],
] as const)test('projection rejects '+name,()=>assert.throws(()=>projectClientPathRuntime(base,altered(mutate))));
test('projection rejects edited baseline and invalid byte type independently of key data',()=>{
  const changed=Buffer.from(base);changed[100]=changed[100]===65?66:65;assert.throws(()=>projectClientPathRuntime(changed,rows));
  assert.throws(()=>projectClientPathRuntime(base.toString('utf8') as never,rows));
});
