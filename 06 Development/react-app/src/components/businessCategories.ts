export const BUSINESS_CATEGORIES = [
  { id: 'visas', ru: 'Визы', en: 'Visas', icon: '▣' },
  { id: 'bikes', ru: 'Байки', en: 'Bikes', icon: 'bike' },
  { id: 'housing', ru: 'Жильё', en: 'Housing', icon: '⌂' },
  { id: 'insurance', ru: 'Страхование', en: 'Insurance', icon: 'shield' },
  { id: 'assistance', ru: 'Помощь', en: 'Assistance', icon: '◌' },
  { id: 'other', ru: 'Другие услуги', en: 'Other services', icon: '✦' },
] as const;

export type BusinessCategory = typeof BUSINESS_CATEGORIES[number]['id'];
export type BusinessSource = Record<string, unknown>;
export type BusinessData = { visa_types?: BusinessSource[]; services?: BusinessSource[] };
export type BusinessPriceIdentity = {
  entity_type: 'VISA' | 'SERVICE'; entity_key: string; sku?: string;
  option_code?: string; label_ru?: string; label_en?: string;
};
export type BusinessEntityGroup<T extends BusinessPriceIdentity = BusinessPriceIdentity> = {
  id: string; entityType: 'visa' | 'service'; entityKey: string;
  category: BusinessCategory; source?: BusinessSource;
  variants: Array<{ item: T; index: number }>;
};

export function businessCategory(item: { entity_type?: string; entity_key?: string; slug?: string; category?: string }): BusinessCategory {
  if (item.entity_type === 'VISA') return 'visas';
  const key = `${item.entity_key ?? item.slug ?? ''} ${item.category ?? ''}`.toLowerCase();
  if (/^visa(?:$|[- ])/.test(key) || /(?:^|\s)(visas|визы)(?:$|\s)/.test(key)) return 'visas';
  if (/(bike|scooter|байк|скутер)/.test(key)) return 'bikes';
  if (/(housing|accommodation|villa|жиль|аренда жилья)/.test(key)) return 'housing';
  if (/(insurance|страх)/.test(key)) return 'insurance';
  if (/(assistance|support|consult|soft-landing|transfer|помощ|поддерж|консульт|трансфер)/.test(key)) return 'assistance';
  return 'other';
}

// Settings and prices are separate APIs. Join only explicit type/key identities;
// a missing price or SKU must never hide an entity from the settings inventory.
export function groupBusinessEntities<T extends BusinessPriceIdentity>(data: BusinessData | null | undefined, prices: readonly T[]): BusinessEntityGroup<T>[] {
  const groups = new Map<string, BusinessEntityGroup<T>>();
  const addSources = (sources: BusinessSource[], entityType: 'visa' | 'service') => {
    sources.forEach((source, index) => {
      const entityKey = String((entityType === 'visa' ? source.code : source.slug) ?? '').trim();
      const id = entityKey ? `${entityType}:${entityKey}` : `${entityType}:missing-key:${source.id ?? index}`;
      groups.set(id, {
        id, entityType, entityKey, source, variants: [],
        category: businessCategory({ entity_type: entityType === 'visa' ? 'VISA' : 'SERVICE', entity_key: entityKey, category: String(source.category ?? '') }),
      });
    });
  };
  addSources(data?.visa_types ?? [], 'visa');
  addSources(data?.services ?? [], 'service');
  prices.forEach((item, index) => {
    const entityType = item.entity_type === 'VISA' ? 'visa' : 'service';
    const entityKey = item.entity_key;
    const id = `${entityType}:${entityKey}`;
    const group = groups.get(id) ?? { id, entityType, entityKey, category: businessCategory(item), variants: [] };
    group.variants.push({ item, index });
    groups.set(id, group);
  });
  return [...groups.values()];
}

export function businessEntityLabel(group: BusinessEntityGroup, locale: 'ru' | 'en') {
  const name = group.source?.[locale === 'ru' ? 'name_ru' : 'name_en'] ?? group.source?.name;
  if (typeof name === 'string' && name.trim()) return name;
  if (group.entityType === 'visa' || group.variants.length !== 1) return group.entityKey || (locale === 'ru' ? 'Без названия' : 'Unnamed');
  const price = group.variants[0]?.item;
  return (locale === 'ru' ? price?.label_ru : price?.label_en) || group.entityKey || (locale === 'ru' ? 'Без названия' : 'Unnamed');
}

export function businessEntityMatches(group: BusinessEntityGroup, category: string, query: string) {
  if (category !== 'all' && group.category !== category) return false;
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [group.entityKey, group.source?.name, group.source?.name_ru, group.source?.name_en, group.source?.description, group.source?.category,
    ...group.variants.flatMap(({ item }) => [item.sku, item.option_code, item.label_ru, item.label_en]),
  ].filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().includes(needle);
}

export function businessEntityAvailability(group: BusinessEntityGroup): boolean | null {
  const value = group.entityType === 'visa' ? group.source?.active : group.source?.is_active;
  return typeof value === 'boolean' ? value : null;
}
