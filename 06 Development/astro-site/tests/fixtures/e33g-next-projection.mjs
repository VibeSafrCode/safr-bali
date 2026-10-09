// Synthetic canonical projection for contract tests only. No production rate
// or conversion is calculated here; approximate displays are fixture inputs.
import {d12E28AProjection} from './d12-e28a-projection.mjs';
export function e33gNextProjection(now=Date.now()) {
  const projection=d12E28AProjection(now);
  const rows=[
    ['SERVICE','visa-extension','e33g-extension','12000000','725'],
    ['SERVICE','consultation','e33g-document-review','2000000','110'],
    ['VISA','E33G','conversion-from-voa','17000000','1020'],
    ['VISA','E33G','conversion-from-c1','15000000','900'],
    ['VISA','E33G','conversion-from-d12','17000000','1020'],
    ['VISA','E33G','conversion-from-kitas','17500000','1050'],
  ];
  for(const [entity_type,entity_key,option_code,amount_idr,display_usd_approx] of rows) {
    projection.items=projection.items.filter(row=>!(row.entity_type===entity_type&&
      row.entity_key===entity_key&&row.option_code===option_code));
    projection.items.push({entity_type,entity_key,option_code,amount_idr,display_usd_approx,
      show_price:true,price_qualifier:'EXACT',fee_verification_status:'VERIFIED'});
  }
  return projection;
}
