// Deterministic source-only preparation. No filesystem, network, commands,
// Registry mutation, translation, publication or authority derived from source.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const adjacentSha=v=>createHash('sha256').update(v).digest('hex');
const THREAD_SHA='f8e70dbd66bdfa5485f0d491dd4d9bfbbf70a4fc0351fcffe226ec25b1f8c65f';
export const ADJACENT_NATIVE_PINS=Object.freeze({
 '039':Object.freeze({task:'G03_ADJACENT_HOSPITALITY_EXACT_RU_INTAKE_DEV3_039',turnIdSha256:'3551ae93a6eee9fd994c2d8ef8acc0dffdfe84e6aa4f2b9b672fdbac907dd948',assistantIdSha256:'c7d382eeb4da512cf3dab406166f86ab1fa5630cd1b1fdaa25bc8d7920fbb299',characters:8452,sha256:'d4d9e08aff5dba6c0cad388f1076d03f2369b327ed0a8dbf3f928ef12b3ae873'}),
 '040':Object.freeze({task:'G03_ADJACENT_RESTAURANT_EXACT_RU_INTAKE_DEV3_040',turnIdSha256:'40dbe862dbfafeea5256a4bb91754c394d1e0590b34e3043f084a975b1319100',assistantIdSha256:'655bca9a6e5cfef2196914cb0f252645d6fc51a58ac539ab4f229492f25d8257',characters:7524,sha256:'885da68a66a9c540b5039e05b0e7bdabeabb38683f5b82375b8dc1aae897ab08'}),
 '045':Object.freeze({task:'G03_ADJACENT_RU_TO_EN_REUSE_TRANSLATE_DEV3_045',turnIdSha256:'a13d5185c8ac5d591fb1e24fd72bf3516676cd0518ac10d688faea5600b43a8c',assistantIdSha256:'278e80db34e08197face79a91fe4ab30b68c4ea2e42f8d18e90d8657905e25fd',characters:17985,sha256:'9e15519dc6792bf68dbbade8ce97b742548898203176aee0a562f62e666f41ac'}),
});
const scopes=Object.freeze({
 accommodation:Object.freeze({id:'bali_accommodation_licenses',route:'/bali/business/accommodation-licenses/',ruTitle:'Разрешения для отеля, гостевого дома и коммерческой виллы на Бали | SAFRWAY',enTitle:'Permits for a Hotel, Guesthouse and Commercial Villa in Bali | SAFRWAY',ruPacket:'039',ownerQuestions:4}),
 restaurant:Object.freeze({id:'bali_restaurant_licenses',route:'/bali/business/restaurant-licenses/',ruTitle:'Лицензии для ресторана и кафе на Бали | SAFRWAY',enTitle:'Restaurant and Café Licences in Bali | SAFRWAY',ruPacket:'040',ownerQuestions:5}),
});
const wellFormed=s=>{assert.equal(typeof s,'string');assert.ok(s.isWellFormed());assert.ok(!s.includes('\0'));return s;};
function decode(b){assert.ok(Buffer.isBuffer(b));return wellFormed(new TextDecoder('utf-8',{fatal:true}).decode(b));}
function once(text,needle){const first=text.indexOf(needle);assert.ok(first>=0,'Required literal absent');assert.equal(text.indexOf(needle,first+1),-1,'Duplicate literal');return first;}
function lineEnd(text,start){const i=text.indexOf('\n',start);return i<0?text.length:i+1;}
function span(text,start,end){assert.ok(start>=0&&end>start&&end<=text.length);const literal=text.slice(start,end);
 return {startUtf16:start,endUtf16:end,startCodePoint:Array.from(text.slice(0,start)).length,
 endCodePoint:Array.from(text.slice(0,end)).length,sha256:adjacentSha(literal),characters:literal.length,bytes:Buffer.byteLength(literal)};}
