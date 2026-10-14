// Selective owner-publication overlay; immutable draft/source/QA stays unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import publicBuild from '../../shared/content/registry-ready-editorial-public-build.v1.json' with {type:'json'};
import readyBuild from '../../shared/content/registry-ready-editorial-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES,validateRegistry} from '../../shared/src/service-registry.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {validateReadyEditorialPreview} from './registry-ready-editorial-preview.mjs';

const read=readEditorialInput;
const sha=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>JSON.stringify(value,null,2)+'\n';
const sourceAnchor='af322a2729e5ec697e06bb06a229471746bba62652de485fdfc870346e780703';
const approvalAnchor='ca2898b2821bf1ccc75616a41230f614a6cc1460e02d7a447971d5f76181df7a';
const ids=['student','retirement','second_home','knowledge_student_documents',
  'knowledge_retirement_e33f_vs_e33e','knowledge_second_home_requirements'];

function anchors(manifest,sourceManifest) {
  // Neither a self-rehashed source packet nor a loose publication flag grants
  // another version. New source needs a separately reviewed approval snapshot.
  assert.equal(sha(encoded(sourceManifest)),sourceAnchor,'Accepted ready-source manifest drift');
  assert.equal(sha(encoded(manifest)),approvalAnchor,'Version-bound Founder publication grant drift');
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.stage,'LOCAL_READY_NO_DEPLOY');
  assert.equal(manifest.authority.publisher,'Founder');
  assert.equal(manifest.authority.decisionDate,'2026-10-12');
  assert.equal(manifest.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  assert.equal(manifest.readySourceManifestSha256,sourceAnchor);
  assert.deepEqual(manifest.records.map(r=>r.contentId).sort(),[...ids].sort());
}

export function validateReadyEditorialPublicEntry(record,locale,entry,
  {manifest=publicBuild,sourceManifest=readyBuild,asOf='2026-10-12'}={}) {
  anchors(manifest,sourceManifest);
  const approved=manifest.records.find(r=>r.contentId===record?.contentId);
  const source=sourceManifest.records.find(r=>r.contentId===record?.contentId);
  const pin=approved?.locales[locale],sourcePin=source?.locales[locale];
  assert.ok(pin&&sourcePin&&PUBLIC_LOCALES.includes(locale),'Unapproved editorial identity/locale');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.equal(record.candidate.revision,approved.sourceRevision);
  assert.equal(record.candidate.route,approved.canonicalPath);
  const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
  assert.ok(payload,'Missing localized editorial source');
  for(const key of ['bodySha256','metadataSha256','sourceEnvelopeSha256']) {
    assert.equal(pin[key],sourcePin[key],'Owner/source pin drift');
    assert.equal(payload[key],pin[key],'Owner/current candidate pin drift');
    assert.equal(entry?.[key],pin[key],'Public entry pin drift');
  }
  for(const [key,value] of Object.entries({contentId:record.contentId,locale,route:pin.route,
    sourceRevision:approved.sourceRevision,canonicalPath:approved.canonicalPath,
    serviceId:null,pricingRef:null,indexable:true,lastModified:approved.publication.lastModified}))
    assert.deepEqual(entry?.[key],value,'Public entry '+key+' drift');
  assert.equal(pin.contentVersion,'sha256:'+payload.bodySha256);
  return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',
    requiresSources:true,hasSubstantialContent:true,locale,availableLocales:PUBLIC_LOCALES,
    contentVersion:'sha256:'+payload.bodySha256,lastModified:approved.publication.lastModified,
    ownerApproval:{authority:'founder',approvedAt:manifest.authority.decisionDate,contentVersion:pin.contentVersion}},
    {asOf});
}

export function validateReadyEditorialPublicBuild(manifest=publicBuild,authored,
  {sourceManifest=readyBuild,readContent=read,asOf='2026-10-12'}={}) {
  anchors(manifest,sourceManifest);
  assert.ok(authored?.records&&authored.locales,'Actual Registry required');
  validateRegistry(authored);
  const entries=[];
  for(const approved of manifest.records) {
    const record=authored.records.find(r=>r.contentId===approved.contentId);
    const source=sourceManifest.records.find(r=>r.contentId===approved.contentId);
    assert.ok(record&&source,'Existing editorial identity required');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    assert.equal(approved.sourceRevision,source.sourceRevision);
    assert.equal(approved.canonicalPath,source.canonicalPath);
    for(const locale of PUBLIC_LOCALES) {
      const language=authored.locales.find(l=>l.code===locale),pin=approved.locales[locale];
      const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
      assert.ok(language&&payload,'Missing actual locale source');
      assert.equal(pin.route,language.prefix+approved.canonicalPath,'Localized route drift');
      const body=readContent(payload.bodyFile),metadataBytes=readContent(payload.metadataFile);
      assert.equal(sha(body),pin.bodySha256,'Public editorial body bytes drift');
      assert.equal(sha(metadataBytes),pin.metadataSha256,'Public editorial metadata bytes drift');
      const metadata=JSON.parse(metadataBytes);
      validateReadyEditorialPreview(record,locale,payload,metadata,body.toString('utf8'),
        {manifest:sourceManifest,readSource:file=>readContent(file).toString('utf8')});
      const entry={contentId:record.contentId,locale,dir:language.dir,route:pin.route,
        canonicalPath:approved.canonicalPath,sourceRevision:approved.sourceRevision,
        bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
        sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:null,pricingRef:null,
        indexable:true,lastModified:approved.publication.lastModified,
        title:metadata.h1,seoTitle:metadata.seoTitle,description:metadata.metaDescription,
        ownerApprovedReadyEditorial:true};
      const decision=validateReadyEditorialPublicEntry(record,locale,entry,{manifest,sourceManifest,asOf});
      assert.equal(decision.indexable,true,'Owner publication is not eligible');
      entries.push(entry);
    }
  }
  assert.equal(entries.length,60);
  assert.equal(new Set(entries.map(e=>e.route)).size,60,'Editorial canonical collision');
  return entries;
}
