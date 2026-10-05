// Local release preflight only: one owned headless browser and static server,
// no personal profile, external requests, real API mutations or video playback.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {productionCsp} from './fixtures/production-csp.ts';
import {currentRegistryProjection} from './fixtures/current-registry-projection.mjs';
import {buildPublicRegistryModel,publicEntryForRoute} from '../scripts/registry-publication.mjs';

const executable=process.env.REGISTRY_BROWSER_EXECUTABLE;
assert.ok(executable&&existsSync(executable),'Explicit isolated headless executable required; no personal Chrome fallback');
const output=process.env.RELEASE_CRITICAL_OUTPUT;
assert.ok(output?.startsWith('/private/tmp/'),'Explicit private output file required');
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const projection={...currentRegistryProjection(),derived_expires_at:new Date(Date.now()+3600000).toISOString()};
const result={status:'RUNNING',cases:[],screenshots:[],pageErrors:[],externalRequestsPrevented:0,unexpectedMutations:0,
  personalProfileUsed:false,realSubmissions:false,autoplay:false};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json',
  '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let path;try{path=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{response.writeHead(400);response.end();return;}
  const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root)||!existsSync(file)||!statSync(file).isFile()){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Security-Policy':productionCsp,'Cache-Control':'no-store'});
  response.end(request.method==='HEAD'?undefined:readFileSync(file));
});
let browser,base;
const pass=(id,details={})=>{result.cases.push({id,...details,status:'PASS'});};
const text=value=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
async function context({unknown=false,blocked=false,noJS=false,width=320,locale='ru-RU'}={}){
  const context=await browser.newContext({baseURL:base,viewport:{width,height:844},locale,colorScheme:'light',reducedMotion:'reduce',javaScriptEnabled:!noJS});
  await context.addInitScript(({unknown})=>{
    localStorage.setItem('safrway:appearance','light');
    if(unknown){Object.defineProperty(navigator,'languages',{get:()=>['xx-ZZ']});Object.defineProperty(navigator,'language',{get:()=>'xx-ZZ'});}
  },{unknown});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base){result.externalRequestsPrevented++;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#26342c"/></svg>'});}
    if(blocked&&/\/language-picker\.[^/]+\.js$/.test(url.pathname))return route.abort();
    if(!['GET','HEAD'].includes(request.method())){result.unexpectedMutations++;return route.abort();}
    if(url.pathname==='/api/catalog/pricing')return route.fulfill({json:projection});
    if(url.pathname==='/api/analytics/policy')return route.fulfill({json:{enabled:false,has_consent:false,policy_revision:1}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>result.pageErrors.push(error.message));
  return {context,page};
}
async function contained(page){
  const geometry=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    offenders:[...document.querySelectorAll('body *')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&(box.right>innerWidth+1||box.left< -1);})
      .map(element=>({tag:element.tagName,class:element.className,text:element.textContent?.trim().slice(0,120),right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width})).slice(0,14)}));
  if(geometry.scrollWidth>geometry.viewport+1){result.failedGeometry=geometry;await screenshot(page,'overflow-failure');}
  assert.ok(geometry.scrollWidth<=geometry.viewport+1,'page overflow: '+page.url());
  assert.equal(await page.locator('iframe,video,audio').count(),0);
}
async function screenshot(page,name){const path=join(dirname(output),'critical-browser-'+name+'.png');await page.screenshot({path,fullPage:false});result.screenshots.push(path);}

