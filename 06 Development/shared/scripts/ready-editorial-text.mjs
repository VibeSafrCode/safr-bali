// Parse received readable editorial copy; never translate, execute or publish it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {metadataEnvelope} from './import-sync-bundle.mjs';

export const READY_EDITORIAL_KIND = 'G02_READY_TEXT_PREVIEW_V1';
export const READY_COUNTRY_CORRECTION_KIND = 'READY_TEXT_WITH_SUPPLIED_EN_COUNTRY_CORRECTION';
export const READY_CITIZENSHIP_CORRECTION_KIND = 'READY_TEXT_WITH_SUPPLIED_FR_CITIZENSHIP_CORRECTION';
export const editorialSha = value => createHash('sha256').update(value).digest('hex');
const faqHead = /^(?:FAQ|Частые вопросы|Frequently Asked Questions|Häufig Gestellte Fragen|Häufige Fragen|常见问题|Questions fréquentes|자주 묻는 질문|よくある質問|अक्सर पूछे जाने वाले प्रश्न|Preguntas frecuentes|الأسئلة الشائعة)/i;
const field = (text, name) => {
  const bold = text.match(new RegExp('^\\*\\*' + name + ':\\*\\*[^\\S\\n]*(.+)$', 'm'));
  const heading = text.match(new RegExp('^### ' + name + '\\s*\\n([^\\n]+)', 'm'));
  const value = (bold?.[1] ?? heading?.[1])?.trim();
  assert.ok(value, 'Missing supplied ' + name);
  return value;
};

