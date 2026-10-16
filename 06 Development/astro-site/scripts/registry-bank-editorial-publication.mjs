// Version-bound publisher overlay over unchanged draft/QA and commercial identity.
import assert from 'node:assert/strict';
import sourceManifest from '../../shared/content/registry-bank-editorial-build.v1.json' with {type:'json'};
import publicManifest from '../../shared/content/registry-bank-editorial-public-build.v1.json' with {type:'json'};
import {BANK_SOURCE_MODE,BANK_EDITORIAL_KIND,BANK_PACKETS,BANK_SOURCE_SPANS,BANK_LOCALES,bankSha as sha,parseBankDraftPage} from '../../shared/scripts/bank-editorial-source.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {validateRegistry,PUBLIC_LOCALES} from '../../shared/src/service-registry.mjs';
import {evaluatePublication} from '../src/lib/publication-policy.mjs';
import {readEditorialInput} from './registry-private-editorial-inputs.mjs';
import {readBankEditorialInput,BANK_SOURCE_ANCHOR} from './registry-bank-editorial-inputs.mjs';

export const BANK_PUBLIC_ANCHOR='d5961422fedd60e30586eb54dd6dfd47d3fa9e9f3ed8a6a521dbd7f9367d584a';
const encoded=value=>JSON.stringify(value,null,2)+'\n';
function anchors(source=sourceManifest,grant=publicManifest){
  assert.equal(sha(encoded(source)),BANK_SOURCE_ANCHOR,'Bank source manifest drift');
  assert.equal(sha(encoded(grant)),BANK_PUBLIC_ANCHOR,'Bank version-bound publication drift');
  assert.equal(source.fullPayloadKind,BANK_EDITORIAL_KIND);assert.equal(source.records.length,1);
  assert.ok(Object.values(source.publicationGates).every(value=>value===false));
  assert.equal(grant.records.length,1);assert.equal(grant.records[0].contentId,'bank');
  assert.equal(grant.sourceManifestSha256,BANK_SOURCE_ANCHOR);
  assert.equal(grant.authority.publisher,'Founder');assert.equal(grant.authority.decisionDate,'2026-10-12');
  assert.equal(grant.authority.scope,'PUBLIC_SITE_TEN_LOCALES_INDEXABLE_WITH_SEPARATE_RECHECK_LIST');
  assert.equal(grant.stage,'LOCAL_READY_NO_DEPLOY');
  return {entry:source.records[0],approved:grant.records[0]};
}
export const isBankEditorialDraft=record=>record?.contentId==='bank';
export function ownerApprovedBankRoute(contentId,locale){
  const {approved}=anchors();return contentId==='bank'?approved.locales[locale]?.route??null:null;
}

