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
    Object.freeze({filename:'pricing-entry.DfioUYTU.js',
      assetSha256:'4476d68458f76dd6b7624909b7b3f8c2ea56d6bc9ee73bf4e9ab68901be48545',raw:1_659,gzip:855}),
  ]),
  raw:6_864,gzip:3_649,
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_CSS_BUDGET=Object.freeze({
  // Preserve the approved footer, mobile HOME support entry and caption-wrap
  // source/output pair. Aggregate caps are not increased.
  sourcePins:Object.freeze({
    'src/components/FooterCredits.astro':'e2f11fe273671da0423bcb632a4b80768553a5c2bbf094bf9501b9bfb97e649d',
    'src/components/SafrwayWordmark.astro':'a3aec8c2c3d40ab6d5398b0620a1c97a3b8748144e84f8c34ecd341f9dff8149',
    'src/components/SiteFooter.astro':'10fd31854ee11c7df24faa785bfdf981d614e7fafb9f59bbf5aac6124ce87823',
    'src/styles/support-dialog.css':'faf0b6b2cf4e639615cbddcdd8c655192b8b9ab0c9a0fd3a1396d9b7075a9c85',
    'src/styles/destination-worlds.css':'c9370f918c3a06cf92a24c0e952f3929dd9b55cfe3207dd9e602b06d28d88eaf',
  }),
  filename:'BaseLayout.De9JUWmP.css',
  assetSha256:'74e633f8f91c64624592d065f765e77d39efed7782659a62b62cb0905d59e7a4',
  raw:163_868,gzip:27_615,
});
export function validatePublicCssSources(rows) {
  const pins=PUBLIC_CSS_BUDGET.sourcePins;
  assert.equal(new Set(rows.map(row=>row.name)).size,rows.length,'Duplicate CSS source inventory');
  assert.deepEqual(rows.map(row=>row.name).sort(),Object.keys(pins).sort(),'Exact reviewed CSS source inventory required');
  for(const row of rows)assert.equal(sha(row.bytes),pins[row.name],'Reviewed CSS source changed: '+row.name);
}
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
