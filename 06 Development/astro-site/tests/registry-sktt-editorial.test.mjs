import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import currentRegistry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import {skttNativeRecordForValidation} from '../scripts/registry-sktt-local-editorial-preview.mjs';
// Preserve the complete native-eight compatibility suite as its explicit
// historical stage. Current mixed-ten behavior is tested separately.
const registry={...currentRegistry,records:currentRegistry.records.map(row=>row.contentId==='sktt'?skttNativeRecordForValidation(row):row)};
import manifest from '../../shared/content/registry-sktt-editorial-build.v1.json' with {type:'json'};
import {SKTT_LOCALES,planSkttEditorialImport,encoded} from '../../shared/scripts/sktt-editorial-import.mjs';
import {SKTT_PACKETS,sha256 as sha} from '../../shared/scripts/sktt-editorial-source-readiness.mjs';
import {metadataEnvelope} from '../../shared/scripts/import-sync-bundle.mjs';
import {validateRegistry} from '../../shared/src/service-registry.mjs';
import {skttPrivateInventory,createSkttEditorialInputResolver} from '../scripts/registry-sktt-editorial-inputs.mjs';
import {createEditorialInputResolver} from '../scripts/registry-private-editorial-inputs.mjs';
import {validateSkttEditorialOriginal,validateSkttEditorialProjection} from '../scripts/registry-sktt-editorial-preview.mjs';
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {renderRegistryPreview,registryPreviewMiddleware} from '../scripts/registry-preview.mjs';
import {publicBuildEntries,publicTargetHref} from '../scripts/registry-publication.mjs';
import {preSkttRegistry} from '../../shared/tests/fixtures/pre-sktt-registry.mjs';
const root=new URL('../../shared/content/',import.meta.url),read=f=>readFileSync(new URL(f,root));
const record=registry.records.find(r=>r.contentId==='sktt'),payload=l=>l==='ru'?record.candidate.ru:record.candidate.translations[l];
const meta=l=>JSON.parse(read(payload(l).metadataFile)),source=createSkttEditorialInputResolver();
const visible=s=>s.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
test('only the SKTT record changed; all161 other records retain the reviewed HEAD9759 bytes',()=>{
  const unchanged=registry.records.filter(row=>row.contentId!=='sktt');
  assert.equal(unchanged.length,161);
  assert.equal(sha(JSON.stringify(unchanged)),'f6714f64f7f407bfca1aeaa73fd6608eb3d29e120df9a827de77e707e485577f');
  const original=encoded(registry),before=preSkttRegistry(registry);
  assert.equal(sha(encoded(before)),'60c2af4d4c643947858b19939d58bfafe6c79423cc33658613f39d9723e36f1d');
  assert.equal(encoded(registry),original,'Test history restoration never mutates current Registry');
});
test('historical SKTT reversal rejects unknown SKTT or unrelated record drift',()=>{
  for(const mutate of [r=>r.records.find(row=>row.contentId==='sktt').title+=' changed',
    r=>r.records.find(row=>row.contentId==='bank').title+=' changed']){
    const copy=structuredClone(registry);mutate(copy);assert.throws(()=>preSkttRegistry(copy));
  }
});
test('native8 source flags remain unchanged; separate Owner grant adds only ten public targets',()=>{
  const entries=publicBuildEntries();assert.equal(entries.filter(row=>!['sktt','hospitality'].includes(row.contentId)).length,630);
  assert.equal(entries.filter(row=>row.contentId==='hospitality').length,10,'Separate exact two-component grant, not SKTT source-QA promotion');
  assert.equal(entries.filter(row=>row.contentId==='sktt').length,10);
  for(const locale of registry.locales)assert.equal(publicTargetHref('sktt',locale.code),locale.prefix+record.candidate.route);
  for(const locale of SKTT_LOCALES)assert.equal(meta(locale).publicationAuthorized,false);
  assert.equal(record.published,null);assert.equal(record.release,'not_authorized');
});
test('all40 current bank/Vietnam preview and public models are unchanged by the SKTT rebase',()=>{
  const before=preSkttRegistry(registry),entries=publicBuildEntries();
  for(const id of ['bank','vietnam'])for(const locale of registry.locales){
    const entry=entries.find(row=>row.contentId===id&&row.locale===locale.code);assert.ok(entry);
    const publicOption=id==='bank'?{bankEditorialPublicEntry:entry}:{vietnamEditorialPublicEntry:entry};
    for(const options of [{editorialPreview:true},{...publicOption,targetHref:publicTargetHref}]){
      assert.deepEqual(buildRegistryDocument(registry,id,locale.code,options),buildRegistryDocument(before,id,locale.code,options));
    }
  }
});
test('existing single identity and eight explicit source locales, not ten or publication',()=>{
  validateRegistry(registry);assert.equal(registry.records.filter(r=>r.contentId==='sktt').length,1);
  assert.equal(record.kind,'document');assert.equal(record.candidate.route,'/bali/documents/sktt/');
  assert.equal(record.candidate.exposure,'preview_only');assert.equal(record.release,'not_authorized');
  for(const k of ['serviceId','pricingRef','published'])assert.equal(record[k],null);
  assert.equal(record.bindingStatus,'unresolved');assert.equal(record.availability,'not_verified');
  assert.deepEqual(manifest.receivedLocales,SKTT_LOCALES);assert.deepEqual(manifest.missingLocales,['hi','ar']);
  assert.equal(manifest.fullTenLocaleSourceComplete,false);assert.ok(Object.values(manifest.publicationGates).every(v=>v===false));
});
for(const l of SKTT_LOCALES)test('whole original and actual shared renderer preserve '+l,()=>{
  const m=meta(l),body=read(payload(l).bodyFile).toString('utf8');
  validateSkttEditorialOriginal(record,l,payload(l),m,body,{readSource:source});
  const model=buildRegistryDocument(registry,'sktt',l,{editorialPreview:true});
  assert.equal(model.title,m.h1);assert.equal(model.seoTitle,m.seo.title);assert.equal(model.description,m.seo.description);
  assert.equal(model.dir,'ltr');assert.equal(model.sections.length,3);assert.equal(model.faqSchema.length,2);
  assert.equal(model.managerLabel,m.cta[0].label);assert.equal(model.ctaActions.length,1);
  assert.equal(model.price,null);assert.equal(model.pricingHref,null);
  assert.equal(model.diagnostics.editorialPreview,true);assert.equal(model.diagnostics.qaMethod,l==='ru'?'supplied_ru_review_pending':'supplied_model_pending_render');
  assert.equal(model.languages.filter(x=>x.href).length,8);
  assert.ok(model.languages.filter(x=>['hi','ar'].includes(x.code)).every(x=>x.href===null));
  const html=[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join('\n'),text=visible(html);
  assert.equal((html.match(/<table>/g)||[]).length,0);
  for(const line of body.split('\n').filter(x=>x.trim()&&!/^#/.test(x)))assert.ok(text.includes(line.replace(/\*\*/g,'').trimEnd()),'Missing customer paragraph '+l);
  for(const faq of m.faq){assert.equal(text.split(faq.question).length-1,1);assert.equal(text.split(faq.answerMarkdown).length-1,1);}
  assert.doesNotMatch(html,/DEV4_|RU_REVIEW|CONTENT_DRAFTS_RU_EN|NATIVE_TEXT_LF_FRAMED/);
  assert.equal(body.split('\n').filter(x=>/^\*\*.*\*\* {2}$/.test(x)).length,2,'Literal FAQ trailing spaces');
});
test('missing Hindi/Arabic/foreign never read or substitute Russian',()=>{
  for(const locale of ['hi','ar','xx']){let reads=0;assert.equal(buildRegistryDocument(registry,'sktt',locale,{editorialPreview:true,readBody:()=>{reads++;throw Error('NO_READ');}}),null);assert.equal(reads,0);}
});
test('source opt-in cannot turn into public authority',()=>{
  for(const l of SKTT_LOCALES){assert.equal(buildRegistryDocument(registry,'sktt',l),null);assert.equal(buildRegistryDocument(registry,'sktt',l,{editorialPreview:true,targetHref:()=>'/public/'}),null);}
});
test('pure import reuses exact whole packets and does not mutate its input',()=>{
  const before=structuredClone(registry),pre=structuredClone(registry);
  pre.records[pre.records.findIndex(r=>r.contentId==='sktt')]={contentId:'sktt',kind:'document',title:'Сопровождение оформления SKTT',parentId:'documents',relatedContentIds:[],serviceId:null,pricingRef:null,bindingStatus:'unresolved',availability:'not_verified',bindingEvidence:[],published:null,candidate:{route:'/bali/documents/sktt/',exposure:'preview_only',revision:'SYNC-2:sktt:draft1',ru:{status:'missing',bodyFile:null,bodySha256:null,approvalEvidence:null,approvalRevision:null},translations:{}},reuseRoutes:[],mergeTargetId:null,duplicateRisk:null,release:'not_authorized',inlineLinkTargets:[]};
  const preBytes=encoded(pre),archives=new Map(SKTT_PACKETS.map(p=>{const sample=SKTT_LOCALES.find(l=>meta(l).sourceProvenance.task===p.task);return [p.task,Buffer.from(JSON.parse(source(meta(sample).sourceFile)).archive)];}));
  const result=planSkttEditorialImport(pre,archives,{metadataEnvelope});
  assert.equal(encoded(pre),preBytes);assert.deepEqual(registry,before);assert.deepEqual(result.record,record);assert.deepEqual(result.manifest,manifest);
  assert.equal(result.files.length,24);assert.equal(result.files.filter(f=>f.private).length,8);
  // Original envelopes are never required inside the repository or public
  // derivative. Reuse only the separate exact eight-input private bundle.
  for(const file of result.files)assert.equal(sha(file.text),sha(file.private?source(file.path):read(file.path)));
  const wrong=new Map(archives);wrong.delete('045');assert.throws(()=>planSkttEditorialImport(pre,wrong,{metadataEnvelope}));
});
test('separate eight original inventory rejects absent root and unrelated source',()=>{
  assert.equal(skttPrivateInventory().files.length,8);
  assert.throws(()=>createSkttEditorialInputResolver({privateRoot:null}),/SKTT_PRIVATE_ROOT_REQUIRED/);
  assert.throws(()=>createSkttEditorialInputResolver({privateRoot:'/no-sktt-bundle'}));
  assert.throws(()=>source('registry-copy/bank_ru_native_20261003.source.json'),/UNBOUND_SKTT_PRIVATE_INPUT/);
  const base=createEditorialInputResolver();for(const pin of skttPrivateInventory().files)assert.throws(()=>base(pin.file),e=>e.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
});
test('public verification profile never substitutes for mandatory SKTT original',()=>{
  assert.throws(()=>buildRegistryDocument(registry,'sktt','en',{editorialPreview:true,readSkttSource:()=>{throw Error('ORIGINAL_REQUIRED');}}),/ORIGINAL_REQUIRED/);
  assert.throws(()=>validateSkttEditorialOriginal(record,'en',payload('en'),meta('en'),read(payload('en').bodyFile).toString('utf8'),{readSource:()=>Buffer.from('{}')}),/SKTT private source bytes drift/);
});
test('base240 raw selector deny is case-insensitive and precedes filesystem lookup',()=>{
  const base=createEditorialInputResolver();
  for(const file of ['registry-copy/SKTT_EN_NATIVE_20261003.source.json','registry-copy/sktt_unreceived.source.json'])
    assert.throws(()=>base(file),e=>e.code==='UNBOUND_PRIVATE_INPUT_SELECTOR');
});
for(const [name,edit] of [
  ['body',x=>x.body+='\nEdited'],['SEO',x=>x.meta.seo.title+=' Edited'],['leading whitespace',x=>x.body=' '+x.body],
  ['FAQ whitespace',x=>x.body=x.body.replace(/\*\* {2}\n/,'**\n')],['FAQ',x=>x.meta.faq.pop()],['CTA',x=>x.meta.cta=[]],
  ['identity',x=>x.record.contentId='sktt-copy'],['Service',x=>x.record.serviceId='new-service'],['price',x=>x.record.pricingRef={}],
  ['availability',x=>x.record.availability='available'],['publication',x=>x.meta.publicationAuthorized=true],
  ['fake QA',x=>x.meta.approval.legalVerification=true],['locale',x=>x.meta.locale='ru'],['direction',x=>x.meta.direction='rtl'],
  ['raw source',x=>x.meta.archive='PRIVATE_SENTINEL'],['record source revision',x=>x.record.candidate.revision='other'],
])test('version-bound rejection: '+name,()=>{const x={record:structuredClone(record),meta:meta('en'),body:read(payload('en').bodyFile).toString('utf8')};edit(x);assert.throws(()=>validateSkttEditorialProjection(x.record,'en',x.record.candidate.translations.en,x.meta,x.body));});
test('manifest cannot silently add missing translations or claim review',()=>{
  for(const edit of [m=>m.fullTenLocaleSourceComplete=true,m=>m.missingLocales=[],m=>m.publicationGates.legalVerification=true,m=>m.records[0].locales.hi=m.records[0].locales.en]){
    const copy=structuredClone(manifest);edit(copy);assert.throws(()=>validateSkttEditorialProjection(record,'en',payload('en'),meta('en'),read(payload('en').bodyFile).toString('utf8'),{manifest:copy}));
  }
});
test('legacy raw preview never consumes SKTT source',()=>{
  let reads=0;const copy=structuredClone(registry),r=copy.records.find(x=>x.contentId==='sktt');
  r.candidate.ru.metadataFile=null;r.candidate.ru.bodyFile='POISONED_SOURCE.md';
  const html=renderRegistryPreview(copy,'sktt','ru',()=>{reads++;return 'PRIVATE_SENTINEL';});
  assert.equal(reads,0);assert.doesNotMatch(html,/PRIVATE_SENTINEL|<pre>/);
});
const token='SYNTHETIC_SKTT_PREVIEW_TOKEN_0123456789';
async function probe({url='/_registry/sktt/?locale=ru',renderer}={}){
  const result={headers:{},body:null,next:false},res={setHeader:(k,v)=>result.headers[k]=v,end:value=>result.body=value};
  const req={url,method:'GET',socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost',authorization:'Basic '+Buffer.from('preview:'+token).toString('base64')}};
  await registryPreviewMiddleware({token,load:()=>registry,validate:()=>{},renderer})(req,res,()=>{result.next=true;});return {...result,status:res.statusCode};
}
test('missing/null renderer remains 404; rejected renderer remains 503 without private echo',async()=>{
  for(const renderer of [undefined,()=>null,async()=>null]){const r=await probe({renderer});assert.equal(r.status,404);assert.equal(r.body,'Not found');}
  const r=await probe({renderer:()=>{throw Error('PRIVATE_SENTINEL');}});assert.equal(r.status,503);assert.doesNotMatch(r.body,/PRIVATE_SENTINEL/);
});
test('new manifest and raw copies denied before raw/import loaders',async()=>{
  for(const url of ['/shared/content/registry-sktt-editorial-build.v1.json?raw','/@fs/shared/content/registry-sktt-editorial-build.v1.json?import','/shared/content/%2572egistry-sktt-editorial-build.v1.json','/shared/content/registry-copy/sktt_ru_native_20261003.source.json']){
    const r=await probe({url});assert.equal(r.status,404);assert.equal(r.next,false);assert.equal(r.headers['Cache-Control'],'no-store');
  }
});
