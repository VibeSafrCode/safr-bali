import {startPublicPricing} from '../lib/pricing-required.mjs';
// Astro emits a deferred module: all body/SEO nodes exist before this test.
// Needed prices start immediately, not on click, idle or a Lighthouse signal.
void startPublicPricing(document,()=>import('./pricing.js'));