export function validateBankEditorialProjection(record,locale,payload,metadata,source,{manifest=sourceManifest,grant=publicManifest}={}){
  const {entry}=anchors(manifest,grant),pin=entry.locales[locale];
  assert.equal(record?.contentId,'bank');assert.ok(BANK_LOCALES.includes(locale)&&pin,'Unreceived bank locale');
  assert.equal(record.kind,'document');assert.equal(record.parentId,'documents');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.candidate.route,entry.canonicalPath);
  assert.equal(record.candidate.revision,entry.sourceRevision);assert.equal(record.candidate.ru.status,'draft');
  assert.equal(record.candidate.ru.approvalEvidence,null);assert.equal(record.candidate.ru.approvalRevision,null);
  if(locale!=='ru'){
    assert.equal(payload.status,'translated');assert.equal(payload.complete,true);assert.equal(payload.qa,'not_done');
    assert.equal(payload.qaMethod,'supplied_model_semantic');assert.equal(payload.sourceRevision,entry.sourceRevision);
  }
  for(const key of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(payload[key],pin[key],'Bank payload '+key+' drift');
  assert.equal(sha(source),pin.bodySha256);assert.equal(sha(encoded(metadata)),pin.metadataSha256);
  assert.equal(metadata.fullPayloadKind,BANK_EDITORIAL_KIND);assert.equal(metadata.sourceMode,BANK_SOURCE_MODE);
  assert.equal(metadata.resolvedContentId,'bank');assert.equal(metadata.locale,locale);assert.equal(metadata.direction,pin.direction);
  assert.equal(metadata.resolvedCanonicalPath,entry.canonicalPath);assert.equal(metadata.sourceRevision,entry.sourceRevision);
  assert.equal(metadata.editorialSourceRevision,entry.editorialSourceRevision);assert.equal(metadata.sourceRuBodySha256,entry.ruBodySha256);
  assert.equal(metadata.bodyMarkdown,source);assert.equal(metadata.bodySha256,pin.bodySha256);
  assert.equal(metadataEnvelope(source,metadata),pin.sourceEnvelopeSha256);
  assert.equal(metadata.sourceEnvelopeSha256,pin.sourceEnvelopeSha256);
  assert.equal(metadata.sourceFile,pin.sourceFile);assert.equal(metadata.sourceFileSha256,pin.sourceFileSha256);
  assert.equal(metadata.serviceId,null);assert.equal(metadata.pricingRef,null);assert.equal(metadata.pricingMode,'individual_quote');
  assert.equal(metadata.publicationAuthorized,false);assert.equal(metadata.factBlock,null);assert.equal(metadata.directAnswer,'');
  assert.equal(metadata.faqHeading,null);assert.equal(metadata.faq.length,1);assert.equal(metadata.cta.length,1);
  assert.equal(metadata.bodyIncludesFaq,true);assert.equal(metadata.doNotRenderSeparateFaqAgain,true);
  assert.equal(metadata.seoTitle,metadata.seo.title);assert.equal(metadata.metaDescription,metadata.seo.description);
  assert.equal(metadata.approval.status,locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA');
  for(const flag of ['legalVerification','fulfillmentVerified','nativeSpeakerReview','browserReview'])assert.equal(metadata.approval[flag],false);
  return metadata;
}

export function validateBankEditorialOriginal(record,locale,payload,metadata,source,{readSource=readBankEditorialInput,...options}={}){
  validateBankEditorialProjection(record,locale,payload,metadata,source,options);
  const pin=(options.manifest??sourceManifest).records[0].locales[locale],raw=readSource(pin.sourceFile);
  assert.equal(sha(raw),pin.sourceFileSha256,'Private bank source bytes drift');
  const wire=JSON.parse(raw.toString('utf8'));assert.equal(wire.sourceMode,BANK_SOURCE_MODE);assert.equal(wire.schemaVersion,1);
  assert.deepEqual(wire.provenance,metadata.sourceProvenance);
  const scope=BANK_SOURCE_SPANS.find(row=>row.locale===locale),packet=BANK_PACKETS.find(row=>row.task===scope.task);
  const archive=Buffer.from(wire.archiveText,'utf8');assert.equal(archive.length,packet.bytes);assert.equal(sha(archive),packet.sha256);
  assert.ok(wire.archiveText.endsWith('\n'+packet.end+'\n'));
  assert.deepEqual(wire.provenance.seoLines,[scope.seoLine,scope.seoLine+1]);
  assert.deepEqual(wire.provenance.customerLines,[scope.bodyLine,scope.bodyLine+25]);
  const lines=wire.archiveText.split('\n');
  const parsed=parseBankDraftPage(lines.slice(scope.seoLine-1,scope.seoLine+1),lines.slice(scope.bodyLine-1,scope.bodyLine+25),{locale});
  for(const key of ['bodyMarkdown','h1','seo','directAnswer','factBlock','faq','faqHeading','cta','bodyIncludesFaq','doNotRenderSeparateFaqAgain'])
    assert.deepEqual(metadata[key],parsed[key],'Lost literal bank source '+key);
  return metadata;
}

export function validateBankEditorialPublicEntry(record,locale,entry,{manifest=sourceManifest,grant=publicManifest,asOf='2026-10-15'}={}){
  const {approved}=anchors(manifest,grant),pin=approved.locales[locale],sourcePin=manifest.records[0].locales[locale];
  assert.ok(pin&&sourcePin&&PUBLIC_LOCALES.includes(locale),'Unapproved bank identity/locale');
  assert.equal(record?.contentId,'bank');assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  assert.equal(record.candidate.revision,approved.sourceRevision);assert.equal(record.candidate.route,approved.canonicalPath);
  const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];assert.ok(payload);
  for(const key of ['bodySha256','metadataSha256','sourceEnvelopeSha256']){
    assert.equal(pin[key],sourcePin[key]);assert.equal(payload[key],pin[key]);assert.equal(entry?.[key],pin[key]);
  }
  for(const [key,value] of Object.entries({contentId:'bank',locale,dir:sourcePin.direction,route:pin.route,
    sourceRevision:approved.sourceRevision,canonicalPath:approved.canonicalPath,serviceId:null,pricingRef:null,
    indexable:true,lastModified:approved.publication.lastModified,ownerApprovedBankEditorial:true}))assert.deepEqual(entry?.[key],value,'Bank entry '+key+' drift');
  assert.equal(pin.contentVersion,'sha256:'+payload.bodySha256);
  return evaluatePublication({publicationStatus:'published',reviewStatus:'owner_approved',requiresSources:true,
    hasSubstantialContent:true,locale,availableLocales:BANK_LOCALES,contentVersion:pin.contentVersion,
    lastModified:approved.publication.lastModified,ownerApproval:{authority:'founder',approvedAt:grant.authority.decisionDate,
      contentVersion:pin.contentVersion}},{asOf});
}
function validateBuild(registry,{manifest=sourceManifest,grant=publicManifest,readContent=readEditorialInput,readSource=readBankEditorialInput}={},validator){
  const {entry:binding,approved}=anchors(manifest,grant);validateRegistry(registry);
  const matches=registry.records.filter(row=>row.contentId==='bank');assert.equal(matches.length,1);const record=matches[0];
  assert.deepEqual(Object.keys(approved.locales).sort(),[...BANK_LOCALES].sort());
  const entries=BANK_LOCALES.map(locale=>{
    const language=registry.locales.find(row=>row.code===locale),pin=approved.locales[locale],sourcePin=binding.locales[locale];
    assert.ok(language);assert.equal(sourcePin.direction,language.dir);assert.equal(pin.route,language.prefix+approved.canonicalPath);
    const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];assert.ok(payload);
    const source=readContent(payload.bodyFile).toString('utf8'),metadata=JSON.parse(readContent(payload.metadataFile).toString('utf8'));
    validator(record,locale,payload,metadata,source,{manifest,grant,readSource});
    const result={contentId:'bank',locale,dir:language.dir,route:pin.route,canonicalPath:approved.canonicalPath,
      sourceRevision:approved.sourceRevision,bodySha256:pin.bodySha256,metadataSha256:pin.metadataSha256,
      sourceEnvelopeSha256:pin.sourceEnvelopeSha256,serviceId:null,pricingRef:null,indexable:true,
      lastModified:approved.publication.lastModified,title:metadata.h1,seoTitle:metadata.seoTitle,description:metadata.metaDescription,
      ownerApprovedBankEditorial:true};
    assert.equal(validateBankEditorialPublicEntry(record,locale,result,{manifest,grant}).indexable,true);return result;
  });
  assert.equal(entries.length,10);assert.equal(new Set(entries.map(row=>row.route)).size,10);return entries;
}
export const validateBankEditorialPublicOriginals=(registry,options)=>validateBuild(registry,options,validateBankEditorialOriginal);
export const validateBankEditorialPublicDerivative=(registry,options)=>validateBuild(registry,options,validateBankEditorialProjection);
