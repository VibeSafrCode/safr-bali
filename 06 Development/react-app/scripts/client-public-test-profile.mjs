import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const PRIVATE_CLIENT_TESTS=Object.freeze([
 'client-life-counts.test.ts','client-visa-external-source.test.ts','client-visa-life-copy.test.ts',
]);
export const PUBLIC_CLIENT_COMPANION='client-visa-life-runtime.public.ts';
export function publicClientTestFiles(names,contract){
 assert.equal(contract,'PUBLIC_DERIVATIVE','Explicit PUBLIC_DERIVATIVE client test contract required');
 assert(Array.isArray(names)&&names.every(n=>typeof n==='string'&&path.basename(n)===n),'Flat test inventory required');
 assert.equal(new Set(names).size,names.length,'Duplicate test filename');
 for(const name of [...PRIVATE_CLIENT_TESTS,PUBLIC_CLIENT_COMPANION])assert(names.includes(name),'Required profile file missing: '+name);
 const ordinary=names.filter(name=>name.endsWith('.test.ts')).sort();
 assert(ordinary.length>PRIVATE_CLIENT_TESTS.length,'Normal unit inventory missing');
 return [...ordinary.filter(name=>!PRIVATE_CLIENT_TESTS.includes(name)),PUBLIC_CLIENT_COMPANION].map(name=>'tests/'+name);
}
export function runPublicClientTests(){
 const app=fileURLToPath(new URL('../',import.meta.url));
 const names=fs.readdirSync(path.join(app,'tests'));
 const files=publicClientTestFiles(names,process.env.SAFR_CLIENT_TEST_CONTRACT);
 for(const name of [...files,...PRIVATE_CLIENT_TESTS.map(n=>'tests/'+n)]){
  const stat=fs.lstatSync(path.join(app,name));assert(stat.isFile()&&!stat.isSymbolicLink(),'Ordinary test source required');
 }
 const scope={contract:'PUBLIC_DERIVATIVE',publicUnitFiles:files.length,
  privateOriginalModules:PRIVATE_CLIENT_TESTS.map(file=>({file,status:'NOT_EXECUTED'})),
  privateOriginalEquivalence:'NOT_EXECUTED',
  releaseRequires:'UNCHANGED_PRIVATE_MODULES_WITH_PINNED_ORIGINALS_ON_SAME_COMMIT_TOOLCHAIN_AND_EQUAL_PUBLIC_PROJECTION',
  overallFrontendGate:'STILL_REQUIRES_TYPECHECK_BOTH_BUILDS_BUILD_TESTS_BROWSER_AND_LIGHTHOUSE'};
 console.log(JSON.stringify(scope));
 const result=spawnSync(process.execPath,['--import','./node_modules/tsx/dist/loader.mjs','--test',...files],{
  cwd:app,env:process.env,stdio:'inherit',timeout:180000,
 });
 if(result.error||result.signal||result.status!==0){console.error(JSON.stringify({status:'PUBLIC_DERIVATIVE_FAILED',exitCode:result.status,signal:result.signal,error:result.error?.code??null}));return 1;}
 console.log(JSON.stringify({...scope,status:'PUBLIC_DERIVATIVE_UNIT_VERIFIED'}));return 0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runPublicClientTests();
