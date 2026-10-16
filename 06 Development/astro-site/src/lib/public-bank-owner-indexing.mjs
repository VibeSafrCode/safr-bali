// Scoped bank10 addition; neither historical712 nor1070 grants are rewritten.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import grant from '../../../shared/content/registry-bank-editorial-public-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../../shared/src/service-registry.mjs';
import {publicRegistryContentVersion} from './public-content-version.mjs';
const anchor='d5961422fedd60e30586eb54dd6dfd47d3fa9e9f3ed8a6a521dbd7f9367d584a';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(grant);
function approvedBank(){
  assert.equal(createHash('sha256').update(JSON.stringify(grant,null,2)+'\n').digest('hex'),anchor,'Bank indexing approval drift');
  assert.equal(grant.authority.publisher,'Founder');assert.equal(grant.authority.decisionDate,'2026-10-12');
  assert.equal(grant.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  assert.equal(grant.sourceManifestSha256,'985d7eff08477ffc2b1cad2bbcaa4a817440faa733b8b7bd11b7eda5b511bc6d');
  assert.equal(grant.records.length,1);const record=grant.records[0];
  assert.equal(record.contentId,'bank');assert.equal(record.canonicalPath,'/bali/documents/bank-account/');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.deepEqual(Object.keys(record.locales).sort(),[...PUBLIC_LOCALES].sort());
  for(const [locale,pin]of Object.entries(record.locales)){
    const prefix=locale==='ru'?'':locale==='zh-Hans'?'/zh-cn':'/'+locale;
    assert.equal(pin.route,prefix+record.canonicalPath);
    assert.match(pin.publicSourceVersion,/^sha256:[a-f0-9]{64}$/);
  }
  return record;
}
export function publicBankApprovedRoutes(){
  const record=approvedBank();return Object.entries(record.locales).map(([locale,pin])=>({kind:'registry',contentId:'bank',locale,
    route:pin.route,canonicalPath:record.canonicalPath,contentVersion:pin.publicSourceVersion}));
}
export function applyPublicBankOwnerIndexing(kind,page,locale,asOf=new Date()){
  assert.equal(kind,'registry','Bank approval does not extend other kinds');
  const record=approvedBank(),pin=record.locales[locale],now=asOf instanceof Date?asOf.getTime():Date.parse(asOf);
  assert.ok(Number.isFinite(now)&&now>=Date.parse(grant.authority.decisionDate),'Invalid bank publication clock');
  assert.ok(pin,'Unknown bank approval locale');
  assert.equal(page?.contentId,'bank');assert.equal(page.locale,locale);assert.equal(page.route,pin.route);
  assert.equal(page.canonicalPath,record.canonicalPath);assert.equal(page.sourceRevision,record.sourceRevision);
  assert.equal(page.serviceId,null);assert.equal(page.pricingRef,null);
  assert.equal(publicRegistryContentVersion(page),pin.publicSourceVersion,'Bank public source changed after approval');
  return {...page,indexable:true,publication:{indexable:true,reason:'eligible_owner_approved_indexing',
    lastmod:record.publication.lastModified,localeCoverageConfirmed:true,independentReviewClaim:false}};
}
