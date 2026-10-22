// Additive SKTT10 owner grant; historical712/1070, bank10 and Vietnam10 are immutable.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import grant from '../../../shared/content/registry-sktt-editorial-public-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../../shared/src/service-registry.mjs';
import {publicRegistryContentVersion} from './public-content-version.mjs';
import {strictPublicationDate} from './publication-policy.mjs';
const anchor='72933c5d1a96f638d43587c388b27b4361fe1a3b7fe32b6bf32fce914484b033';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(grant);
function approvedSktt(){
 assert.equal(createHash('sha256').update(JSON.stringify(grant,null,2)+'\n').digest('hex'),anchor,'SKTT indexing grant drift');
 assert.equal(grant.authority.publisher,'Founder');assert.equal(grant.authority.decisionDate,'2026-10-22');
 assert.equal(grant.authority.scope,'PUBLIC_SKTT_EXISTING_IDENTITY_TEN_LOCALES_INDEXABLE_NO_QA_PROMOTION');
 assert.equal(grant.records.length,1);const record=grant.records[0];
 assert.equal(record.contentId,'sktt');assert.equal(record.canonicalPath,'/bali/documents/sktt/');
 assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
 assert.deepEqual(Object.keys(record.locales),PUBLIC_LOCALES);
 for(const [locale,pin]of Object.entries(record.locales)){
  const prefix=locale==='ru'?'':locale==='zh-Hans'?'/zh-cn':'/'+locale;
  assert.equal(pin.route,prefix+record.canonicalPath);assert.match(pin.publicSourceVersion,/^sha256:[a-f0-9]{64}$/);
 }
 return record;
}
export function publicSkttApprovedRoutes(){
 const record=approvedSktt();return Object.entries(record.locales).map(([locale,pin])=>({kind:'registry',contentId:'sktt',
  locale,route:pin.route,canonicalPath:record.canonicalPath,contentVersion:pin.publicSourceVersion}));
}
export function applyPublicSkttOwnerIndexing(kind,page,locale,asOf=new Date()){
 assert.equal(kind,'registry','SKTT grant does not extend other kinds');
 const record=approvedSktt(),pin=record.locales[locale],now=asOf instanceof Date?asOf.getTime():strictPublicationDate(asOf);
 assert.ok(Number.isFinite(now)&&now>=Date.parse(grant.authority.decisionDate),'Invalid SKTT publication clock');
 assert.ok(pin,'Unknown SKTT grant locale');assert.equal(page?.contentId,'sktt');assert.equal(page.locale,locale);
 assert.equal(page.route,pin.route);assert.equal(page.canonicalPath,record.canonicalPath);assert.equal(page.sourceRevision,record.sourceRevision);
 assert.equal(page.serviceId,null);assert.equal(page.pricingRef,null);
 assert.equal(publicRegistryContentVersion(page),pin.publicSourceVersion,'SKTT public source changed after grant');
 return {...page,indexable:true,publication:{indexable:true,reason:'eligible_owner_approved_indexing',
  lastmod:record.publication.lastModified,localeCoverageConfirmed:true,independentReviewClaim:false}};
}
