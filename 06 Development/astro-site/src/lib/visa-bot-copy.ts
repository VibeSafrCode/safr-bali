import visas from "../../../bot/app/content/visas.json" with { type: "json" };
import runtime from "../../../shared/content/generated/i18n/bot.v1.json" with { type: "json" };

const keys = {
  e33g: ["E33G", "e33g"], d12: ["D12", "d12"], "d1-d2": ["D1/D2", "d1d2"],
  c1: ["C1", "c1"], voa: ["VOA", "voa"], "other-visa": ["Другая виза", "other"],
} as const;
const entries = runtime.entries as Record<string, { ru: string; en: string }>;
const source = visas as Record<string, { text: string }>;

/** Same authored body and message fragments as bot get_visa_card.
 * Prices deliberately stay in /api/catalog/pricing, not in this static copy.
 */
export function getBotVisaCopy(route: string, locale: "ru" | "en") {
  const slug = route.replace(/^\/en\//, "/").match(/^\/bali\/visas\/([^/]+)\/$/)?.[1];
  if (!slug || !(slug in keys)) return null;
  const [key, messageKey] = keys[slug as keyof typeof keys];
  const text = (name: string) => entries[name][locale];
  const fullBody = (locale === "ru" ? source[key].text : text(`visa.${messageKey}.body`)).replace(/\\n/g, "\n").trim();
  const paragraphs = fullBody.split(/\n\n/);
  return {
    key, fullBody, title: paragraphs[0], lead: paragraphs[1] ?? "",
    paragraphs: paragraphs.slice(2),
    disclaimers: ["conditionsMayChange", "verifyBeforePayment", "writeNext"].map((id) => text(`visa.disclaimer.${id}`)),
    priceCopy: Object.fromEntries(["heading", "feesIncluded", "noExtra", "line"].map((id) => [id, text(`visa.price.${id}`)])),
  };
}
