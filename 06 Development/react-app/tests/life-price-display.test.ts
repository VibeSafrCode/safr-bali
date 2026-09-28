import assert from 'node:assert/strict';
import test from 'node:test';
import { compactLifePrice, approximateLifeUsdt, type LifePricingProjection } from '../src/components/lifePriceDisplay';
const now=Date.parse('2026-09-28T10:00:00Z');
const projection: LifePricingProjection={fx:{status:'fresh',ask_idr_per_usdt:'17000'},derived_expires_at:'2026-09-28T11:00:00Z'};
test('compact IDR retains exact decimal amount without long zeros',()=>{
 const item={price_amount:'2500000.00',price_currency:'IDR',price_unit:'month'} as const;
 assert.equal(compactLifePrice(item,'ru'),'2500K IDR в месяц');
 assert.equal(compactLifePrice({...item,price_amount:'2500123.45'},'ru'),'2500,12345K IDR в месяц');
 assert.equal(compactLifePrice({...item,price_amount:'0'},'ru'),'Rp 0 в месяц');
});
test('USDT equivalent is nearest 5 half up, not double-rounded and not a payment price',()=>{
 assert.equal(approximateLifeUsdt('2500000.00',projection,now),'145');
 assert.equal(approximateLifeUsdt('2507500',projection,now),'150'); // 147.5
 assert.equal(approximateLifeUsdt('2507499.99',projection,now),'145');
 assert.equal(approximateLifeUsdt('0',projection,now),'0');
});
test('invalid or expired rate never produces a conversion',()=>{
 for(const value of ['0','-1','garbage',null]) assert.equal(approximateLifeUsdt('2500000',{...projection,fx:{status:'fresh',ask_idr_per_usdt:value}},now),null);
 assert.equal(approximateLifeUsdt('2500000',projection,Date.parse('2026-09-28T11:00:00Z')),null);
 assert.equal(approximateLifeUsdt('2500000',{...projection,fx:{status:'unavailable',ask_idr_per_usdt:'17000'}},now),null);
 assert.equal(approximateLifeUsdt('2500000',null,now),null);
 assert.equal(approximateLifeUsdt('2500000',{...projection,derived_expires_at:'invalid'},now),null);
});
