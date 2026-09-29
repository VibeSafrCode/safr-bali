import test from "node:test";
import assert from "node:assert/strict";
import { businessCategory, businessEntityAvailability, businessEntityLabel, businessEntityMatches, groupBusinessEntities, BUSINESS_CATEGORIES, type BusinessPriceIdentity } from "../src/components/businessCategories";

test("business categories group the canonical keys without changing their identity", () => {
  for (const [item, expected] of [
    [{ entity_type: "VISA", entity_key: "E33G" }, "visas"],
    [{ entity_type: "SERVICE", entity_key: "visa-extension" }, "visas"],
    [{ entity_key: "villa-rental" }, "housing"],
    [{ entity_key: "bike-rental" }, "bikes"],
    [{ entity_key: "transfer" }, "assistance"],
    [{ entity_key: "unknown", category: "Transport" }, "other"],
    [{ category: "страховка" }, "insurance"],
    [{ entity_key: "soft-landing" }, "assistance"],
    [{ entity_key: "unknown" }, "other"],
  ] as const) assert.equal(businessCategory(item), expected);
});

test("business navigation has the shared six categories in the agreed order", () => {
  assert.deepEqual(BUSINESS_CATEGORIES.map(category => category.ru), ["Визы", "Байки", "Жильё", "Страхование", "Помощь", "Другие услуги"]);
});

const prices: BusinessPriceIdentity[] = [
  { entity_type: "VISA", entity_key: "D12", sku: "d12-standard", option_code: "one-year-standard", label_ru: "D12 · 1 год", label_en: "D12 · 1 year" },
  { entity_type: "VISA", entity_key: "D12", sku: "d12-express", option_code: "two-year-express", label_ru: "D12 · 2 года срочно", label_en: "D12 · 2 years express" },
  { entity_type: "SERVICE", entity_key: "bike", sku: "bike-default", label_ru: "Аренда байка", label_en: "Bike rental" },
];

test("grouping retains every settings entity including missing price, missing key and unknown category", () => {
  const data = {
    visa_types: [{ code: "D12", name: "Бизнес-виза", active: true }, { code: "E33G", name: "Удалённая работа", active: false }],
    services: [
      { slug: "bike", name: "Байки", is_active: true },
      { slug: "insurance", name: "Страхование" },
      { slug: "new-service", name: "Новая услуга", category: "unmapped" },
      { id: 91, name: "Услуга без ключа", category: "unmapped" },
    ],
  };
  const before = JSON.stringify({ data, prices });
  const groups = groupBusinessEntities(data, prices);
  assert.equal(groups.length, 6);
  assert.deepEqual(groups.find(group => group.entityKey === "D12")?.variants.map(variant => variant.index), [0, 1]);
  assert.equal(groups.find(group => group.entityKey === "insurance")?.variants.length, 0);
  assert.equal(groups.find(group => group.entityKey === "new-service")?.category, "other");
  assert.equal(groups.find(group => group.source?.id === 91)?.entityKey, "");
  assert.equal(JSON.stringify({ data, prices }), before, "grouping must not mutate API data or price drafts");
});

test("price-only entities remain visible without claiming availability or joining a different entity type", () => {
  const groups = groupBusinessEntities({ services: [{ slug: "D12", name: "Separate service", is_active: false }] }, prices);
  assert.equal(groups.length, 3);
  const visa = groups.find(group => group.id === "visa:D12")!;
  const service = groups.find(group => group.id === "service:D12")!;
  assert.equal(visa.variants.length, 2);
  assert.equal(service.variants.length, 0);
  assert.equal(businessEntityAvailability(visa), null);
  assert.equal(businessEntityAvailability(service), false);
  assert.equal(businessEntityLabel(visa, "ru"), "D12", "a variant label is not the entity name");
});

test("search matches canonical names and any price variant within the same category", () => {
  const groups = groupBusinessEntities({ visa_types: [{ code: "D12", name: "Бизнес-виза" }] }, prices);
  const visa = groups.find(group => group.id === "visa:D12")!;
  assert.equal(businessEntityMatches(visa, "visas", " БИЗНЕС "), true);
  assert.equal(businessEntityMatches(visa, "all", "two-year-express"), true);
  assert.equal(businessEntityMatches(visa, "visas", "срочно"), true);
  assert.equal(businessEntityMatches(visa, "bikes", "D12"), false);
  assert.equal(businessEntityMatches(visa, "visas", "unrelated"), false);
  assert.equal(businessEntityLabel(visa, "ru"), "Бизнес-виза");
});

test("entity identities survive settings version changes and unknown activity stays unknown", () => {
  const before = groupBusinessEntities({ services: [{ slug: "insurance", settings_version: 1 }] }, []);
  const after = groupBusinessEntities({ services: [{ slug: "insurance", settings_version: 2, is_active: "false" }] }, []);
  assert.equal(before[0].id, after[0].id);
  assert.equal(businessEntityAvailability(before[0]), null);
  assert.equal(businessEntityAvailability(after[0]), null);
});

test("settings category is shared with pricing even when the slug alone is unknown", () => {
  const groups = groupBusinessEntities({ services: [{ slug: "s1", name: "Полис", category: "insurance" }] }, [{ entity_type: "SERVICE", entity_key: "s1" }]);
  assert.equal(groups[0].category, "insurance");
  assert.equal(groups[0].variants.length, 1);
});
