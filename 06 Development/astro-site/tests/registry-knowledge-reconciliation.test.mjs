import assert from 'node:assert/strict';
import test from 'node:test';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import {reconciledKnowledgePlanRows} from '../../shared/src/catalog-knowledge-reconciliation.mjs';
import {renderCatalogRoutingPreview} from '../scripts/registry-catalog-routing-preview.mjs';
import {catalogPublicCoverage} from '../scripts/registry-catalog-coverage.mjs';
import {publicBuildEntries,publicTargetHref} from '../scripts/registry-publication.mjs';

const clone=()=>structuredClone(registry);
const id='knowledge_apostille_vs_legalization';
const canonical='/bali/knowledge/documents/apostille-vs-legalization/';
const bound=['ru','en','de','fr','es','zh-Hans','ja','ko','hi','ar'];
const selected=r=>r.records.find(row=>row.contentId===id);
const intent=r=>r.routingPlan.knowledge.find(row=>row.proposedRoute===canonical);

test('one finite old null reference resolves to its existing canonical identity without mutation',()=>{
  const before=JSON.stringify(registry),rows=reconciledKnowledgePlanRows(registry),row=rows.find(v=>v.contentId===id);
  assert.equal(rows.length,9);assert.equal(row.declaredContentId,null);
  assert.equal(row.identityReconciledFromKnowledgeCanonical,true);assert.equal(row.proposedRoute,canonical);
  assert.deepEqual([...row.sourceBoundLocales].sort(),[...bound].sort());
  assert.equal(row.sourceEvidenceScope,'REGISTRY_BODY_METADATA_BINDING_ONLY_NOT_WHOLE_SOURCE_QA');
  assert.equal(row.publicationAuthority,false);assert.equal(row.commercialAuthority,false);
  assert.equal(JSON.stringify(registry),before);assert.equal(intent(registry).contentId,null);
});

test('the other seven consumed references and the unbound Schengen shell remain distinct',()=>{
  const rows=reconciledKnowledgePlanRows(registry),other=rows.filter(row=>row.contentId!==id);
  assert.equal(other.filter(row=>row.sourceBoundLocales.length===10).length,7);
  const shell=rows.find(row=>row.contentId==='schengen_guide');
  assert.equal(shell.identityReconciledFromKnowledgeCanonical,false);assert.deepEqual(shell.sourceBoundLocales,[]);
  assert.equal(registry.records.find(row=>row.contentId==='knowledge_e33g_requirements').mergeTargetId,'knowledge_e33g_overview');
  assert.ok(!rows.some(row=>row.contentId==='knowledge_e33g_requirements'),'No duplicate generic requirements page');
});

test('a similar or unknown null route never becomes a candidate-path fallback',()=>{
  for(const route of ['/bali/knowledge/documents/apostille-vs-legalisation/','/bali/knowledge/not-supplied/']) {
    const r=clone();intent(r).proposedRoute=route;
    const row=reconciledKnowledgePlanRows(r).find(v=>v.proposedRoute===route);
    assert.equal(row.contentId,null);assert.equal(row.identityReconciledFromKnowledgeCanonical,false);
    assert.deepEqual(row.sourceBoundLocales,[]);
  }
});

test('a non-null planning identity is never silently replaced with the apostille identity',()=>{
  const r=clone();intent(r).contentId='schengen_guide';
  const row=reconciledKnowledgePlanRows(r).find(v=>v.proposedRoute===canonical);
  assert.equal(row.contentId,'schengen_guide');assert.equal(row.declaredContentId,'schengen_guide');
  assert.equal(row.identityReconciledFromKnowledgeCanonical,false);assert.deepEqual(row.sourceBoundLocales,[]);
});

test('canonical identity, type, parent, source and commercial drift refuse finite reconciliation',()=>{
  const changes=[
    r=>selected(r).candidate.route='/bali/documents/apostille/',
    r=>selected(r).kind='service',
    r=>selected(r).parentId='business',
    r=>selected(r).serviceId='invented',
    r=>selected(r).pricingRef={entityKey:'invented'},
    r=>selected(r).candidate.revision='sha256:'+'0'.repeat(64),
    r=>selected(r).candidate.ru.bodySha256='0'.repeat(64),
    r=>selected(r).candidate.ru.metadataSha256='0'.repeat(64),
    r=>selected(r).candidate.ru.bodyFile='registry-copy/other.md',
    r=>selected(r).candidate.ru.metadataFile='registry-copy/other.meta.json',
    r=>intent(r).label='Different subject',
    r=>intent(r).sourceEditorialState='UNREVIEWED',
  ];
  for(const change of changes){const r=clone();change(r);assert.throws(()=>reconciledKnowledgePlanRows(r));}
});

test('unknown or duplicate existing identity refuses instead of adopting a different record',()=>{
  for(const change of [
    r=>r.records.splice(r.records.findIndex(v=>v.contentId===id),1),
    r=>r.records.push(structuredClone(selected(r))),
    r=>intent(r).contentId='unknown_identity',
  ]){const r=clone();change(r);assert.throws(()=>reconciledKnowledgePlanRows(r));}
});

