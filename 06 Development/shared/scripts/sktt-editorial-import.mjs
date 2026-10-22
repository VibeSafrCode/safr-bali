// Pure Registry plan over the eight already received complete source versions.
// Partial source intake is explicit: no fallback, publication or new service.
import assert from 'node:assert/strict';
import {sha256 as sha,planSkttReceivedEight,SKTT_PACKETS,SKTT_OLD_RECORD_SHA256} from './sktt-editorial-source-readiness.mjs';
export const SKTT_KIND='SKTT_NATIVE_RECEIVED_EIGHT_V1';
export const SKTT_SOURCE_MODE='SKTT_NATIVE_RECEIVED_20261003';
export const SKTT_LOCALES=Object.freeze(['ru','en','de','fr','es','zh-Hans','ja','ko']);
export const encoded=value=>JSON.stringify(value,null,2)+'\n';
export function planSkttEditorialImport(registry,archives,{metadataEnvelope}={}){
  assert.equal(typeof metadataEnvelope,'function','Existing metadata envelope required');
  const ready=planSkttReceivedEight(registry,archives),oldRecord=registry.records.find(r=>r.contentId==='sktt');
  const record=structuredClone(oldRecord),ru=ready.pages.find(p=>p.locale==='ru');
  const revision='sha256:'+sha(ru.bodyMarkdown),files=[];
  const entry={contentId:'sktt',canonicalPath:record.candidate.route,sourceRevision:revision,
    editorialSourceRevision:'CONTENT_DRAFTS_RU_EN.md#5/sktt/2026-10-03',ruBodySha256:sha(ru.bodyMarkdown),locales:{}};
  record.candidate.revision=revision;
  for(const page of ready.pages){
    const {locale,direction,source,...parsed}=page;
    const stem='sktt_'+locale.toLowerCase().replaceAll('-','_')+'_native_20261003';
    const sourceFile='registry-copy/'+stem+'.source.json';
    const wire={schemaVersion:1,sourceMode:SKTT_SOURCE_MODE,provenance:source,archive:archives.get(source.task).toString('utf8')};
    const sourceBytes=encoded(wire),bodySha256=sha(parsed.bodyMarkdown);
    const metadata={schemaVersion:1,fullPayloadKind:SKTT_KIND,sourceMode:SKTT_SOURCE_MODE,
      resolvedContentId:'sktt',resolvedCanonicalPath:entry.canonicalPath,locale,direction,...parsed,
      seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,sourceRevision:revision,
      editorialSourceRevision:entry.editorialSourceRevision,sourceRuBodySha256:entry.ruBodySha256,bodySha256,
      sourceFile,sourceFileSha256:sha(sourceBytes),sourceProvenance:source,
      serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
      approval:{status:locale==='ru'?'RU_REVIEW':'MODEL_TRANSLATED_PENDING_RENDER_QA',
        legalVerification:false,fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
    metadata.sourceEnvelopeSha256=metadataEnvelope(parsed.bodyMarkdown,metadata);
    const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=encoded(metadata);
    const payload={status:locale==='ru'?'draft':'translated',bodyFile:'registry-copy/'+stem+'.md',bodySha256,
      metadataFile,metadataSha256:sha(metaBytes),sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,
      ...(locale==='ru'?{approvalEvidence:null,approvalRevision:null}:{sourceRevision:revision,complete:true,qa:'not_done',
        qaMethod:'supplied_model_semantic',qaEvidence:'Whole received native source; independent native/legal/rendered review not run'})};
    if(locale==='ru')record.candidate.ru=payload;else record.candidate.translations[locale]=payload;
    entry.locales[locale]={...payload,direction,sourceFile,sourceFileSha256:metadata.sourceFileSha256};
    files.push({path:payload.bodyFile,text:parsed.bodyMarkdown,private:false},
      {path:metadataFile,text:metaBytes,private:false},{path:sourceFile,text:sourceBytes,private:true});
  }
  assert.deepEqual(Object.keys(entry.locales),SKTT_LOCALES);
  assert.deepEqual(Object.keys(record.candidate.translations).sort(),SKTT_LOCALES.filter(l=>l!=='ru').sort());
  entry.plannedRecordSha256=sha(encoded(record));
  const manifest={schemaVersion:1,fullPayloadKind:SKTT_KIND,sourceMode:SKTT_SOURCE_MODE,
    priorRecordSha256:SKTT_OLD_RECORD_SHA256,sourcePackets:SKTT_PACKETS.map(p=>({...p})),
    receivedLocales:[...SKTT_LOCALES],missingLocales:[...ready.missingLocales],fullTenLocaleSourceComplete:false,
    publicationGates:{ownerPublication:false,independentNativeReview:false,legalVerification:false,renderedReview:false},records:[entry]};
  return {oldRecord,record,manifest,files,summary:{identities:1,receivedLocales:8,missingLocales:[...ready.missingLocales],
    fullTenLocaleSourceComplete:false,publicProjectionFiles:16,privateSourceFiles:8,newServices:0,newPrices:0,
    localImportPlanned:true,published:false,independentNativeLegalRendered:'NOT_RUN'}};
}
