import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {correctE33GFamilyEditorial,loadE33GFamilyCorrection,E33G_FAMILY_CORRECTION_SHA256} from '../scripts/registry-e33g-family-correction.mjs';
import {parseStructuredEditorial,safeMarkdown,buildRegistryDocument} from '../scripts/registry-document.mjs';
import {bindAuthoredPrices} from '../scripts/registry-price-bindings.mjs';

const root = new URL('../../shared/content/', import.meta.url);
const data = loadE33GFamilyCorrection();
const registry = JSON.parse(readFileSync(new URL('service-registry.v1.json',root)));
const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-09T12:00:00Z');
const projection = {projection_id:'family-correction-principal',catalog_version_id:9,fx_snapshot_id:11,
  currency:'IDR',fx:{status:'fresh'},derived_expires_at:'2026-10-09T12:15:00Z',
  display_usd_approx_formula_version:'IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1',items:[
    {entity_type:'VISA',entity_key:'E33G',option_code:'standard',amount_idr:'12000000',show_price:true,price_qualifier:'EXACT',display_usd_approx:'725'},
    {entity_type:'VISA',entity_key:'E33G',option_code:'express',amount_idr:'14000000',show_price:true,price_qualifier:'EXACT',display_usd_approx:'850'},
  ]};

function original(locale) {
  const baseline = data.locales[locale].baseline;
  const source = readFileSync(new URL(baseline.bodyFile,root),'utf8');
  const metadata = JSON.parse(readFileSync(new URL(baseline.metadataFile,root)));
  return {source,authored:parseStructuredEditorial(source,metadata)};
}
function correct(locale,source,authored) {
  return correctE33GFamilyEditorial(authored,{contentId:'knowledge_e33g_family',locale,source});
}
function render(authored,locale) {
  const fragments = [authored.intro,authored.direct,authored.fact.text,...authored.sections.map(section=>section.text)];
  return fragments.map(fragment=>{
    const bound = bindAuthoredPrices(fragment,{contentId:'knowledge_e33g_family',publicBuild:true});
    assert.deepEqual(bound.bindings,[], 'No principal or dependent price operation on the corrected family article');
    return safeMarkdown(bound.text,{registry,locale,e33g:true});
  }).join('');
}