test('incomplete, stale or unsafe locale body/metadata bindings refuse; no RU fallback',()=>{
  for(const change of [
    r=>selected(r).candidate.translations.ar.complete=false,
    r=>selected(r).candidate.translations.ar.sourceRevision='sha256:'+'0'.repeat(64),
    r=>selected(r).candidate.translations.ar.bodyFile='../private/body.md',
    r=>selected(r).candidate.translations.ar.metadataSha256='not-a-sha',
  ]){const r=clone();change(r);assert.throws(()=>reconciledKnowledgePlanRows(r));}
  const r=clone();selected(r).candidate.translations.ar.bodyFile=null;
  const row=reconciledKnowledgePlanRows(r).find(v=>v.contentId===id);
  assert.equal(row.sourceBoundLocales.length,9);assert.ok(!row.sourceBoundLocales.includes('ar'));
});

test('detached resolver results cannot change source rows or later observations',()=>{
  const rows=reconciledKnowledgePlanRows(registry),row=rows.find(v=>v.contentId===id);
  row.sourceBoundLocales.push('xx');row.proposedRoute='/invented/';
  const fresh=reconciledKnowledgePlanRows(registry).find(v=>v.contentId===id);
  assert.equal(fresh.proposedRoute,canonical);assert.equal(fresh.sourceBoundLocales.length,10);
});

test('authenticated preview links the resolved existing record and qualifies binding-only state',()=>{
  for(const locale of ['ru','ar','ja']){
    const html=renderCatalogRoutingPreview(registry,locale);
    assert.ok(html.includes('/_registry/'+id+'/?locale='+locale));
    assert.ok(html.includes('Исторический null сопоставлен существующей канонической записи'));
    assert.ok(html.includes('Локальные body/metadata привязки:'));
    assert.ok(html.includes('Не whole-source/native/legal QA и не разрешение публикации.'));
    assert.ok(html.includes('Тело в Registry не связано; глобальное отсутствие источника не установлено.'));
    assert.ok(html.includes('noindex,nofollow'));assert.ok(!html.includes('legal review PASS'));
  }
});

test('unknown preview locale stays rejected and corrupt source identity cannot render as ready',()=>{
  assert.equal(renderCatalogRoutingPreview(registry,'xx'),null);
  const r=clone();selected(r).candidate.ru.bodySha256='0'.repeat(64);
  assert.throws(()=>renderCatalogRoutingPreview(r,'ru'));
});

test('Knowledge coverage uses only actual grant-backed publication callers for all nine rows',()=>{
  const before=JSON.stringify(registry),report=catalogPublicCoverage(),entries=publicBuildEntries();
  assert.equal(report.knowledge.length,9);assert.equal(report.bali.length,94);assert.equal(report.worldVisas.length,9);
  assert.equal(report.publicationOrRoutesChanged,false);assert.equal(report.actualIndexing,'NOT_EVALUATED');
  assert.equal(report.knowledge.filter(row=>row.targetCoverage==='ALL_TEN_PUBLIC_TARGETS').length,8);
  assert.equal(entries.length,650);
  for(const row of report.knowledge){
    assert.equal(row.intentAndSectionCoverage,'NOT_VERIFIED');assert.equal(row.ctaJourney,'NOT_VERIFIED');
    assert.equal(row.publicTargets.length+row.missingLocales.length,10);
    for(const target of row.publicTargets){
      assert.equal(target.route,publicTargetHref(row.contentId,target.locale));
      const actual=entries.find(v=>v.contentId===row.contentId&&v.locale===target.locale&&v.route===target.route);
      assert.ok(actual&&actual.indexable===true,'No plan/candidate URL without the real public grant');
    }
  }
  assert.equal(JSON.stringify(registry),before);
});

test('the single reconciled Knowledge reference is not a Documents reservation or new route',()=>{
  const report=catalogPublicCoverage(),row=report.knowledge.find(v=>v.contentId===id);
  assert.equal(row.declaredContentId,null);assert.equal(row.identityReconciledFromKnowledgeCanonical,true);
  assert.equal(row.identityReconciledFromReservation,false);assert.equal(row.publicTargets.length,10);
  assert.equal(row.publicTargets.find(v=>v.locale==='ru').route,canonical);
  assert.deepEqual(report.bali.filter(v=>v.identityReconciledFromReservation).map(v=>v.contentId),['legalization','corporate_docs']);
  assert.equal(report.worldVisas.find(v=>v.contentId==='vietnam').publicTargets.find(v=>v.locale==='ru').route,'/vietnam/visas/');
});

test('missing Schengen source/locale is not hidden by the deferred destination or a section alias',()=>{
  const row=catalogPublicCoverage().knowledge.find(v=>v.contentId==='schengen_guide');
  assert.equal(row.targetCoverage,'NO_PUBLIC_TARGET');assert.deepEqual(row.publicTargets,[]);
  assert.equal(row.missingLocales.length,10);assert.deepEqual(row.sourceBoundLocales,[]);
  assert.equal(row.candidateRuBodyBound,false);assert.equal(row.intentAndSectionCoverage,'NOT_VERIFIED');
});

test('coverage copies cannot mutate future Knowledge evidence or append an unapproved target',()=>{
  const report=catalogPublicCoverage(),row=report.knowledge.find(v=>v.contentId===id);
  row.publicTargets.push({locale:'xx',route:'/invented/',sourceKind:'registry'});row.sourceBoundLocales.push('xx');report.knowledge.pop();
  const fresh=catalogPublicCoverage();assert.equal(fresh.knowledge.length,9);
  assert.equal(fresh.knowledge.find(v=>v.contentId===id).publicTargets.length,10);
  assert.equal(fresh.knowledge.find(v=>v.contentId===id).sourceBoundLocales.length,10);
});
