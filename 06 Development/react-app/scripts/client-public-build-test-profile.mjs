import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const PRIVATE_CLIENT_BUILD_TESTS=Object.freeze(['client-bootstrap-boundary.test.mjs']);
export const PUBLIC_CLIENT_BUILD_COMPANION='client-bootstrap-boundary.public.mjs';
export function publicClientBuildTestFiles(names,contract){
 assert.equal(contract,'PUBLIC_DERIVATIVE','Explicit PUBLIC_DERIVATIVE client build-test contract required');
 assert(Array.isArray(names)&&names.every(name=>typeof name==='string'&&path.basename(name)===name),'Flat build-test inventory required');
 assert.equal(new Set(names).size,names.length,'Duplicate build-test filename');
 for(const name of [...PRIVATE_CLIENT_BUILD_TESTS,PUBLIC_CLIENT_BUILD_COMPANION])assert(names.includes(name),'Required build profile file missing: '+name);
 const ordinary=names.filter(name=>name.endsWith('.test.mjs')).sort();
 assert(ordinary.length>PRIVATE_CLIENT_BUILD_TESTS.length,'Normal build-test inventory missing');
 return [...ordinary.filter(name=>!PRIVATE_CLIENT_BUILD_TESTS.includes(name)),PUBLIC_CLIENT_BUILD_COMPANION].map(name=>'tests/'+name);
}
export function runPublicClientBuildTests(){
 const app=fileURLToPath(new URL('../',import.meta.url));
 const files=publicClientBuildTestFiles(fs.readdirSync(path.join(app,'tests')),process.env.SAFR_CLIENT_TEST_CONTRACT);
 for(const name of [...files,...PRIVATE_CLIENT_BUILD_TESTS.map(file=>'tests/'+file)]){
  const stat=fs.lstatSync(path.join(app,name));assert(stat.isFile()&&!stat.isSymbolicLink(),'Ordinary build-test source required');
 }
 const scope={contract:'PUBLIC_DERIVATIVE',publicBuildTestFiles:files.length,
  privateComparatorModules:PRIVATE_CLIENT_BUILD_TESTS.map(file=>({file,status:'NOT_EXECUTED'})),
  priorCompiledGraphComparison:'NOT_EXECUTED',publicSourcePredecessors:'EXACT_FIVE_PINNED_PUBLIC_CODE_BODIES',
  releaseRequires:'UNCHANGED_PRIVATE_BOOTSTRAP_MODULE_WITH_PINNED_SOURCE_AND_COMPILED_GRAPH_ON_SAME_COMMIT_AND_TOOLCHAIN',
  overallFrontendGate:'STILL_REQUIRES_UNIT_TYPECHECK_BOTH_BUILDS_BROWSER_LIGHTHOUSE_AND_PRIVATE_RELEASE_GATES'};
 console.log(JSON.stringify(scope));
 const result=spawnSync(process.execPath,['--test',...files],{cwd:app,env:process.env,stdio:'inherit',timeout:180000});
 if(result.error||result.signal||result.status!==0){console.error(JSON.stringify({status:'PUBLIC_DERIVATIVE_BUILD_TESTS_FAILED',exitCode:result.status,signal:result.signal,error:result.error?.code??null}));return 1;}
 console.log(JSON.stringify({...scope,status:'PUBLIC_DERIVATIVE_BUILD_TESTS_VERIFIED'}));return 0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runPublicClientBuildTests();
