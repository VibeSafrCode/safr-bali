// Full commercial block, matching bot/content/visas.py. No embedded price/rate.
const d1D2InitialOptions = new Set(['d1', 'd2'].flatMap(visa =>
  ['one', 'two'].flatMap(years => ['standard', 'express'].map(speed => `${visa}-${years}-year-${speed}`))));
const strictOptions = {
  'D1/D2': d1D2InitialOptions,
  D12: new Set(['one-year-standard','one-year-express','two-year-standard','two-year-express']),
  E28A: new Set(['two-year-standard']),
};

export function visaPriceText(key, projection, locale, copy, now = Date.now()) {
  const sourceItems = key === "D1/D2" && !Array.isArray(projection?.items) ? [] : (projection?.items ?? []);
  const items = sourceItems.filter((item) => item?.entity_type === "VISA" &&
    item.entity_key === key && (key!=="E33G" || ["standard","express"].includes(item.option_code)) && item.show_price === true && item.amount_idr != null)
    .filter(item => !strictOptions[key] || (strictOptions[key].has(item.option_code) &&
      item.price_qualifier === "EXACT" && item.fee_verification_status === "VERIFIED" &&
      typeof item.amount_idr === "string" && /^[0-9]+$/.test(item.amount_idr) && BigInt(item.amount_idr) > 0n &&
      sourceItems.filter(row => row?.entity_type === "VISA" && row.entity_key === key &&
        row.option_code === item.option_code).length === 1))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      (String(a.sku || "") < String(b.sku || "") ? -1 : String(a.sku || "") > String(b.sku || "") ? 1 : 0));
  if (!items.length) return locale === "en"
    ? "Current price is temporarily unavailable. Ask the manager before payment."
    : "Актуальная цена временно недоступна. Уточните её у менеджера до оплаты.";
  const expiry = Date.parse(projection.derived_expires_at);
  const fresh = Number.isFinite(expiry) && now <= expiry;
  const lines = [copy.heading, copy.feesIncluded, copy.noExtra];
  for (const item of items) {
    const idr = `Rp ${BigInt(item.amount_idr).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
    const variables = {
      label: item.label?.[locale] ?? item.option_code ?? "",
      idr, usdSuffix: fresh && item.display_usd_approx != null &&
        (!['D12','E28A'].includes(key)||['fresh','stale'].includes(projection.fx?.status)) ? ` (≈ $${item.display_usd_approx})` : "",
    };
    lines.push(copy.line.replace(/\{(label|idr|usdSuffix)\}/g, (_, key) => variables[key]));
  }
  if (items[0].fee_note?.[locale]) lines.push("", items[0].fee_note[locale]);
  return lines.join("\n");
}
