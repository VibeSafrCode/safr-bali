import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { publicOutputTestPlan, runPublicOutputTests } from '../scripts/run-public-output-tests.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

test('every emitted-output test receives the absolute current main build path', () => {
  const env = { SAFRWAY_PUBLIC_TEST_OUTPUT: '/stale-or-foreign-build', KEEP: 'unchanged' };
  const before = { ...env };
  const plan = publicOutputTestPlan({ projectRoot, env });
  assert.equal(plan.options.cwd, path.resolve(projectRoot));
  assert.equal(plan.options.env.SAFRWAY_PUBLIC_TEST_OUTPUT, path.join(projectRoot, 'dist'));
  assert.equal(plan.options.env.KEEP, 'unchanged');
  assert.deepEqual(env, before);
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/registry-vietnam-output.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/astro-build.test.mjs')));
  assert.ok(plan.args.includes(path.join(projectRoot, 'tests/registry-public-output.test.mjs')));
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
