import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPreviewPackage,verifyPreviewOutput} from '../../scripts/package-york-preview.mjs';
import {verifyPackage} from '../../scripts/verify-york-package.mjs';

const root=fileURLToPath(new URL('../../dist-yoga-https-preview/',import.meta.url));
const base='/yoga-preview';

test('all HTTPS preview navigation and resources stay within the protected prefix',async()=>{
  const receipt=await verifyPreviewOutput(root);
  assert.equal(receipt.basePath,base);
  const htmlFiles=(await readdir(root,{recursive:true})).filter(file=>file.endsWith('.html'));
  assert.equal(htmlFiles.length,204);
  for(const file of htmlFiles) {
    const html=await readFile(path.join(root,file),'utf8');
    for(const match of html.matchAll(/(?:href|src)=["'](\/[^"']*)["']/g)) {
      assert.ok(match[1].startsWith(base+'/'),file+' leaves private prefix');
      const logical=match[1].slice(base.length).split(/[?#]/)[0];
      assert.ok(existsSync(path.join(root,logical.endsWith('/')?logical+'index.html':logical)),file+' has broken link');
    }
    assert.match(html,/noindex,nofollow,noarchive/);
  }
  const bundle=await readFile(path.join(root,'_york/york-preview.js'),'utf8');
  assert.ok(bundle.includes(base),'React compile-time prefix missing');
});

test('HTTPS variant packaging preserves its mount and exact build provenance',async t=>{
  const artifacts=await mkdtemp(path.join(tmpdir(),'yoga-https-package-test-'));
  t.after(()=>rm(artifacts,{recursive:true,force:true}));
  const result=await createPreviewPackage({output:root,artifacts});
  const manifest=await verifyPackage(result.directory);
  assert.equal(manifest.basePath,base);
  assert.equal(manifest.htmlPages,204);
  assert.equal(manifest.activated,false);
  const mount=await readFile(path.join(result.directory,'deploy/mount.conf.template'),'utf8');
  assert.equal([...mount.matchAll(/if \(\$http_x_forwarded_proto = "http"\)/g)].length,2,'Both private locations must upgrade HTTP before authentication');
  assert.equal([...mount.matchAll(/absolute_redirect off;/g)].length,2,'Both private locations must preserve relative slash redirects');
});

test('React customer and partner links respect the compiled HTTPS base',async t=>{
  globalThis.__YOGA_PREVIEW_BASE__=base;
  t.after(()=>delete globalThis.__YOGA_PREVIEW_BASE__);
  const {default:React}=await import('../../../react-app/node_modules/react/index.js');
  const {renderToStaticMarkup}=await import('../../../react-app/node_modules/react-dom/server.node.js');
  const {DemoApp}=await import('../../../react-app/src/york-preview/DemoApp.tsx?https-prefix-contract');
  for(const [route,locale] of [['/account/','ru'],['/en/influencer/overview/','en'],['/owner/influencers/','ru']]) {
    const html=renderToStaticMarkup(React.createElement(DemoApp,{route,locale}));
    const links=[...html.matchAll(/href="(\/[^"']*)"/g)];
    assert.ok(links.length>0);
    assert.ok(links.every(match=>match[1].startsWith(base+'/')));
  }
});
