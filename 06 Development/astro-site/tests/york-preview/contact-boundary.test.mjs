import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('offline packaging cannot silently discard an enabled Telegram contact mode',()=>{
  const project=fileURLToPath(new URL('../../',import.meta.url));
  const result=spawnSync(process.execPath,['scripts/build-york-preview.mjs'],{
    cwd:project,env:{...process.env,YOGA_CONTACT_MODE:'telegram'},encoding:'utf8',timeout:5000,
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Offline preview cannot enable Telegram contacts/);
  assert.doesNotMatch(result.stdout,/building|built|offline preview ready/);
});
