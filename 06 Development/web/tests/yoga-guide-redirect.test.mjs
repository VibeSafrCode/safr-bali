import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../../deploy/nginx/yoga-open-preview.conf.template',import.meta.url),'utf8');
const oldPath='/downloads/all-indonesia-client-guide-safrway-2026.pdf';
const newPath='/downloads/all-indonesia-client-guide-yoga-2026.pdf';
const block=source.slice(source.indexOf(`location = ${oldPath}`),source.indexOf(`location = ${newPath}`));
const target=block.match(/return 301 ([^;]+);/)?.[1];

test('legacy guide redirects inside the loopback root, not the public mount twice',()=>{
  assert.equal(target,newPath);
  // Observed HTTPS mount translates every root-relative backend Location once.
  const publicLocation='/yoga-preview'+target;
  assert.equal(publicLocation,'/yoga-preview'+newPath);
  assert.equal(publicLocation.split('/yoga-preview/').length-1,1);
  assert.notEqual('/yoga-preview'+'/yoga-preview'+newPath,publicLocation);
});

test('the two PDF exceptions retain method and directory privacy guards',()=>{
  assert.match(block,/limit_except GET HEAD \{ deny all; \}/);
  assert.ok(source.includes(`location = ${newPath} {`));
  assert.match(source,/downloads\|src\|shared\|node_modules/);
  assert.doesNotMatch(source,/location \^~ \/downloads\//);
  assert.equal((source.match(/location = \/downloads\//g)||[]).length,2);
});
