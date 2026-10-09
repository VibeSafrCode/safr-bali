import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateFamilyBuild,FAMILY_GATE_KEYS} from '../scripts/registry-family-kitas-publication.mjs';
import {publicBuildEntries,publicEntryForRoute,publicTargetHref,publicAlternatesForRoute,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
const root=new URL('../../shared/content/',import.meta.url),readContent=file=>readFileSync(new URL(file,root));
const build=JSON.parse(readContent('registry-family-kitas-build.v1.json')),registry=JSON.parse(readContent('service-registry.v1.json'));
test('fifty exact locale routes construct full models without inventing actual readiness, alternates or extra indexable duplicates',()=>{
  const entries=validateFamilyBuild(build,registry,{readContent});assert.equal(entries.length,50);assert.equal(publicBuildEntries().length,370);
  let faqCount=0,tableCount=0;
  for(const entry of entries) {
    assert.equal(entry.indexable,false);assert.deepEqual(publicEntryForRoute(entry.route),entry);assert.deepEqual(publicAlternatesForRoute(entry.route),[]);
    assert.equal(publicTargetHref(entry.contentId,entry.locale),entry.route);
    const model=buildPublicRegistryModel(entry),html=model.directHtml+model.factHtml+model.sections.map(s=>s.html).join('');
    assert.equal(model.dir,entry.locale==='ar'?'rtl':'ltr');assert.equal(model.sourceContext.source_revision,entry.sourceRevision);assert.equal(model.sourceContext.content_id,entry.contentId);
    assert.equal(model.ctaActions.length,entry.contentId==='family'?2:1);assert.ok(model.ctaActions.every(action=>action.manager&&action.href===null));
    assert.ok(!/\*\*Status|Content intent|Proposed route|Primary button:|Secondary button:|RU_REVIEW/.test(html),'No editorial preamble/button-field labels');
    const metadata=JSON.parse(readContent(build.records.find(r=>r.contentId===entry.contentId).locales[entry.locale].metadataFile));
    assert.equal(model.faqSchema.length,metadata.faq.length);faqCount+=model.faqSchema.length;tableCount+=(html.match(/<table>/g)??[]).length;
    const visibleText=html.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");
    for(const item of model.faqSchema)assert.equal(visibleText.split(item.question).length-1,1,'FAQ shown exactly once');
    assert.equal(model.seoTitle,metadata.seo_title);assert.equal(model.description,metadata.seo_description);
  }
  assert.equal(faqCount,270);assert.equal(tableCount,10);assert.ok(FAMILY_GATE_KEYS.every(key=>build.publicationGates[key]===false));
  assert.equal(publicEntryForRoute('/bali/visas/family-kitas/child/'),null);assert.equal(publicEntryForRoute('/bali/visas/family-kitas/parent/'),null);
});
test('source, metadata, quote policy, direction, source revision and unsupported readiness drift fail closed',()=>{
  const pin=build.records[0].locales.ru;
  assert.throws(()=>validateFamilyBuild(build,registry,{readContent:file=>file===pin.bodyFile?Buffer.from(readContent(file).toString()+'drift'):readContent(file)}));
  const sourceChanged=structuredClone(build);sourceChanged.records[0].sourceRevision='sha256:'+'0'.repeat(64);assert.throws(()=>validateFamilyBuild(sourceChanged,registry,{readContent}));
  const dirChanged=structuredClone(build);dirChanged.records[0].locales.ar.direction='ltr';assert.throws(()=>validateFamilyBuild(dirChanged,registry,{readContent}));
  const priced=structuredClone(registry);priced.records.find(r=>r.contentId==='family').pricingRef={entityType:'VISA',entityKey:'E33G',optionCodes:['standard']};assert.throws(()=>validateFamilyBuild(build,priced,{readContent}));
  const fakeReady=structuredClone(build);for(const key of FAMILY_GATE_KEYS)fakeReady.publicationGates[key]=true;fakeReady.stage='LOCAL_READY_NO_DEPLOY';
  assert.throws(()=>validateFamilyBuild(fakeReady,registry,{readContent}));
});
