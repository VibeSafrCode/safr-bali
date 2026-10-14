// Explicit owner indexing approval for an exact positive public source snapshot.
// Short/uncertain copy remains publishable by this decision, not falsely verified.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import grant from '../../../shared/content/public-owner-indexing.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../../shared/src/service-registry.mjs';
import {strictPublicationDate} from './publication-policy.mjs';
import {publicRegistryContentVersion,publicLegacyContentVersion,publicStandaloneContentVersion} from './public-content-version.mjs';
const anchor='c7d182cf190daee2528320586191d5745ed9aa1abebb11b3138870b55d8bc9b8';
const versions={registry:publicRegistryContentVersion,legacy:publicLegacyContentVersion,standalone:publicStandaloneContentVersion};
const privateSegments=new Set(['account','admin','auth','api','_registry','preview','private','mini-app','cabinet','login']);
export function validatePublicOwnerIndexingGrant(manifest=grant) {
  assert.equal(createHash('sha256').update(JSON.stringify(manifest,null,2)+'\n').digest('hex'),anchor,'Version-bound owner indexing grant drift');
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.stage,'LOCAL_READY_NO_DEPLOY');
  assert.equal(manifest.authority.publisher,'Founder');assert.equal(manifest.authority.decisionDate,'2026-10-12');
  assert.equal(manifest.authority.scope,'ALL_EXISTING_PUBLIC_PAGES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  assert.equal(manifest.records.length,712);
  assert.equal(new Set(manifest.records.map(r=>r.kind+'|'+r.route)).size,712,'Ambiguous owner indexing identity');
  for(const row of manifest.records) {
    assert.ok(Object.hasOwn(versions,row.kind)&&PUBLIC_LOCALES.includes(row.locale),'Unknown indexing scope');
    assert.match(row.route,/^\/(?:[a-z0-9-]+\/)*$/);
    assert.ok(!row.route.split('/').some(s=>privateSegments.has(s)),'Private surface cannot be indexed');
    assert.match(row.contentVersion,/^sha256:[0-9a-f]{64}$/);
  }
  return manifest;
}
/**
 * @param {'registry'|'legacy'|'standalone'} kind
 * @param {any} page Actual validated public model, never a private route.
 * @param {string} [locale]
 * @param {string|Date} [asOf]
 * @param {{manifest?: typeof grant,localeCoverageConfirmed?: boolean|null}} [options]
 */
export function applyPublicOwnerIndexing(kind,page,locale=page?.locale,asOf=new Date(),
  {manifest=grant,localeCoverageConfirmed=null}={}) {
  validatePublicOwnerIndexingGrant(manifest);
  assert.ok(Object.hasOwn(versions,kind),'Unknown public indexing source kind');
  const approval=manifest.records.find(r=>r.kind===kind&&r.route===page?.route);
  assert.ok(approval&&approval.locale===locale,'Unapproved public route/locale');
  const now=asOf instanceof Date?asOf.getTime():strictPublicationDate(asOf);
  assert.ok(Number.isFinite(now)&&now>=Date.parse(manifest.authority.decisionDate),'Owner indexing approval in future/invalid clock');
  assert.equal(versions[kind](page),approval.contentVersion,'Public content changed since indexing approval');
  if(kind==='registry') {
    assert.equal(page.contentId,approval.contentId);assert.equal(page.canonicalPath,approval.canonicalPath);
    return {...page,indexable:true};
  }
  return {...page,indexable:true,publication:{indexable:true,reason:'eligible_owner_approved_indexing',
    lastmod:page.publication?.lastmod??manifest.authority.decisionDate,
    localeCoverageConfirmed,independentReviewClaim:false}};
}
