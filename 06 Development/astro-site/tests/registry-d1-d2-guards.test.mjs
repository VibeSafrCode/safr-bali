import assert from 'node:assert/strict';
import test from 'node:test';
import {registryPrice,priceDisplay,priceOperations} from '../scripts/registry-price-bindings.mjs';
import {d1D2Projection} from './fixtures/d1-d2-projection.mjs';
import {currentRegistryProjection,registryFixtureNow} from './fixtures/current-registry-projection.mjs';
import {visaPriceText} from '../src/lib/visa-price-text.js';

const now=Date.parse('2026-10-05T00:00:00Z');
const optionCodes=Object.keys(priceOperations).filter(code=>
  (priceOperations[code].entity_key==='D1/D2'&&!code.includes('five-year'))||['d1_extension','d2_extension'].includes(code));
const rowFor=(p,code)=>p.items.find(row=>Object.entries(priceOperations[code]).every(([key,value])=>row[key]===value));

test('all ten D1/D2 options require EXACT and VERIFIED without modifying projection',()=>{
  assert.equal(optionCodes.length,10);
  for(const code of optionCodes) {
    const p=d1D2Projection(now),before=structuredClone(p);
    assert.ok(registryPrice(code,p,now));assert.deepEqual(p,before);
    for(const mutation of [row=>delete row.fee_verification_status,row=>row.fee_verification_status='NEEDS_VERIFICATION',
      row=>row.price_qualifier='FROM',row=>delete row.price_qualifier]) {
      const bad=structuredClone(p);mutation(rowFor(bad,code));assert.equal(registryPrice(code,bad,now),null,code);
    }
  }
});

const mismatchCases={
  qualifier:r=>r.price_qualifier='FROM',currency:r=>r.currency='USD',
  publication:r=>r.publication_version++,catalog:r=>r.catalog_version++,fx:r=>r.fx_version++,
  projection:r=>r.projection_id='other-snapshot',expiry:r=>r.derived_expires_at=new Date(now+7200000).toISOString(),
  formula:r=>r.formula_version='OTHER',usdFormula:r=>r.display_usd_approx_formula_version='OTHER',
  fxStatus:r=>r.fx_status='stale',
};
for(const [name,mutate] of Object.entries(mismatchCases))test('D1/D2 composition rejects '+name+' mismatch',()=>{
  for(const type of ['d1','d2']) {
    const p=d1D2Projection(now),code=type+'-extension-x2';
    mutate(p.compositions.find(row=>row.recipe_code===code));
    assert.equal(registryPrice(code,p,now),null);
    assert.equal(registryPrice('d1-d2-extension-x2',p,now),null);
  }
});

test('missing parent and child parity fields cannot accidentally match as undefined',()=>{
  for(const field of ['publication_version','catalog_version','derived_expires_at','formula_version','display_usd_approx_formula_version']) {
    for(const side of ['parent','child','both']) {
      const p=d1D2Projection(now),row=p.compositions.find(r=>r.recipe_code==='d1-extension-x2');
      if(side!=='child')delete p[field];if(side!=='parent')delete row[field];
      assert.equal(registryPrice('d1-extension-x2',p,now),null,field+'/'+side);
    }
  }
  for(const value of [0,-1,'7',null]) {
    const p=d1D2Projection(now);p.publication_version=value;
    p.compositions.find(r=>r.recipe_code==='d1-extension-x2').publication_version=value;
    assert.equal(registryPrice('d1-extension-x2',p,now),null);
  }
  for(const value of [undefined,null,{},'invalid']) {
    const p=d1D2Projection(now);p.compositions=value;
    assert.equal(registryPrice('d1-extension-x2',p,now),null);
  }
});

test('invalid expiry matching both levels and duplicate recipes remain unavailable',()=>{
  const p=d1D2Projection(now),row=p.compositions.find(r=>r.recipe_code==='d1-extension-x2');
  p.derived_expires_at=row.derived_expires_at='invalid';
  assert.equal(registryPrice('d1-extension-x2',p,now),null);
  const duplicate=d1D2Projection(now);
  duplicate.compositions.push({...duplicate.compositions.find(r=>r.recipe_code==='d1-extension-x2')});
  assert.equal(registryPrice('d1-extension-x2',duplicate,now),null);
});

