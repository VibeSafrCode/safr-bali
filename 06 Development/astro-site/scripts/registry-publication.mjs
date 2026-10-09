// Build-time selective publication overlay. Never a deploy, CMS or price store.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import buildManifest from "../../shared/content/registry-public-build.v1.json" with {type:"json"};
import registry from "../../shared/content/service-registry.v1.json" with {type:"json"};
import translationQa from "../../shared/content/registry-copy/sync1004_qa_import.json" with {type:"json"};
import presentation from "../../shared/content/registry-presentation-approvals.v1.json" with {type:"json"};
import routeContract from "../../shared/contracts/ecosystem-routes.v1.json" with {type:"json"};
import {PUBLIC_LOCALES,validateRegistry} from "../../shared/src/service-registry.mjs";
import {metadataEnvelope,syncPageIds} from "../../shared/scripts/import-sync-bundle.mjs";
import {buildRegistryDocument} from "./registry-document.mjs";
import d1Build from '../../shared/content/registry-d1-d2-build.v1.json' with {type:'json'};
import {validateD1Build} from './registry-d1-d2-publication.mjs';
import d12Build from '../../shared/content/registry-d12-e28a-build.v1.json' with {type:'json'};
import {validateD12E28ABuild} from './registry-d12-e28a-publication.mjs';
import e33gNextBuild from '../../shared/content/registry-e33g-next-build.v1.json' with {type:'json'};
import {validateE33GNextBuild} from './registry-e33g-next-publication.mjs';
import familyBuild from '../../shared/content/registry-family-kitas-build.v1.json' with {type:'json'};
import {validateFamilyBuild} from './registry-family-kitas-publication.mjs';
import partnersBuild from '../../shared/content/registry-partners-build.v1.json' with {type:'json'};
import {validatePartnersBuild} from './registry-partners-publication.mjs';
import {languageChoices} from "./registry-language.mjs";

const contentRoot=new URL("../../shared/content/",import.meta.url);
// Vite rewrites the literal glob into server-only string imports. Do not use a
// typeof guard around the call: after SSR bundling import.meta.glob is gone,
// but its transformed object must still be selected. Direct Node unit tests
// have no Vite macro and use the original module-relative read-only loader.
function collectBundledSources() {
  try {
    return import.meta.glob([
      "../../shared/content/registry-copy/*.md",
      "../../shared/content/registry-copy/*.meta.json",
      "../../shared/content/registry-copy/*.source.json",
      "../../shared/content/registry-copy/d1d2_price_occurrences.json",
      "../../shared/content/registry-copy/d1d2_render_qa.json",
      "../../shared/content/registry-copy/d12e28a_price_occurrences.json",
      "../../shared/content/registry-copy/d12e28a_render_qa.json",
      "../../shared/content/registry-copy/d12e28a_source_pack/**/*.json",
      "../../shared/content/registry-copy/d12e28a_source_pack/**/*.md",
      "../../shared/content/registry-copy/e33g_next_price_occurrences.json",
      "../../shared/content/registry-copy/e33g_next_render_qa.json",
      "../../shared/content/registry-copy/e33g_family_correction_20261009.json",
      "../../shared/content/registry-copy/e33g_next_source_pack/**/*.json",
      "../../shared/content/registry-copy/e33g_next_source_pack/**/*.md",
      "../../shared/content/registry-copy/family_kitas_price_occurrences.json",
      "../../shared/content/registry-copy/family_kitas_render_qa.json",
      "../../shared/content/registry-copy/family_kitas_source_pack/**/*.json",
      "../../shared/content/registry-copy/family_kitas_source_pack/**/*.md",
      "../../shared/content/registry-copy/family_kitas_source_pack/**/*.txt",
      "../../shared/content/registry-copy/family_kitas_source_pack/**/*.py",
      "../../shared/content/registry-copy/partners_b2b_render_qa.json",
      "../../shared/content/registry-copy/partners_b2b_source_pack/**/*.json",
      "../../shared/content/registry-copy/partners_b2b_source_pack/**/*.md",
      "../../shared/content/registry-copy/partners_b2b_source_pack/**/*.txt",
      "../../shared/content/registry-copy/partners_b2b_source_pack/**/*.py",
    ],{query:"?raw",import:"default",eager:true});
  } catch(error) {
    if(typeof import.meta.glob!=="function")return null;
    throw error;
  }
}
const bundledSources=collectBundledSources();
const read=file=>{
  if(!bundledSources)return readFileSync(new URL(file,contentRoot));
  const source=bundledSources["../../shared/content/"+file];
  assert.equal(typeof source,"string","Missing server-only authored source: "+file);
  return Buffer.from(source,"utf8");
};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const pathPattern=/^\/(?:[a-z0-9-]+\/)*$/;
const selectedIds=Object.values(syncPageIds);
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,label);