try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:executable,args:['--autoplay-policy=user-gesture-required','--disable-background-networking']});
  {
    const {context:c,page}=await context({noJS:true});
    try{await page.goto('/bali/visas/e33g/');assert.equal(await page.locator('noscript a[href="https://t.me/safr_bali_bot"]').isVisible(),true);
      assert.equal(await page.locator('[data-language-fallback] a[href="/en/bali/visas/e33g/"]').isVisible(),true);
      await contained(page);await screenshot(page,'no-js-320');pass('no-JS-manager-and-exact-native-language');
    }finally{await c.close();}
  }
  {
    const {context:c,page}=await context({blocked:true});
    try{await page.goto('/bali/');assert.equal(await page.locator('main').isVisible(),true);
      assert.equal(await page.locator('[data-language-fallback] a[href="/en/bali/"]').isVisible(),true);
      assert.equal(await page.locator('#site-language-dialog').isVisible(),false);
      await page.locator('[data-language-fallback] a[href="/en/bali/"]').click();assert.ok(page.url().endsWith('/en/bali/'));
      await contained(page);pass('blocked-language-module-native-navigation');
    }finally{await c.close();}
  }
  {
    const {context:c,page}=await context({unknown:true});
    try{
      let release;const gate=new Promise(resolve=>{release=resolve;});
      await page.route(/\/language-picker\.[^/]+\.js$/,async route=>{await gate;await route.continue();});
      await page.addInitScript(()=>{window.releaseMainCLS=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput&&entry.sources?.some(source=>source.node?.id==='content'))window.releaseMainCLS.push(entry.value);}).observe({type:'layout-shift',buffered:true});});
      try{await page.goto('/bali/',{waitUntil:'commit'});await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#site-language-dialog').isVisible(),false);}finally{release();}
      await page.locator('#site-language-dialog').waitFor({state:'visible'});await contained(page);
      const bounds=await page.locator('#site-language-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=321&&bounds.y>=0&&bounds.y+bounds.height<=845);
      assert.equal(await page.locator('.lp-list li').count(),10);
      assert.equal(await page.locator('.lp-list').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),2);
      assert.ok(await page.evaluate(()=>window.releaseMainCLS.reduce((a,b)=>a+b,0))<.001);
      await screenshot(page,'unknown-language-320');await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-language-picker-open]').evaluate(element=>element===document.activeElement),true);
      pass('unknown-language-modal-no-main-CLS-two-columns-focus');
    }finally{await c.close();}
  }
  for(const locale of ['ru','en'])for(const id of ['c1','e33g']){
    const route=(locale==='en'?'/en':'')+'/bali/visas/'+id+'/';const model=buildPublicRegistryModel(publicEntryForRoute(route),{projection});
    const {context:c,page}=await context({locale:locale==='en'?'en-US':'ru-RU'});
    try{await page.goto(route);await page.waitForFunction(()=>document.querySelector('[data-registry-price]')?.dataset.projectionId);
      assert.equal(await page.locator('html').getAttribute('data-source-revision'),model.sourceRevision);
      assert.equal((await page.locator('h1').textContent()).replace(/\s+/g,' ').trim(),text(model.titleHtml));
      const prices=page.locator('[data-registry-price]');for(const price of await prices.all()){
        assert.equal(await price.getAttribute('data-projection-id'),projection.projection_id);
        assert.equal(await price.getAttribute('data-catalog-version'),String(projection.catalog_version_id));
        assert.equal(await price.getAttribute('data-fx-version'),String(projection.fx_snapshot_id));
      }
      if(id==='c1')assert.equal(await page.locator('[data-registry-price="c1"]').first().textContent(),'2 000 000 IDR (≈ $110)');
      if(id==='e33g'){assert.equal(await page.locator('[data-registry-price="e33g_standard"]').first().textContent(),'12 000 000 IDR (≈ $725)');assert.equal(await page.locator('[data-registry-price="e33g_express"]').first().textContent(),'14 000 000 IDR (≈ $850)');}
      for(const section of model.sections)assert.equal((await page.locator('.article-section[aria-labelledby="'+section.id+'"] .prose').textContent()).replace(/\s+/g,' ').trim(),text(section.html));
      await contained(page);pass('approved-source-and-canonical-prices',{id,locale,width:320});
    }finally{await c.close();}
  }
  for(const locale of ['de','ar']){
    const route=publicEntryForRoute('/'+locale+'/bali/visas/e33g/')?.route;assert.ok(route);
    const {context:c,page}=await context();try{await page.goto(route);await page.waitForFunction(()=>document.querySelector('[data-registry-price]')?.dataset.projectionId);await contained(page);
      assert.equal(await page.locator('html').getAttribute('lang'),locale);assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
      await screenshot(page,locale+'-320');pass('localized-320-no-overflow',{locale});
    }finally{await c.close();}
  }
  assert.equal(result.unexpectedMutations,0);assert.deepEqual(result.pageErrors,[]);result.status='PASS';
}catch(error){result.status='FAIL';result.error=String(error);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));result.browserClosed=true;result.ownedServerStopped=true;
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,cases:result.cases.length,error:result.error,externalRequestsPrevented:result.externalRequestsPrevented,
    unexpectedMutations:result.unexpectedMutations,browserClosed:result.browserClosed,ownedServerStopped:result.ownedServerStopped,output}));}