test('valid composition stays server-authoritative and expired USD never changes IDR',()=>{
  const p=d1D2Projection(now),before=structuredClone(p);
  for(const code of ['d1-extension-x2','d2-extension-x2','d1-d2-extension-x2']) {
    assert.equal(priceDisplay(code,p,'en',now),'5 000 000 IDR (≈ $300)');
    assert.equal(priceDisplay(code,p,'en',now+3600001),'5 000 000 IDR');
  }
  assert.deepEqual(p,before);
  for(const row of p.compositions.filter(r=>r.recipe_code.startsWith('d1-')||r.recipe_code.startsWith('d2-')))
    row.display_usd_approx='12345';
  assert.equal(priceDisplay('d1-d2-extension-x2',p,'en',now),'5 000 000 IDR (≈ $12345)');
  p.fx.status='stale';
  for(const row of p.compositions)row.fx_status='stale';
  assert.equal(priceDisplay('d1-d2-extension-x2',p,'en',now),'5 000 000 IDR (≈ $12345)');
});

test('shared single extension rejects an unverified variant and five-year CONTACT never becomes zero',()=>{
  const p=d1D2Projection(now);rowFor(p,'d2_extension').fee_verification_status='NEEDS_VERIFICATION';
  assert.equal(registryPrice('d1-d2-extension-equal',p,now),null);
  for(const type of ['d1','d2'])for(const speed of ['standard','express'])
    assert.equal(registryPrice(type+'-five-year-'+speed,p,now),null);
});

test('legacy C1/E33G fixture and composition behavior is unchanged',()=>{
  const p=currentRegistryProjection();
  assert.equal(priceDisplay('c1',p,'en',registryFixtureNow),'2 000 000 IDR (≈ $110)');
  assert.equal(priceDisplay('c1-extension-x2',p,'en',registryFixtureNow),'4 000 000 IDR (≈ $220)');
  assert.equal(priceDisplay('e33g_standard',p,'en',registryFixtureNow),'12 000 000 IDR (≈ $725)');
  assert.equal(priceDisplay('e33g_express',p,'en',registryFixtureNow),'14 000 000 IDR (≈ $850)');
});

test('legacy D1/D2 commercial helper shows only unique VERIFIED EXACT positive initial eight options',()=>{
  const copy={heading:'Prices',feesIncluded:'Fees included',noExtra:'No extra',line:'{label}: {idr}{usdSuffix}'};
  const p=d1D2Projection(now),before=structuredClone(p);
  const initial=p.items.filter(row=>row.entity_key==='D1/D2'&&row.show_price);
  const text=visaPriceText('D1/D2',p,'en',copy,now);
  assert.equal(initial.length,8);
  for(const row of initial)assert.ok(text.includes(row.option_code+': Rp '));
  assert.deepEqual(p,before);
  const extra=structuredClone(p);
  extra.items.push({...initial[0],option_code:'unknown-business-option',amount_idr:'88888888'},
    {...initial[0],option_code:'d1-five-year-standard',amount_idr:'99999999'});
  assert.equal(visaPriceText('D1/D2',extra,'en',copy,now),text);
  for(const mutate of [row=>row.price_qualifier='FROM',row=>delete row.price_qualifier,
    row=>row.fee_verification_status='NEEDS_VERIFICATION',row=>delete row.fee_verification_status,
    ...['0','000','-1','1.5','1e6',' 5000000','５００００００','1\n',5000000,null].map(value=>row=>row.amount_idr=value)]) {
    const bad=structuredClone(p),row=bad.items.find(r=>r.option_code==='d1-one-year-standard');mutate(row);
    const result=visaPriceText('D1/D2',bad,'en',copy,now);
    assert.ok(!result.includes('d1-one-year-standard:'));
    assert.ok(result.includes('d2-one-year-standard:'));
  }
  const duplicate=structuredClone(p);
  duplicate.items.push({...initial[0],show_price:false});
  assert.ok(!visaPriceText('D1/D2',duplicate,'en',copy,now).includes(initial[0].option_code+':'));
  for(const items of [null,{},'invalid',[]])assert.match(visaPriceText('D1/D2',{items},'en',copy,now),/unavailable/);
  for(const key of ['C1','E33G']) {
    const legacy={...p,items:[{...initial[0],entity_key:key,option_code:'standard',price_qualifier:'FROM',fee_verification_status:'NEEDS_VERIFICATION'}]};
    assert.match(visaPriceText(key,legacy,'en',copy,now),/Rp 5\.000\.000/);
  }
});
