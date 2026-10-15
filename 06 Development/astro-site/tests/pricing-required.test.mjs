import assert from 'node:assert/strict';
import test from 'node:test';
import {PUBLIC_PRICING_SELECTOR,publicDocumentNeedsPricing,startPublicPricing} from '../src/lib/pricing-required.mjs';
test('each independent price, SEO-only or JSON-LD consumer starts existing pricing immediately',()=>{
 const markers=['[data-canonical-price]','[data-registry-price]','html[data-registry-seo-price-template]',
  'html[data-registry-seo-title-price-template]','script[type="application/ld+json"][data-registry-price-template]'];
 assert.deepEqual(PUBLIC_PRICING_SELECTOR.split(', '),markers);
 for(const marker of markers){
  let calls=0;const root={querySelector:selector=>selector.split(', ').includes(marker)?{hidden:true}:null};
  assert.equal(publicDocumentNeedsPricing(root),true);
  assert.equal(startPublicPricing(root,()=>{calls++;return 'immediate';}),'immediate');assert.equal(calls,1);
 }
});
test('a document with no consumers never imports, fetches or schedules the pricing runtime',()=>{
 let calls=0;const root={querySelector:()=>null};
 assert.equal(publicDocumentNeedsPricing(root),false);
 assert.equal(startPublicPricing(root,()=>{calls++;throw Error('must not load');}),undefined);assert.equal(calls,0);
});
