import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogPublicCoverage} from '../scripts/registry-catalog-coverage.mjs';
import {publicBuildEntries,publicTargetHref} from '../scripts/registry-publication.mjs';
import {publicTenLocaleApprovedRoutes} from '../src/lib/public-ten-locale-publication.mjs';
import vietnamGrant from '../../shared/content/registry-vietnam-editorial-public-build.v1.json' with {type:'json'};

const registryUrl=new URL('../../shared/content/service-registry.v1.json',import.meta.url);
const sha=body=>createHash('sha256').update(body).digest('hex');

test('94 retained Bali intents and nine world intents use only current approved targets',()=>{
  const before=readFileSync(registryUrl),report=catalogPublicCoverage();
  const entries=publicBuildEntries(),owners=publicTenLocaleApprovedRoutes();
  assert.equal(report.bali.length,94);assert.equal(report.worldVisas.length,9);
  assert.equal(report.locales.length,10);assert.equal(new Set(report.bali.map(row=>row.intentKey)).size,94);
  assert.equal(report.publicationOrRoutesChanged,false);assert.equal(report.actualIndexing,'NOT_EVALUATED');
  for(const row of [...report.bali,...report.worldVisas]) {
    assert.equal(row.intentAndSectionCoverage,'NOT_VERIFIED');assert.equal(row.ctaJourney,'NOT_VERIFIED');
    assert.equal(row.publicTargets.length+row.missingLocales.length,10);
    assert.equal(new Set(row.publicTargets.map(target=>target.locale)).size,row.publicTargets.length);
    for(const target of row.publicTargets) {
      assert.equal(target.route,publicTargetHref(row.contentId,target.locale));
      assert.ok([...entries,...owners].some(owner=>owner.route===target.route&&owner.locale===target.locale));
      assert.ok(!target.route.includes('_registry')&&!target.route.includes('?'));
    }
  }
  assert.equal(sha(readFileSync(registryUrl)),sha(before),'Coverage must not mutate the Registry');
  assert.equal(entries.length,650,'Historical630 plus separate exact SKTT10 and hospitality10 grants');
});

test('exact imported reservations resolve without activating the historical route proposal',()=>{
  const report=catalogPublicCoverage();
  const rows=report.bali.filter(row=>row.identityReconciledFromReservation);
  assert.deepEqual(rows.map(row=>row.contentId),['legalization','corporate_docs']);
  for(const row of rows)assert.equal(row.targetCoverage,'ALL_TEN_PUBLIC_TARGETS');
  const world=report.worldVisas.find(row=>row.contentId==='vietnam');
  assert.equal(world.targetCoverage,'ALL_TEN_PUBLIC_TARGETS');
  assert.equal(world.publicTargets.find(row=>row.locale==='ru').route,vietnamGrant.records[0].locales.ru.route);
  assert.equal(vietnamGrant.records[0].canonicalPath,'/vietnam/visas/');
  // Historical candidate/plan ownership is not the later version-bound grant.
  assert.ok(!world.publicTargets.some(row=>row.route==='/visas/vietnam/'));
});

test('null candidate bodies do not erase existing legacy housing and privacy renderers',()=>{
  const report=catalogPublicCoverage();
  const legacy=report.bali.filter(row=>!row.candidateRuBodyBound&&row.publicTargets.some(target=>target.sourceKind==='legacy'));
  assert.ok(legacy.length>0,'Keep actual legacy renderer evidence instead of candidate-only absence');
  for(const row of legacy)assert.equal(row.sourceEvidence,'CURRENT_APPROVED_RENDERER_TARGET');
});

test('only the exact additive SKTT10 grant supplies its ten targets, without source-QA promotion',()=>{
  const report=catalogPublicCoverage(),sktt=report.bali.find(row=>row.contentId==='sktt');
  assert.ok(sktt);assert.equal(sktt.targetCoverage,'ALL_TEN_PUBLIC_TARGETS');
  assert.equal(sktt.publicTargets.length,10);assert.deepEqual(sktt.missingLocales,[]);
  for(const target of sktt.publicTargets)assert.equal(target.route,publicTargetHref('sktt',target.locale));
  assert.equal(publicTargetHref('sktt','hi'),'/hi/bali/documents/sktt/');assert.equal(publicTargetHref('sktt','ar'),'/ar/bali/documents/sktt/');
  assert.equal(sktt.intentAndSectionCoverage,'NOT_VERIFIED');assert.equal(sktt.ctaJourney,'NOT_VERIFIED');
});

test('report copies cannot alter future approved coverage or append arbitrary targets',()=>{
  const first=catalogPublicCoverage();
  first.bali[0].publicTargets.push({locale:'ru',route:'/unapproved/',sourceKind:'registry'});
  first.locales.push('xx');first.worldVisas.pop();
  const fresh=catalogPublicCoverage();
  assert.equal(fresh.locales.length,10);assert.equal(fresh.worldVisas.length,9);
  assert.ok(!fresh.bali.some(row=>row.publicTargets.some(target=>target.route==='/unapproved/')));
});
