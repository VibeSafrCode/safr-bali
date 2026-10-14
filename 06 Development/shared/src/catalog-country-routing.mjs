// Planning references inside the existing Registry. Never a public router,
// Service table, availability authority, redirect map or price catalogue.
import assert from 'node:assert/strict';

export const COUNTRY_CATALOG_TASK = 'CATALOG-COUNTRY-ROUTING-20261009';
export const COUNTRY_CATALOG_MASTER_SHA = '87be0d2ef654680b49c1fefaede972e34a608849482d898cc1b346a5c16835a4';
export const COUNTRY_CATALOG_BASELINE = '78d3ec2056e8be537191be7511591f073f7215f8';
export const COUNTRY_NAV_GROUPS = ['visas', 'business', 'documents', 'housing', 'transport', 'life', 'finance'];
export const COUNTRY_NAV_LABELS = ['Визы и KITAS', 'Бизнес и лицензии', 'Документы', 'Жильё', 'Транспорт и аэропорт', 'Жизнь на Бали', 'Страховки и финансы'];
const existingCountries = ['ID', 'TH', 'AE', 'NP', 'RU'];
const newCountries = ['JP', 'SG', 'IN', 'VN', 'AU', 'US', 'KR', 'ZA'];
const conditionalCountries = ['DE', 'FR', 'IT', 'ES'];

// Canonical associations for this pinned planning revision, not release authority.
// Keep semantic identities stable even when two syntactically valid paths differ.
const COUNTRY_SLUGS = Object.freeze({
  ID: 'bali', TH: 'thailand', AE: 'uae', NP: 'nepal', RU: 'russia',
  JP: 'japan', SG: 'singapore', IN: 'india', VN: 'vietnam', AU: 'australia',
  US: 'usa', KR: 'south-korea', ZA: 'south-africa', DE: 'germany',
  FR: 'france', IT: 'italy', ES: 'spain',
});
const WORLD_IDENTITIES = Object.freeze({
  visa_japan: ['japan', 'JP'], visa_singapore: ['singapore', 'SG'],
  visa_india: ['india', 'IN'], visa_vietnam: ['vietnam', 'VN'],
  visa_australia: ['australia', 'AU'], visa_usa: ['usa', 'US'],
  visa_korea: ['south_korea', 'KR'], visa_south_africa: ['south_africa', 'ZA'],
  visa_schengen: ['schengen', null],
});
// v82 imported these two previously reserved content identities. The pinned
// historical plan remains byte-identical; only exact Documents drafts can
// reconcile its reservations, never an arbitrary shell or business binding.
const IMPORTED_RESERVATIONS=Object.freeze({legalization:'/bali/documents/legalization/',corporate_docs:'/bali/documents/corporate/'});

const pathPattern = /^\/(?:[a-z0-9-]+\/)*$/;
const text = value => assert.ok(typeof value === 'string', 'Expected planning text');
const path = value => { if (value !== null) assert.match(value, pathPattern, 'Unsafe proposed path'); };
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'Unexpected routing-plan fields');

/** No fallback to candidate URLs; callers must supply their existing approved
 * publication projection. Absence of evidence means no public target. This
 * helper does NOT activate the proposed seven-group navigation. */
export function approvedRoutingTargets(registry, contentIds, locale, approvedEntries = []) {
  if (!registry.locales.some(language => language.code === locale)) return [];
  const ids = new Set(registry.records.map(record => record.contentId));
  return [...new Set(contentIds)].flatMap(contentId => {
    if (!ids.has(contentId)) return [];
    const entry = approvedEntries.find(row => row.contentId === contentId && row.locale === locale);
    if (!entry || !['public_noindex', 'public_indexable'].includes(entry.exposure)) return [];
    const record = registry.records.find(row => row.contentId === contentId);
    const prefix = registry.locales.find(language => language.code === locale).prefix;
    const allowed = [record.published?.routes[locale], prefix + record.candidate.route].filter(Boolean);
    if (!allowed.includes(entry.route)) return [];
    path(entry.route);
    return [{contentId, locale, route: entry.route, exposure: entry.exposure}];
  });
}

/** Optional for preceding releases and historical import fixtures. The plan
 * can describe a missing identity but cannot manufacture a business binding. */
