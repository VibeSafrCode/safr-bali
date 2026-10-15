// 05's15-Oct bounded follow-up replaces, never adds to, the old28KB package.
// These data-free validator/loader bytes count fully in the tightened total.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export const PUBLIC_INTERACTION_BUDGET=Object.freeze({
  sourceSha256:'4120b1d225a7e8f08b63f16cea9df3804defa4847166e38d556478c79792c472',
  files:Object.freeze([
    Object.freeze({filename:'public-interaction-captions.3rJzfbIC.js',
      assetSha256:'3f6aa157abd7128881afbccb718b43c8c5961fff6b94a46ca5fce698ad5a9c8c',raw:5_205,gzip:2_794}),
    Object.freeze({filename:'pricing-entry.Dydp6ekl.js',
      assetSha256:'4cd910adee18e7fec7fb3af0b187b03cc6ff35ecdeda98b36e38149813636f4d',raw:1_659,gzip:855}),
  ]),
  raw:6_864,gzip:3_649,
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_CSS_BUDGET=Object.freeze({
  filename:'BaseLayout.Bt_MRs3Y.css',
  assetSha256:'d7b9cd49e8c9dd186e4b2dd3c5cd44ef45f2da132f93badecbd1bbee71cc3998',
  raw:160_840,gzip:26_973,
});
export function validatePublicCssBudget(rows) {
  const pin=PUBLIC_CSS_BUDGET;
  assert.equal(new Set(rows.map(row=>row.name)).size,rows.length,'Duplicate CSS inventory');
  const candidates=rows.filter(row=>/(?:^|\/)BaseLayout\.[A-Za-z0-9_-]+\.css$/.test(row.name));
  assert.equal(candidates.length,1,'Exactly one fixed BaseLayout CSS required');
  const fixed=candidates[0];
  assert.equal(fixed.name.split('/').at(-1),pin.filename,'BaseLayout CSS compilation changed');
  assert.equal(sha(fixed.bytes),pin.assetSha256,'BaseLayout CSS bytes changed');
  assert.equal(fixed.bytes.length,pin.raw);assert.equal(gzipSync(fixed.bytes).length,pin.gzip);
  for(const row of rows.filter(row=>row!==fixed)) {
    assert.ok(row.bytes.length<=155_000,'Individual CSS budget exceeded: '+row.name);
    assert.ok(gzipSync(row.bytes).length<=26_000,'Individual gzip CSS budget exceeded: '+row.name);
  }
  const raw=rows.reduce((total,row)=>total+row.bytes.length,0);
  const gzip=rows.reduce((total,row)=>total+gzipSync(row.bytes).length,0);
  assert.ok(raw<180_000,'Full CSS raw budget exceeded');assert.ok(gzip<32_000,'Full CSS gzip budget exceeded');
  return {files:rows.length,raw,gzip};
}
export function validatePublicJavascriptBudget(rows,sourceBytes) {
  const pin=PUBLIC_INTERACTION_BUDGET;
  assert.equal(sha(sourceBytes),pin.sourceSha256,'Public interaction input drift');
  assert.equal(new Set(rows.map(row=>row.name)).size,rows.length,'Duplicate JS inventory');
  const fixed=rows.filter(row=>/(?:^|\/)(?:public-interactions|public-interaction-captions|pricing-entry)\.[A-Za-z0-9_-]+\.js$/.test(row.name));
  assert.equal(fixed.length,2,'Exactly two fixed integration assets required; old package is superseded');
  for(const expected of pin.files){
    const matches=fixed.filter(row=>row.name.split('/').at(-1)===expected.filename);
    assert.equal(matches.length,1,'Missing or changed integration asset: '+expected.filename);
    assert.equal(sha(matches[0].bytes),expected.assetSha256,'Integration compiled bytes changed');
    assert.equal(matches[0].bytes.length,expected.raw);assert.equal(gzipSync(matches[0].bytes).length,expected.gzip);
  }
  const others=rows.filter(row=>!fixed.includes(row));
  const raw=items=>items.reduce((total,row)=>total+row.bytes.length,0);
  const gzip=items=>items.reduce((total,row)=>total+gzipSync(row.bytes).length,0);
  assert.ok(raw(others)<75_000,'Remaining JS raw budget exceeded');
  assert.ok(gzip(others)<28_000,'Remaining JS gzip budget exceeded');
  for(const row of rows) {
    assert.ok(row.bytes.length<=16_000,'Individual JS budget exceeded: '+row.name);
    assert.ok(gzipSync(row.bytes).length<=6_000,'Individual gzip JS budget exceeded: '+row.name);
  }
  assert.ok(raw(rows)<81_864,'Full JS raw budget exceeded');
  assert.ok(gzip(rows)<31_649,'Full JS gzip budget exceeded');
  return {files:rows.length,raw:raw(rows),gzip:gzip(rows),remainingRaw:raw(others),remainingGzip:gzip(others)};
}
