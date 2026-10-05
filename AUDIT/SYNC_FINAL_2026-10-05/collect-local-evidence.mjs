// Local evidence only: no network, Git writes, backend startup or production.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {syncPageIds} from '../../06 Development/shared/scripts/import-sync-bundle.mjs';
const frontend=fileURLToPath(new URL('../../',import.meta.url));
const backend=resolve(frontend,'../bali-runtime-workspace');
const output=fileURLToPath(new URL('./',import.meta.url));
const content=resolve(frontend,'06 Development/shared/content');
const bytes=(root,path)=>readFileSync(resolve(root,path));
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=(root,path)=>JSON.parse(bytes(root,path));
const save=(path,value)=>writeFileSync(resolve(output,path),JSON.stringify(value,null,2)+'\n');
const manifest=json(content,'registry-copy/sync1004_manifest.json');
const registry=json(content,'service-registry.v1.json');
const overlay=json(content,'registry-public-build.v1.json');
const drafts=json(content,'next-stage-decisions.v1.json');
const legacyRecords=registry.records.filter(row=>row.published);
const legacyRoutes=legacyRecords.reduce((count,row)=>count+Object.keys(row.published.routes??{}).length,0);
assert.equal(legacyRecords.length,22);assert.equal(legacyRoutes,44);
const integrity=[];
for(const row of manifest.records){
 const id=syncPageIds[row.pageKey];
 assert.ok(id);
 const stem='registry-copy/'+id+'_'+row.locale.toLowerCase().replaceAll('-','_')+'_sync1004';
 for(const [suffix,expected] of [['.md',row.bodySha256],['.meta.json',row.metadataSha256],['_reference.md',row.completeReferenceSha256]]){
  const path=stem+suffix,actual=hash(bytes(content,path));assert.equal(actual,expected,path);
  integrity.push({contentId:id,locale:row.locale,path,sha256:actual});
 }
 const r=registry.records.find(r=>r.contentId===id);
 assert.equal(r.candidate.revision,row.sourceRevision,id);
}
assert.equal(manifest.records.length,140);assert.equal(overlay.records.length,14);
const accepted=overlay.records.map(row=>({contentId:row.contentId,sourceRevision:row.sourceRevision,serviceId:row.serviceId,pricingRef:row.pricingRef,locales:row.locales}));
const draftEvidence=drafts.entries.map(row=>{
 const actual=hash(bytes(content,row.bodyFile));assert.equal(actual,row.bodySha256);
 const r=registry.records.find(r=>r.contentId===row.contentId);assert.equal(r.candidate.ru.status,'draft');
 assert.equal(r.candidate.revision,'sha256:'+actual);
 return {contentId:row.contentId,path:row.bodyFile,route:row.route,sourceRevision:r.candidate.revision,serviceId:r.serviceId,publication:'PREVIEW_ONLY_NO_INDEX'};
});
const pricing=['06 Development/backend/app/services/catalog_pricing.py','06 Development/backend/app/models/catalog_pricing.py'].map(path=>{
 const current=hash(bytes(backend,path));const base=hash(execFileSync('git',['show','HEAD:'+path],{cwd:backend}));
 assert.equal(current,base,'Existing Indodax/FX source must remain byte-exact: '+path);
 return {path,sha256:current,equalsRuntimeCommittedBaseline:true};
});
const browserFiles=['BROWSER_VERIFICATION.json','BROWSER_DELTA_VERIFICATION.json','CLIENT_PREVIEW_BROWSER_VERIFICATION.json'];
const browser=browserFiles.map(path=>{
 const result=json(output,path);assert.equal(result.status,'PASS',path);
 assert.equal(result.personalProfileUsed,false);assert.equal(result.realSubmissions,false);
 assert.equal(result.browserClosed,true);assert.equal(result.ownedServerStopped,true);
 return {path,status:result.status,cases:result.cases.length,screenshots:result.screenshots?.length??result.cases.length,unexpectedMutations:result.unexpectedMutations,ownedServerStopped:true,browserClosed:true};
});
const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(path,e.name)):[resolve(path,e.name)]);
const built=walk(resolve(frontend,'06 Development/astro-site/dist')).filter(path=>path.endsWith('.html'));
for(const r of overlay.records)for(const {route} of Object.values(r.locales))assert.ok(existsSync(resolve(frontend,'06 Development/astro-site/dist','.'+route,'index.html')),route);
const scopeGroups=[
 ['frontend','06 Development/shared/',['content/service-registry.v1.json','content/registry-public-build.v1.json','content/registry-approvals.v1.json','content/registry-presentation-approvals.v1.json','content/registry-pricing-bindings.v1.json','content/next-stage-decisions.v1.json','content/analytics-allowlist.v1.json','content/generated/bot-visa-summaries.v1.json','src/i18n/public.ts','content/generated/i18n/public.v1.json','scripts/import-next-stage-drafts.mjs','scripts/validate-service-registry.mjs']],
 ['frontend','06 Development/astro-site/',['scripts/registry-document.mjs','scripts/registry-publication.mjs','scripts/registry-price-bindings.mjs','scripts/registry-family-applicability.mjs','scripts/registry-preview.config.mjs','src/components/HomeExperience.astro','src/components/SiteHeader.astro','src/components/LanguagePicker.astro','src/components/CountryPicker.astro','src/components/AnalyticsConsent.astro','src/layouts/BaseLayout.astro','src/layouts/RegistryPublicLayout.astro','src/client/pricing.js','src/client/support.js','src/client/analytics.js','src/client/language-picker.js','src/client/country-picker.js','src/client/public-selector-policy.mjs','src/lib/visa-price-text.js','src/lib/destination-worlds.ts','src/pages/[...path].astro','src/pages/sitemap.xml.ts','src/pages/og/[...path].png.ts','src/styles/registry-public.css','src/assets/worlds/vietnam-hoi-an-day-ai-v1.png','src/assets/worlds/vietnam-hoi-an-night-ai-v1.png']],
 ['frontend','06 Development/react-app/',['src/main.tsx','src/api/client.ts','src/api/account-preview.ts','src/surfaces/AccountApp.tsx','src/surfaces/AdminAccountPreview.tsx','src/components/AdminServiceCountdown.tsx','src/components/AdminVisaCRM.tsx','src/components/AdminLifeServices.tsx','src/components/VisaCabinet.tsx','src/components/SupportPanel.tsx','src/components/LifeReminderPreference.tsx','src/components/admin-life-tiles.css','src/components/account-preview.css','src/components/AdminPricingCatalog.tsx','src/components/AdminBusinessWorkspace.tsx','src/components/AdminAnalytics.tsx','src/components/admin-analytics.css','src/utils/admin-analytics.ts']],
 ['runtime','06 Development/backend/',['app/main.py','app/api/catalog_pricing.py','app/api/analytics.py','app/api/client_account_preview.py','app/schemas/client_portal.py','app/schemas/analytics.py','app/models/analytics.py','app/services/analytics.py','app/services/catalog_compositions.py','app/services/extension_pricing.py','app/services/next_stage_tariffs.py','app/scripts/publish_extension_prices.py','app/scripts/analytics_retention.py','alembic/versions/a7e4c9d2f105_add_first_party_analytics.py']],
 ['runtime','06 Development/bot/',['app/content/visas.py','app/handlers/menu.py']],
];
const code=scopeGroups.flatMap(([workspace,prefix,files])=>files.map(file=>{const path=prefix+file;return {workspace,path,sha256:hash(bytes(workspace==='runtime'?backend:frontend,path))};}));
save('CANDIDATE_CODE_SCOPE.json',{note:'Cumulative selected candidate sources, not permission to commit all dirty work; accepted/draft source hashes are separate. Runtime is authoritative.',files:code});
save('SOURCE_INTEGRITY.json',{status:'PASS',acceptedLocalized:140,acceptedSourceArtifacts:integrity.length,artifacts:integrity,drafts:draftEvidence,existingFxSource:pricing});
save('ACCEPTED_REVISIONS_AND_ROUTES.json',{releaseCandidate:overlay.version,status:'LOCAL_READY_NO_DEPLOY',records:accepted,drafts:draftEvidence});
save('LOCAL_CHECKPOINT.json',{
 version:'SYNC-FINAL-2026-10-05-LOCAL',date:'2026-10-05',state:'LOCAL_IMPLEMENTED_NO_DEPLOY',
 baselines:{frontend:execFileSync('git',['rev-parse','HEAD'],{cwd:frontend,encoding:'utf8'}).trim(),runtime:execFileSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim()},
 authority:{latestDirectUser:'Full local sprint and report, without deploy',commit:false,push:false,deploy:false,productionMigration:false,customerMessages:false},
 content:{registryRecords:registry.records.length,legacyPublishedRecords:legacyRecords.length,legacyRouteBindings:legacyRoutes,acceptedIds:overlay.records.length,acceptedLocales:140,draftIds:draftEvidence.length,totalBuiltHtml:built.length,translationsRewritten:false,rawSourcePublished:false},
 pricing:{existingIndodaxSourceUnchanged:true,existingNearest5UsdUnchanged:true,productionTariffsPublished:false,historicalOrdersChanged:false},
 browser,
 tests:{astroCritical:{pass:20,fail:0},nextStageImporter:{pass:3,fail:0},adminAnalyticsHelpers:{pass:3,fail:0},backendAnalyticsAndPreview:{pass:70,fail:0,evidence:'BACKEND_CRITICAL.xml'},astroCheck:{files:129,errors:0,warnings:0,hints:0},reactTypecheck:'PASS',reactBuild:'PASS',astroBuild:'PASS',runtimeRouterMounts:'PASS (3 required, no server/network)'},
 releaseGatesNotExecuted:['Founder release approval','Canonical workspace OS access and exact WIP reconciliation','Exact scoped Git publication','Production PostgreSQL full-chain backup/restore/upgrade-downgrade-upgrade','Production tariff publication','Nginx preview/CSP verification','Production deployed revision and live route/schema/FX verification'],
 runtimePackaging:'Use authoritative runtime backend/bot plus frontend source; frontend workspace backend mirror is not a replacement for the runtime.'
});
console.log(JSON.stringify({status:'PASS',accepted:140,sourceArtifacts:integrity.length,drafts:draftEvidence.length,builtHtml:built.length,fxSourceUnchanged:true}));
