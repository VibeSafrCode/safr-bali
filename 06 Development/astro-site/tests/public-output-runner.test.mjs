import assert from 'node:assert/strict';
import { readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { publicOutputTestPlan, runPublicOutputTests,SOURCE_ONLY_TEST_NAMES } from '../scripts/run-public-output-tests.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

test('every emitted-output test receives the absolute current main build path', () => {
  const env = { SAFRWAY_PUBLIC_TEST_OUTPUT: '/stale-or-foreign-build', SAFR_EDITORIAL_VERIFICATION_CONTRACT:'PRIVATE_ORIGINALS', KEEP: 'unchanged' };
  const before = { ...env };
  const plan = publicOutputTestPlan({ projectRoot, env });
  assert.equal(plan.options.cwd, path.resolve(projectRoot));
  assert.equal(plan.options.env.SAFRWAY_PUBLIC_TEST_OUTPUT, path.join(projectRoot, 'dist'));
  assert.equal(plan.options.env.KEEP, 'unchanged');
  assert.equal(plan.options.env.SAFR_EDITORIAL_VERIFICATION_CONTRACT,'PUBLIC_DERIVATIVE');
  assert.equal(plan.contract,'PUBLIC_DERIVATIVE');assert.equal(plan.privateOriginals,'NOT_EXECUTED_REQUIRES_SEPARATE_ROOT_SAME_CANDIDATE_GATE');
  assert.deepEqual(env, before);
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/registry-vietnam-output.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/astro-build.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/registry-public-output.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot,'tests/registry-sktt-publication.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot,'tests/registry-sktt-output.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot,'tests/registry-hospitality-publication.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot,'tests/registry-hospitality-output.test.mjs')));
  const all=readdirSync(path.join(projectRoot,'tests'),{withFileTypes:true}).filter(row=>row.isFile()&&row.name.endsWith('.test.mjs'))
    .map(row=>path.join(projectRoot,'tests',row.name)).sort();
  assert.deepEqual(plan.args.slice(3),all.filter(file=>!SOURCE_ONLY_TEST_NAMES.includes(path.basename(file))));
  assert.deepEqual(plan.sourceOnlyTests,all.filter(file=>SOURCE_ONLY_TEST_NAMES.includes(path.basename(file))));
  assert.equal(plan.args[0], '--import');
  assert.equal(plan.args[2], '--test');
  assert.ok(plan.args.slice(3).every(file => file.endsWith('.test.mjs') && path.isAbsolute(file)));
});

test('preview output cannot masquerade as the primary public build', () => {
  for (const env of [{ SAFRWAY_PREVIEW_BRAND: 'york' }, { SAFRWAY_PREVIEW_BASE_PATH: '/yoga-preview' }]) {
    assert.throws(() => publicOutputTestPlan({ projectRoot, env }), /main website build/);
  }
});

test('test failures and interrupted child processes never become a successful gate', () => {
  for (const [status, expected] of [[0, 0], [1, 1], [23, 23], [null, 1]]) {
    let calls = 0;
    const result = runPublicOutputTests({ projectRoot, env: {}, execute(binary, args, options) {
      calls += 1;
      assert.equal(binary, process.execPath);
      assert.equal(options.env.SAFRWAY_PUBLIC_TEST_OUTPUT, path.join(projectRoot, 'dist'));
      assert.ok(args.includes(path.join(projectRoot, 'tests/registry-vietnam-output.test.mjs')));
      return { status, signal: status === null ? 'SIGTERM' : null };
    } });
    assert.equal(calls, 1);
    assert.equal(result, expected);
  }
});

test('launch errors fail closed without exposing inherited environment values', () => {
  assert.throws(() => runPublicOutputTests({ projectRoot, env: {}, execute: () => ({
    error: new Error('private diagnostic'), status: null,
  }) }), { message: 'Public output test process could not start' });
});

test('the package gate builds first and retains the mandatory fresh-output assertion', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.test, /pnpm run build && node scripts\/run-public-output-tests\.mjs$/);
  const vietnam = readFileSync(new URL('./registry-vietnam-output.test.mjs', import.meta.url), 'utf8');
  assert.match(vietnam, /process\.env\.SAFRWAY_PUBLIC_TEST_OUTPUT;assert\.equal\(typeof root,'string','Exact fresh build output required'\)/);
  assert.doesNotMatch(vietnam, /test\.skip|process\.env\.CI/);
});

test('source-only classification is exactly three explicit suites, never a family/CI/missing-input skip',()=>{
 assert.ok(Object.isFrozen(SOURCE_ONLY_TEST_NAMES));
 assert.deepEqual(SOURCE_ONLY_TEST_NAMES,['registry-sktt-editorial.test.mjs','registry-sktt-local-editorial.test.mjs','registry-hospitality-component.test.mjs']);
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 for(const name of SOURCE_ONLY_TEST_NAMES)assert.ok(pkg.scripts['test:private-originals'].includes('tests/'+name));
 assert.match(pkg.scripts['test:private-originals'],/^SAFR_EDITORIAL_VERIFICATION_CONTRACT=PRIVATE_ORIGINALS /);
 assert.match(pkg.scripts['verify:private-originals'],/--contract PRIVATE_ORIGINALS$/);
 assert.doesNotMatch(pkg.scripts['test:private-originals'],/PUBLIC_DERIVATIVE|--test-skip/);
});
test('missing classified or meaningful public suites is a hard planning failure',()=>{
 const required=[...SOURCE_ONLY_TEST_NAMES,'registry-vietnam-output.test.mjs','registry-sktt-publication.test.mjs','registry-sktt-output.test.mjs','registry-hospitality-publication.test.mjs','registry-hospitality-output.test.mjs'];
 for(const missing of required){
  const fixture=mkdtempSync(path.join(os.tmpdir(),'safr-public-suite-plan-'));
  try{
   mkdirSync(path.join(fixture,'tests'),{mode:0o700});
   for(const name of required.filter(name=>name!==missing))writeFileSync(path.join(fixture,'tests',name),'',{mode:0o600,flag:'wx'});
   assert.throws(()=>publicOutputTestPlan({projectRoot:fixture,env:{}}),/Required .*suite is missing/);
  }finally{rmSync(fixture,{recursive:true});}
 }
});
