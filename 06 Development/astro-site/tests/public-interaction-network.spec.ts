import {expect,test,type Page} from '@playwright/test';
import {productionCsp} from './fixtures/production-csp';
import {localizedPublicRoute} from '../src/lib/public-locale';
test.use({viewport:{width:390,height:844}});

async function prepare(page:Page,marker=''){
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['GET','HEAD'].includes(request.method()))return route.abort();
  if(url.origin!=='http://127.0.0.1:4322')return route.abort();
  if(url.pathname==='/api/catalog/pricing')return route.fulfill({json:{projection_id:'fixture-only',
   catalog_version_id:1,fx_snapshot_id:1,derived_expires_at:'2099-01-01T00:00:00Z',items:[]}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
  if(request.resourceType()!=='document')return route.continue();
  const response=await route.fetch();let body=await response.text();
  if(marker.startsWith('html:'))body=body.replace('<html ','<html '+marker.slice(5)+' ');
  else if(marker)body=body.replace('</body>',marker+'</body>');
  return route.fulfill({response,body,headers:{...response.headers(),'content-security-policy':productionCsp}});
 });
}

test('EN and Bali never download pricing or poll its API without consumers, also on focus/visibility',async({page})=>{
 await prepare(page);
 const pricing:string[]=[],errors:string[]=[];
 page.on('request',request=>{if(/\/pricing\.[\w-]+\.js(?:\?|$)|\/api\/catalog\/pricing/.test(request.url()))pricing.push(request.url());});
 page.on('pageerror',error=>errors.push(error.message));
 for(const route of ['/en/','/bali/']){
  await page.goto(route);await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(150);
 }
 expect(pricing).toEqual([]);expect(errors).toEqual([]);
});

const markers=[
 '<span hidden data-canonical-price data-entity-type="VISA" data-entity-key="E33G"></span>',
 '<span hidden data-registry-price="E33G"></span>',
 'html:data-registry-seo-price-template="Fixture"',
 'html:data-registry-seo-title-price-template="Fixture"',
 '<script type="application/ld+json" data-registry-price-template="{}">{}</script>',
];
for(const [index,marker] of markers.entries())test(`pricing consumer${index+1} starts the real unchanged runtime without user interaction`,async({page})=>{
 await prepare(page,marker);let calls=0;
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/catalog/pricing')calls++;});
 const ready=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/catalog/pricing');
 await page.goto('/en/');expect((await ready).status()).toBe(200);expect(calls).toBeGreaterThan(0);
});

test('each new language document and Registry layout use their own synchronous captions under CSP',async({page})=>{
 await prepare(page);const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'] as const;
 for(const [index,locale] of locales.entries()){
  // A Registry page also exercises the second layout, not only BaseLayout.
  const route=localizedPublicRoute(index===9?'/bali/visas/e33g/':locale==='ru'?'/bali/':'/',locale);
  await page.goto(route);
  const tag=page.locator('[data-public-interaction-captions]');await expect(tag).toHaveCount(1);
  const payload=JSON.parse((await tag.textContent())!);expect(payload.locale).toBe(locale);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await page.locator('[data-theme-toggle]').first().click();
  const preference=await page.locator('html').getAttribute('data-theme-preference');
  const next=({auto:'light',light:'dark',dark:'auto'} as Record<string,string>)[preference!];
  const values=payload.values;
  const expected=values['theme.title'].replace('{names_preference_}',values['theme.'+preference])
   .replace('{names_next_}',values['theme.'+next]);
  await expect(page.locator('[data-theme-toggle]').first()).toHaveAttribute('title',expected);
 }
 expect(errors).toEqual([]);
});