export function exactAdjacentNative(rawBytes,key){
 assert.ok(Object.hasOwn(ADJACENT_NATIVE_PINS,key),'Unknown source packet');
 const pin=ADJACENT_NATIVE_PINS[key],outer=JSON.parse(decode(rawBytes));
 assert.equal(outer.isError,false,'Native transport failed before source parsing');
 assert.ok(Array.isArray(outer.content)&&outer.content.length===1&&outer.content[0].type==='text');
 const page=JSON.parse(wellFormed(outer.content[0].text));
 assert.equal(adjacentSha(page.thread.id),THREAD_SHA,'Native thread identity drift');assert.equal(page.thread.kind,'chatgpt');
 const turns=page.turns.filter(t=>adjacentSha(t.id)===pin.turnIdSha256);assert.equal(turns.length,1,'Native turn identity drift');
 const turn=turns[0];assert.equal(turn.status,'completed');assert.equal(turn.error,null);
 const matches=turn.items.filter(i=>i.type==='agentMessage'&&adjacentSha(i.id)===pin.assistantIdSha256);assert.equal(matches.length,1,'Native assistant identity drift');
 const m=matches[0],text=wellFormed(m.text);assert.equal(text.length,pin.characters);assert.ok(text.length<19500);
 for(const flag of [m.truncated,m.isTruncated,m.textTruncated])assert.notEqual(flag,true,'Truncated native source');
 assert.equal(adjacentSha(text),pin.sha256,'Whole native message drift');
 const resolvedPin={task:pin.task,turnId:turn.id,assistantId:m.id,characters:pin.characters,sha256:pin.sha256};
 return {key,pin:resolvedPin,text,responseSha256:adjacentSha(rawBytes),nativeTruncationFlag:m.truncated??m.isTruncated??m.textTruncated??null,threadId:page.thread.id};
}
function field(article,label){
 const marker='**'+label+':** ',start=once(article,marker),end=lineEnd(article,start),raw=article.slice(start,end);
 assert.ok(start===0||article[start-1]==='\n','Field must begin at line boundary');
 // literalValue deliberately retains Markdown hard-break spaces; no trim/normalization.
 return {label,literalValue:raw.slice(marker.length).replace(/\n$/,''),literal:raw,spanInArticle:span(article,start,end)};
}
function article(native,key,locale){
 const scope=scopes[key];assert.ok(scope&&['ru','en'].includes(locale));
 const text=native.text,title=scope[locale+'Title'],h1='# '+title+'\n',h1Start=once(text,h1);
 assert.ok(h1Start===0||text[h1Start-1]==='\n');
 const ctaLineStart=text.indexOf('\n**CTA:** ',h1Start)+1;assert.ok(ctaLineStart>h1Start);
 const ctaEnd=lineEnd(text,ctaLineStart),articleStart=locale==='ru'?h1Start:
  text.lastIndexOf('\n**SEO Title:** ',h1Start)+1;
 assert.ok(articleStart>=0&&articleStart<=h1Start&&h1Start-articleStart<1000);
 const raw=text.slice(articleStart,ctaEnd),h1Local=h1Start-articleStart,ctaLocal=ctaLineStart-articleStart;
 const directLabel=locale==='ru'?'Прямой ответ':'Direct answer',direct=once(raw,'**'+directLabel+':** ');
 assert.ok(direct>h1Local);
 const seo=field(raw,'SEO Title'),description=field(raw,'Meta Description'),cta=field(raw,'CTA');
 let pieces;
 const sourceHeader={};
 if(locale==='ru'){
  const status=field(raw,'Статус'),proposedRoute=field(raw,'Предлагаемый URL'),proposedId=field(raw,'Content ID (предложение)'),date=field(raw,'Дата редакционной проверки');
  assert.match(status.literalValue,/^RU_REVIEW/);assert.ok(proposedRoute.literalValue.includes('\x60'+scope.route+'\x60'));
  assert.equal(proposedId.literalValue,'\x60'+scope.id+'\x60  ');assert.equal(date.literalValue,'2026-10-10');
  const metaStart=once(raw,'**Статус:** ');
  pieces=[{start:h1Local,end:metaStart},{start:direct,end:ctaLocal}];
  Object.assign(sourceHeader,{status:status.literalValue,reportedRoute:proposedRoute.literalValue,reportedId:proposedId.literalValue,editorialDate:date.literalValue});
 }else{
  assert.ok(seo.spanInArticle.startUtf16<h1Local&&description.spanInArticle.startUtf16<h1Local);
  pieces=[{start:h1Local,end:ctaLocal}];
 }
 const body=pieces.map(p=>raw.slice(p.start,p.end)).join('');
 assert.equal((body.match(/^# (?!#)/gm)||[]).length,1);
 assert.equal((body.match(/^## (?!#)/gm)||[]).length,9);
 assert.equal((body.match(/^### (?!#)/gm)||[]).length,7);
 assert.equal((body.match(/^- /gm)||[]).length,6);
 assert.equal((body.match(/^\d+\. /gm)||[]).length,6);
 assert.equal((body.match(/^\|/gm)||[]).length,0);
 assert.equal((body.match(new RegExp('\\*\\*'+directLabel+':\\*\\* ','g'))||[]).length,1);
 assert.doesNotMatch(body,/\*\*(?:Статус|Предлагаемый URL|Content ID|SEO Title|Meta Description|Дата редакционной проверки|CTA):|END_G03|END_RU_SOURCE|Source \/ QA|Редакционный контекст|Источник \d/);
 for(const term of key==='accommodation'?['KBLI','55','2025','PT PMA','PBG','SLF','NIB']:['KBLI','2025','PT PMA','PBG','SLF','NIB','SLHS','BKPM','5/2025'])assert.ok(body.includes(term),'Missing supplied source term');
 const links=[...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m=>m[1]);
 assert.deepEqual(links,key==='restaurant'?['/bali/business/oss-nib-licensing/']:[]);
 return {artifactKey:key,locale,sourceArticle:raw,customerBody:body,metadata:{
  stage:'MATERIALIZED_ACCEPTED_SOURCE_ONLY_NOT_REGISTRY',language:locale,reportedSourceIdentity:scope.id,reportedSourceRoute:scope.route,
  registryAssignmentConfirmed:false,registryContentId:null,publicCanonical:null,serviceId:null,pricingRef:null,
  sourceRevision:'2026-10-10',sourceStatus:'RU_REVIEW',publicationAuthorized:false,legalReview:'NOT_RUN',nativeLanguageReview:'NOT_RUN',
  title,seoTitleLiteral:seo.literalValue,metaDescriptionLiteral:description.literalValue,ctaLabelLiteral:cta.literalValue,
  h2:9,faq:7,bullets:6,steps:6,tables:0,factBlock:null,links,ownerRecheckQuestions:scope.ownerQuestions,
  rawSourceHeader:sourceHeader,sourceArticleSha256:adjacentSha(raw),customerBodySha256:adjacentSha(body),
  source:{transport:'WHOLE_NATIVE_ASSISTANT_TEXT',threadId:native.threadId,task:native.pin.task,turnId:native.pin.turnId,assistantId:native.pin.assistantId,
   nativeSha256:native.pin.sha256,responseSha256:native.responseSha256,nativeTruncationFlag:native.nativeTruncationFlag,
   articleNativeSpan:span(text,articleStart,ctaEnd),bodyParts:pieces.map(p=>span(raw,p.start,p.end)),
   originalFileDownloaded:false,originalFileSha256:null,customerBytesNotRegenerated:true},
 }};
}
export function prepareAdjacentBusinessSources(responses){
 assert.deepEqual(Object.keys(responses).sort(),['039','040','045']);
 const natives=Object.fromEntries(Object.keys(responses).map(k=>[k,exactAdjacentNative(responses[k],k)]));
 const articles=Object.keys(scopes).flatMap(key=>[article(natives[scopes[key].ruPacket],key,'ru'),article(natives['045'],key,'en')]);
 assert.equal(articles.length,4);
 return {stage:'FOUR_SOURCE_VARIANTS_ONLY_NOT_IMPORTED',materialCount:2,languageVersions:4,receivedLocales:['ru','en'],
 missingLocales:['de','fr','es','zh-Hans','ja','ko','hi','ar'],articles,
 nativeSources:Object.values(natives).map(n=>({key:n.key,...n.pin,responseSha256:n.responseSha256,nativeTruncationFlag:n.nativeTruncationFlag})),
 registryAssignmentConfirmed:false,newCustomerTranslations:0,newServiceIds:0,newPrices:0,imported:false,published:false};
}
export function verifyPreparedAdjacentArticle(candidate,responses){
 const actual=prepareAdjacentBusinessSources(responses).articles.find(a=>a.artifactKey===candidate?.artifactKey&&a.locale===candidate?.locale);
 assert.ok(actual,'Unknown prepared article');assert.deepEqual(candidate,actual,'Prepared projection drift');
 return true;
}

