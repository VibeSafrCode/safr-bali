// One isolated local headless browser, no personal profile or real submissions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {productionCsp} from './fixtures/production-csp.ts';
import {d1D2Projection} from './fixtures/d1-d2-projection.mjs';
import {d1PageKeys} from '../scripts/registry-d1-d2-pricing.mjs';
import {buildPublicRegistryModel,publicBuildEntries} from '../scripts/registry-publication.mjs';
import {priceDisplay} from '../scripts/registry-price-bindings.mjs';
const executable=process.env.REGISTRY_BROWSER_EXECUTABLE,output=process.env.D1_BROWSER_OUTPUT;
assert.ok(executable&&existsSync(executable),'Explicit isolated headless binary, no personal Chrome fallback');
assert.ok(output?.startsWith('/private/tmp/'),'Private output required');mkdirSync(dirname(output),{recursive:true});
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const entries=publicBuildEntries().filter(e=>Object.hasOwn(d1PageKeys,e.contentId));
const report={status:'RUNNING',cases:[],screenshots:[],errors:[],error:null,diagnostic:null,personalProfileUsed:false,realSubmissions:false,autoplay:false,unexpectedMutations:0,externalRequestsPrevented:0};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+'/')||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Security-Policy':productionCsp,'Cache-Control':'no-store'});res.end(readFileSync(file));
});
let browser,base,projection=d1D2Projection();
const capture=async(page,name)=>{const path=join(dirname(output),name+'.png');await page.screenshot({path,fullPage:false});report.screenshots.push(name+'.png');};
const pass=(id,details={})=>report.cases.push({id,...details,status:'PASS'});
async function check(page,entry,width,theme,{sourceCheck=false}={}) {
 await page.setViewportSize({width,height:900});
 await page.goto(entry.route,{waitUntil:'load'});
 await page.evaluate(theme=>{localStorage.setItem('safrway:appearance',theme);dispatchEvent(new StorageEvent('storage',{key:'safrway:appearance',newValue:theme}));},theme);
 // The documents guide has no authored commercial tariff. All five other
 // families do, and must await the actual shared projection before comparison.
 try {if(entry.contentId==='knowledge_d1_d2_documents')assert.equal(await page.locator('[data-registry-price]').count(),0);
  else await expect(page.locator('[data-registry-price]').first()).toHaveAttribute('data-projection-id',projection.projection_id,{timeout:5000});}
 catch(error){report.diagnostic=await page.evaluate(()=>({url:location.pathname,h1:document.querySelector('h1')?.textContent,
  firstPrice:document.querySelector('[data-registry-price]')?.outerHTML,scripts:[...document.scripts].filter(s=>s.src).map(s=>new URL(s.src).pathname)}));throw error;}
 assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('html').getAttribute('lang'),entry.locale);
 assert.equal(await page.locator('html').getAttribute('dir'),entry.dir);
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 assert.equal(await page.locator('iframe,video,audio').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow: '+entry.route);
 const model=buildPublicRegistryModel(entry,{projection});
 const buttons=page.locator('article .registry-cta-actions .manager-button:not(noscript *)');
 assert.equal(await buttons.count(),model.ctaActions.length);
 for(const button of await buttons.all())assert.ok(await button.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'CTA overflow');
 const allText=await page.locator('article').textContent();assert.doesNotMatch(allText,/\{\{(?:USD|PRICE_IDR|CATALOG_PRICE)|MODEL_REVIEWED|PNBP/);
 for(const node of await page.locator('[data-registry-price]').all()) {
  assert.equal(await node.getAttribute('data-projection-id'),projection.projection_id);
  assert.equal(await node.getAttribute('data-catalog-version'),String(projection.catalog_version_id));
  assert.equal(await node.getAttribute('data-fx-version'),String(projection.fx_snapshot_id));
  assert.equal(await node.textContent(),priceDisplay(await node.getAttribute('data-registry-price'),projection,entry.locale));
  assert.equal(await node.locator('bdi[dir=ltr]').count(),1);
 }
 const graphs=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()),faq=graphs.find(g=>g['@type']==='FAQPage');
 assert.equal(faq.mainEntity.length,model.faqSchema.length);
 for(let i=0;i<faq.mainEntity.length;i++)assert.equal(faq.mainEntity[i].acceptedAnswer.text,model.faqSchema[i].answer);
 assert.equal(await page.locator('meta[name=description]').getAttribute('content'),model.description);
 if(sourceCheck)for(const section of model.sections) {
  const expected=await page.evaluate(html=>{const div=document.createElement('div');div.innerHTML=html;return div.textContent.replace(/\s+/g,' ').trim();},section.html);
  const actual=await page.locator('.article-section[aria-labelledby="'+section.id+'"] .prose').textContent();
  assert.equal(actual.replace(/\s+/g,' ').trim(),expected,'complete supplied section '+entry.route+'#'+section.id);
 }
 pass('localized-layout-price-source',{contentId:entry.contentId,locale:entry.locale,width,theme,sourceCheck});
}
try {
 await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:executable,args:['--autoplay-policy=user-gesture-required','--disable-background-networking']});
 const context=await browser.newContext({baseURL:base,viewport:{width:320,height:900},locale:'ru-RU',reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('safrway:appearance','light'));
 await context.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==base){report.externalRequestsPrevented++;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"/>'});}
  if(!['GET','HEAD'].includes(req.method())){report.unexpectedMutations++;return route.abort();}
  if(url.pathname==='/api/catalog/pricing')return route.fulfill({json:projection});
  if(url.pathname==='/api/analytics/policy')return route.fulfill({json:{enabled:false,has_consent:false,policy_revision:1}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{}});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 // Every imported page has real DOM/source/price checks at320px; desktop/dark
 // checks cover each family in six required locales, not new unrelated scope.
 for(const entry of entries) {
  await check(page,entry,320,'light',{sourceCheck:true});
  if(entry.locale==='ru')await capture(page,entry.contentId+'-ru-320-light');
 }
 for(const entry of entries.filter(e=>['ru','en','de','zh-Hans','ja','ar'].includes(e.locale))) {
  await check(page,entry,1280,'dark');
  if((entry.contentId==='d1'&&['en','ja'].includes(entry.locale))||entry.contentId==='d1_d2'&&entry.locale==='ar')await capture(page,entry.contentId+'-'+entry.locale+'-1280-dark');
 }
 for(const locale of ['de','zh-Hans','hi','ar']) {
  const entry=entries.find(e=>e.contentId==='d1'&&e.locale===locale);
  await check(page,entry,375,'dark');await page.locator('.fact-panel').scrollIntoViewIfNeeded();await capture(page,'d1-'+locale+'-375-dark-prices');
 }
 const ar=entries.find(e=>e.contentId==='d1_d2'&&e.locale==='ar');await check(page,ar,320,'dark');
 const table=page.locator('.table-scroll').first();await table.scrollIntoViewIfNeeded();await capture(page,'hub-ar-320-table-start');
 assert.ok(await table.evaluate(el=>el.scrollWidth>el.clientWidth));await table.evaluate(el=>el.scrollLeft=-el.scrollWidth);
 assert.ok(await table.evaluate(el=>Math.abs(el.scrollLeft)>0));await capture(page,'hub-ar-320-table-end');
 await page.locator('[data-language-picker-open]').click();assert.equal(await page.locator('#site-language-dialog a[data-language-choice]').count(),10);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-language-picker-open]').evaluate(el=>el===document.activeElement),true);
 pass('RTL-wide-table-two-edges-and-keyboard-language-control');
 // Exact edited projection and expiry: HTML, SEO and FAQ schema must all agree.
 for(const code of ['d1-extension','d2-extension']){const row=projection.items.find(i=>i.option_code===code);row.amount_idr='2700000';row.display_usd_approx='160';}
 const ext=entries.find(e=>e.contentId==='d1_d2_extension'&&e.locale==='ru');await check(page,ext,375,'light');
 assert.match(await page.locator('meta[name=description]').getAttribute('content'),/2 700 000 IDR/);
 projection.derived_expires_at=new Date(Date.now()+800).toISOString();await page.evaluate(()=>dispatchEvent(new Event('focus')));
 await page.waitForTimeout(1100);assert.doesNotMatch(await page.locator('article').textContent(),/≈ \$/);
 assert.doesNotMatch(await page.locator('meta[name=description]').getAttribute('content'),/≈ \$/);
 assert.doesNotMatch(await page.locator('script[type="application/ld+json"]').textContent(),/≈ \$/);
 pass('Admin-edit-and-expired-USD-body-SEO-FAQ-parity');
 await page.locator('article [data-support-open]').first().click();assert.equal(await page.locator('#support-panel').isVisible(),true);
 await page.keyboard.press('Escape');pass('manager-CTA-opens-existing-support-no-submission');
 assert.equal(report.unexpectedMutations,0);assert.deepEqual(report.errors,[]);report.status='PASS';await context.close();
} catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));report.browserClosed=true;report.ownedServerStopped=true;
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,screenshots:report.screenshots.length,error:report.error,browserClosed:true,ownedServerStopped:true}));}
