// Founder publication is a separate, version-pinned layer over immutable source drafts.
// It does not promote supplied/model QA, create Services, or grant deployment evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import grant from '../../shared/content/registry-draft-editorial-public-build.v1.json' with {type:'json'};
import business from '../../shared/content/registry-business-build.v1.json' with {type:'json'};
import documents from '../../shared/content/registry-documents-build.v1.json' with {type:'json'};
import working from '../../shared/content/registry-working-build.v1.json' with {type:'json'};
import {PUBLIC_LOCALES,validateRegistry} from '../../shared/src/service-registry.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {validateBusinessPreviewPayload} from './registry-business-preview.mjs';
import {validateDocumentsPreviewPayload} from './registry-documents-preview.mjs';
import {validateWorkingPreviewPayload} from './registry-working-preview.mjs';

const read=readEditorialInput;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encoded=value=>JSON.stringify(value,null,2)+'\n';
const sourceBuilds={business,documents,working};
const sourceAnchors={
  business:'c976b403300fd518f2440f9bc2373e435f11dd3b4da32a5074dd941fea128496',
  documents:'9fe047020fe59c8f0c0edd31cdbdd728b37a9224b1dfba10137284ecc0b0e671',
  working:'d01eeeb25554863864eaee440922aead1a9600a8c449fc3e4833b1467215fb2c',
};
const grantAnchor='5a39059e9d76b8272206edc95556ff70d4c1cd8334a381ab1cd811879fa21dad';
const validators={business:validateBusinessPreviewPayload,documents:validateDocumentsPreviewPayload,working:validateWorkingPreviewPayload};

function anchors(manifest,builds) {
  assert.equal(sha(encoded(manifest)),grantAnchor,'Founder draft publication grant drift');
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.stage,'LOCAL_READY_NO_DEPLOY');
  assert.equal(manifest.authority.publisher,'Founder');
  assert.equal(manifest.authority.decisionDate,'2026-10-12');
  assert.equal(manifest.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  for(const group of Object.keys(sourceAnchors)) {
    assert.equal(sha(encoded(builds[group])),sourceAnchors[group],'Accepted '+group+' source manifest drift');
    assert.equal(manifest.sourceManifestSha256[group],sourceAnchors[group]);
    assert.deepEqual(manifest.records.filter(r=>r.sourceGroup===group).map(r=>r.contentId).sort(),
      builds[group].records.map(r=>r.contentId).sort(),'Public draft identity scope drift');
  }
  assert.equal(manifest.records.length,18);
}
export const isOwnerApprovedDraftEditorial=record=>grant.records.some(r=>r.contentId===record?.contentId);
export const ownerApprovedDraftRoute=(contentId,locale)=>grant.records.find(r=>r.contentId===contentId)?.locales[locale]?.route??null;

export function validateDraftEditorialPublicEntry(record,locale,entry,
  {manifest=grant,builds=sourceBuilds,asOf='2026-10-12'}={}) {
  anchors(manifest,builds);
  const approved=manifest.records.find(r=>r.contentId===record?.contentId);
  assert.ok(approved&&PUBLIC_LOCALES.includes(locale),'Unapproved draft editorial identity/locale');
  const source=builds[approved.sourceGroup].records.find(r=>r.contentId===record.contentId);
  const pin=approved.locales[locale],sourcePin=source?.locales[locale];
  const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
  assert.ok(pin&&sourcePin&&payload,'Missing actual localized draft source');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.candidate.ru.status,'draft');
  if(locale!=='ru')assert.equal(payload.qa,'not_done','Owner approval is not independent translation QA');
  assert.equal(record.candidate.revision,approved.sourceRevision);
  assert.equal(record.candidate.route,approved.canonicalPath);
  for(const key of ['bodySha256','metadataSha256','sourceEnvelopeSha256']) {
    assert.equal(pin[key],sourcePin[key],'Owner/source draft pin drift');
    assert.equal(payload[key],pin[key],'Owner/current candidate draft pin drift');
    assert.equal(entry?.[key],pin[key],'Public draft entry pin drift');
  }
  for(const [key,value] of Object.entries({contentId:record.contentId,locale,dir:sourcePin.direction,
    route:pin.route,sourceGroup:approved.sourceGroup,sourceRevision:approved.sourceRevision,
    canonicalPath:approved.canonicalPath,serviceId:null,pricingRef:null,indexable:true,
    lastModified:approved.publication.lastModified,ownerApprovedDraftEditorial:true}))
    assert.deepEqual(entry?.[key],value,'Public draft entry '+key+' drift');
  assert.equal(pin.contentVersion,'sha256:'+payload.bodySha256);
  return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',
    requiresSources:true,hasSubstantialContent:true,locale,availableLocales:PUBLIC_LOCALES,
    contentVersion:pin.contentVersion,lastModified:approved.publication.lastModified,
    ownerApproval:{authority:'founder',approvedAt:manifest.authority.decisionDate,contentVersion:pin.contentVersion}},{asOf});
}

