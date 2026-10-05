// Synthetic accepted whole projection, not prices or rates for production.
// Every test can remove/alter individual fields to exercise fail-closed paths.
export const registryFixtureNow = Date.parse("2026-10-03T12:00:00Z");
export function currentRegistryProjection() {
  const item = (entityType,entityKey,optionCode,amount,usd) => ({
    entity_type:entityType,entity_key:entityKey,option_code:optionCode,
    price_qualifier:"EXACT",show_price:true,amount_idr:amount,display_usd_approx:usd,
  });
  return {
    projection_id:"current-registry-test",currency:"IDR",catalog_version_id:2,catalog_version:2,
    fx_snapshot_id:10,fx:{version:10,status:"fresh"},derived_expires_at:"2026-10-03T12:15:00Z",
    display_usd_approx_formula_version:"IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1",
    items:[item("VISA","C1","standard","2000000","110"),
      item("SERVICE","visa-extension","c1-extension","2000000","110"),
      item("VISA","VOA","standard","850000","45"),
      item("SERVICE","visa-extension","voa-extension","850000","45"),
      item("VISA","E33G","standard","12000000","725"),
      item("VISA","E33G","express","14000000","850")],
    compositions:[
      ["c1-issuance-plus-1-extension","4000000","220"],
      ["c1-issuance-plus-2-extensions","6000000","330"],
      ["c1-extension-x1","2000000","110"],
      ["c1-extension-x2","4000000","220"],
      ["c1-extension-x3","6000000","330"],
    ].map(([recipe,amount,usd])=>({recipe_code:recipe,show_price:true,amount_idr:amount,
      display_usd_approx:usd,projection_id:"current-registry-test",catalog_version:2,fx_version:10})),
  };
}
