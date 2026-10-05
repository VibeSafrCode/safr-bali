// Synthetic QA values only; USD is supplied by the canonical projection,
// never calculated here or used as a production fallback.
import {currentRegistryProjection} from './current-registry-projection.mjs';
export function d1D2Projection(now=Date.now()) {
  const p=currentRegistryProjection();
  p.publication_version=7;
  p.formula_version='IDR_DIV_ASK_USDTIDR_HALF_UP_2DP_V1';
  p.derived_expires_at=new Date(now+3600000).toISOString();
  const rows=[
    ['d1-one-year-standard','5000000','300'],['d1-one-year-express','6500000','390'],
    ['d1-two-year-standard','9000000','540'],['d1-two-year-express','11000000','660'],
    ['d2-one-year-standard','5500000','330'],['d2-one-year-express','7000000','420'],
    ['d2-two-year-standard','9000000','540'],['d2-two-year-express','11000000','660'],
  ];
  p.items.push(...rows.map(([option_code,amount_idr,display_usd_approx])=>({
    entity_type:'VISA',entity_key:'D1/D2',option_code,amount_idr,display_usd_approx,
    show_price:true,price_qualifier:'EXACT',fee_verification_status:'VERIFIED'})));
  for(const type of ['d1','d2']) {
    p.items.push({entity_type:'SERVICE',entity_key:'visa-extension',option_code:type+'-extension',
      amount_idr:'2500000',display_usd_approx:'150',show_price:true,price_qualifier:'EXACT',fee_verification_status:'VERIFIED'});
    for(const speed of ['standard','express'])p.items.push({entity_type:'VISA',entity_key:'D1/D2',
      option_code:type+'-five-year-'+speed,amount_idr:null,display_usd_approx:null,show_price:false,price_qualifier:'CONTACT',fee_verification_status:'VERIFIED'});
    p.compositions.push({recipe_code:type+'-extension-x2',amount_idr:'5000000',display_usd_approx:'300',
      show_price:true,price_qualifier:'EXACT',currency:'IDR',projection_id:p.projection_id,
      publication_version:p.publication_version,catalog_version:p.catalog_version,fx_version:p.fx.version,
      fx_status:p.fx.status,derived_expires_at:p.derived_expires_at,formula_version:p.formula_version,
      display_usd_approx_formula_version:p.display_usd_approx_formula_version});
  }
  return p;
}
