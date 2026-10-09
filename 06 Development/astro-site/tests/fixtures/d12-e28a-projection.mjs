// Synthetic QA projection. Dollar displays are supplied fixture values from
// the existing contract, never a conversion or production fallback.
import {currentRegistryProjection} from './current-registry-projection.mjs';
export function d12E28AProjection(now=Date.now()) {
  const projection=currentRegistryProjection();
  projection.projection_id='d12-e28a-test-projection';
  projection.publication_version=9;
  projection.derived_expires_at=new Date(now+3_600_000).toISOString();
  const rows=[
    ['VISA','D12','one-year-standard','7500000','450'],
    ['VISA','D12','one-year-express','9500000','570'],
    ['VISA','D12','two-year-standard','10500000','630'],
    ['VISA','D12','two-year-express','13000000','780'],
    ['SERVICE','visa-extension','d12-extension','7000000','420'],
    ['VISA','E28A','two-year-standard','16000000','960'],
    ['VISA','E33G','conversion-from-d12','17000000','1020'],
  ];
  projection.items.push(...rows.map(([entity_type,entity_key,option_code,amount_idr,display_usd_approx])=>({
    entity_type,entity_key,option_code,amount_idr,display_usd_approx,
    show_price:true,price_qualifier:'EXACT',fee_verification_status:'VERIFIED',
  })));
  projection.items.push({entity_type:'SERVICE',entity_key:'visa-extension',option_code:'e28a-extension',
    amount_idr:null,display_usd_approx:null,show_price:false,price_qualifier:'CONTACT',fee_verification_status:'VERIFIED'});
  return projection;
}
