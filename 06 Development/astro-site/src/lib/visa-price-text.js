// Full commercial block, matching bot/content/visas.py. No embedded price/rate.
export function visaPriceText(key, projection, locale, copy, now = Date.now()) {
  const items = (projection?.items ?? []).filter((item) => item?.entity_type === "VISA" &&
    item.entity_key === key && item.show_price === true && item.amount_idr != null)
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
      idr, usdSuffix: fresh && item.display_usdt != null ? ` (≈ ${item.display_usdt} USDT)` : "",
    };
    lines.push(copy.line.replace(/\{(label|idr|usdSuffix)\}/g, (_, key) => variables[key]));
  }
  if (items[0].fee_note?.[locale]) lines.push("", items[0].fee_note[locale]);
  return lines.join("\n");
}
