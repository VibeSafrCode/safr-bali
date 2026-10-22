import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
// Explicit source-only suites, never a broad family/pattern or missing-input skip.
export const SOURCE_ONLY_TEST_NAMES=Object.freeze([
  'registry-sktt-editorial.test.mjs','registry-sktt-local-editorial.test.mjs','registry-hospitality-component.test.mjs',
]);

// package.json invokes this only after the main public build succeeds. Bind all
// output tests to that build, never an inherited or preview output directory.
export function publicOutputTestPlan({ projectRoot = siteRoot, env = process.env } = {}) {
  if (env.SAFRWAY_PREVIEW_BRAND || env.SAFRWAY_PREVIEW_BASE_PATH) {
    throw new Error('Public output tests require the main website build');
  }
  const root = path.resolve(projectRoot);
  const allTests = readdirSync(path.join(root, 'tests'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => path.join(root, 'tests', entry.name)).sort();
  for(const name of SOURCE_ONLY_TEST_NAMES)if(!allTests.some(file=>path.basename(file)===name))
    throw new Error('Required classified source-only suite is missing');
  const tests=allTests.filter(file=>!SOURCE_ONLY_TEST_NAMES.includes(path.basename(file)));
  for(const name of ['registry-vietnam-output.test.mjs','registry-sktt-publication.test.mjs','registry-sktt-output.test.mjs','registry-hospitality-publication.test.mjs','registry-hospitality-output.test.mjs'])
    if(!tests.some(file=>path.basename(file)===name))throw new Error('Required public projection/output suite is missing');
  return {
    sourceOnlyTests: allTests.filter(file=>SOURCE_ONLY_TEST_NAMES.includes(path.basename(file))),
    contract: 'PUBLIC_DERIVATIVE',
    privateOriginals: 'NOT_EXECUTED_REQUIRES_SEPARATE_ROOT_SAME_CANDIDATE_GATE',
    args: ['--import', path.resolve(root, '../react-app/node_modules/tsx/dist/loader.mjs'), '--test', ...tests],
    options: {
      cwd: root,
      env: { ...env, SAFR_EDITORIAL_VERIFICATION_CONTRACT: 'PUBLIC_DERIVATIVE', SAFRWAY_PUBLIC_TEST_OUTPUT: path.join(root, 'dist') },
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
