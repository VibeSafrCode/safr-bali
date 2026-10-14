import {createHash} from "node:crypto";
import publicDictionary from "../../../shared/content/generated/i18n/public.v1.json";
import liveInput from "../../../shared/content/client-ui/public-live-locales.v1.json";
import {insuranceProviders} from "../../../shared/src/insurance";

// Local public-only lookups. No shared bot, pricing or notification mutation.
export const PUBLIC_INSURANCE_LOCALES = Object.freeze(["ru", "en", "zh-Hans", "ko", "fr", "de", "ja", "hi", "es", "ar"] as const);
export type PublicInsuranceLocale = typeof PUBLIC_INSURANCE_LOCALES[number];
const livePin = "7fd35b8f19ee68d3d91e55758dba2917be4b80e3d611d682e1e95a2a564c3fae";
const publicPin = "f460406e4623997cf1a960ff0cbfb9d6d9f0772fe633df246290a8b7a80cd943";
const canonicalHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 2) + "\n").digest("hex");
if (canonicalHash(liveInput) !== livePin || canonicalHash(publicDictionary) !== publicPin)
  throw new Error("Public insurance source projection drift");
const live = new Map(liveInput.entries.map(row => [row.key, row]));

function dictionaryValue(key: string, locale: PublicInsuranceLocale): string {
  const entry = (publicDictionary.entries as Record<string, Record<string, unknown>>)[key];
  const value = entry?.[locale];
  if (typeof value !== "string" || !value) throw new Error("Missing public insurance dictionary value");
  return value;
}
function liveValue(key: string, locale: PublicInsuranceLocale): string {
  const row = live.get(key);
  const value = locale === "ru" || locale === "en" ? row?.[locale]
    : (row?.translations as Record<string, string> | undefined)?.[locale];
  if (typeof value !== "string" || !value) throw new Error("Missing public insurance source value");
  return value;
}
function assertLocale(locale: string): asserts locale is PublicInsuranceLocale {
  if (!(PUBLIC_INSURANCE_LOCALES as readonly string[]).includes(locale))
    throw new Error("Unsupported public insurance locale");
}
export function getPublicInsuranceCopy(locale: PublicInsuranceLocale) {
  assertLocale(locale);
  return {
    title: dictionaryValue("catalog.bali.insurance.name", locale),
    summary: dictionaryValue("catalog.bali.insurance.summary", locale),
    price: dictionaryValue("catalog.bali.insurance.note", locale),
    cta: dictionaryValue("ui.manager.button", locale),
    contact: liveValue("public.live.insurance.contact", locale),
    availability: liveValue("public.live.insurance.availability", locale),
    brandLink: liveValue("public.live.insurance.brandLink", locale),
  };
}
export function getPublicInsuranceProviders(locale: PublicInsuranceLocale) {
  assertLocale(locale);
  const bindings = {
    LUMA: {url: "https://www.lumahealth.com/", key: "public.live.insurance.provider.luma.description"},
    SafetyWing: {url: "https://safetywing.com/", key: "public.live.insurance.provider.safetyWing.description"},
  } as const;
  if (insuranceProviders.length !== 2 || new Set(insuranceProviders.map(provider => provider.name)).size !== 2)
    throw new Error("Public insurance provider identity drift");
  return insuranceProviders.map(provider => {
    if (!Object.hasOwn(bindings, provider.name)) throw new Error("Unknown public insurance provider");
    const binding = bindings[provider.name];
    if (provider.url !== binding.url) throw new Error("Public insurance provider URL drift");
    return {name: provider.name, url: provider.url, description: liveValue(binding.key, locale)};
  });
}
export function publicInsuranceEnquiry(country: string, brand: string, locale: PublicInsuranceLocale) {
  assertLocale(locale);
  const template = liveValue("public.live.insurance.enquiryTemplate", locale);
  const values = {brand, country};
  // Single literal substitution, never eval/repeated expansion of user values.
  return template.replace(/\$\{(brand|country)\}/g, (_token, key: "brand" | "country") => values[key]);
}
