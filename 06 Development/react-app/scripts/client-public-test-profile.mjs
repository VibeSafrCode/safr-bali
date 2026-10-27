import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const PRIVATE_CLIENT_TESTS=Object.freeze([
 'client-life-counts.test.ts','client-visa-external-source.test.ts','client-visa-life-copy.test.ts',
]);
// These suites compare pinned private originals/baselines. Never replace their
// input with current source or silently weaken them to fit the public runner.
export const PRIVATE_CLIENT_JSX_TESTS=Object.freeze([
 'client-account-children-ten-locale.test.tsx','client-catalog-consumer.test.tsx',
 'client-catalog-split.test.tsx','client-current-support-integration.test.tsx',
 'client-life-presentation.test.tsx','client-parent-lifecycle.test.tsx',
 'client-performance-boundaries.test.tsx','client-support-consumer.test.tsx',
 'client-visa-cabinet.test.tsx','client-visa-status-help.test.tsx',
]);
export const PUBLIC_CLIENT_JSX_TESTS=Object.freeze([
 'admin-dialog-focus.test.tsx','admin-messaging.test.tsx','admin-referral-correction.test.tsx',
 'admin-visa-save-runtime.test.tsx','admin-visa-stay-action.test.tsx','admin-visa-stay-period.test.tsx',
 'client-calculator-ten-locale.test.tsx','client-current-parent-integration.test.tsx',
 'client-visa-life-parent-activation.test.tsx','support-drawer-focus.test.tsx','visa-stay-controls.test.tsx',
]);
export const PUBLIC_CLIENT_COMPANION='client-visa-life-runtime.public.ts';
export function publicClientTestFiles(names,contract){
 assert.equal(contract,'PUBLIC_DERIVATIVE','Explicit PUBLIC_DERIVATIVE client test contract required');
 assert(Array.isArray(names)&&names.every(n=>typeof n==='string'&&n.length>0&&n!=='.'&&n!=='..'&&
  path.basename(n)===n&&!n.includes('\\')&&!n.includes('\0')),'Flat test inventory required');
 assert.equal(new Set(names).size,names.length,'Duplicate test filename');
 const classifiedJsx=[...PRIVATE_CLIENT_JSX_TESTS,...PUBLIC_CLIENT_JSX_TESTS];
 assert.equal(new Set(classifiedJsx).size,classifiedJsx.length,'Duplicate JSX classification');
 const actualJsx=names.filter(name=>/\.test\.(?:tsx|jsx)$/.test(name)).sort();
 assert.deepEqual(actualJsx,classifiedJsx.sort(),'Every JSX test must have an explicit public/private classification');
 for(const name of [...PRIVATE_CLIENT_TESTS,PUBLIC_CLIENT_COMPANION])assert(names.includes(name),'Required profile file missing: '+name);
 const ordinary=names.filter(name=>name.endsWith('.test.ts')).sort();
 assert(ordinary.length>PRIVATE_CLIENT_TESTS.length,'Normal unit inventory missing');
 return [...ordinary.filter(name=>!PRIVATE_CLIENT_TESTS.includes(name)),...PUBLIC_CLIENT_JSX_TESTS]
  .sort().concat(PUBLIC_CLIENT_COMPANION).map(name=>'tests/'+name);
}
export function runPublicClientTests(){
 const app=fileURLToPath(new URL('../',import.meta.url));
 const names=fs.readdirSync(path.join(app,'tests'));
 const files=publicClientTestFiles(names,process.env.SAFR_CLIENT_TEST_CONTRACT);
 for(const name of [...files,...[...PRIVATE_CLIENT_TESTS,...PRIVATE_CLIENT_JSX_TESTS].map(n=>'tests/'+n)]){
  const stat=fs.lstatSync(path.join(app,name));assert(stat.isFile()&&!stat.isSymbolicLink(),'Ordinary test source required');
 }
 const scope={contract:'PUBLIC_DERIVATIVE',publicUnitFiles:files.length,
  publicJsxModules:PUBLIC_CLIENT_JSX_TESTS,classifiedJsxFiles:PUBLIC_CLIENT_JSX_TESTS.length+PRIVATE_CLIENT_JSX_TESTS.length,
  unknownJsxInventory:'REFUSED',
  privateOriginalModules:[...PRIVATE_CLIENT_TESTS,...PRIVATE_CLIENT_JSX_TESTS].map(file=>({file,status:'NOT_EXECUTED'})),
  privateOriginalEquivalence:'NOT_EXECUTED',
  releaseRequires:'HISTORICAL_PRIVATE_SOURCE_REPLAY_WITH_EXPLICIT_FINITE_COPY_CORRECTIONS_ON_SAME_COMMIT_TOOLCHAIN_AND_EQUAL_PUBLIC_PROJECTION',
  overallFrontendGate:'STILL_REQUIRES_TYPECHECK_BOTH_BUILDS_BUILD_TESTS_BROWSER_AND_LIGHTHOUSE'};
 console.log(JSON.stringify(scope));
 const result=spawnSync(process.execPath,['--import','./node_modules/tsx/dist/loader.mjs','--test','--test-concurrency=2',...files],{
  cwd:app,env:process.env,stdio:'inherit',timeout:180000,
 });
 if(result.error||result.signal||result.status!==0){console.error(JSON.stringify({status:'PUBLIC_DERIVATIVE_FAILED',exitCode:result.status,signal:result.signal,error:result.error?.code??null}));return 1;}
 console.log(JSON.stringify({...scope,status:'PUBLIC_DERIVATIVE_UNIT_VERIFIED'}));return 0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runPublicClientTests();
