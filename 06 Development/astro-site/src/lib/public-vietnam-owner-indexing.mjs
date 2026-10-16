// One source-pinned ten-locale extension, no rewrite of historical approvals.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import grant from '../../../shared/content/registry-vietnam-editorial-public-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../../shared/src/service-registry.mjs';
import {publicRegistryContentVersion} from './public-content-version.mjs';
const anchor='d5648322e03e377654b0c75f7c350a5cfb14b7f1cdae8cade0a3d0a739649656';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(grant);
function approvedVietnam(){
  assert.equal(createHash('sha256').update(JSON.stringify(grant,null,2)+'\n').digest('hex'),anchor,'Vietnam indexing approval drift');
  assert.equal(grant.authority.publisher,'Founder');assert.equal(grant.authority.decisionDate,'2026-10-12');
  assert.equal(grant.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  assert.equal(grant.sourceManifestSha256,'defebc9a11676c8398a9cbeffaff32f66964cf4bcf5881a42c0cbab4c990c5df');
  assert.equal(grant.records.length,1);const record=grant.records[0];
  assert.equal(record.contentId,'vietnam');assert.equal(record.canonicalPath,'/vietnam/visas/');
  assert.equal(record.sourceCanonicalPath,'/visas/vietnam/');assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.deepEqual(Object.keys(record.locales).sort(),[...PUBLIC_LOCALES].sort());
  for(const [locale,pin]of Object.entries(record.locales)){
    const prefix=locale==='ru'?'':locale==='zh-Hans'?'/zh-cn':'/'+locale;
    assert.equal(pin.route,prefix+record.canonicalPath);assert.match(pin.publicSourceVersion,/^sha256:[a-f0-9]{64}$/);
  }
  return record;
}
export function publicVietnamApprovedRoutes(){
  const record=approvedVietnam();return Object.entries(record.locales).map(([locale,pin])=>({
    kind:'registry',contentId:'vietnam',locale,route:pin.route,canonicalPath:record.canonicalPath,contentVersion:pin.publicSourceVersion}));
}
export function applyPublicVietnamOwnerIndexing(kind,page,locale,asOf=new Date()){
  assert.equal(kind,'registry','Vietnam approval does not extend other kinds');
  const record=approvedVietnam(),pin=record.locales[locale],now=asOf instanceof Date?asOf.getTime():Date.parse(asOf);
  assert.ok(Number.isFinite(now)&&now>=Date.parse(grant.authority.decisionDate),'Invalid Vietnam publication clock');
  assert.ok(pin,'Unknown Vietnam locale');assert.equal(page?.contentId,'vietnam');assert.equal(page.locale,locale);
  assert.equal(page.route,pin.route);assert.equal(page.canonicalPath,record.canonicalPath);assert.equal(page.sourceRevision,record.sourceRevision);
  assert.equal(page.serviceId,null);assert.equal(page.pricingRef,null);
  assert.equal(publicRegistryContentVersion(page),pin.publicSourceVersion,'Vietnam public source drift after approval');
  return {...page,indexable:true,publication:{indexable:true,reason:'eligible_owner_approved_indexing',
    lastmod:record.publication.lastModified,localeCoverageConfirmed:true,independentReviewClaim:false}};
}
