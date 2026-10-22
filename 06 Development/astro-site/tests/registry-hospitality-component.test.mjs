import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import {hospitalitySourceManifest,hospitalityPrivateInventory,createHospitalityEditorialInputResolver} from '../scripts/registry-hospitality-component-inputs.mjs';
import {buildHospitalityComponent,renderHospitalityComponentPreview,renderHospitalityComponentIndex,hospitalityComponentHref} from '../scripts/registry-hospitality-component-preview.mjs';
import {registryPreviewMiddleware,renderRegistryPreview} from '../scripts/registry-preview.mjs';
import {createEditorialInputResolver} from '../scripts/registry-private-editorial-inputs.mjs';
import {previewHref,escapeHtml,safeMarkdown} from '../scripts/registry-document.mjs';
import localManifest from '../../shared/content/registry-hospitality-local-editorial-build.v1.json' with {type:'json'};
import {HOSPITALITY_LOCAL_LOCALES,HOSPITALITY_NATIVE_MANIFEST_SHA,HOSPITALITY_PEER_SHA,HOSPITALITY_ROOT_ACCEPTANCE_SHA,
 encoded,parseHospitalityLocalOriginals,hospitalityLocalOriginalsFromWire,planHospitalityLocalEditorialImport} from '../../shared/scripts/hospitality-local-editorial-source.mjs';