/** Every public record is pinned to exact supplied content, not to a loose flag.
 * Candidate exposure and release remain unchanged; this manifest authorizes a
 * LOCAL build only and cannot attest deployment or independent legal review. */
export function validatePublicBuild(manifest=buildManifest,authored=registry,{readContent=read}={}) {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.stage,"LOCAL_READY_NO_DEPLOY");
  assert.equal(manifest.authority.publisher,"Founder");
  assert.equal(manifest.authority.decisionDate,"2026-10-05");
  assert.equal(manifest.presentationVersion,presentation.version,"Public presentation approval drift");
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),[...selectedIds].sort(),"Selective public scope changed");
  const entries=[];
  unique(manifest.records.map(r=>r.contentId),"Public content IDs");
  for(const approved of manifest.records) {
    const record=authored.records.find(r=>r.contentId===approved.contentId);
    assert.ok(record,"Unknown public content identity");
    assert.equal(approved.sourceRevision,record.candidate.revision,"Public RU revision drift");
    assert.equal(approved.canonicalPath,record.candidate.route,"Public path drift");
    assert.equal(approved.serviceId,record.serviceId,"Public business identity drift");
    assert.deepEqual(approved.pricingRef,record.pricingRef,"Public price identity drift");
    assert.equal(record.candidate.ru.status,"owner_approved_semantics");
    assert.equal(approved.publication.indexable,true);
    assert.equal(approved.publication.lastModified,"2026-10-04","Public content date drift");
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort(),"Public locale scope changed");
    for(const locale of PUBLIC_LOCALES) {
      const language=authored.locales.find(l=>l.code===locale);
      const pin=approved.locales[locale];
      const payload=locale==="ru"?record.candidate.ru:record.candidate.translations[locale];
      assert.ok(payload?.metadataFile,"Structured public body/metadata required");
      if(locale!=="ru") {
        assert.equal(payload.sourceRevision,approved.sourceRevision,"Stale public translation");
        assert.equal(payload.complete,true);assert.equal(payload.status,"translated");assert.equal(payload.qa,"passed");
        assert.equal(payload.qaFile,"registry-copy/sync1004_qa_import.json","Public QA source drift");
        assert.ok(translationQa.records.some(q=>q.contentId===approved.contentId&&q.page===payload.qaPage&&
          q.locale===locale&&q.bodySha256==="sha256:"+pin.bodySha256&&
          q.sourceRevision===approved.sourceRevision&&q.sourceEnvelopeSha256===pin.sourceEnvelopeSha256&&
          q.status==="MODEL_REVIEWED_PENDING_RENDER_QA"&&q.sourceOriginReconciled===true),"Public translation evidence drift");
      }
      const expectedRoute=record.published?.routes[locale]??language.prefix+approved.canonicalPath;
      assert.equal(pin.route,expectedRoute,"Canonical route drift");assert.match(pin.route,pathPattern);
      const body=readContent(payload.bodyFile),metaBytes=readContent(payload.metadataFile);
      assert.equal(pin.bodySha256,payload.bodySha256,"Public body binding drift");
      assert.equal(pin.metadataSha256,payload.metadataSha256,"Public metadata binding drift");
      assert.equal(pin.sourceEnvelopeSha256,payload.sourceEnvelopeSha256,"Public source envelope binding drift");
      assert.equal(sha(body),pin.bodySha256,"Public body bytes drift");
      assert.equal(sha(metaBytes),pin.metadataSha256,"Public metadata bytes drift");
      const metadata=JSON.parse(metaBytes);
      assert.equal(metadata.bodySha256,pin.bodySha256);assert.equal(metadata.sourceRevision,approved.sourceRevision);
      assert.equal(metadata.locale,locale);assert.equal(metadata.direction,language.dir);
      if(locale==="ru")assert.equal(metadataEnvelope(body,metadata),pin.sourceEnvelopeSha256,"Public RU envelope drift");
      for(const field of ["h1","seoTitle","metaDescription"])assert.ok(typeof metadata[field]==="string"&&metadata[field].trim(),"Missing public SEO field: "+field);
      entries.push({contentId:record.contentId,locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
        sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
        sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:record.serviceId,pricingRef:record.pricingRef,
        indexable:approved.publication.indexable,lastModified:approved.publication.lastModified,
        title:metadata.h1,seoTitle:metadata.seoTitle,description:metadata.metaDescription});
    }
  }
  unique(entries.map(e=>e.route),"Public canonical route collision");
  assert.equal(entries.length,140);
  return entries;
}

