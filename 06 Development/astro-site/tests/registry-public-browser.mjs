// One owned headless browser, fresh context, same-origin fixtures only.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dev} from 'astro';
import {chromium} from '@playwright/test';
import {publicBuildEntries} from '../scripts/registry-publication.mjs';

const output=fileURLToPath(new URL('../../../AUDIT/SYNC_FINAL_2026-10-05/',import.meta.url));
const delta=process.env.REGISTRY_BROWSER_DELTA==='1';
mkdirSync(output+'screenshots',{recursive:true});
const entries=publicBuildEntries();
const routeFor=(id,locale)=>entries.find(e=>e.contentId===id&&e.locale===locale).route;
const item=(entity_type,entity_key,option_code,amount_idr,display_usd_approx)=>({entity_type,entity_key,option_code,amount_idr,display_usd_approx,show_price:true,price_qualifier:'EXACT',label:{ru:option_code,en:option_code}});
const projection={projection_id:'synthetic-browser-only',currency:'IDR',publication_version:7,catalog_version_id:12,catalog_version:3,fx_snapshot_id:30,fx:{version:8,status:'fresh'},derived_expires_at:new Date(Date.now()+3600000).toISOString(),display_usd_approx_formula_version:'IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1',items:[item('VISA','C1','standard','2000000','125'),item('VISA','VOA','standard','800000','50'),item('SERVICE','visa-extension','c1-extension','2000000','125'),item('SERVICE','visa-extension','voa-extension','850000','55'),item('VISA','E33G','standard','12000000','750'),item('VISA','E33G','express','14000000','875')],compositions:[['c1-issuance-plus-1-extension','4000000','250'],['c1-issuance-plus-2-extensions','6000000','375']].map(([recipe_code,amount_idr,display_usd_approx])=>({recipe_code,amount_idr,display_usd_approx,show_price:true,projection_id:'synthetic-browser-only',catalog_version:3,fx_version:8}))};
const result={status:'RUNNING',error:null,cases:[],screenshots:[],errors:[],externalRequestsPrevented:0,unexpectedMutations:0,realSubmissions:false,personalProfileUsed:false,autoplay:false};
let browser,server,enabled=false,consent=false,lead=null;const batches=[];
try{
 server=await dev({root:fileURLToPath(new URL('../',import.meta.url)),configFile:'scripts/registry-preview.config.mjs',server:{host:'127.0.0.1',port:0},logLevel:'error'});
 const base='http://127.0.0.1:'+server.address.port;
 browser=await chromium.launch({headless:true,executablePath:process.env.REGISTRY_BROWSER_EXECUTABLE,args:['--autoplay-policy=user-gesture-required','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU',colorScheme:'light',reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  const json=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  if(u.origin!==base){result.externalRequestsPrevented++;return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#26342c"/></svg>'});}
  if(u.pathname==='/api/catalog/pricing')return json(projection);
  if(u.pathname==='/api/web/auth/me')return json({authenticated:false});
  if(u.pathname==='/api/analytics/policy')return json({enabled,policy_revision:1,privacy_notice_version:'sync1005-local-only',has_consent:consent});
  if(u.pathname==='/api/analytics/consent'){consent=req.postDataJSON().granted===true;return json({granted:consent});}
  if(u.pathname==='/api/analytics/events'){assert.equal(consent,true);batches.push(req.postDataJSON());return json({accepted:true});}
  if(u.pathname==='/api/web/chat/guest'){lead=req.postDataJSON();return json({accepted:true});}
  if(!['GET','HEAD'].includes(req.method())){result.unexpectedMutations++;return route.abort();}
  if(u.pathname.startsWith('/api/'))return json({});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 const capture=async name=>{
  // Theme assets are decoded asynchronously. Do not label a night frame "light".
  if(await page.locator('[data-country-theme-image]').count())await page.waitForFunction(()=>{
   const dark=document.documentElement.dataset.theme==='dark';
   const cards=Array.from(document.querySelectorAll('[data-country-theme-image]'));
   return cards.every(image=>image.complete&&image.naturalWidth>0&&(image.getAttribute('src')===image.dataset.nightSrc)===dark);
  });
  if(name.startsWith('home-')||name.startsWith('vietnam-'))await page.waitForFunction(()=>{
   const image=Array.from(document.querySelectorAll('.world-backdrop > img')).at(-1);
   return image?.complete&&image.naturalWidth>0&&image.src.includes('night')===(document.documentElement.dataset.theme==='dark');
  });
  await page.screenshot({path:output+'screenshots/'+name+'.png',fullPage:false});result.screenshots.push(name+'.png');
 };
 const layout=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'body overflow '+page.url());
 // Gut-check + two critical responsive states per script, not a 140-page browser crawl.
 const samples=delta?[['ru',1280],['zh-Hans',375],['zh-Hans',320],['ar',375]]:[['ru',1280],['en',375],['de',820],['zh-Hans',375],['ja',820],['hi',375],['ar',1280],['ar',375]];
 for(const [locale,width] of samples){
  await page.setViewportSize({width,height:900});
  for(const theme of ['light','dark']){
   await page.goto(base+routeFor('e33g',locale),{waitUntil:'load'});
   await page.evaluate(theme=>{localStorage.setItem('safrway:appearance',theme);dispatchEvent(new StorageEvent('storage',{key:'safrway:appearance',newValue:theme}));},theme);
   await page.waitForFunction(()=>document.querySelector('[data-registry-price]')?.textContent.includes('IDR'));
   assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.locator('[data-family-case-check]').count(),1);assert.equal(await page.locator('[data-registry-price="e33g_standard"]').first().getAttribute('data-projection-id'),projection.projection_id);
   assert.equal(await page.locator('iframe,video,audio').count(),0);await layout();await capture('e33g-'+locale+'-'+width+'-'+theme);
   if(delta&&width===1280){const ys=await page.locator('.primary-menu a,.primary-menu button').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().y)));assert.equal(new Set(ys).size,1,'single desktop nav row');}
   if(delta&&locale==='zh-Hans'){assert.equal(await page.locator('.lp-trigger>span:first-child').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');}
   if(delta&&['ru','ar'].includes(locale)){await page.locator('[data-price-unit="per_person"]').first().scrollIntoViewIfNeeded();await capture('price-unit-'+locale+'-'+width+'-'+theme);}
   if(delta&&locale==='ar'){const amount=page.locator('.e33g-tariff-card [data-registry-price="e33g_standard"]').first();assert.equal(await amount.locator('bdi[dir=ltr]').count(),1);assert.equal(await amount.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');assert.ok(await amount.evaluate(el=>el.getBoundingClientRect().width<=el.closest('.e33g-tariff-card').getBoundingClientRect().width));}
   result.cases.push({id:'e33g',locale,width,theme,status:'PASS'});
  }
 }
 // eVOA supplied PRICE_IDR tokens must hydrate even though the static build
 // deliberately fetches no production projection.
 await page.setViewportSize({width:375,height:900});await page.goto(base+routeFor('voa','en'),{waitUntil:'load'});
 await page.waitForFunction(()=>document.querySelector('[data-registry-price="voa"]')?.textContent.includes('800 000 IDR'));
 assert.equal(await page.locator('[data-registry-price="voa"]').first().getAttribute('data-projection-id'),projection.projection_id);
 assert.equal(await page.locator('[data-registry-price="voa"] bdi[dir=ltr]').first().textContent(),'800 000 IDR (≈ $50)');await layout();await capture('voa-en-375-price');
 result.cases.push({id:'voa-live-price-token',locale:'en',width:375,status:'PASS'});
 await page.setViewportSize({width:375,height:900});await page.goto(base+routeFor('knowledge_evoa_vs_voa','ar'),{waitUntil:'load'});
 assert.equal(await page.locator('.table-scroll table').count(),2);await layout();
 for(let i=0;i<2;i++){const table=page.locator('.table-scroll').nth(i);await table.scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-table-scroll-hint]').nth(i).isVisible(),true);await capture('comparison-ar-table'+i);await table.evaluate(el=>{el.scrollLeft=-el.scrollWidth;});assert.ok(await table.evaluate(el=>Math.abs(el.scrollLeft)>0));await capture('comparison-ar-table'+i+'-opposite');}
 await page.locator('[data-language-picker-open]').click();assert.equal(await page.locator('#site-language-dialog').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#site-language-dialog .lp-list li').count(),10);assert.equal(await page.locator('#site-language-dialog a[data-language-choice]').count(),10);
 assert.equal(await page.locator('.lp-list').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);await capture('language-ar-mobile');
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-language-picker-open]').evaluate(el=>el===document.activeElement),true);
 // Mocked support submission proves attribution, never delivers a real message.
 await page.goto(base+routeFor('c1_extension','en'),{waitUntil:'load'});await page.locator('.manager-button').first().click();
 await page.locator('#support-name').fill('Synthetic QA');await page.locator('label').filter({has:page.locator('input[name=contact_method][value=email]')}).click();assert.equal(await page.locator('input[name=contact_method][value=email]').isChecked(),true);await page.locator('#support-email').fill('qa@example.invalid');await page.locator('#support-body').fill('Synthetic local verification only.');await page.locator('[data-support-submit]').click();
 await page.waitForFunction(()=>document.querySelector('[data-support-status]').dataset.state==='success');
 assert.equal(lead.route_context.content_id,'c1_extension');assert.equal(lead.route_context.locale,'en');assert.equal(lead.route_context.path,routeFor('c1_extension','en'));assert.match(lead.route_context.source_revision,/^sha256:[a-f0-9]{64}$/);
 result.cases.push({id:'mocked-lead',contentId:lead.route_context.content_id,locale:lead.route_context.locale,status:'PASS'});
 assert.equal(batches.length,0,'disabled analytics must not send');enabled=true;
 await page.goto(base+routeFor('e33g','ru'),{waitUntil:'load'});await page.locator('[data-analytics-accept]').click();await page.waitForTimeout(1150);assert.ok(batches.length>0);
 for(const batch of batches)for(const event of batch.events){assert.equal(event.content_id,'e33g');assert.equal(event.service_id,'visa');assert.equal(Object.keys(event).some(k=>['name','contact','body','url','ip','email'].includes(k)),false);}
 await page.locator('[data-analytics-manage]').click();await page.locator('[data-analytics-decline]').click();const count=batches.length;
 await page.locator('.manager-button').first().click();await page.waitForTimeout(1100);assert.equal(batches.length,count);await page.keyboard.press('Escape');
 result.cases.push({id:'analytics-consent-revoke',status:'PASS'});enabled=false;
 for(const width of [1280,820,375]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/',{waitUntil:'load'});
  assert.equal(await page.locator('[data-public-country]').count(),6);await layout();
  if(width<1280){const rows=await page.locator('[data-public-country]').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();const label=el.querySelector('.public-country-copy').getBoundingClientRect();return {top:r.top,bottom:r.bottom,labelBottom:label.bottom};}));assert.ok(rows.slice(0,3).every(r=>r.labelBottom<=r.bottom+1),'country caption must fit its grid row');assert.ok(Math.min(...rows.slice(3).map(r=>r.top))>=Math.max(...rows.slice(0,3).map(r=>r.labelBottom))+12,'second row must not overlap first-row captions');}
  for(const theme of ['light','dark']){await page.evaluate(theme=>{localStorage.setItem('safrway:appearance',theme);dispatchEvent(new StorageEvent('storage',{key:'safrway:appearance',newValue:theme}));},theme);await capture('home-'+width+'-'+theme);}
  const vietnam=page.locator('[data-public-country-select="vietnam"]');await vietnam.scrollIntoViewIfNeeded();await vietnam.click();await capture('vietnam-'+width+'-dark');
  assert.ok(await vietnam.getAttribute('href').then(href=>!href.includes('/vietnam/')));result.cases.push({id:'home-six-vietnam',width,status:'PASS'});
 }
 await page.setViewportSize({width:1280,height:900});await page.goto(base+'/',{waitUntil:'load'});await page.locator('[data-country-picker-open]').click();
 assert.equal(await page.locator('[data-country-row]').count(),249);await page.locator('[data-country-search]').fill('Vietnam');await page.locator('[data-country-choice="VN"]').click();
 assert.equal(await page.locator('[data-country-choice="VN"]').evaluate(el=>el.tagName),'BUTTON');await capture('country-vietnam-assessment');
 assert.equal(result.unexpectedMutations,0);assert.deepEqual(result.errors,[]);result.status='PASS';await context.close();
 console.log(JSON.stringify({status:result.status,cases:result.cases.length,screenshots:result.screenshots.length,externalRequestsPrevented:result.externalRequestsPrevented}));
}catch(error){result.status='FAIL';result.error=String(error);throw error;}
 finally{if(browser)await browser.close();if(server)await server.stop();result.browserClosed=true;result.ownedServerStopped=true;writeFileSync(output+(delta?'BROWSER_DELTA_VERIFICATION.json':'BROWSER_VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');}
