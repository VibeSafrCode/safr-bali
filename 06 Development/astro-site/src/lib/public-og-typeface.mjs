// Renderer metadata only. Font bytes/config live in a private build snapshot, never public output.
const latin = ["Arial", "Apple Color Emoji"];
const fallbackByLocale = {
  ru: latin, en: latin, fr: latin, de: latin, es: latin,
  "zh-Hans": ["Heiti SC", "Arial", "Apple Color Emoji"],
  ko: ["Apple SD Gothic Neo", "Arial", "Apple Color Emoji"],
  ja: ["Hiragino Sans", "Arial", "Apple Color Emoji"],
  hi: ["Devanagari Sangam MN", "Arial", "Apple Color Emoji"],
  ar: ["Geeza Pro", "Arial", "Apple Color Emoji"],
};
const rows = Object.freeze(Object.fromEntries(Object.entries(fallbackByLocale).map(([locale, families]) =>
  [locale, Object.freeze({
    locale, language: locale === "zh-Hans" ? "zh-CN" : locale,
    families: Object.freeze([...families]),
    family: families.map(family => '"' + family + '"').join(", "),
    brandFamily: "Times New Roman",
  })])));
export function publicOgTypeface(locale) {
  if (typeof locale !== "string" || !Object.hasOwn(rows, locale)) throw new Error("Unsupported public OG locale");
  return rows[locale];
}
