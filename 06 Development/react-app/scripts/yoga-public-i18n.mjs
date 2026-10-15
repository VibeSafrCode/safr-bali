import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const canonicalPublicI18n = fileURLToPath(new URL('../../shared/content/generated/i18n/public.v1.json',import.meta.url));

/** Build-time projection, never a second translation store. Catalog readers
 * construct only catalog.* keys; every selected RU/EN string stays byte-exact.
 */
export function yogaCatalogTranslations(source) {
  const entries = Object.fromEntries(Object.entries(source.entries)
    .filter(([key]) => key.startsWith('catalog.'))
    .map(([key, value]) => {
      if (typeof value.ru !== 'string' || typeof value.en !== 'string') throw new Error('Incomplete canonical RU/EN catalog entry: ' + key);
      return [key, {ru: value.ru, en: value.en}];
    }));
  if (!Object.keys(entries).length) throw new Error('Empty Yoga catalog projection');
  return {schemaVersion: source.schemaVersion, locales: ['ru','en'], entries};
}

export function yogaCatalogI18nPlugin() {
  return {
    name: 'yoga-canonical-ruen-catalog', enforce: 'pre',
    load(id) {
      if (path.resolve(id.split('?',1)[0]) !== canonicalPublicI18n) return null;
      return JSON.stringify(yogaCatalogTranslations(JSON.parse(readFileSync(canonicalPublicI18n,'utf8'))));
    },
  };
}