export function validateCatalogRoutingPlan(registry) {
  if (!Object.hasOwn(registry, 'routingPlan')) return null;
  const plan = registry.routingPlan;
  keys(plan, ['schemaVersion', 'taskId', 'exposure', 'publicationAuthorized', 'source', 'navigation', 'bali', 'worldVisas', 'destinations', 'globalServices', 'knowledge']);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.taskId, COUNTRY_CATALOG_TASK);
  assert.equal(plan.exposure, 'preview_only');
  assert.equal(plan.publicationAuthorized, false);
  keys(plan.source, ['file', 'sha256', 'inspectedGitSha']);
  assert.equal(plan.source.file, 'MASTER_CATALOG_ARCHITECTURE.json');
  assert.equal(plan.source.sha256, COUNTRY_CATALOG_MASTER_SHA);
  assert.equal(plan.source.inspectedGitSha, COUNTRY_CATALOG_BASELINE);
  const records = new Map(registry.records.map(record => [record.contentId, record]));
  const reference = id => assert.ok(id === null || records.has(id), 'Unknown routing content identity: ' + id);
  const identity = row => {
    reference(row.contentId);
    if (row.contentId !== null) assert.equal(row.reservedContentId, null);
    else if (row.reservedContentId !== null) {
      assert.match(row.reservedContentId, /^[a-z][a-z0-9_]*$/);
      if(records.has(row.reservedContentId)) {
        const record=records.get(row.reservedContentId),route=IMPORTED_RESERVATIONS[row.reservedContentId];
        assert.ok(route,'Reserved identity collision');assert.equal(record.kind,'document');assert.equal(record.parentId,'documents');
        assert.equal(record.candidate.route,route);assert.equal(row.proposedRoute,route);
        assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);assert.equal(record.published,null);
        assert.equal(record.release,'not_authorized');assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.candidate.ru.status,'draft');
        assert.equal(record.candidate.ru.metadataFile,'registry-copy/'+row.reservedContentId+'_ru_documents_20261009.meta.json','Only imported Documents reservation may be reconciled');
      }
    }
  };
  const nav = plan.navigation;
  keys(nav, ['root', 'activation', 'groups', 'quickLinkContentIds']);
  assert.equal(nav.root, '/bali/');
  assert.equal(nav.activation, 'preview_only');
  assert.deepEqual(nav.groups.map(group => group.id), COUNTRY_NAV_GROUPS);
  assert.deepEqual(nav.groups.map(group => group.titleRU), COUNTRY_NAV_LABELS);
  for (const group of nav.groups) {
    keys(group, ['id', 'titleRU', 'descriptionRU', 'targetContentIds']);
    text(group.descriptionRU);
    unique(group.targetContentIds, 'Duplicate navigation target');
    group.targetContentIds.forEach(reference);
  }
  assert.deepEqual(nav.quickLinkContentIds, ['visas_bali', 'assistant', 'guides', 'insurance', 'exchange']);
  nav.quickLinkContentIds.forEach(reference);
  assert.equal(plan.bali.length, 94);
  unique(plan.bali.map(row => row.key), 'Duplicate Bali intent');
  const baliKeys = new Set(plan.bali.map(row => row.key));
  for (const row of plan.bali) {
    keys(row, ['key', 'contentId', 'reservedContentId', 'titleRU', 'groupId', 'jurisdictionCountry', 'serviceLocation', 'representation', 'sourceCandidateRoute', 'editorialPreferredRoute', 'proposedRoute', 'sourceEditorialState', 'priority', 'commercialAvailability', 'pricingPolicy', 'publicationRecommendation', 'gate', 'notes', 'relatedKeys', 'routeConflict']);
    identity(row);
    if (row.contentId !== null && row.sourceCandidateRoute !== null) {
      assert.equal(row.sourceCandidateRoute, records.get(row.contentId).candidate.route, 'Bali identity/candidate drift: ' + row.key);
    }
    assert.match(row.key, /^id_[a-z0-9_]+$/);
    assert.ok(COUNTRY_NAV_GROUPS.includes(row.groupId));
    assert.equal(row.jurisdictionCountry, 'ID');
    assert.equal(row.commercialAvailability, 'not_verified');
    assert.equal(row.pricingPolicy, 'existing_binding_or_unapproved_quote');
    assert.ok(['page', 'section', 'triage', 'feature', 'resource', 'utility'].includes(row.representation));
    assert.ok(['LIVE_HTML', 'STAGED_EDITORIAL', 'CONCEPT', 'REGISTRY_SHELL', 'INFO_OR_REVIEW', 'HOLD'].includes(row.sourceEditorialState));
    assert.equal(typeof row.routeConflict, 'boolean');
    for (const field of ['titleRU', 'serviceLocation', 'priority', 'publicationRecommendation', 'gate', 'notes']) text(row[field]);
    for (const field of ['sourceCandidateRoute', 'editorialPreferredRoute', 'proposedRoute']) path(row[field]);
    row.relatedKeys.forEach(key => assert.ok(baliKeys.has(key), 'Unknown related intent'));
  }
  assert.deepEqual(plan.bali.filter(row => row.contentId === null).map(row => row.reservedContentId), ['legalization', 'corporate_docs']);
  assert.equal(plan.bali.filter(row => row.routeConflict).length, 5);
  assert.equal(plan.worldVisas.length, 9);
  unique(plan.worldVisas.map(row => row.key), 'Duplicate world-visa intent');
  unique(plan.worldVisas.map(row => row.contentId), 'Duplicate world-visa content identity');
  assert.deepEqual(plan.worldVisas.map(row => row.destinationCountryCode).filter(Boolean), newCountries);
  for (const row of plan.worldVisas) {
    keys(row, ['key', 'contentId', 'titleRU', 'destinationCountryCode', 'destinationRegion', 'applicationCountryCode', 'applicationContext', 'applicationOriginExamples', 'sourceCandidateRoute', 'proposedRoute', 'migrationMode', 'priority', 'gate', 'exposure', 'pricingPolicy']);
    reference(row.contentId); assert.ok(row.contentId);
    const expected = WORLD_IDENTITIES[row.key];
    assert.ok(expected, 'Unknown world-visa semantic key');
    assert.equal(row.contentId, expected[0], 'World-visa content identity mismatch: ' + row.key);
    assert.equal(row.destinationCountryCode, expected[1], 'World-visa country mismatch: ' + row.key);
    assert.equal(records.get(row.contentId).kind, 'world_visa', 'World visa must reference world_visa content');
    assert.equal(row.sourceCandidateRoute, records.get(row.contentId).candidate.route, 'World-visa candidate drift');
    const expectedSource = row.destinationCountryCode === null ? '/visas/schengen/' : '/visas/' + COUNTRY_SLUGS[row.destinationCountryCode] + '/';
    assert.equal(row.sourceCandidateRoute, expectedSource, 'World-visa country/source association mismatch');
    if (row.destinationCountryCode !== null) {
      assert.equal(row.proposedRoute, '/' + COUNTRY_SLUGS[row.destinationCountryCode] + '/visas/', 'World-visa country/proposed-route mismatch');
    }
    assert.equal(row.applicationCountryCode, null);
    assert.equal(row.applicationContext, 'context_dependent');
    assert.deepEqual(row.applicationOriginExamples, ['ID']);
    assert.equal(row.exposure, 'preview_only');
    assert.equal(row.pricingPolicy, 'unapproved_individual_quote');
    path(row.sourceCandidateRoute); path(row.proposedRoute);
    if (row.destinationCountryCode === null) {
      assert.equal(row.destinationRegion, 'SCHENGEN'); assert.equal(row.proposedRoute, null);
    } else assert.equal(row.destinationRegion, null);
    for (const field of ['titleRU', 'migrationMode', 'priority', 'gate']) text(row[field]);
  }
  assert.equal(plan.destinations.length, 17);
  unique(plan.destinations.map(row => row.entityId), 'Duplicate country entity');
  unique(plan.destinations.map(row => row.countryCode), 'Duplicate country code');
  assert.deepEqual(plan.destinations.map(row => row.countryCode), [...existingCountries, ...newCountries, ...conditionalCountries]);
  for (const row of plan.destinations) {
    keys(row, ['entityId', 'countryCode', 'slug', 'nameRU', 'existingHub', 'proposedHub', 'lifecycle', 'notes']);
    assert.match(row.countryCode, /^[A-Z]{2}$/);
    assert.equal(row.entityId, 'country:' + row.countryCode);
    assert.ok(!records.has(row.entityId), 'Country entity cannot reuse service identity');
    assert.match(row.slug, /^[a-z-]+$/); text(row.nameRU); text(row.notes);
    assert.equal(row.slug, COUNTRY_SLUGS[row.countryCode], 'Country/slug mismatch: ' + row.countryCode);
    assert.equal(row.proposedHub, '/' + COUNTRY_SLUGS[row.countryCode] + '/', 'Country/hub mismatch: ' + row.countryCode);
    path(row.existingHub); path(row.proposedHub);
    if (existingCountries.includes(row.countryCode)) {
      assert.equal(row.lifecycle, 'preserve_existing'); assert.ok(row.existingHub);
      assert.equal(row.proposedHub, row.existingHub);
    } else {
      assert.equal(row.existingHub, null);
      assert.equal(row.lifecycle, conditionalCountries.includes(row.countryCode) ? 'conditional_preview' : 'preview_only');
    }
  }
  assert.equal(plan.globalServices.length, 4);
  unique(plan.globalServices.map(row => row.key), 'Duplicate global intent');
  for (const row of plan.globalServices) {
    keys(row, ['key', 'contentId', 'titleRU', 'proposedRoute', 'sourceEditorialState', 'notes']);
    reference(row.contentId); path(row.proposedRoute);
    text(row.titleRU); text(row.sourceEditorialState); text(row.notes);
  }
  assert.equal(plan.knowledge.length, 9);
  unique(plan.knowledge.map(row => row.proposedRoute), 'Duplicate Knowledge proposal');
  for (const row of plan.knowledge) {
    keys(row, ['contentId', 'proposedRoute', 'label', 'sourceEditorialState']);
    reference(row.contentId); path(row.proposedRoute); text(row.label); text(row.sourceEditorialState);
  }
  return {baliIntents: 94, existingReferences: 92, reservedReferences: 2, worldVisaIntents: 9, countryEntities: 17, routeConflicts: 5, publicRoutesAdded: 0};
}
