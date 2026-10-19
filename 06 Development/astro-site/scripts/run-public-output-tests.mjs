import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));

// package.json invokes this only after the main public build succeeds. Bind all
// output tests to that build, never an inherited or preview output directory.
export function publicOutputTestPlan({ projectRoot = siteRoot, env = process.env } = {}) {
  if (env.SAFRWAY_PREVIEW_BRAND || env.SAFRWAY_PREVIEW_BASE_PATH) {
    throw new Error('Public output tests require the main website build');
  }
  const root = path.resolve(projectRoot);
  const tests = readdirSync(path.join(root, 'tests'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => path.join(root, 'tests', entry.name)).sort();
  if (!tests.some(file => path.basename(file) === 'registry-vietnam-output.test.mjs')) {
    throw new Error('Required Vietnam emitted-output test is missing');
  }
  return {
    args: ['--import', path.resolve(root, '../react-app/node_modules/tsx/dist/loader.mjs'), '--test', ...tests],
    options: {
      cwd: root,
      env: { ...env, SAFRWAY_PUBLIC_TEST_OUTPUT: path.join(root, 'dist') },
      stdio: 'inherit',
    },
  };
}

export function runPublicOutputTests({ execute = spawnSync, ...settings } = {}) {
  const plan = publicOutputTestPlan(settings);
  const child = execute(process.execPath, plan.args, plan.options);
  if (child.error) throw new Error('Public output test process could not start');
  return Number.isInteger(child.status) ? child.status : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runPublicOutputTests();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
