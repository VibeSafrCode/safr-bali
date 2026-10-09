// Bounded Founder-supplied editorial correction. No routes, tariffs or FX.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const E33G_FAMILY_CORRECTION_SHA256 = '69b1221ee70a9310888a919baf3ba4939f7c7e968ace2a1aa28e0afc21fae066';
const dataUrl = new URL('../../shared/content/registry-copy/e33g_family_correction_20261009.json', import.meta.url);
const sourceRoot = new URL('../../shared/content/', import.meta.url);
const locales = ['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'];
const hash = value => createHash('sha256').update(value).digest('hex');

// Read-only injection supports corruption tests without editing any source.
export function loadE33GFamilyCorrection({read = readFileSync,readContent} = {}) {
  // Astro bundles import.meta.url into a prerender chunk. Reuse its pinned,
  // server-only source loader rather than reaching into the output filesystem.
  const sourceRead = file => readContent ? readContent(file) : read(new URL(file,sourceRoot));
  const bytes = readContent ? sourceRead('registry-copy/e33g_family_correction_20261009.json') : read(dataUrl);
  assert.equal(hash(bytes), E33G_FAMILY_CORRECTION_SHA256, 'E33G-family correction data drift');
  const data = JSON.parse(bytes.toString());
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.contentId, 'knowledge_e33g_family');
  assert.deepEqual(Object.keys(data.locales), locales);
  // A hreflang peer drifting must fail the whole corrected edition, not leave
  // some locales with old dependent prices while others receive the patch.
  for (const locale of locales) {
    const baseline = data.locales[locale].baseline;
    for (const [fileKey, hashKey] of [['bodyFile','bodySha256'],['metadataFile','metadataSha256']]) {
      assert.equal(hash(sourceRead(baseline[fileKey])), baseline[hashKey],
        'E33G-family baseline source drift: ' + locale + '/' + fileKey);
    }
  }
  return data;
}

function replaceOnce(value, before, after, label) {
  assert.equal(typeof value, 'string', label);
  assert.ok(before && value.includes(before), 'Missing exact E33G-family anchor: ' + label);
  assert.equal(value.split(before).length, 2, 'Ambiguous E33G-family anchor: ' + label);
  return value.replace(before, after);
}

function signature(authored) {
  const {title,seoTitle,description,intro,direct,fact,sections} = authored;
  return hash(JSON.stringify({title,seoTitle,description,intro,direct,fact,sections}));
}

export function correctE33GFamilyEditorial(authored, {contentId,locale,source,readContent}) {
  if (contentId !== 'knowledge_e33g_family') return authored;
  const data = loadE33GFamilyCorrection({readContent});
  assert.ok(locales.includes(locale), 'Unsupported E33G-family correction locale');
  const entry = data.locales[locale];
  assert.equal(typeof source, 'string', 'E33G-family source must be supplied');
  assert.equal(hash(source), entry.baseline.bodySha256, 'E33G-family supplied source drift');
  assert.equal(signature(authored), entry.baseline.authoredSha256, 'E33G-family parsed editorial drift');
  const result = structuredClone(authored);
  const {summary,mayApply,cost} = entry.supplied;
  const retainedRu = locale === 'ru' ? [entry.preservedRuChildRule.slice(2),entry.preservedRuParentRule] : [];
  result.direct = [summary,...retainedRu].join('\n\n');
  result.fact.text = [summary,...retainedRu.map(text => '- ' + text),entry.preservedFactTail].join('\n\n');
  result.intro = replaceOnce(result.intro, entry.anchors.introTail, summary, 'intro');
  for (const name of ['spouse','child']) {
    const anchor = entry.anchors[name];
    const section = result.sections[anchor.index];
    assert.equal(section.heading, anchor.heading, 'E33G-family section identity drift: ' + name);
    section.text = replaceOnce(section.text, anchor.paragraph, mayApply.answer, name);
  }
  const faq = entry.anchors.faq;
  assert.equal(result.sections[faq.index].heading, faq.heading, 'E33G-family FAQ identity drift');
  result.sections[faq.index].text = replaceOnce(result.sections[faq.index].text, faq.block,
    '### ' + mayApply.question + '\n\n' + mayApply.answer, 'after-E33G FAQ');
  const price = entry.anchors.cost;
  assert.equal(result.sections[price.index].heading, price.heading, 'E33G-family price FAQ identity drift');
  assert.equal(result.sections[price.index].text, price.text, 'E33G-family price FAQ anchor drift');
  result.sections[price.index].text = '### ' + cost.question + '\n\n' + cost.answer;
  // The legacy article's entire price section was the mistaken principal
  // standard/express FAQ. Removing it must leave no binding or stale amount.
  assert.doesNotMatch(JSON.stringify(result), /USD_12M|USD_14M|CATALOG_PRICE:|(?:12|14)[ ,.\u00a0]000[ ,.\u00a0]000/,
    'E33G-family principal price survived correction');
  return result;
}
