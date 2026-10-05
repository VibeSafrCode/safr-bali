// Preview-only binding to existing E33G published options. No FX arithmetic,
// seed fallback, catalog mutation, dependent tariff or independent rounding.
import {visaPriceText} from "../src/lib/visa-price-text.js";
export function e33gPublishedPrices(record, projection, now) {
  if (record.contentId !== "e33g" || record.pricingRef?.entityType !== "VISA" ||
    record.pricingRef.entityKey !== "E33G" ||
    record.pricingRef.optionCodes.join(",") !== "standard,express") return null;
  if (!projection || typeof projection.projection_id !== "string" || !projection.projection_id ||
    !Number.isInteger(projection.catalog_version_id) || projection.catalog_version_id <= 0 ||
    !Number.isInteger(projection.fx_snapshot_id) || projection.fx_snapshot_id <= 0 ||
    projection.currency !== "IDR" || projection.fx?.status !== "fresh" ||
    !Number.isFinite(Date.parse(projection.derived_expires_at)) || !Array.isArray(projection.items) ||
    projection.display_usd_approx_formula_version !== "IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1") return null;
  const prices = {};
  for (const [option, expected] of [["standard","12000000"],["express","14000000"]]) {
    const matches = projection.items.filter(i=>i?.entity_type === "VISA" &&
      i.entity_key === "E33G" && i.option_code === option);
    if (matches.length !== 1 || matches[0].show_price !== true || matches[0].amount_idr !== expected) return null;
    const item = matches[0];
    // Validate the authoritative display field, never calculate/round a rate.
    const trustedDisplay = typeof item.display_usd_approx === "string" &&
      /^[1-9]\d{0,17}$/.test(item.display_usd_approx) && BigInt(item.display_usd_approx) % 5n === 0n;
    const suffix = trustedDisplay ? visaPriceText("E33G",{...projection,items:[{...item,fee_note:{}}]},"en",
      {heading:"",feesIncluded:"",noExtra:"",line:"{usdSuffix}"},now).trim() : "";
    prices[option] = {idr:BigInt(item.amount_idr).toString().replace(/\B(?=(\d{3})+(?!\d))/g," "),
      usdSuffix:/^\(≈ \$\d+\)$/.test(suffix) ? suffix : "",expires:projection.derived_expires_at,
      projectionId:projection.projection_id,catalogVersion:projection.catalog_version_id,fxVersion:projection.fx_snapshot_id};
  }
  return prices;
}
