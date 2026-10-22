// Read-only coverage of the retained intent plan against actual build approvals.
// This is not a router, a content approval, a Service or a completeness claim.
import assert from 'node:assert/strict';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {validateCatalogRoutingPlan} from '../../shared/src/catalog-country-routing.mjs';
import {reconciledKnowledgePlanRows} from '../../shared/src/catalog-knowledge-reconciliation.mjs';
import {publicBuildEntries,publicTargetHref} from './registry-publication.mjs';
import {publicTenLocaleApprovedRoutes} from '../src/lib/public-ten-locale-publication.mjs';

const reservations=Object.freeze({legalization:'/bali/documents/legalization/',corporate_docs:'/bali/documents/corporate/'});

/** No injected projection or candidate-URL fallback: use the same current
 * publication callers as the site. A public target is not proof that a section,
 * customer journey, CTA, provider or commercial offer satisfies the intent. */
export function catalogPublicCoverage() {
  validateCatalogRoutingPlan(registry);
  const entries=publicBuildEntries();
  const owners=publicTenLocaleApprovedRoutes().filter(row=>row.kind==='legacy'||row.kind==='standalone');
  const byRoute=new Map([...owners,...entries.map(row=>({...row,kind:'registry'}))].map(row=>[row.route,row]));
  assert.equal(byRoute.size,owners.length+entries.length,'Public coverage route collision');
  const records=new Map(registry.records.map(row=>[row.contentId,row]));
  function coverage(intent) {
    const id=intent.contentId??intent.reservedContentId??null;
    const record=id?records.get(id):null;
    if(intent.contentId===null&&record) {
      assert.equal(record.kind,'document');assert.equal(record.parentId,'documents');
      assert.equal(record.candidate.route,reservations[id],'Unknown reservation reconciliation');
    }
    const targets=PUBLIC_LOCALES.flatMap(locale=>{
      const route=id?publicTargetHref(id,locale):null;
      if(route===null)return [];
      const owner=byRoute.get(route);
      assert.ok(owner&&owner.locale===locale,'Target without actual current publication approval');
      if(owner.kind==='registry')assert.equal(owner.contentId,id,'Public identity drift');
      assert.match(route,/^\/(?:[a-z0-9-]+\/)*$/);
      return [{locale,route,sourceKind:owner.kind}];
    });
    const missingLocales=PUBLIC_LOCALES.filter(locale=>!targets.some(row=>row.locale===locale));
    return {
      intentKey:intent.key,contentId:id,representation:intent.representation??'page',
      identityReconciledFromReservation:intent.contentId===null&&Boolean(record),
      publicTargets:targets,missingLocales,
      targetCoverage:targets.length===PUBLIC_LOCALES.length?'ALL_TEN_PUBLIC_TARGETS':targets.length?'PARTIAL_PUBLIC_TARGETS':'NO_PUBLIC_TARGET',
      candidateRuBodyBound:Boolean(record?.candidate.ru.bodyFile),
      sourceEvidence:targets.length?'CURRENT_APPROVED_RENDERER_TARGET':record?.candidate.ru.bodyFile?'LOCAL_BOUND_SOURCE_NOT_PUBLIC':'CURRENT_BINDING_ABSENT_OR_UNVERIFIED',
      intentAndSectionCoverage:'NOT_VERIFIED',ctaJourney:'NOT_VERIFIED',
      commercialAvailability:record?.availability??'not_verified',
    };
  }
  const bali=registry.routingPlan.bali.map(coverage),worldVisas=registry.routingPlan.worldVisas.map(coverage);
  const knowledge=reconciledKnowledgePlanRows(registry).map(intent=>({
    ...coverage({...intent,key:'knowledge:'+intent.proposedRoute}),
    declaredContentId:intent.declaredContentId,
    identityReconciledFromKnowledgeCanonical:intent.identityReconciledFromKnowledgeCanonical,
    sourceBoundLocales:[...intent.sourceBoundLocales],
    sourceEvidenceScope:intent.sourceEvidenceScope,
  }));
  assert.equal(bali.length,94);assert.equal(worldVisas.length,9);assert.equal(knowledge.length,9);
  return {schemaVersion:1,scope:'CURRENT_APPROVED_TARGET_COVERAGE_ONLY',
    publicationOrRoutesChanged:false,actualIndexing:'NOT_EVALUATED',
    locales:[...PUBLIC_LOCALES],bali,worldVisas,knowledge};
}