function validateBuild(manifest,authored,
  {builds=sourceBuilds,readContent=read,asOf='2026-10-12'}={},verifyOriginals) {
  anchors(manifest,builds);validateRegistry(authored);
  const entries=[];
  for(const approved of manifest.records) {
    const source=builds[approved.sourceGroup].records.find(r=>r.contentId===approved.contentId);
    const record=authored.records.find(r=>r.contentId===approved.contentId);
    assert.ok(record&&source,'Existing Registry identity required');
    assert.deepEqual(Object.keys(approved.locales).sort(),[...PUBLIC_LOCALES].sort());
    assert.equal(source.sourceRevision,approved.sourceRevision);assert.equal(source.canonicalPath,approved.canonicalPath);
    for(const locale of PUBLIC_LOCALES) {
      const language=authored.locales.find(l=>l.code===locale),pin=approved.locales[locale],sourcePin=source.locales[locale];
      const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
      assert.ok(language&&payload,'Missing actual locale source');
      assert.equal(pin.route,language.prefix+approved.canonicalPath,'Localized draft canonical drift');
      const body=readContent(payload.bodyFile),metaBytes=readContent(payload.metadataFile);
      assert.equal(sha(body),pin.bodySha256,'Draft public body bytes drift');
      assert.equal(sha(metaBytes),pin.metadataSha256,'Draft public metadata bytes drift');
      // These structured JSON envelopes are already public. Both contracts
      // verify them; only the strict wrapper reads the separate original MD.
      assert.equal(sha(readContent(sourcePin.sourceFile)),sourcePin.sourceFileSha256,'Draft original source bytes drift');
      if(verifyOriginals)assert.equal(sha(readContent(sourcePin.sourceMarkdownFile)),sourcePin.sourceMarkdownSha256,'Draft original source bytes drift');
      const metadata=JSON.parse(metaBytes);
      validators[approved.sourceGroup](record,locale,payload,metadata,body.toString('utf8'));
      const entry={contentId:record.contentId,locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
        sourceGroup:approved.sourceGroup,sourceRevision:approved.sourceRevision,
        bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,sourceEnvelopeSha256:pin.sourceEnvelopeSha256,
        serviceId:null,pricingRef:null,indexable:true,lastModified:approved.publication.lastModified,
        title:metadata.h1,seoTitle:metadata.seoTitle,description:metadata.metaDescription,ownerApprovedDraftEditorial:true};
      assert.equal(validateDraftEditorialPublicEntry(record,locale,entry,{manifest,builds,asOf}).indexable,true);
      entries.push(entry);
    }
  }
  assert.equal(entries.length,180);assert.equal(new Set(entries.map(e=>e.route)).size,180,'Draft public canonical collision');
  return entries;
}

export function validateDraftEditorialPublicBuild(manifest=grant,authored,options={}) {
  return validateBuild(manifest,authored,options,true);
}

// Public bytes + fixed source/owner pins only. The private-original gate is
// separate and mandatory before release, never inferred from this result.
export function validateDraftEditorialPublicDerivative(manifest=grant,authored,options={}) {
  return validateBuild(manifest,authored,options,false);
}
