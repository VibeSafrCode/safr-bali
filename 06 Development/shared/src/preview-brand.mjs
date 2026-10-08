import assert from 'node:assert/strict';
import registry from '../brands/preview-brands.v1.json' with {type:'json'};

assert.equal(registry.schemaVersion,1);
for(const brand of registry.brands) {
  assert.equal(brand.previewOnly,true);
  assert.equal(brand.siteOrigin,null);
  assert.equal(brand.telegramBotUsername,null);
  assert.deepEqual(brand.locales,['ru','en']);
  assert.equal(brand.catalogMode,'inherit_published');
  assert.equal(brand.pricingMode,'canonical_projection_only');
  assert.ok(brand.allowedAuthorities.every(host=>/^(127\.0\.0\.1|localhost):438[01]$/.test(host)));
  assert.ok(Object.values(brand.theme).every(color=>/^#[0-9a-f]{6}$/.test(color)));
}

/** Explicit build selection only. Request headers, queries and referrals cannot
 * choose a brand or confer account/partner permissions. */
export function previewBrand(selection) {
  if(selection===undefined||selection==='')return null;
  const brand=registry.brands.find(record=>record.brandId===selection);
  assert.ok(brand,'Unknown preview brand');
  return structuredClone(brand);
}

export function previewAuthorityAllowed(brand,authority,headers={}) {
  if(Object.keys(headers).some(key=>/^(forwarded|x-forwarded-host|x-forwarded-proto|x-original-host|authorization)$/i.test(key)))return false;
  return brand.allowedAuthorities.includes(authority);
}

export const YORK_DEMO_ROUTES=Object.freeze([
  '/services/','/about/','/stories/','/contacts/',
  '/account/','/account/orders/','/account/referrals/','/account/points/',
  '/influencer/','/influencer/overview/','/influencer/network/',
  '/influencer/earnings/','/influencer/terms/','/influencer/links/',
  '/owner/influencers/','/owner/influencers/york-gangster/business/',
  '/owner/publications/','/bot-demo/',
]);

export function previewLocale(route) {return route.startsWith('/en/')?'en':'ru';}
export function previewSourceRoute(route) {return route.startsWith('/en/')?route.slice(3):route;}
export function previewHref(route,locale) {
  assert.ok(locale==='ru'||locale==='en','Preview locale is RU or EN only');
  return locale==='en'?'/en'+previewSourceRoute(route):previewSourceRoute(route);
}
