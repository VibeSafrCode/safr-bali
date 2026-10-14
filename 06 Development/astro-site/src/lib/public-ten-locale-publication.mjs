// Separate version-bound Founder approval; never promotes source/native/legal QA.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import grant from '../../../shared/content/public-ten-locale-owner-indexing.v1.json' with {type:'json'};
import {PUBLIC_LOCALES} from '../../../shared/src/service-registry.mjs';
import {publicRegistryContentVersion,publicLegacyContentVersion,publicStandaloneContentVersion} from './public-content-version.mjs';
export const PUBLIC_TEN_LOCALE_OWNER_GRANT_SHA256='35a75851f1c40fee0a003d0fde9baca2c6842bdb8a9851abc3e1b2a1470443b8';
const versions=Object.freeze({registry:publicRegistryContentVersion,legacy:publicLegacyContentVersion,standalone:publicStandaloneContentVersion});
const forbidden=new Set(['account','admin','api','auth','private','preview','_registry','cabinet','login','mini-app']);
const hash=value=>createHash('sha256').update(JSON.stringify(value,null,2)+'\n').digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(grant);
export function validatePublicTenLocaleOwnerGrant(manifest=grant){
 assert.equal(hash(manifest),PUBLIC_TEN_LOCALE_OWNER_GRANT_SHA256,'Ten-locale owner grant drift');
 assert.equal(manifest.schemaVersion,1);assert.equal(manifest.stage,'LOCAL_READY_NO_DEPLOY');
 assert.deepEqual(manifest.authority,{publisher:'Founder',decisionDate:'2026-10-12',scope:'ALL_EXISTING_PUBLIC_PAGES_TEN_LANGUAGES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST'});
 assert.equal(manifest.independentReviewClaim,false);assert.equal(manifest.sourceQaPromotion,false);assert.equal(manifest.legacyGrantPreserved,true);
 assert.equal(manifest.records.length,1070);assert.equal(new Set(manifest.records.map(r=>r.route)).size,1070);
 for(const row of manifest.records){
  assert.ok(typeof row.kind==='string'&&Object.hasOwn(versions,row.kind)&&typeof row.locale==='string'&&PUBLIC_LOCALES.includes(row.locale),'Unknown public approval identity');
  assert.match(row.route,/^\/(?:[a-z0-9-]+\/)*$/);assert.ok(!row.route.split('/').some(s=>forbidden.has(s)),'Private indexing forbidden');
  assert.match(row.contentVersion,/^sha256:[a-f0-9]{64}$/);
 }
 for(const [kind,count]of[['legacy',450],['registry',610],['standalone',10]])assert.equal(manifest.records.filter(r=>r.kind===kind).length,count);
 return manifest;
}
validatePublicTenLocaleOwnerGrant();
const approved=new Map(grant.records.map(row=>[row.route,row]));
export function publicTenLocaleApprovedRoutes(){return grant.records.map(row=>({...row}));}
export function applyPublicTenLocaleOwnerIndexing(kind,page,locale,asOf=new Date()){
 assert.ok(typeof kind==='string'&&Object.hasOwn(versions,kind),'Unknown public source kind');
 const row=approved.get(page?.route),now=asOf instanceof Date?asOf.getTime():Date.parse(asOf);
 assert.ok(Number.isFinite(now)&&now>=Date.parse(grant.authority.decisionDate),'Invalid owner approval clock');
 assert.ok(row&&row.kind===kind&&row.locale===locale,'Unapproved public path/locale');
 assert.equal(versions[kind](page),row.contentVersion,'Current public source changed since owner approval');
 if(kind==='registry'){assert.equal(row.contentId,page.contentId);assert.equal(row.canonicalPath,page.canonicalPath);}
 return {...page,indexable:true,publication:{indexable:true,reason:'eligible_owner_approved_indexing',
  lastmod:page.publication?.lastmod??page.lastModified??grant.authority.decisionDate,
  localeCoverageConfirmed:true,independentReviewClaim:false}};
}
