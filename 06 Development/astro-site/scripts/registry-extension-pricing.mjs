// Projection consumer only: no prices, rates, conversion or rounding here.
export function extensionPublishedPrice(record,projection,now=Date.now()) {
  const option={c1_extension:"c1-extension",voa_extension:"voa-extension"}[record.contentId];
  if(!option || record.pricingRef?.entityType!=="SERVICE" || record.pricingRef.entityKey!=="visa-extension" ||
    record.pricingRef.optionCodes.join(",")!==option || !projection?.projection_id ||
    !Number.isInteger(projection.catalog_version_id) || projection.catalog_version_id<=0 ||
    !Number.isInteger(projection.fx_snapshot_id) || projection.fx_snapshot_id<=0 || projection.currency!=="IDR" ||
    !Array.isArray(projection.items))return null;
  const matches=projection.items.filter(i=>i?.entity_type==="SERVICE" && i.entity_key==="visa-extension" && i.option_code===option);
  if(matches.length!==1 || matches[0].show_price!==true || matches[0].price_qualifier!=="EXACT" ||
    typeof matches[0].amount_idr!=="string" || !/^[1-9]\d{0,17}$/.test(matches[0].amount_idr))return null;
  const item=matches[0],expiry=Date.parse(projection.derived_expires_at);
  const display=typeof item.display_usd_approx==="string" && /^\d{1,18}$/.test(item.display_usd_approx) &&
    BigInt(item.display_usd_approx)%5n===0n;
  const trusted=display && Number.isFinite(expiry) && now<=expiry && projection.fx?.status==="fresh" &&
    projection.display_usd_approx_formula_version==="IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1";
  return {idr:BigInt(item.amount_idr).toString().replace(/\B(?=(\d{3})+(?!\d))/g," "),
    usdSuffix:trusted?"(≈ $"+item.display_usd_approx+")":"",expires:projection.derived_expires_at,
    projectionId:projection.projection_id,catalogVersion:projection.catalog_version_id,fxVersion:projection.fx_snapshot_id};
}
