// One frozen exception accepted in the 15 October CI architecture review.
// This package contains translations AND executable validation; its cost is
// included in the increased total, never described as free/non-code bytes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

export const PUBLIC_INTERACTION_BUDGET=Object.freeze({
  sourceSha256:'4120b1d225a7e8f08b63f16cea9df3804defa4847166e38d556478c79792c472',
  filename:'public-interactions.Cjhhv-a0.js',
  assetSha256:'e545b2874a4cab30d4c40bb251c3607d9f14c1a623bc41ecd8de2acf5dcbecde',
  raw:28_550,gzip:12_003,
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
  const candidates=rows.filter(row=>/(?:^|\/)public-interactions\.[A-Za-z0-9_-]+\.js$/.test(row.name));
  assert.equal(candidates.length,1,'Exactly one fixed interaction asset required');
  const fixed=candidates[0];
  assert.equal(fixed.name.split('/').at(-1),pin.filename,'Interaction compilation changed');
  assert.equal(sha(fixed.bytes),pin.assetSha256,'Interaction compiled bytes changed');
  assert.equal(fixed.bytes.length,pin.raw);assert.ok(gzipSync(fixed.bytes).length<=pin.gzip);
  const others=rows.filter(row=>row!==fixed);
  const raw=items=>items.reduce((total,row)=>total+row.bytes.length,0);
  const gzip=items=>items.reduce((total,row)=>total+gzipSync(row.bytes).length,0);
  assert.ok(raw(others)<75_000,'Remaining JS raw budget exceeded');
  assert.ok(gzip(others)<28_000,'Remaining JS gzip budget exceeded');
  for(const row of others) {
    assert.ok(row.bytes.length<=16_000,'Individual JS budget exceeded: '+row.name);
    assert.ok(gzipSync(row.bytes).length<=6_000,'Individual gzip JS budget exceeded: '+row.name);
  }
  assert.ok(raw(rows)<103_550,'Full JS raw budget exceeded');
  assert.ok(gzip(rows)<40_003,'Full JS gzip budget exceeded');
  return {files:rows.length,raw:raw(rows),gzip:gzip(rows),remainingRaw:raw(others),remainingGzip:gzip(others)};
}