for (const locale of Object.keys(data.locales)) {
  test(locale + ': supplied conditional summary and individual quote render without principal amounts',()=>{
    const {source,authored} = original(locale),before = structuredClone(authored);
    const result = correct(locale,source,authored),entry = data.locales[locale];
    assert.deepEqual(authored,before,'Immutable parsed original');
    assert.notEqual(result,authored);
    assert.ok(result.direct.startsWith(entry.supplied.summary));
    assert.ok(result.fact.text.startsWith(entry.supplied.summary));
    assert.ok(result.intro.endsWith(entry.supplied.summary));
    assert.match(result.direct,/E33G/);assert.match(result.direct,/Golden[ -]Visa/);
    for (const code of ['E31B','E31E','E31H','18']) assert.ok(result.direct.includes(code),code);
    const price = result.sections[entry.anchors.cost.index];
    assert.equal(price.text,'### '+entry.supplied.cost.question+'\n\n'+entry.supplied.cost.answer);
    assert.equal((price.text.match(/^### /gm)??[]).length,1);
    assert.ok(result.sections[entry.anchors.faq.index].text.includes(entry.supplied.mayApply.answer));
    assert.equal(result.title,before.title);
    assert.equal(result.seoTitle,before.seoTitle);
    assert.equal(result.description,before.description);
    assert.equal(result.fact.heading,before.fact.heading);
    assert.equal(result.sections.length,before.sections.length);
    // Only direct/fact, intro and five explicit passage/FAQ targets can change.
    const changed = [0,2,18,19];
    before.sections.forEach((section,index)=>{
      if (!changed.includes(index)) assert.deepEqual(result.sections[index],section);
      else assert.equal(result.sections[index].heading,section.heading);
    });
    for (const target of ['spouse','child']) {
      const anchor = entry.anchors[target];
      assert.equal(result.sections[anchor.index].text,
        before.sections[anchor.index].text.replace(anchor.paragraph,entry.supplied.mayApply.answer));
    }
    assert.equal(result.sections[18].text,
      before.sections[18].text.replace(entry.anchors.faq.block,
        '### '+entry.supplied.mayApply.question+'\n\n'+entry.supplied.mayApply.answer));
    const html = render(result,locale);
    assert.match(html,/E31B/);assert.match(html,/E31E/);assert.match(html,/E31H/);
    assert.doesNotMatch(html,/USD_12M|USD_14M|REGISTRY_PRICE_|data-registry-price|(?:12|14)[ ,.\u00a0]000[ ,.\u00a0]000|\$725|\$850/);
    assert.equal(hash(readFileSync(new URL(entry.baseline.bodyFile,root))),entry.baseline.bodySha256);
    assert.equal(hash(readFileSync(new URL(entry.baseline.metadataFile,root))),entry.baseline.metadataSha256);
    if (locale === 'ru') {
      assert.ok(result.direct.includes(entry.preservedRuChildRule.slice(2)));
      assert.ok(result.direct.includes(entry.preservedRuParentRule));
    }
  });
}

test('Founder patch provenance binds all ten exact excerpts, archive and data without private paths or invented certification',()=>{
  const audit = JSON.parse(readFileSync(new URL('../../../AUDIT/FAMILY_KITAS_RELEASE_2026-10-09/E33G_FAMILY_CORRECTION_SOURCES.json',import.meta.url)));
  assert.deepEqual(audit.archive,data.archive);
  assert.equal(audit.correctionData.sha256,E33G_FAMILY_CORRECTION_SHA256);
  assert.equal(data.archive.sha256,'9ee6328582ff6561b3afcc0dd9ec963cafde7e558ce621db78a603571c31a1b0');
  assert.deepEqual(audit.sourcePatches.map(({archiveEntry,sha256})=>({archiveEntry,sha256})),data.sourcePatches);
  assert.equal(audit.sourcePatches.length,4);
  for (const [locale,entry] of Object.entries(data.locales)) {
    const {sourceIndex,...excerpts} = entry.supplied;
    assert.deepEqual(audit.sourcePatches[sourceIndex].excerpts[locale],excerpts);
  }
  assert.doesNotMatch(JSON.stringify(audit),/\/Users\/|\/private\/|\/mnt\/|nativeHumanReview":true|legalVerification":true/);
});

test('data signature drift and each of twenty immutable baseline files fail closed without writes',()=>{
  assert.throws(()=>loadE33GFamilyCorrection({read:url=>{
    const bytes = readFileSync(url);
    return url.href.endsWith('e33g_family_correction_20261009.json') ? Buffer.concat([bytes,Buffer.from(' ')]) : bytes;
  }}),/correction data drift/);
  for (const entry of Object.values(data.locales)) {
    for (const key of ['bodyFile','metadataFile']) {
      const target = new URL(entry.baseline[key],root).href;
      assert.throws(()=>loadE33GFamilyCorrection({read:url=>{
        const bytes = readFileSync(url);
        return url.href === target ? Buffer.concat([bytes,Buffer.from('\n')]) : bytes;
      }}),/baseline source drift/);
    }
  }
});

test('prerender injection loads all pinned sources without output filesystem access',()=>{
  const requested=[];
  const result=loadE33GFamilyCorrection({read:()=>{throw Error('No bundled filesystem fallback');},
    readContent:file=>{requested.push(file);return readFileSync(new URL(file,root));}});
  assert.deepEqual(result,data);assert.equal(requested.length,21);
  assert.ok(requested.every(file=>file.startsWith('registry-copy/')));
  assert.throws(()=>loadE33GFamilyCorrection({readContent:file=>{
    const bytes=readFileSync(new URL(file,root));return file===requested[1]?Buffer.concat([bytes,Buffer.from(' ')]) : bytes;
  }}),/baseline source drift/);
});

test('wrong source, unknown locale, parsed anchor or unscoped editorial mutation fails closed',()=>{
  const {source,authored} = original('en');
  assert.throws(()=>correct('en',source+'\n',authored),/supplied source drift/);
  assert.throws(()=>correct('xx',source,authored),/Unsupported.*locale/);
  for (const field of ['direct','intro','title']) {
    const mutated = structuredClone(authored);mutated[field] += ' drift';
    assert.throws(()=>correct('en',source,mutated),/parsed editorial drift/);
  }
  const changedFaq = structuredClone(authored);changedFaq.sections[18].text += '\n';
  assert.throws(()=>correct('en',source,changedFaq),/parsed editorial drift/);
});

test('all other content identities are strict no-ops; principal E33G retains both actual catalog price bindings',()=>{
  const {authored} = original('en');
  for (const contentId of ['e33g','family','family_spouse','family_child','family_parent','knowledge_family_documents','c1','voa']) {
    assert.equal(correctE33GFamilyEditorial(authored,{contentId,locale:'xx',source:'unrelated'}),authored);
  }
  for (const locale of Object.keys(data.locales)) {
    const model = buildRegistryDocument(registry,'e33g',locale,{projection,now});
    const html = model.introHtml+model.directHtml+model.factHtml+model.sections.map(section=>section.html).join('');
    assert.match(html,/data-registry-price="e33g_standard"/);
    assert.match(html,/data-registry-price="e33g_express"/);
    assert.match(html,/12 000 000 IDR \(≈ \$725\)/);
    assert.match(html,/14 000 000 IDR \(≈ \$850\)/);
  }
});
