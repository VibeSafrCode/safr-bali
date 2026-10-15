// Every consumer in pricing.js, including price-bound SEO and structured data.
export const PUBLIC_PRICING_SELECTOR='[data-canonical-price], [data-registry-price], html[data-registry-seo-price-template], html[data-registry-seo-title-price-template], script[type="application/ld+json"][data-registry-price-template]';
export function publicDocumentNeedsPricing(root){return Boolean(root.querySelector(PUBLIC_PRICING_SELECTOR));}
export function startPublicPricing(root,load){if(publicDocumentNeedsPricing(root))return load();}
