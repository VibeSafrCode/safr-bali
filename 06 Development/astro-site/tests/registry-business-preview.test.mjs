import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import build from '../../shared/content/registry-business-build.v1.json' with {type:'json'};
import {buildRegistryDocument,previewHref,safeMarkdown} from '../scripts/registry-document.mjs';
import {publicBuildEntries,publicTargetHref} from '../scripts/registry-publication.mjs';
import {registryPreviewMiddleware,renderRegistryPreview} from '../scripts/registry-preview.mjs';
const read=file=>readFileSync(new URL('../../shared/content/'+file,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const plain=html=>html.replace(/<br\s*\/?[^>]*>|<\/(?:p|h[1-6]|li|ul|ol|div|blockquote)>/g,' ')
  .replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"')
  .replaceAll('&lt;','<').replaceAll('&gt;','>').replace(/\s+/gu,' ').trim();

test('60 exact Business protected models retain supplied SEO, full copy,360FAQ, CTA and quote-only identity',()=>{
  let count=0;
  for(const entry of build.records)for(const language of registry.locales) {
    const locale=language.code,record=registry.records.find(row=>row.contentId===entry.contentId);
    const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale];
    const source=read(payload.bodyFile),meta=JSON.parse(read(payload.metadataFile));
    const model=buildRegistryDocument(registry,record.contentId,locale,{editorialPreview:true});
    assert.equal(sha(source),payload.bodySha256);assert.equal(sha(read(payload.metadataFile)),payload.metadataSha256);
    assert.equal(model.title,meta.sourceRecord.seo.h1);assert.equal(model.seoTitle,meta.sourceRecord.seo.title);
    assert.equal(model.description,meta.sourceRecord.seo.description);assert.equal(model.dir,language.dir);
    assert.equal(model.faqSchema.length,6);assert.equal(model.sections.filter(section=>section.faq).length,1);
    assert.equal(model.managerLabel,meta.sourceRecord.seo.cta);
    assert.deepEqual(model.ctaActions,[{label:meta.sourceRecord.seo.cta,href:null,manager:true,intent:'existing_contact_flow'}]);
    assert.equal(model.price,null);assert.equal(model.tariffPrices,null);assert.equal(model.pricingHref,null);
    assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
    assert.equal(model.diagnostics.editorialPreview,true);assert.notEqual(model.diagnostics.qaMethod,'founder_approved');
    assert.deepEqual(model.diagnostics.unmappedTargets,[]);
    const starts=[...source.matchAll(/^## (.+)$/gm)];
    const supplied=starts.map((match,index)=>({heading:match[1],
      markdown:source.slice(match.index+match[0].length,starts[index+1]?.index??source.length).trim()}));
    assert.equal(supplied[0].markdown,meta.directAnswer);
    assert.equal(plain(model.directHtml),plain(safeMarkdown(meta.directAnswer,{registry,locale})));
    assert.equal(model.sections.length,supplied.length-1);
    model.sections.forEach((section,index)=>{
      assert.equal(section.heading,supplied[index+1].heading);
      assert.equal(plain(section.html),plain(safeMarkdown(supplied[index+1].markdown,{registry,locale})));
    });
    const html=model.introHtml+model.directHtml+model.factHtml+model.sections.map(section=>section.html).join('');
    assert.doesNotMatch(html,/data-registry-price|CATALOG_PRICE|MODEL_TRANSLATED_PENDING|RU_REVIEW/);
    assert.equal((model.sections.find(section=>section.faq).html.match(/<h3>/g)??[]).length,6);
    assert.equal(model.factHtml,''); // no invented fact block or tariff
    model.related.filter(row=>build.records.some(item=>item.contentId===row.contentId))
      .forEach(row=>assert.equal(row.lang,locale));
    count++;
  }
  assert.equal(count,60);
});

test('pending Business cannot enter public/default render, sitemap, or a public-href adapter',()=>{
  const published=publicBuildEntries();
  for(const entry of build.records)for(const {code:locale} of registry.locales) {
    assert.equal(buildRegistryDocument(registry,entry.contentId,locale),null);
    assert.equal(buildRegistryDocument(registry,entry.contentId,locale,{editorialPreview:true,targetHref:publicTargetHref}),null);
    assert.ok(!published.some(item=>item.contentId===entry.contentId));
  }
  assert.ok(Object.values(build.publicationGates).every(flag=>flag===false));
});

test('new internal Business build manifest is blocked before authorization and every Vite fallback',()=>{
  const middleware=registryPreviewMiddleware();
  for(const path of ['/registry-business-build.v1.json','/@fs/tmp/shared/content/registry-business-build.v1.json?raw',
    '/@fs/tmp/shared/content/registry-business-build.v1.json?import','/%2572egistry-business-build.v1.json']){
    let ended=false,forwarded=false;
    const response={statusCode:0,setHeader(){},end(){ended=true;}};
    middleware({url:path,headers:{},socket:{}},response,()=>{forwarded=true;});
    assert.equal(response.statusCode,404);assert.equal(ended,true);assert.equal(forwarded,false);
  }
});

test('supplied link aliases reuse existing IDs only in protected namespace and exact official URLs',()=>{
  for(const entry of build.records)for(const {code:locale} of registry.locales) {
    const model=buildRegistryDocument(registry,entry.contentId,locale,{editorialPreview:true});
    const meta=JSON.parse(read(entry.locales[locale].metadataFile));
    const html=model.directHtml+model.sections.map(section=>section.html).join('');
    for(const alias of meta.inlineLinkReconciliation)
      assert.ok(html.includes('href="'+previewHref(alias.contentId,locale)+'"'),alias.sourceRoute);
    for(const url of meta.links.filter(value=>value.startsWith('https://')))
      assert.ok(html.includes('href="'+url+'" rel="noopener noreferrer"'),url);
    assert.doesNotMatch(html,/href="\/(?:en\/|ar\/|bali\/)/);
  }
  const malicious=safeMarkdown('[x](https://oss.go.id.evil.test/x) [y](https://user@oss.go.id/id/kbli) [z](javascript:alert)',
    {registry,locale:'en',officialSourceUrls:['https://oss.go.id.evil.test/x','https://user@oss.go.id/id/kbli']});
  assert.doesNotMatch(malicious,/href=/);
  assert.throws(()=>safeMarkdown('[x](/en/bali/business/pt-pma/)',{registry,locale:'en',linkAliases:[{
    sourceRoute:'/en/bali/business/pt-pma/',status:'resolved_content_id',contentId:'pma',resolvedCanonicalRoute:'/invented/'}]}),/reconciliation/);
});

test('preview drift, stale source and fake QA fail closed without changing authored Registry',()=>{
  const original=JSON.stringify(registry),entry=build.records[0],record=registry.records.find(row=>row.contentId===entry.contentId);
  const invalid=structuredClone(registry);invalid.records.find(row=>row.contentId===entry.contentId).candidate.translations.en.qa='passed';
  assert.throws(()=>buildRegistryDocument(invalid,entry.contentId,'en',{editorialPreview:true}),/Preview never promotes/);
  const stale=structuredClone(registry);stale.records.find(row=>row.contentId===entry.contentId).candidate.translations.en.sourceRevision='stale';
  assert.equal(buildRegistryDocument(stale,entry.contentId,'en',{editorialPreview:true}),null);
  assert.throws(()=>buildRegistryDocument(registry,entry.contentId,'en',{editorialPreview:true,readBody:file=>read(file)+'\n'}),/approval drift/);
  const wrong=structuredClone(registry);wrong.records.find(row=>row.contentId===entry.contentId).candidate.translations.en.metadataSha256='0'.repeat(64);
  assert.throws(()=>buildRegistryDocument(wrong,entry.contentId,'en',{editorialPreview:true}),/approval drift/);
  assert.equal(JSON.stringify(registry),original);
  assert.equal(record.candidate.ru.status,'draft');
});

test('missing immutable Business metadata and rechecksummed RU cannot escape through legacy raw fallback',async()=>{
  const tampered=structuredClone(registry),record=tampered.records.find(row=>row.contentId==='business');
  const edited='# Edited private copy\n\nThis must never be rendered as a raw fallback.\n';
  record.candidate.ru.bodySha256=sha(edited);record.candidate.revision='sha256:'+sha(edited);
  for(const field of ['metadataFile','metadataSha256','sourceEnvelopeSha256'])delete record.candidate.ru[field];
  assert.throws(()=>buildRegistryDocument(tampered,'business','ru',{editorialPreview:true,readBody:()=>edited}),/immutable Business preview metadata/);
  assert.ok(!renderRegistryPreview(tampered,'business','ru',()=>edited).includes('Edited private copy'));
  const token='synthetic-business-preview-test-only-0123456789';
  const req={url:'/_registry/business/?locale=ru',method:'GET',headers:{host:'127.0.0.1',
    authorization:'Basic '+Buffer.from('preview:'+token).toString('base64')},socket:{remoteAddress:'127.0.0.1'}};
  const cases=[[undefined,404],[()=>null,404],
    [()=>buildRegistryDocument(tampered,'business','ru',{editorialPreview:true,readBody:()=>edited}),503]];
  for(const [renderer,status] of cases){
    const res={statusCode:0,body:'',setHeader(){},end(value){this.body=value??'';}};
    await registryPreviewMiddleware({token,load:()=>tampered,validate:()=>{},renderer})(req,res,()=>assert.fail('No fallthrough'));
    assert.equal(res.statusCode,status);assert.ok(!res.body.includes('Edited private copy'));
  }
});
