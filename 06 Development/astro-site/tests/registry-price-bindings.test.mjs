import {test} from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import {buildRegistryDocument} from '../scripts/registry-document.mjs';
import {registryPrice,priceDisplay} from '../scripts/registry-price-bindings.mjs';
const now=Date.parse('2026-10-05T00:00:00Z');
const projection={projection_id:'test-whole',currency:'IDR',catalog_version_id:12,catalog_version:3,fx_snapshot_id:30,fx:{version:8,status:'fresh'},derived_expires_at:'2026-10-05T01:00:00Z',display_usd_approx_formula_version:'IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1',items:[
 {entity_type:'VISA',entity_key:'C1',option_code:'standard',price_qualifier:'EXACT',show_price:true,amount_idr:'2000000',display_usd_approx:'125'},
 {entity_type:'SERVICE',entity_key:'visa-extension',option_code:'c1-extension',price_qualifier:'EXACT',show_price:true,amount_idr:'2000000',display_usd_approx:'125'},
 {entity_type:'VISA',entity_key:'E33G',option_code:'standard',price_qualifier:'EXACT',show_price:true,amount_idr:'12000000',display_usd_approx:'750'},
 {entity_type:'VISA',entity_key:'E33G',option_code:'express',price_qualifier:'EXACT',show_price:true,amount_idr:'14000000',display_usd_approx:'875'},
],compositions:['c1-issuance-plus-1-extension','c1-issuance-plus-2-extensions','c1-extension-x2','c1-extension-x3'].map((recipe,i)=>({recipe_code:recipe,show_price:true,amount_idr:i%2?'6000000':'4000000',display_usd_approx:i%2?'375':'250',projection_id:'test-whole',catalog_version:3,fx_version:8}))};
test('all eVOA PRICE_IDR tokens remain live catalog bindings, including when built without a projection',()=>{
 const live=structuredClone(projection);live.items.push({entity_type:'VISA',entity_key:'VOA',option_code:'standard',price_qualifier:'EXACT',show_price:true,amount_idr:'950000',display_usd_approx:'60'});
 for(const l of registry.locales){
  const html=model=>[model.directHtml,model.factHtml,model.introHtml,...model.sections.map(s=>s.html)].join('');
  const built=html(buildRegistryDocument(registry,'voa',l.code));assert.match(built,/data-registry-price="voa"/);assert.doesNotMatch(built,/\{\{PRICE_IDR\}\}|\{\{USD\}\}/);
  const fresh=html(buildRegistryDocument(registry,'voa',l.code,{projection:live,now}));assert.match(fresh,/data-registry-price="voa"[^>]*><bdi dir="ltr">950 000 IDR \(≈ \$60\)/);
  const expired=html(buildRegistryDocument(registry,'voa',l.code,{projection:live,now:now+3600001}));assert.match(expired,/data-registry-price="voa"[^>]*><bdi dir="ltr">950 000 IDR<\/bdi>/);
 }
});
test('all accepted locales bind mixed C1 operations and separate totals, not a single USD suffix',()=>{
 for(const l of registry.locales){
  const m=buildRegistryDocument(registry,'knowledge_c1_price',l.code,{projection,now});
  const html=[m.directHtml,m.factHtml,m.introHtml,...m.sections.map(s=>s.html)].join('');
  assert.match(html,/data-registry-price="c1-issuance-plus-1-extension"[^>]*><bdi dir="ltr">4 000 000 IDR \(≈ \$250\)/);
  assert.match(html,/data-registry-price="c1-issuance-plus-2-extensions"[^>]*><bdi dir="ltr">6 000 000 IDR \(≈ \$375\)/);
  assert.match(html,/data-registry-price="c1_extension"/);assert.match(html,/data-registry-price="c1"/);
  assert.doesNotMatch(html,/\{\{USD/);
 }
});
test('corrected family article is individual quote-only, without principal price bindings',()=>{
 for(const l of registry.locales){const m=buildRegistryDocument(registry,'knowledge_e33g_family',l.code,{projection,now});
  const html=m.sections.map(s=>s.html).join('');
  assert.doesNotMatch(html,/data-registry-price=|12 000 000|14 000 000|\$750|\$875/);
  assert.equal(m.price,null);assert.equal(m.tariffPrices,null);assert.ok(m.familyApplicabilityNote);}
});
test('edited prices follow exact identity; stale expiry, duplicates and mismatched composite versions fail safe',()=>{
 const changed=structuredClone(projection);changed.items[1].amount_idr='2500000';changed.items[1].display_usd_approx='155';
 assert.equal(priceDisplay('c1_extension',changed,'ru',now),'2 500 000 IDR (≈ $155)');
 assert.equal(priceDisplay('c1',changed,'ru',now),'2 000 000 IDR (≈ $125)');
 assert.equal(registryPrice('c1',projection,now+3600001).usd,null);
 const duplicate=structuredClone(projection);duplicate.items.push(duplicate.items[0]);assert.equal(registryPrice('c1',duplicate,now),null);
 const mismatched=structuredClone(projection);mismatched.compositions[0].fx_version=99;assert.equal(registryPrice('c1-issuance-plus-1-extension',mismatched,now),null);
});
test('public internal targets use emitted routes and unavailable related targets are omitted',()=>{
 const m=buildRegistryDocument(registry,'c1','en',{targetHref:id=>id==='c1_extension'?'/en/bali/visas/c1/extension/':null});
 assert.match(m.sections.map(s=>s.html).join(''),/href="\/en\/bali\/visas\/c1\/extension\/"/);
 assert.doesNotMatch(JSON.stringify(m.related),/_registry/);assert.equal(m.pricingHref,null);
});
