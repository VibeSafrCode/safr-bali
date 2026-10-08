import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const reactRoot=fileURLToPath(new URL('../../react-app/',import.meta.url));
for(const [cwd,args] of [
  [root,['--import','../react-app/node_modules/tsx/dist/loader.mjs','--test','tests/york-preview/preview.test.mjs','tests/york-preview/package.test.mjs']],
  [reactRoot,['--import','tsx','--test','tests/york-preview/demo.test.ts']],
]) {
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});
  if(result.status!==0)throw new Error('York critical check failed');
}
