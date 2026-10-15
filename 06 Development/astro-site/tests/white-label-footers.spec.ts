import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

// Existing CI browser gate, synthetic public files only. No user browser,
// Telegram SDK, authentication, external services, or production mutation.
const yogaRoot=fileURLToPath(new URL('../dist-yoga-https-preview/',import.meta.url));
for(const width of [390,1440])for(const locale of ['ru','en']) {
  test(`static agency footer ${locale} ${width}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4322(?:\/|$))/,route=>route.abort());
    await page.goto(locale==='ru'?'/':'/en/');
    const footer=page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole('img',{name:'AI Creative Agency NИИK',exact:true})).toBeVisible();
    await expect(footer.getByRole('img',{name:'SAFRWAY',exact:true})).toBeVisible();
    expect(await footer.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await footer.screenshot({path:testInfo.outputPath(`main-footer-${locale}-${width}.png`)});

    await page.route('**/yoga-preview/**',async route=>{
      const url=new URL(route.request().url());
      const relative=decodeURIComponent(url.pathname.slice('/yoga-preview/'.length));
      if(relative.split('/').some(p=>p==='..'||p.startsWith('.')))return route.abort();
      const file=path.join(yogaRoot,relative.endsWith('/')?relative+'index.html':relative);
      try {
        const resolved=await realpath(file);
        if(!resolved.startsWith(yogaRoot))return route.abort();
        await route.fulfill({body:await readFile(resolved),contentType:resolved.endsWith('.css')?'text/css':resolved.endsWith('.js')?'application/javascript':resolved.endsWith('.html')?'text/html':'application/octet-stream'});
      } catch {await route.fulfill({status:404,body:'Not found'});}
    });
    await page.goto('/yoga-preview/'+(locale==='en'?'en/':''));
    const partners=page.locator('#partnership');
    const yogaFooter=page.locator('footer');
    await partners.scrollIntoViewIfNeeded();
    const logo=page.getByRole('img',{name:'SAFRWAY',exact:true});
    await expect(logo).toHaveCount(1);
    expect(await logo.evaluate(e=>Boolean(e.closest('a,button,[tabindex]')))).toBe(false);
    await expect(partners.getByRole('img',{name:'SAFRWAY',exact:true})).toBeVisible();
    await expect(yogaFooter.getByRole('img',{name:'AI Creative Agency NИИK',exact:true})).toBeVisible();
    expect(await yogaFooter.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`yoga-footer-${locale}-${width}.png`)});
  });
}