import {privateEditorialBytePrimitives as localBytes} from '../scripts/registry-private-editorial-inputs.mjs';
import {hospitalityLocalPrivateInventory,preparePrivateHospitalityLocalEditorialBundle,createHospitalityLocalEditorialInputResolver} from '../scripts/registry-hospitality-local-editorial-inputs.mjs';
import {validateHospitalityLocalProjection,validateHospitalityLocalOriginal} from '../scripts/registry-hospitality-local-editorial-preview.mjs';
import {HOSPITALITY_COMPONENT_LOCALES} from '../scripts/registry-hospitality-component-preview.mjs';
import {exactAdjacentNative} from '../../shared/scripts/adjacent-business-source.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixtureRoot=process.env.SAFR_HOSPITALITY_SOURCE_FIXTURE_ROOT;
assert.equal(typeof fixtureRoot,'string','EXACT_HOSPITALITY_SOURCE_FIXTURE_ROOT_REQUIRED');
assert.equal(fs.realpathSync(fixtureRoot),fixtureRoot);
const manifest=hospitalitySourceManifest(),source=createHospitalityEditorialInputResolver();
const components=['accommodation','restaurant'],locales=['ru','en'];
// This remains the one explicit hospitality PRIVATE_ORIGINALS source suite.
// No CI/profile/missing-root skip and no test-time source regeneration.
const localSourceRoot=process.env.SAFR_HOSPITALITY_LOCAL_TEST_SOURCE_ROOT;
assert.equal(typeof localSourceRoot,'string','EXACT_HOSPITALITY_LOCAL_SOURCE_ROOT_REQUIRED');
const localInventory=hospitalityLocalPrivateInventory(),localInputs=new Map(),localWires=new Map();
for(const component of components)for(const locale of HOSPITALITY_LOCAL_LOCALES){
 const pin=localManifest.variants.find(row=>row.component===component&&row.locale===locale);
 const raw=localBytes.readPinned(localSourceRoot,pin.sourceFile,{privateRoot:true,expectedSha256:pin.sourceFileSha256}).bytes;
 const wire=JSON.parse(raw);localWires.set(component+'/'+locale,wire);
 localInputs.set(component+'/'+locale,hospitalityLocalOriginalsFromWire(wire,component,locale));
}
const registryBeforePlan=JSON.stringify(registry),localPlan=planHospitalityLocalEditorialImport(registry,localInputs,manifest);
const localPrepared=preparePrivateHospitalityLocalEditorialBundle(localSourceRoot);
const localReader=createHospitalityLocalEditorialInputResolver({privateRoot:localPrepared.root});
after(()=>fs.rmSync(localPrepared.root,{recursive:true}));
const publicLocalRead=file=>fs.readFileSync(new URL('../../shared/content/'+file,import.meta.url));
const localMeta=pin=>JSON.parse(publicLocalRead(pin.metadataFile));
const visible=text=>text.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");
function fixture(component,locale,suffix){
  assert.ok(components.includes(component)&&locales.includes(locale)&&['customer-body.md','source-article.md','metadata.json'].includes(suffix));
  return fs.readFileSync(fixtureRoot+'/articles/'+component+'_'+locale+'.'+suffix);
}
test('exact manifest has four source-only variants, three private origins and no public authority',()=>{
  assert.equal(manifest.variants.length,4);assert.equal(hospitalityPrivateInventory().files.length,3);
  assert.deepEqual(manifest.receivedLocales,locales);assert.equal(manifest.missingLocales.length,8);
  assert.equal(manifest.registryContentId,'hospitality');assert.equal(manifest.registryAssignmentConfirmed,false);
  assert.equal(manifest.publicationAuthorized,false);assert.ok(Object.values(manifest.gates).every(v=>v===false));
});
test('public parser source contains only identity digests and refuses private thread/turn/message identity drift',()=>{
 const code=fs.readFileSync(new URL('../../shared/scripts/adjacent-business-source.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
 const raw=source(manifest.sourcePackets.find(row=>row.key==='039').file),actual=exactAdjacentNative(raw,'039');
 for(const [part,message]of [['thread','Native thread identity drift'],['turn','Native turn identity drift'],['assistant','Native assistant identity drift']]){
  const outer=JSON.parse(raw),page=JSON.parse(outer.content[0].text),turn=page.turns.find(row=>row.id===actual.pin.turnId);
  if(part==='thread')page.thread.id='changed-private-identity';
  else if(part==='turn')turn.id='changed-private-identity';
  else turn.items.find(row=>row.id===actual.pin.assistantId).id='changed-private-identity';
  outer.content[0].text=JSON.stringify(page);
  assert.throws(()=>exactAdjacentNative(Buffer.from(JSON.stringify(outer)),'039'),new RegExp(message));
 }
});
test('separate native bundle is mandatory; a public profile cannot replace it',()=>{
  assert.throws(()=>createHospitalityEditorialInputResolver({privateRoot:null}),/HOSPITALITY_PRIVATE_ROOT_REQUIRED/);
  assert.throws(()=>createHospitalityEditorialInputResolver({privateRoot:fixtureRoot}));
  assert.throws(()=>source('registry-copy/bank_ru_native_20261003.source.json'),/UNBOUND_HOSPITALITY_PRIVATE_INPUT/);
  assert.throws(()=>hospitalitySourceManifest({contentRoot:fixtureRoot}));
});
for(const component of components)for(const locale of locales)test('real whole native/body/metadata and protected HTML: '+component+' '+locale,()=>{
  const original=JSON.stringify(registry),body=fixture(component,locale,'customer-body.md'),article=fixture(component,locale,'source-article.md'),
    metadata=JSON.parse(fixture(component,locale,'metadata.json')),pin=manifest.variants.find(v=>v.component===component&&v.locale===locale);
  assert.equal(hash(body),pin.customerBodySha256);assert.equal(hash(article),pin.sourceArticleSha256);
  assert.equal(hash(fixture(component,locale,'metadata.json')),pin.metadataSha256);
  const model=buildHospitalityComponent(registry,component,locale,{editorialPreview:true});
  assert.equal(model.customerBody,body.toString('utf8'));assert.equal(model.title,metadata.title);
  assert.equal(model.seoTitle,metadata.seoTitleLiteral);assert.equal(model.description,metadata.metaDescriptionLiteral);
  assert.equal(model.ctaLabel,metadata.ctaLabelLiteral);
  assert.equal(model.contentId,'hospitality');assert.equal(model.sourceOnly,true);assert.equal(model.completeBroadIntent,false);
  assert.equal(model.publicationAuthorized,false);assert.equal(model.serviceId,null);assert.equal(model.pricingRef,null);
  assert.equal((model.html.match(/<h1>/g)||[]).length,1);assert.equal((model.html.match(/<h2>/g)||[]).length,9);
  assert.equal((model.html.match(/<h3>/g)||[]).length,7);
  const html=renderHospitalityComponentPreview(registry,component,locale);
  assert.ok(html.includes('<title>'+escapeHtml(metadata.seoTitleLiteral)+'</title>'));
  assert.ok(html.includes('content="'+escapeHtml(metadata.metaDescriptionLiteral)+'"'));
  assert.ok(html.includes(escapeHtml(metadata.ctaLabelLiteral)+'</button>'));
  assert.match(html,/noindex,nofollow/);assert.match(html,/<button type="button" disabled /);
  assert.doesNotMatch(html,/<form|<script|<iframe|DEV3_|RU_REVIEW|registryAssignmentConfirmed|articleNativeSpan|source-article\.md/);
  assert.equal(JSON.stringify(registry),original,'No Registry mutation');
});
test('unknown and aliased locales refuse before native or local original reads',()=>{
  let reads=0;const readSource=()=>{reads++;throw Error('NO_ORIGINAL_READ');};
  for(const component of components)for(const locale of ['xx','en-US','RU',''])
    assert.equal(buildHospitalityComponent(registry,component,locale,{editorialPreview:true,readSource,readLocalSource:readSource}),null);
  assert.equal(reads,0);
});
test('unknown component and public or non-opted-in calls refuse before original reads',()=>{
  let reads=0;const readSource=()=>{reads++;throw Error('NO_ORIGINAL_READ');};
  for(const component of [undefined,null,'','hospitality','accommodation/../../','restaurant-copy'])
    assert.equal(buildHospitalityComponent(registry,component,'ru',{editorialPreview:true,readSource}),null);
  assert.equal(buildHospitalityComponent(registry,'accommodation','ru',{readSource}),null);
  assert.equal(buildHospitalityComponent(registry,'accommodation','ru',{editorialPreview:true,targetHref:()=>'/public/',readSource}),null);
  assert.equal(reads,0);
});
test('exact existing identity, candidate, Service and two-intent scope are mandatory',()=>{
  const edits=[
    r=>r.records.find(x=>x.contentId==='hospitality').candidate.route='/bali/business/new-route/',
    r=>r.records.find(x=>x.contentId==='hospitality').serviceId='new-service',
    r=>r.records.find(x=>x.contentId==='hospitality').pricingRef={price:1},
    r=>r.records.find(x=>x.contentId==='hospitality').availability='available',
    r=>r.routingPlan.bali.find(x=>x.key==='id_food').representation='page',
    r=>r.records.push({...r.records.find(x=>x.contentId==='hospitality'),contentId:'restaurant'}),
  ];
  for(const edit of edits){const copy=structuredClone(registry);edit(copy);let reads=0;
    assert.throws(()=>buildHospitalityComponent(copy,'accommodation','ru',{editorialPreview:true,readSource:()=>{reads++;throw Error('NO_READ');}}));
    assert.equal(reads,0);}
});
test('literal old OSS source URL remains unchanged while existing nib_oss preview target is exact/localized',()=>{
  for(const locale of locales){
    const model=buildHospitalityComponent(registry,'restaurant',locale,{editorialPreview:true});
    assert.ok(model.customerBody.includes('](/bali/business/oss-nib-licensing/)'));
    assert.ok(model.html.includes('href="'+previewHref('nib_oss',locale)+'"'));
    assert.ok(!model.html.includes('/oss-nib-licensing/'));
  }
  const copy=structuredClone(registry);copy.records.find(x=>x.contentId==='nib_oss').candidate.route='/wrong/';
  let reads=0;assert.throws(()=>buildHospitalityComponent(copy,'restaurant','en',{editorialPreview:true,readSource:()=>{reads++;}}));
  assert.equal(reads,0);
});
test('changed native source never substitutes a projection or partial body',()=>{
  const raw=source(manifest.sourcePackets[0].file);let reads=0;
  const broken=file=>{reads++;return file===manifest.sourcePackets[0].file?Buffer.concat([raw,Buffer.from('changed')]):source(file);};
  assert.throws(()=>buildHospitalityComponent(registry,'accommodation','ru',{editorialPreview:true,readSource:broken}));
  assert.ok(reads>0);
});
test('base private selector denies the new native family case-insensitively before lookup',()=>{
  const contentRoot=process.env.SAFR_COMPONENT_BASE_CONTENT_ROOT;assert.equal(typeof contentRoot,'string');
  const base=createEditorialInputResolver({contentRoot,privateRoot:undefined});
  for(const file of ['registry-copy/hospitality_039.source.json','registry-copy/HOSPITALITY_045.SOURCE.JSON','registry-copy/hospitality_unbound.source.json'])
    assert.throws(()=>base(file),e=>e.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
});
const token='SYNTHETIC_COMPONENT_PREVIEW_TOKEN_0123456789';
async function probe({url='/_registry/hospitality/?locale=ru&component=accommodation',method='GET',authorized=true,
  address='127.0.0.1',extraHeaders={},renderer,load=()=>registry}={}){
  const result={headers:{},body:null,next:false,loads:0,renders:0},res={setHeader:(k,v)=>result.headers[k]=v,end:v=>{result.body=v;}};
  const req={url,method,socket:{remoteAddress:address},headers:{host:'localhost',...(authorized?{authorization:'Basic '+Buffer.from('preview:'+token).toString('base64')}:{ }),...extraHeaders}};
  const wrapped=renderer?(r,id,locale,options)=>{result.renders++;return renderer(r,id,locale,options);}:undefined;
  await registryPreviewMiddleware({token,load:()=>{result.loads++;return load();},validate:()=>{},renderer:wrapped})(req,res,()=>{result.next=true;});
  return {...result,status:res.statusCode};
}
for(const component of components)for(const locale of locales)test('existing authenticated middleware reaches exact source component: '+component+' '+locale,async()=>{
  const result=await probe({url:'/_registry/hospitality/?locale='+locale+'&component='+component,
    renderer:(r,id,l,options)=>{assert.equal(id,'hospitality');assert.equal(options.component,component);
      return renderHospitalityComponentPreview(r,options.component,l);}});
  assert.equal(result.status,200);assert.equal(result.renders,1);assert.match(result.body,/disabled/);
  assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.headers['X-Robots-Tag'],'noindex, nofollow');
});
test('auth, loopback, proxy and method boundary precedes source/Registry loading',async()=>{
  for(const options of [{authorized:false},{address:'10.1.2.3'},{extraHeaders:{forwarded:'for=127.0.0.1'}},{method:'POST'}]){
    const result=await probe({...options,renderer:()=>{throw Error('NO_RENDER');},load:()=>{throw Error('NO_LOAD');}});
    assert.ok([401,405].includes(result.status));assert.equal(result.loads,0);assert.equal(result.renders,0);
  }
});
test('unknown/duplicate component, foreign identity and unknown locale return404 with zero renderer calls',async()=>{
  for(const url of ['/_registry/hospitality/?locale=xx&component=accommodation','/_registry/hospitality/?locale=ru&component=spa',
    '/_registry/hospitality/?locale=ru&component=restaurant&component=restaurant','/_registry/pma/?locale=ru&component=restaurant',
    '/_registry/hospitality/?locale=ru&locale=en&component=restaurant']){
    const r=await probe({url,renderer:()=>{throw Error('NO_RENDER');}});assert.equal(r.status,404);assert.equal(r.renders,0);
  }
});
test('component index has exactly two components in all10 locales and no whole body/public source route',async()=>{
  for(const locale of HOSPITALITY_COMPONENT_LOCALES){const html=renderHospitalityComponentIndex(registry,locale);assert.equal((html.match(/component=/g)||[]).length,2);
    assert.ok(html.includes('component=accommodation'));assert.ok(html.includes('component=restaurant'));
    assert.ok(!html.includes('## '));assert.ok(!html.includes('/restaurant-licenses/'));assert.ok(!html.includes('/accommodation-licenses/'));
    const r=await probe({url:'/_registry/hospitality/?locale='+locale,renderer:()=>{throw Error('INDEX_ONLY');}});
    assert.equal(r.status,200);assert.equal(r.renders,0);}
  for(const locale of ['xx','RU','en-US',''])assert.equal(renderHospitalityComponentIndex(registry,locale),null);
  assert.equal(hospitalityComponentHref('accommodation','ar'),'/_registry/hospitality/?locale=ar&component=accommodation');
});
test('old raw fallback cannot expose a hospitality candidate and missing renderer stays404',async()=>{
  const copy=structuredClone(registry);copy.records.find(x=>x.contentId==='hospitality').candidate.ru.bodyFile='POISONED.md';
  let reads=0;const html=renderRegistryPreview(copy,'hospitality','ru',()=>{reads++;return 'PRIVATE_SENTINEL';});
  assert.equal(reads,0);assert.doesNotMatch(html,/PRIVATE_SENTINEL|<pre>/);
  const r=await probe();assert.equal(r.status,404);assert.equal(r.renders,0);
});
test('raw/native/manifest imports including encoded case variants refuse before auth/load',async()=>{
  for(const url of ['/shared/content/registry-hospitality-component-build.v1.json?raw',
    '/@fs/shared/content/registry-hospitality-component-build.v1.json?import',
    '/shared/content/%2572egistry-hospitality-component-build.v1.json',
    '/@fs/private/registry-copy/HOSPITALITY_039.SOURCE.JSON?raw']){
    const r=await probe({url,authorized:false,renderer:()=>{throw Error('NO_RENDER');},load:()=>{throw Error('NO_LOAD');}});
    assert.equal(r.status,404);assert.equal(r.loads,0);assert.equal(r.renders,0);assert.equal(r.next,false);
  }
});
test('renderer failure remains sanitized503 and HEAD emits no component body',async()=>{
  const failed=await probe({renderer:()=>{throw Error('PRIVATE_SENTINEL');}});
  assert.equal(failed.status,503);assert.doesNotMatch(failed.body,/PRIVATE_SENTINEL/);
  const head=await probe({method:'HEAD',renderer:(r,id,l,o)=>renderHospitalityComponentPreview(r,o.component,l)});
  assert.equal(head.status,200);assert.equal(head.body,undefined);
});

test('finite local16 plan binds actual receipts and leaves all162 records/native4/intents exact',()=>{
 assert.equal(JSON.stringify(registry),registryBeforePlan);assert.deepEqual(localPlan.retainedRecord,registry.records.find(row=>row.contentId==='hospitality'));
 assert.equal(registry.records.filter(row=>row.contentId!=='hospitality').length,161);
 assert.equal(hash(JSON.stringify(registry.records.filter(row=>row.contentId!=='hospitality'))),'202b9631b2c481c8e8c1542ec1a47ecc487316f7ad972241fa49c9ca90a72bb4');
 assert.equal(hash(encoded(manifest)),HOSPITALITY_NATIVE_MANIFEST_SHA);assert.deepEqual(localPlan.manifest,localManifest);
 assert.deepEqual(localManifest.nativeReceivedLocales,['ru','en']);assert.deepEqual(localManifest.localModelLocales,HOSPITALITY_LOCAL_LOCALES);
 assert.equal(localManifest.independentModelReviewSha256,HOSPITALITY_PEER_SHA);assert.equal(localManifest.rootSourceAcceptanceSha256,HOSPITALITY_ROOT_ACCEPTANCE_SHA);
 assert.equal(localPlan.files.length,48);assert.equal(localPlan.files.filter(row=>row.private).length,16);
 for(const file of localPlan.files){const actual=file.private?localBytes.readPinned(localSourceRoot,file.path,{privateRoot:true}).bytes:publicLocalRead(file.path);
  assert.equal(hash(actual),hash(file.text),'Exact planned original/projection bytes required');}
 assert.equal(localManifest.publicationAuthorized,false);assert.equal(localManifest.registryAssignmentConfirmed,false);assert.ok(Object.values(localManifest.gates).every(value=>value===false));
});
test('opt-in CJK literal strong preserves exact visible text, escapes HTML and does not alter code or ordinary callers',()=>{
 for(const [locale,label,tail]of [['zh-Hans','直接答复：','这是 SAFRWAY'],['ja','端的な回答：','これは、SAFRWAY']]){
  const source='**'+label+'**'+tail,normal=safeMarkdown(source,{registry,locale}),opted=safeMarkdown(source,{registry,locale,literalStrong:true});
  assert.ok(normal.includes('**'+label+'**'));assert.equal(visible(opted).trim(),label+tail);
  assert.ok(opted.includes('<strong>'+label+'</strong>'));assert.ok(!opted.includes('**'));
  const code=safeMarkdown('`'+source+'`',{registry,locale,literalStrong:true});assert.ok(code.includes('<code>'+source+'</code>'));
  for(const unpaired of ['****','**'+label,label+'**'])assert.equal(safeMarkdown(unpaired,{registry,locale,literalStrong:true}),safeMarkdown(unpaired,{registry,locale}));
  const unsafe=safeMarkdown('**<img src=x onerror=alert(1)>：**'+tail,{registry,locale,literalStrong:true});
  assert.doesNotMatch(unsafe,/<img|<script|<strong[^>]+>/i);assert.ok(unsafe.includes('&lt;img'));
 }
});
for(const component of components)for(const locale of HOSPITALITY_LOCAL_LOCALES)test('complete local original + actual protected body/SEO/FAQ/CTA/RTL: '+component+' '+locale,()=>{
 const pin=localManifest.variants.find(row=>row.component===component&&row.locale===locale),body=publicLocalRead(pin.bodyFile).toString('utf8'),metadata=localMeta(pin);
 validateHospitalityLocalOriginal(registry,component,locale,metadata,body,{readSource:localReader});
 assert.equal(body,localInputs.get(component+'/'+locale).get(locale+'.md').toString('utf8'));
 assert.equal(metadata.sourceProvenance.kind,'LOCAL_MODEL_TRANSLATION_V1');assert.equal(metadata.sourceProvenance.nativeReceipt,null);
 assert.equal(metadata.sourceProvenance.nativeSpeakerReview,false);assert.equal(metadata.approval.legalVerification,false);assert.equal(metadata.approval.browserReview,false);
 const options={readLocalSource:localReader},model=buildHospitalityComponent(registry,component,locale,{...options,editorialPreview:true});
 assert.equal(model.customerBody,body);assert.equal(model.title,metadata.title);assert.equal(model.seoTitle,metadata.seoTitleLiteral);
 assert.equal(model.description,metadata.metaDescriptionLiteral);assert.equal(model.ctaLabel,metadata.ctaLabelLiteral);
 assert.equal(model.dir,locale==='ar'?'rtl':'ltr');assert.equal(model.sourceOnly,true);assert.equal(model.completeBroadIntent,false);
 assert.equal(model.publicationAuthorized,false);assert.equal(model.serviceId,null);assert.equal(model.pricingRef,null);assert.equal(model.sourceArticleSha256,null);
 assert.equal((model.html.match(/<h1>/g)||[]).length,1);assert.equal((model.html.match(/<h2>/g)||[]).length,9);assert.equal((model.html.match(/<h3>/g)||[]).length,7);
 assert.equal((model.html.match(/<li>/g)||[]).length,12);assert.equal(model.faq.length,7);
 const text=visible(model.html);
 for(const line of body.split('\n').filter(line=>line.trim())){
  const plain=line.replace(/^#{1,3} /,'').replace(/^- |^\d+\. /,'').replaceAll('**','').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
  assert.ok(text.includes(plain),'Missing complete customer line '+component+' '+locale+': '+JSON.stringify(plain));
 }
 for(const faq of metadata.faq){assert.equal(text.split(faq.question).length-1,1);assert.ok(text.includes(faq.answerMarkdown));}
 const html=renderHospitalityComponentPreview(registry,component,locale,options);
 assert.ok(html.includes('<html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'">'));
 assert.ok(html.includes('<title>'+escapeHtml(metadata.seoTitleLiteral)+'</title>'));assert.ok(html.includes('content="'+escapeHtml(metadata.metaDescriptionLiteral)+'"'));
 assert.ok(html.includes(escapeHtml(metadata.ctaLabelLiteral)+'</button>'));assert.match(html,/noindex,nofollow/);assert.match(html,/<button type="button" disabled /);
 assert.equal((html.match(/&amp;component=/g)||[]).length,10);
 assert.doesNotMatch(html,/<form|<script|<iframe|LOCAL_MODEL|ROOT_ACCEPTANCE|PEER_REVIEW|source\.json|\/Users\//);
 if(component==='restaurant'){
  assert.ok(body.includes('](/bali/business/oss-nib-licensing/)'));assert.ok(model.html.includes('href="'+previewHref('nib_oss',locale)+'"'));assert.ok(!model.html.includes('/oss-nib-licensing/'));
 }
});
for(const component of components)for(const locale of HOSPITALITY_LOCAL_LOCALES)test('existing auth middleware reaches local component: '+component+' '+locale,async()=>{
 const result=await probe({url:'/_registry/hospitality/?locale='+locale+'&component='+component,
  renderer:(r,id,l,options)=>{assert.equal(id,'hospitality');return renderHospitalityComponentPreview(r,options.component,l,{readLocalSource:localReader});}});
 assert.equal(result.status,200);assert.equal(result.renders,1);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.headers['X-Robots-Tag'],'noindex, nofollow');
 assert.match(result.body,/disabled/);
});
test('local original body/fields/peer/Root bytes and exact wire shape all fail closed',()=>{
 for(const component of components)for(const locale of HOSPITALITY_LOCAL_LOCALES){
  const inputs=localInputs.get(component+'/'+locale);
  for(const file of inputs.keys()){const copy=new Map(inputs);copy.set(file,Buffer.concat([copy.get(file),Buffer.from(' ')]));assert.throws(()=>parseHospitalityLocalOriginals(component,locale,copy));}
  const missing=new Map(inputs);missing.delete('ROOT_ACCEPTANCE.json');assert.throws(()=>parseHospitalityLocalOriginals(component,locale,missing));
 }
 const original=localWires.get('restaurant/ar');
 for(const mutate of [wire=>wire.sourceMode='NATIVE_RECEIVED',wire=>wire.locale='ru',wire=>wire.component='spa',wire=>wire.registryContentId='pma',wire=>wire.nativeReceipt='FAKE']){
  const wire=structuredClone(original);mutate(wire);assert.throws(()=>hospitalityLocalOriginalsFromWire(wire,'restaurant','ar'));
 }
});
for(const [name,mutate] of [
 ['body',x=>x.body+='changed'],['SEO',x=>x.meta.seoTitleLiteral+='changed'],['FAQ',x=>x.meta.faq.pop()],['CTA',x=>x.meta.ctaLabelLiteral+='changed'],
 ['direction',x=>x.meta.direction='ltr'],['mode',x=>x.meta.sourceMode='unknown'],['fake native',x=>x.meta.sourceProvenance.nativeReceipt='FAKE'],
 ['fake native QA',x=>x.meta.sourceProvenance.nativeSpeakerReview=true],['fake legal QA',x=>x.meta.approval.legalVerification=true],
 ['fake browser QA',x=>x.meta.approval.browserReview=true],['public authority',x=>x.meta.publicationAuthorized=true],
 ['record',x=>x.registry.records.find(row=>row.contentId==='hospitality').title+='changed'],
 ['intent',x=>x.registry.routingPlan.bali.find(row=>row.key==='id_food').representation='page'],
 ['OSS identity',x=>x.registry.records.find(row=>row.contentId==='nib_oss').candidate.route='/wrong/'],
 ['registry direction',x=>x.registry.locales.find(row=>row.code==='ar').dir='ltr'],
])test('local16 exact projection rejects '+name,()=>{
 const pin=localManifest.variants.find(row=>row.component==='restaurant'&&row.locale==='ar');
 const item={registry:structuredClone(registry),meta:localMeta(pin),body:publicLocalRead(pin.bodyFile).toString()};mutate(item);
 assert.throws(()=>validateHospitalityLocalProjection(item.registry,'restaurant','ar',item.meta,item.body));
});
test('local manifest, roots, file modes and selectors cannot fall back to native/base/public profile',()=>{
 assert.equal(localInventory.files.length,16);assert.throws(()=>createHospitalityLocalEditorialInputResolver({privateRoot:null}),/HOSPITALITY_LOCAL_PRIVATE_ROOT_REQUIRED/);
 assert.throws(()=>createHospitalityLocalEditorialInputResolver({privateRoot:'/no-such-hospitality-local-bundle'}));
 assert.throws(()=>localReader(manifest.sourcePackets[0].file),/UNBOUND_HOSPITALITY_LOCAL_PRIVATE_INPUT/);
 const file=localPrepared.root+'/files/'+localInventory.files[0].file;fs.chmodSync(file,0o644);
 try{assert.throws(()=>createHospitalityLocalEditorialInputResolver({privateRoot:localPrepared.root}));}finally{fs.chmodSync(file,0o600);}
 const pin=localManifest.variants.find(row=>row.component==='restaurant'&&row.locale==='ar');
 assert.throws(()=>validateHospitalityLocalOriginal(registry,'restaurant','ar',localMeta(pin),publicLocalRead(pin.bodyFile).toString(),{readSource:()=>{throw Error('LOCAL_ORIGINAL_REQUIRED');}}),/LOCAL_ORIGINAL_REQUIRED/);
 const bad=structuredClone(localManifest);bad.gates.legalReview=true;
 assert.throws(()=>validateHospitalityLocalProjection(registry,'restaurant','ar',localMeta(pin),publicLocalRead(pin.bodyFile).toString(),{manifest:bad}));
 const base=createEditorialInputResolver({contentRoot:process.env.SAFR_COMPONENT_BASE_CONTENT_ROOT,privateRoot:undefined});
 for(const pin of localInventory.files)assert.throws(()=>base(pin.file),error=>error.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
});
test('local manifest is denied by Astro and middleware before raw/import/auth/load, including encoded and case forms',async()=>{
 const config=fs.readFileSync(new URL('../astro.config.mjs',import.meta.url),'utf8');assert.ok(config.includes('**/shared/content/registry-hospitality-local-editorial-build.v1.json'));
 for(const url of ['/shared/content/registry-hospitality-local-editorial-build.v1.json?raw','/@fs/shared/content/registry-hospitality-local-editorial-build.v1.json?import',
  '/shared/content/%2572egistry-hospitality-local-editorial-build.v1.json','/SHARED/CONTENT/REGISTRY-HOSPITALITY-LOCAL-EDITORIAL-BUILD.V1.JSON']){
  const result=await probe({url,authorized:false,renderer:()=>{throw Error('NO_RENDER');},load:()=>{throw Error('NO_LOAD');}});
  assert.equal(result.status,404);assert.equal(result.loads,0);assert.equal(result.renders,0);assert.equal(result.next,false);
 }
});