validateRegistry(registry);
const entries=[...validatePublicBuild(),...validateD1Build(d1Build,registry,{readContent:read}),
  ...validateD12E28ABuild(d12Build,registry,{readContent:read}),
  ...validateE33GNextBuild(e33gNextBuild,registry,{readContent:read}),
  ...validateFamilyBuild(familyBuild,registry,{readContent:read}),
  ...validatePartnersBuild(partnersBuild,registry,{readContent:read})];
unique(entries.map(entry=>entry.route),'Combined public route collision');
const byRoute=new Map(entries.map(e=>[e.route,e]));
const byIdentity=new Map(entries.map(e=>[e.contentId+"/"+e.locale,e]));
const legacyRoutes=new Set(routeContract.astroPublicRoutes.flatMap(route=>[route,route==="/"?"/en/":"/en"+route]));

export function publicBuildEntries() {return entries.map(e=>({...e}));}
export function publicEntryForRoute(route) {return byRoute.get(route)??null;}
export function publicTargetHref(contentId,locale) {
  const selected=byIdentity.get(contentId+"/"+locale);
  if(selected)return selected.route;
  // Existing emitted legacy routes are valid targets. No candidate fallback,
  // cross-language substitution or automatic redirect/extra page is invented.
  const route=registry.records.find(r=>r.contentId===contentId)?.published?.routes[locale];
  return route&&legacyRoutes.has(route)?route:null;
}
export function publicAlternatesForRoute(route) {
  const own=byRoute.get(route);
  if(!own||!own.indexable)return [];
  const values=entries.filter(e=>e.contentId===own.contentId&&e.indexable).map(e=>({locale:e.locale,href:e.route}));
  const defaultEntry=values.find(e=>e.locale==="ru");
  return defaultEntry?[...values,{locale:"x-default",href:defaultEntry.href}]:values;
}
export function buildPublicRegistryModel(entry,{projection=null,now=Date.now()}={}) {
  const current=byIdentity.get(entry.contentId+"/"+entry.locale);
  assert.ok(current&&current.route===entry.route,"Unapproved public page");
  const model=buildRegistryDocument(registry,entry.contentId,entry.locale,{projection,now,targetHref:publicTargetHref,
    readBody:file=>read(file).toString("utf8"),readMetadata:file=>read(file).toString("utf8")});
  assert.ok(model,"Approved public content is not renderable");
  // Only public model diagnostics are retained server-side. No raw source
  // paths, preview credential, editorial instructions or internal IDs render.
  const {previewNotice,pricingHref,diagnostics,...content}=model;
  const chromeLocale=entry.locale==="ru"?"ru":"en";
  const breadcrumbs=entry.contentId==='partners'?[{label:'SAFRWAY',href:chromeLocale==='ru'?'/':'/en/',lang:chromeLocale}]:[{label:chromeLocale==="ru"?"Бали":"Bali",href:chromeLocale==="ru"?"/bali/":"/en/bali/",lang:chromeLocale},
    {label:chromeLocale==="ru"?"Визы":"Visas",href:chromeLocale==="ru"?"/bali/visas/":"/en/bali/visas/",lang:chromeLocale}];
  const choices=languageChoices.flatMap(([code,short,label])=>{
    const href=publicTargetHref(entry.contentId,code);return href?[{code,short,label,href}]:[];
  });
  // The renderer's catalog-bound SEO must win over the immutable authored
  // snapshot; otherwise dynamic body prices and metadata can silently diverge.
  return {...entry,...content,chromeLocale,breadcrumbs,alternates:publicAlternatesForRoute(entry.route),languageChoices:choices,
    sourceContext:{...(entry.contentId==='partners'?{section:'partners'}:{country:"Бали",section:"visa",service:entry.serviceId??"visa"}),content_id:entry.contentId,
      source_revision:entry.sourceRevision,path:entry.route,locale:entry.locale}};
}