export function selectReadyPage(response, locale) {
  assert.equal(typeof response, 'string');
  // Explicit language labels, not a guess based on natural-language length.
  const labels = [...response.matchAll(/^#{1,2} [1-3]\. [^\n]+ — (EN|DE|FR|KO|JA|HI|ES|AR|ZH-HANS)\s*$/gm)];
  if(locale==='zh-Hans'&&labels.length===0)return response; // legacy B01 single-language source
  assert.ok(labels.length>0, 'Missing supplied language labels');
  assert.equal(new Set(labels.map(m=>m[1])).size,labels.length,'Duplicate language block');
  const code=locale.toUpperCase(), index=labels.findIndex(m=>m[1]===code);
  assert.ok(index >= 0, 'Unreceived language');
  return response.slice(labels[index].index+labels[index][0].length, labels[index + 1]?.index ?? response.length);
}

export function parseReadyPage(page, {expectedSectionCount=8,expectedFaqCount=6}={}) {
  assert.equal(typeof page, 'string');
  const end = page.search(/^(?:#{2,3} (?:Редакционная (?:сверка|проверка)|Контекст — изменения|Сведения об исходнике)|\*\*Сведения об исходнике(?: [^\n*:]+)?:\*\*[ \t]*$)/m);
  const clean = (end < 0 ? page : page.slice(0, end)).replace(/\n---\s*$/, '').trimEnd();
  const headings = [...clean.matchAll(/^# (.+)$/gm)];
  assert.equal(headings.length, 1, 'Expected one supplied customer H1');
  const h1 = headings[0][1], bodyMarkdown = clean.slice(headings[0].index).trimEnd() + '\n';
  const sections = [...bodyMarkdown.matchAll(/^## (.+)$/gm)];
  assert.equal(sections.length, expectedSectionCount, 'Expected all supplied source sections');
  const sectionBody = i => bodyMarkdown.slice(sections[i].index + sections[i][0].length, sections[i + 1]?.index ?? bodyMarkdown.length).trim();
  const faqIndexes = sections.map((s,i)=>faqHead.test(s[1])?i:-1).filter(i=>i>=0);
  assert.equal(faqIndexes.length,1,'Expected one supplied FAQ section');
  const faqIndex=faqIndexes[0];
  const faqText = sectionBody(faqIndex), starts = [...faqText.matchAll(/^### (.+)$/gm)];
  assert.equal(starts.length, expectedFaqCount, 'Expected complete supplied FAQ');
  const faq = starts.map((q, i) => ({question:q[1].replace(/^[1-6]\.\s*/, ''),
    answerMarkdown:faqText.slice(q.index + q[0].length, starts[i + 1]?.index ?? faqText.length).trim()}));
  assert.ok(faq.every(q => q.question && q.answerMarkdown), 'Empty FAQ');
  const cta = bodyMarkdown.match(/^\*\*CTA(?:\s+按钮)?\s*[:：]\s*(?:\*\*\s*)?(.+?)(?:\*\*)?\s*$/m);
  assert.ok(cta, 'Missing supplied CTA label');
  const nextSection = sections.find(section => section.index > cta.index);
  assert.equal(bodyMarkdown.slice(cta.index + cta[0].length, nextSection?.index ?? bodyMarkdown.length).trim(), '', 'Unexpected customer copy after CTA within its section; supply a clean page');
  return {bodyMarkdown, h1, seo:{title:field(clean, 'SEO Title'), description:field(clean, 'Meta Description')},
    directAnswer:sectionBody(0), factBlock:null, faq, faqHeading:sections[faqIndex][1],
    cta:[{role:'primary', label:cta[1], actionIntent:'existing_contact_flow'}],
    bodyIncludesFaq:true, doNotRenderSeparateFaqAgain:true};
}

export function selectReadyRussianRecord(response, contentId) {
  assert.equal(typeof response,'string');
  const headers=[...response.matchAll(/^## [1-3]\. [^\n]+ — RU\s*$/gm)];
  const blocks=headers.map((h,i)=>response.slice(h.index,headers[i+1]?.index??response.length));
  const matching=blocks.filter(block=>block.match(/^\*\*contentId:\*\*\s*`([^`]+)`/m)?.[1]===contentId);
  assert.equal(matching.length,1,'Missing or ambiguous received RU identity');
  return matching[0];
}

// A capped reply may contain a full article followed by an incomplete context.
// The source footer and subsequent context boundary must both be observed;
// this never treats the capped overall message or context as received whole.
export function assertCompleteReadyRussianSource(response,contentId) {
  const message=response.turns?.[0]?.items?.find(i=>i.type==='agentMessage');
  assert.ok(message?.text,'Received assistant text required');
  const page=selectReadyRussianRecord(message.text,contentId);
  if(message.text.length>=19500||response.readProof?.responseTruncated){
    assert.equal(response.readProof?.responseTruncated,true,'Potentially truncated RU response');
    assert.ok(response.readProof.completeRecordBlocks?.includes(contentId),'Complete RU boundary proof required');
    assert.ok(!response.readProof.incompleteRecordBlocks?.includes(contentId),'Incomplete RU record');
    const footer=page.indexOf('\n### Сведения об исходнике\n');
    const context=page.indexOf('\n### Контекст — изменения\n');
    assert.ok(footer>0&&context>footer,'Observed full article/footer boundary required');
  }
  return page;
}

export function planReadyRussianImport(registry, manifest, response, {contentId,sourceReceipt,expectedSectionCount,expectedFaqCount=6}={}) {
  const oldRecord=registry.records.find(r=>r.contentId===contentId);
  assert.ok(oldRecord,'Reuse an existing Registry identity');
  assert.equal(oldRecord.release,'not_authorized');assert.equal(oldRecord.published,null);
  assert.equal(oldRecord.serviceId,null);assert.equal(oldRecord.pricingRef,null);
  assert.equal(oldRecord.candidate.ru.bodyFile,null,'Do not replace an existing source');
  assert.equal(Object.keys(oldRecord.candidate.translations).length,0,'Do not invalidate translations');
  assert.ok(!manifest.records.some(r=>r.contentId===contentId),'Already imported source');
  const message=response.turns[0].items.find(i=>i.type==='agentMessage');
  const page=assertCompleteReadyRussianSource(response,contentId);
  const suppliedRoute=page.match(/^\*\*routeHint:\*\*\s*`([^`]+)`/m)?.[1];
  assert.equal(suppliedRoute,oldRecord.candidate.route,'Preserve the actual route');
  const editorialSourceRevision=page.match(/^\*\*Исходная редакция:\*\*\s*`([^`]+)`/m)?.[1];
  assert.ok(editorialSourceRevision&&sourceReceipt);
  const sourceShape={expectedSectionCount,expectedFaqCount};
  const parsed=parseReadyPage(page,sourceShape),bodySha256=editorialSha(parsed.bodyMarkdown),sourceRevision='sha256:'+bodySha256;
  const stem=contentId+'_ru_gpt_20261011',sourceFile='registry-copy/'+stem+'.source.json';
  const input={schemaVersion:1,sourceMode:'ORDINARY_ASSISTANT_TEXT',contentId,sourceRevision:editorialSourceRevision,
    assistantMessageId:message.id,assistantText:message.text,bodyMarkdown:parsed.bodyMarkdown,h1:parsed.h1,seo:parsed.seo,
    shortAnswerMarkdown:parsed.directAnswer,faqs:parsed.faq,cta:parsed.cta[0],factBlock:null};
  if(response.readProof?.responseTruncated)input.readProof=response.readProof;
  const wireBytes=JSON.stringify(input,null,2)+'\n';
  const metadata={schemaVersion:1,fullPayloadKind:READY_EDITORIAL_KIND,sourceMode:'ORDINARY_ASSISTANT_TEXT',resolvedContentId:contentId,
    locale:'ru',direction:'ltr',resolvedCanonicalPath:oldRecord.candidate.route,...parsed,seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,
    sourceRevision,editorialSourceRevision,bodySha256,sourceRuBodySha256:bodySha256,sourceReceipt,sourceFile,
    sourceFileSha256:editorialSha(wireBytes),assistantTextSha256:editorialSha(message.text),sourceShape,
    serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
    approval:{status:'RU_REVIEW',legalVerification:false,fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
  metadata.sourceEnvelopeSha256=metadataEnvelope(parsed.bodyMarkdown,metadata);
  const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=JSON.stringify(metadata,null,2)+'\n';
  const record=structuredClone(oldRecord);record.candidate.revision=sourceRevision;
  record.candidate.ru={status:'draft',bodyFile:'registry-copy/'+stem+'.md',bodySha256,metadataFile,metadataSha256:editorialSha(metaBytes),
    sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,approvalEvidence:null,approvalRevision:null};
  const nextManifest=structuredClone(manifest);
  nextManifest.records.push({contentId,canonicalPath:record.candidate.route,sourceRevision,editorialSourceRevision,
    ruBodySha256:bodySha256,sourceShape,locales:{ru:{...record.candidate.ru,direction:'ltr',sourceFile,
      sourceFileSha256:metadata.sourceFileSha256,assistantMessageId:message.id,assistantTextSha256:metadata.assistantTextSha256}}});
  return {oldRecord,record,manifest:nextManifest,metadata,files:[{path:record.candidate.ru.bodyFile,bytes:parsed.bodyMarkdown},
    {path:metadataFile,bytes:metaBytes},{path:sourceFile,bytes:wireBytes}]};
}

// An explicitly reconciled Knowledge identity only; no Service, public route or
// implicit article creation. Existing records must use the existing RU planner.
export function planReadyKnowledgeImport(registry,manifest,response,{contentId,route,parentId,relatedContentIds=[],sourceReceipt,expectedSectionCount,expectedFaqCount=6}={}) {
  assert.match(contentId,/^knowledge_[a-z0-9_]+$/);
  assert.match(route,/^\/bali\/knowledge\/(?:[a-z0-9-]+\/)+$/);
  assert.ok(!registry.records.some(r=>r.contentId===contentId),'Knowledge identity already exists');
  assert.ok(!registry.records.some(r=>r.candidate.route===route||Object.values(r.published?.routes??{}).includes(route)||r.reuseRoutes.includes(route)), 'Duplicate Knowledge route');
  const ids=new Set(registry.records.map(r=>r.contentId));
  assert.ok(ids.has(parentId),'Knowledge parent must exist');
  assert.equal(new Set(relatedContentIds).size,relatedContentIds.length);
  assert.ok(relatedContentIds.every(id=>ids.has(id)),'Knowledge related identity must exist');
  const message=response.turns[0].items.find(i=>i.type==='agentMessage');
  const page=selectReadyRussianRecord(message?.text,contentId);
  assert.equal(page.match(/^\*\*routeHint:\*\*\s*`([^`]+)`/m)?.[1],route,'Preserve the actual route');
  const parsed=parseReadyPage(page,{expectedSectionCount,expectedFaqCount});
  const empty={contentId,kind:'knowledge',title:parsed.h1,parentId,relatedContentIds,serviceId:null,pricingRef:null,
    bindingStatus:'not_applicable',availability:'not_verified',bindingEvidence:[],published:null,
    candidate:{route,exposure:'preview_only',revision:'pending_received_source',ru:{status:'missing',bodyFile:null,bodySha256:null,approvalEvidence:null,approvalRevision:null},translations:{}},
    reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]};
  const prepared=structuredClone(registry);prepared.records.push(empty);
  const plan=planReadyRussianImport(prepared,manifest,response,{contentId,sourceReceipt,expectedSectionCount,expectedFaqCount});
  return {...plan,oldRecord:null,addedIdentity:true};
}

// Dry planning only: the caller applies exact paths through the normal editor.
export function planReadyLocaleImport(registry, manifest, response, locales, {contentId,sourceRuRecordSha256,sourceReceipt}={}) {
  const oldRecord=registry.records.find(r=>r.contentId===contentId);
  assert.ok(oldRecord);assert.equal(oldRecord.release,'not_authorized');assert.equal(oldRecord.published,null);
  assert.equal(oldRecord.serviceId,null);assert.equal(oldRecord.pricingRef,null);
  const record=structuredClone(oldRecord), nextManifest=structuredClone(manifest);
  const entry=nextManifest.records.find(r=>r.contentId===contentId);assert.ok(entry,'RU must be imported before translations');
  assert.equal(entry.sourceRevision,record.candidate.revision);
  assert.match(sourceRuRecordSha256,/^[a-f0-9]{64}$/);assert.ok(sourceReceipt);
  const message=response.turns[0].items.find(i=>i.type==='agentMessage');assert.ok(message?.text);
  if(message.text.length>=20000){
    assert.equal(response.readProof?.responseTruncated,true,'Potentially truncated response');
    assert.ok(locales.every(locale=>response.readProof.completeLocaleBlocks.includes(locale)&&!response.readProof.incompleteLocaleBlocks.includes(locale)), 'Incomplete locale in partial response');
    for(const locale of locales){
      const block=selectReadyPage(message.text,locale);
      assert.ok(block.length<message.text.length,'Complete bounded language block required');
      assert.ok(message.text.slice(message.text.indexOf(block)+block.length).match(/^#{1,2} [1-3]\. [^\n]+ — (EN|DE|FR|KO|JA|HI|ES|AR|ZH-HANS)/m),'Following boundary required for complete partial block');
    }
  }
  const files=[];
  for(const locale of locales){
    const language=registry.locales.find(l=>l.code===locale);assert.ok(language&&locale!=='ru');
    assert.ok(!record.candidate.translations[locale]?.bodyFile,'Do not overwrite received or approved copy');
    const parsed=parseReadyPage(selectReadyPage(message.text,locale),entry.sourceShape);
    const stem=contentId+'_'+locale.toLowerCase().replaceAll('-','_')+'_gpt_20261011';
    const wire={schemaVersion:1,sourceMode:'ORDINARY_ASSISTANT_TEXT',assistantMessageId:message.id,assistantText:message.text,readProof:response.readProof??{responseTruncated:false},
      sourceRuRecordSha256,sourceRevision:entry.editorialSourceRevision,locale};
    const sourceFile='registry-copy/'+stem+'.source.json',wireBytes=JSON.stringify(wire,null,2)+'\n';
    const metadata={schemaVersion:1,fullPayloadKind:READY_EDITORIAL_KIND,sourceMode:'ORDINARY_ASSISTANT_TEXT',resolvedContentId:contentId,
      locale,direction:language.dir,resolvedCanonicalPath:record.candidate.route,...parsed,seoTitle:parsed.seo.title,metaDescription:parsed.seo.description,
      bodySha256:editorialSha(parsed.bodyMarkdown),sourceRevision:record.candidate.revision,editorialSourceRevision:entry.editorialSourceRevision,
      sourceRuBodySha256:entry.ruBodySha256,sourceRuRecordSha256,sourceEnvelopeSha256:record.candidate.ru.sourceEnvelopeSha256,
      sourceFile,sourceFileSha256:editorialSha(wireBytes),assistantTextSha256:editorialSha(message.text),sourceReceipt,
      serviceId:null,pricingRef:null,pricingMode:'individual_quote',publicationAuthorized:false,
      approval:{status:'MODEL_TRANSLATED_PENDING_RENDER_QA',legalVerification:false,fulfillmentVerified:false,nativeSpeakerReview:false,browserReview:false}};
    const metadataFile='registry-copy/'+stem+'.meta.json',bytes=JSON.stringify(metadata,null,2)+'\n';
    const payload={status:'translated',complete:true,qa:'not_done',sourceRevision:record.candidate.revision,bodyFile:'registry-copy/'+stem+'.md',
      bodySha256:metadata.bodySha256,metadataFile,metadataSha256:editorialSha(bytes),sourceEnvelopeSha256:metadata.sourceEnvelopeSha256,
      qaMethod:'supplied_model_semantic',qaEvidence:'Supplied full text; independent native/legal/rendered review not run'};
    record.candidate.translations[locale]=payload;
    entry.locales[locale]={...payload,direction:language.dir,sourceFile,sourceFileSha256:metadata.sourceFileSha256,
      assistantMessageId:message.id,assistantTextSha256:metadata.assistantTextSha256};
    files.push({path:payload.bodyFile,bytes:parsed.bodyMarkdown},{path:metadataFile,bytes},{path:sourceFile,bytes:wireBytes});
  }
  return {oldRecord,record,manifest:nextManifest,files};
}

function suppliedCorrectionBlock(text,locale){
  const lines=text.split(/\r?\n/),headers=['### Сведения об исходнике','### Адресная поправка '+locale,'### Контекст — изменения'];
  const positions=headers.map(header=>{const found=lines.map((line,i)=>line===header?i:-1).filter(i=>i>=0);assert.equal(found.length,1,'Unique standalone correction headings required');return found[0];});
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2],'Ordered correction boundaries required');
  return lines.slice(positions[1]+1,positions[2]).join('\n').trim();
}

function assertReadyCorrectionBase(registry,manifest,locale,baseSourceBytes,baseMetadata,expectedOldBodySha256,sourceReceipt){
  assert.equal(manifest.fullPayloadKind,READY_EDITORIAL_KIND);
  assert.deepEqual(manifest.publicationGates,{publication:false,indexing:false,newBusinessService:false,productionMutation:false});
  const oldRecord=registry.records.find(r=>r.contentId==='second_home');assert.ok(oldRecord);
  assert.equal(oldRecord.release,'not_authorized');assert.equal(oldRecord.published,null);assert.equal(oldRecord.serviceId,null);assert.equal(oldRecord.pricingRef,null);
  assert.equal(oldRecord.candidate.exposure,'preview_only');assert.equal(oldRecord.candidate.ru.status,'draft');
  assert.equal(oldRecord.candidate.ru.approvalEvidence,null);assert.equal(oldRecord.candidate.ru.approvalRevision,null);
  const entry=manifest.records.find(r=>r.contentId==='second_home');assert.ok(entry);
  assert.equal(entry.sourceRevision,oldRecord.candidate.revision);assert.equal(entry.canonicalPath,oldRecord.candidate.route);
  const oldPayload=oldRecord.candidate.translations[locale],pin=entry.locales[locale];assert.ok(oldPayload&&pin);
  assert.equal(oldPayload.qa,'not_done');assert.equal(oldPayload.status,'translated');assert.equal(oldPayload.complete,true);
  assert.equal(oldPayload.sourceRevision,entry.sourceRevision);assert.equal(oldPayload.qaMethod,'supplied_model_semantic');
  for(const field of ['bodyFile','bodySha256','metadataFile','metadataSha256','sourceEnvelopeSha256'])assert.equal(oldPayload[field],pin[field],'Old correction '+field+' pin drift');
  assert.equal(oldPayload.bodySha256,expectedOldBodySha256);assert.ok(sourceReceipt);
  assert.equal(baseMetadata.publicationAuthorized,false);assert.equal(baseMetadata.locale,locale);assert.equal(baseMetadata.sourceRevision,entry.sourceRevision);
  for(const flag of ['legalVerification','fulfillmentVerified','nativeSpeakerReview','browserReview'])assert.equal(baseMetadata.approval[flag],false);
  assert.equal(editorialSha(JSON.stringify(baseMetadata,null,2)+'\n'),pin.metadataSha256);
  assert.equal(baseMetadata.sourceFile,pin.sourceFile);assert.equal(baseMetadata.sourceFileSha256,pin.sourceFileSha256);
  assert.equal(editorialSha(baseSourceBytes),pin.sourceFileSha256);
  const base=JSON.parse(baseSourceBytes);assert.equal(base.sourceMode,'ORDINARY_ASSISTANT_TEXT');
  assert.equal(base.assistantMessageId,pin.assistantMessageId);assert.equal(editorialSha(base.assistantText),pin.assistantTextSha256);
  assert.equal(baseMetadata.assistantTextSha256,pin.assistantTextSha256);
  return {oldRecord,oldPayload,entry,base};
}

// One source-backed wording repair, not a general copy editor. Both ordinary
// messages are preserved; all copy outside the supplied country phrase is exact.
export function parseReadyCountryCorrection(input,sourceShape){
  assert.equal(input.sourceMode,READY_COUNTRY_CORRECTION_KIND);assert.equal(input.locale,'en');
  const original=parseReadyPage(selectReadyPage(input.assistantText,'en'),sourceShape);
  assert.equal(editorialSha(original.bodyMarkdown),input.baseBodySha256,'Correction base source drift');
  const correction=input.correction;assert.ok(correction?.assistantMessageId&&correction.assistantText);
  assert.equal(correction.responseTruncated,false);assert.ok(correction.assistantText.length<19500);
  const block=suppliedCorrectionBlock(correction.assistantText,'EN');
  const label='**Раздел:** What Information Is Needed for an Assessment?';
  assert.ok(block.startsWith(label+'\n\n'),'Exact supplied section required');
  const supplied=block.slice(label.length).trim();assert.ok(supplied&&!supplied.includes('\n'),'One complete supplied paragraph required');
  const heading='## What Information Is Needed for an Assessment?\n\n',offset=original.bodyMarkdown.indexOf(heading);
  assert.ok(offset>0);const paragraphStart=offset+heading.length,paragraphEnd=original.bodyMarkdown.indexOf('\n\n',paragraphStart);
  assert.ok(paragraphEnd>paragraphStart);const old=original.bodyMarkdown.slice(paragraphStart,paragraphEnd);
  const before='current country of residence',after='the country where you are currently staying';
  assert.equal(old.split(before).length,2);assert.equal(supplied.split(after).length,2);
  assert.equal(supplied.replace(after,before),old,'Unrelated source wording may not change');
  return {...original,bodyMarkdown:original.bodyMarkdown.slice(0,paragraphStart)+supplied+original.bodyMarkdown.slice(paragraphEnd)};
}

export function planReadyCountryCorrection(registry,manifest,baseSourceBytes,baseMetadata,response,{expectedOldBodySha256,sourceReceipt}={}){
  const {oldRecord,oldPayload,entry,base}=assertReadyCorrectionBase(registry,manifest,'en',baseSourceBytes,baseMetadata,expectedOldBodySha256,sourceReceipt);
  const message=response.turns[0].items.find(i=>i.type==='agentMessage');assert.ok(message);
  const wire={...base,sourceMode:READY_COUNTRY_CORRECTION_KIND,baseBodySha256:expectedOldBodySha256,
    correction:{assistantMessageId:message.id,assistantText:message.text,responseTruncated:response.readProof?.responseTruncated}};
  const parsed=parseReadyCountryCorrection(wire,entry.sourceShape),stem='second_home_en_country_stay_gpt_20261011',sourceFile='registry-copy/'+stem+'.source.json';
  const wireBytes=JSON.stringify(wire,null,2)+'\n';
  const metadata={...baseMetadata,...parsed,sourceMode:READY_COUNTRY_CORRECTION_KIND,bodySha256:editorialSha(parsed.bodyMarkdown),sourceReceipt,sourceFile,sourceFileSha256:editorialSha(wireBytes),
    correctionBaseBodySha256:expectedOldBodySha256,correctionAssistantMessageId:message.id,correctionAssistantTextSha256:editorialSha(message.text)};
  const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=JSON.stringify(metadata,null,2)+'\n';
  const record=structuredClone(oldRecord),payload={...oldPayload,bodyFile:'registry-copy/'+stem+'.md',bodySha256:metadata.bodySha256,metadataFile,metadataSha256:editorialSha(metaBytes)};
  record.candidate.translations.en=payload;const nextManifest=structuredClone(manifest),nextEntry=nextManifest.records.find(r=>r.contentId==='second_home');
  nextEntry.locales.en={...entry.locales.en,...payload,sourceFile,sourceFileSha256:metadata.sourceFileSha256,
    correctionAssistantMessageId:message.id,correctionAssistantTextSha256:metadata.correctionAssistantTextSha256};
  return {oldRecord,record,manifest:nextManifest,metadata,files:[{path:payload.bodyFile,bytes:parsed.bodyMarkdown},{path:metadataFile,bytes:metaBytes},{path:sourceFile,bytes:wireBytes}]};
}

export function parseReadyCitizenshipCorrection(input,sourceShape){
  assert.equal(input.sourceMode,READY_CITIZENSHIP_CORRECTION_KIND);assert.equal(input.locale,'fr');
  const original=parseReadyPage(selectReadyPage(input.assistantText,'fr'),sourceShape);
  assert.equal(editorialSha(original.bodyMarkdown),input.baseBodySha256,'Correction base source drift');
  const correction=input.correction;assert.ok(correction?.assistantMessageId&&correction.assistantText);
  assert.equal(correction.responseTruncated,false);assert.ok(correction.assistantText.length<19500);
  const block=suppliedCorrectionBlock(correction.assistantText,'FR'),label='**Раздел:** Réponse rapide';
  assert.ok(block.startsWith(label+'\n\n'));
  const parts=block.slice(label.length).trim().split('\n\n');assert.ok(parts.length===1||parts.length===2);
  if(parts.length===2)assert.ok(parts[1].startsWith('Поправка ограничена смыслом исходного RU:')&&!parts[1].includes('\n'));
  const supplied=parts[0];assert.ok(supplied&&!supplied.includes('\n'));
  const heading='## Réponse rapide\n\n',offset=original.bodyMarkdown.indexOf(heading);assert.ok(offset>0);
  const start=offset+heading.length,end=original.bodyMarkdown.indexOf('\n\n',start);assert.ok(end>start);
  const old=original.bodyMarkdown.slice(start,end),before="ne permet pas d'acquérir la nationalité",after='ne constitue pas un achat de nationalité';
  assert.equal(old.split(before).length,2);assert.equal(supplied.split(after).length,2);assert.equal(supplied.replace(after,before),old,'Unrelated source wording may not change');
  assert.ok(original.directAnswer.startsWith(old));
  return {...original,bodyMarkdown:original.bodyMarkdown.slice(0,start)+supplied+original.bodyMarkdown.slice(end),directAnswer:original.directAnswer.replace(old,supplied)};
}

export function planReadyCitizenshipCorrection(registry,manifest,baseSourceBytes,baseMetadata,response,{expectedOldBodySha256,sourceReceipt}={}){
  const {oldRecord,oldPayload,entry,base}=assertReadyCorrectionBase(registry,manifest,'fr',baseSourceBytes,baseMetadata,expectedOldBodySha256,sourceReceipt);
  const message=response.turns[0].items.find(i=>i.type==='agentMessage');assert.ok(message);
  const wire={...base,sourceMode:READY_CITIZENSHIP_CORRECTION_KIND,baseBodySha256:expectedOldBodySha256,
    correction:{assistantMessageId:message.id,assistantText:message.text,responseTruncated:response.readProof?.responseTruncated}};
  const parsed=parseReadyCitizenshipCorrection(wire,entry.sourceShape),stem='second_home_fr_citizenship_gpt_20261011',sourceFile='registry-copy/'+stem+'.source.json',wireBytes=JSON.stringify(wire,null,2)+'\n';
  const metadata={...baseMetadata,...parsed,sourceMode:READY_CITIZENSHIP_CORRECTION_KIND,bodySha256:editorialSha(parsed.bodyMarkdown),sourceReceipt,sourceFile,sourceFileSha256:editorialSha(wireBytes),
    correctionBaseBodySha256:expectedOldBodySha256,correctionAssistantMessageId:message.id,correctionAssistantTextSha256:editorialSha(message.text)};
  const metadataFile='registry-copy/'+stem+'.meta.json',metaBytes=JSON.stringify(metadata,null,2)+'\n';
  const record=structuredClone(oldRecord),payload={...oldPayload,bodyFile:'registry-copy/'+stem+'.md',bodySha256:metadata.bodySha256,metadataFile,metadataSha256:editorialSha(metaBytes)};
  record.candidate.translations.fr=payload;const nextManifest=structuredClone(manifest),nextEntry=nextManifest.records.find(r=>r.contentId==='second_home');
  nextEntry.locales.fr={...entry.locales.fr,...payload,sourceFile,sourceFileSha256:metadata.sourceFileSha256,
    correctionAssistantMessageId:message.id,correctionAssistantTextSha256:metadata.correctionAssistantTextSha256};
  return {oldRecord,record,manifest:nextManifest,metadata,files:[{path:payload.bodyFile,bytes:parsed.bodyMarkdown},{path:metadataFile,bytes:metaBytes},{path:sourceFile,bytes:wireBytes}]};
}
