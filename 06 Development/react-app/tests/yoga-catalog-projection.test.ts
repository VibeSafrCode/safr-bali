import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {yogaCatalogTranslations, canonicalPublicI18n, yogaCatalogI18nPlugin} from '../scripts/yoga-public-i18n.mjs';

test('Yoga build projection contains exact canonical catalog RU/EN, no handwritten translations',()=>{
  const bytes=readFileSync(canonicalPublicI18n), source=JSON.parse(bytes.toString('utf8'));
  const result=yogaCatalogTranslations(source);
  const keys=Object.keys(source.entries).filter(key=>key.startsWith('catalog.'));
  assert.deepEqual(Object.keys(result.entries),keys);
  for(const key of keys) {
    assert.deepEqual(Object.keys(result.entries[key]),['ru','en']);
    assert.equal(result.entries[key].ru,source.entries[key].ru);
    assert.equal(result.entries[key].en,source.entries[key].en);
  }
  assert.ok(JSON.stringify(result).length < bytes.length / 2);
  assert.equal(createHash('sha256').update(readFileSync(canonicalPublicI18n)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  const plugin=yogaCatalogI18nPlugin();
  assert.equal(plugin.load('/unrelated/private.json'),null);
  assert.deepEqual(JSON.parse(plugin.load(canonicalPublicI18n)),result);
  assert.throws(()=>yogaCatalogTranslations({entries:{'catalog.x':{ru:'x'}}}),/Incomplete/);
});
