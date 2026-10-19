/**
 * Source-only client catalog projection; not wired into catalog.ts or a picker.
 * All145 catalog fields now have source coverage; no RU/EN fallback. Original RU/EN
 * customer/identity/visibility fields remain literal. No Admin/backend access.
 */
import projection from "../../../shared/content/client-ui/client-catalog-runtime.v1.json";
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';

import {CLIENT_CATALOG_LOCALES,CLIENT_CATALOG_RUNTIME_BYTES,CLIENT_CATALOG_RUNTIME_SHA256,type ClientCatalogLocale,type ClientVisaArticle} from "./client-catalog-model";
import {guard,same,frozen,sha256,isClientCatalogLocale} from "./client-catalog-integrity";
import {createClientCatalogProjectionApi} from "./client-catalog-projection";
export * from "./client-catalog-model";
export {isClientCatalogLocale} from "./client-catalog-integrity";

/** Input is pinned canonical UTF-8 bytes, never an untrusted object/getter. */
export function createClientCatalogLookup(input: unknown) {
  guard(typeof input === "string" || input instanceof Uint8Array,
    "CLIENT_CATALOG_INPUT_TYPE");
  guard(typeof input !== "string" || input.length <= CLIENT_CATALOG_RUNTIME_BYTES,
    "CLIENT_CATALOG_INPUT_BOUNDARY");
  guard(typeof input === "string" || input.byteLength === CLIENT_CATALOG_RUNTIME_BYTES,
    "CLIENT_CATALOG_INPUT_BOUNDARY");
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input) : new Uint8Array(input);
  guard(bytes.byteLength === CLIENT_CATALOG_RUNTIME_BYTES,
    "CLIENT_CATALOG_INPUT_BOUNDARY");
  guard(sha256(bytes) === CLIENT_CATALOG_RUNTIME_SHA256,
    "CLIENT_CATALOG_PIN_DRIFT");
  let wire: string;
  try {wire = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);}
  catch {throw new Error("CLIENT_CATALOG_INVALID_UTF8");}
  const data = JSON.parse(wire);
  guard(wire === JSON.stringify(data, null, 2) + "\n",
    "CLIENT_CATALOG_NONCANONICAL_BYTES");
  guard(same(Object.keys(data), ["schemaVersion", "domain", "locales",
    "destinationIds", "baseDestinations", "bikes", "fields", "heldKeys", "articles"]) &&
    data.schemaVersion === 1 && data.domain === "client-catalog" &&
    same(data.locales, CLIENT_CATALOG_LOCALES) &&
    same(data.destinationIds, ["bali", "thailand", "russia", "nepal", "uae"]) &&
    same(data.baseDestinations.map((row: {id: string}) => row.id), data.destinationIds),
    "CLIENT_CATALOG_SCHEMA");
  const keys = Object.keys(data.fields);
  guard(keys.length === 145 && same(keys, [...keys].sort()) &&
    keys.every(key => key.startsWith("catalog.") &&
      !key.split(".").some(part => ["__proto__", "constructor", "prototype"].includes(part))),
    "CLIENT_CATALOG_KEYS");
  guard(same(data.heldKeys, []),
    "CLIENT_CATALOG_HOLD_IDENTITY");
  const fields = new Map<string, Readonly<any>>();
  for (const key of keys) {
    const row = data.fields[key];
    const expectedLocales = row.recipe === "registry_full_body"
      ? ["ru", "en"] : CLIENT_CATALOG_LOCALES;
    guard(same(Object.keys(row.values), expectedLocales), "CLIENT_CATALOG_FIELD_LOCALES");
    guard(typeof row.values.ru === "string" && typeof row.values.en === "string",
      "CLIENT_CATALOG_FIELD_SOURCE");
    if (row.recipe === "source_hold") {
      guard(data.heldKeys.includes(key) && CLIENT_CATALOG_LOCALES.slice(2)
        .every(locale => row.values[locale] === null), "CLIENT_CATALOG_FALSE_HOLD");
    } else if (row.recipe !== "registry_full_body") {
      guard(CLIENT_CATALOG_LOCALES.every(locale => typeof row.values[locale] === "string"),
        "CLIENT_CATALOG_MISSING_TEXT");
    }
    fields.set(key, frozen(row));
  }
  const articles = new Map<string, ClientVisaArticle>();
  const visaIds = ["e33g", "d12", "d1_d2", "c1", "voa"];
  guard(data.articles.length === 50, "CLIENT_CATALOG_ARTICLE_SCOPE");
  for (const article of data.articles) {
    guard(visaIds.includes(article.contentId) && isClientCatalogLocale(article.locale) &&
      article.dir === (article.locale === "ar" ? "rtl" : "ltr") &&
      typeof article.bodyMarkdown === "string" && article.bodyMarkdown.length > 0 &&
      /^[a-f0-9]{64}$/.test(article.bodySha256) &&
      /^[a-f0-9]{64}$/.test(article.metadataSha256) &&
      Array.isArray(article.sections) &&
      (article.faqSchema === null || Array.isArray(article.faqSchema)),
      "CLIENT_CATALOG_ARTICLE_IDENTITY");
    const key = article.contentId + "/" + article.locale;
    guard(!articles.has(key), "CLIENT_CATALOG_DUPLICATE_ARTICLE");
    articles.set(key, frozen(article));
  }
  guard(visaIds.every(id => CLIENT_CATALOG_LOCALES.every(locale =>
    articles.has(id + "/" + locale))), "CLIENT_CATALOG_ARTICLE_LOCALE_GAP");
  const text = (key: string, locale: ClientCatalogLocale): string | null => {
    const row = fields.get(key);
    guard(row, "CLIENT_CATALOG_UNKNOWN_FIELD");
    return row.recipe === "registry_full_body" && locale !== "ru" && locale !== "en"
      ? articles.get(row.contentId + "/" + locale)!.bodyMarkdown : row.values[locale];
  };
  return Object.freeze({
    ...createClientCatalogProjectionApi(data,text),
    visaArticle(visaId: unknown, locale: unknown): ClientVisaArticle {
      guard(typeof visaId === "string" &&
        ["e33g", "d12", "d1-d2", "c1", "voa"].includes(visaId),
        "CLIENT_CATALOG_UNKNOWN_VISA");
      guard(isClientCatalogLocale(locale), "CLIENT_CATALOG_UNKNOWN_LOCALE");
      return articles.get((visaId === "d1-d2" ? "d1_d2" : visaId) + "/" + locale)!;
    },
  });
}
// No Main-only dataset evaluation in the existing Yoga RUEN build. This is not
// a source fallback: a misplaced Main consumer fails explicitly. Main retains
// the original hash/identity/completeness checks on the original JSON bytes.
const lookup = YOGA_MINI_APP ? null :
  createClientCatalogLookup(JSON.stringify(projection, null, 2) + "\n");
function requireLookup(){
  if(!lookup)throw new Error("CLIENT_CATALOG_MAIN_BUILD_ONLY");
  return lookup;
}
type Lookup = ReturnType<typeof createClientCatalogLookup>;
export const inspectClientCatalogProjection = (...args:Parameters<Lookup['inspect']>) => requireLookup().inspect(...args);
export const clientCatalogDestinations = (...args:Parameters<Lookup['destinations']>) => requireLookup().destinations(...args);
export const inspectClientCatalogActiveServices = (...args:Parameters<Lookup['activeServices']>) => requireLookup().activeServices(...args);
export const clientCatalogVisaArticle = (...args:Parameters<Lookup['visaArticle']>) => requireLookup().visaArticle(...args);
