import {expect,test} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {productionCsp} from './fixtures/production-csp';
import AxeBuilder from '@axe-core/playwright';

// CI owns its synthetic browser/server. This spec is never a request to launch
// another local user browser/profile, submit a form or access a private account.
const ci=Boolean(process.env.CI);
const loaded=ci?spawnSync(process.execPath,['--input-type=module','-e',`
  import{publicBuildEntries,buildPublicRegistryModel}from'./scripts/registry-publication.mjs';
  import{d12E28AProjection}from'./tests/fixtures/d12-e28a-projection.mjs';
  const ids=new Set(['d12/ru','investor/en','d12_extension/de','knowledge_d12_180/ar']);
  const projection=d12E28AProjection();projection.derived_expires_at='2099-01-01T00:00:00Z';
  const entries=publicBuildEntries().filter(entry=>ids.has(entry.contentId+'/'+entry.locale));
  const models=Object.fromEntries(entries.map(entry=>[entry.route,buildPublicRegistryModel(entry,{projection})]));
  process.stdout.write(JSON.stringify({entries,projection,models}));
`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:15_000,maxBuffer:16_000_000}):null;
if(loaded&&loaded.status!==0)throw Error('Approved D12/E28A CI fixture load failed: '+(loaded.error?.message??loaded.stderr));
const fixture=loaded?JSON.parse(loaded.stdout):{entries:[],models:{},projection:null};
const plain=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
  .replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/gu,' ').trim();
test.use({locale:'ru-RU'});

test.describe('D12/E28A synthetic CI render checks',()=>{
  test.skip(!ci,'CI-only synthetic browser; preserve the existing local user browser');
  if(ci&&fixture.entries.length!==4)throw Error('CI requires exactly four approved representative routes');
  const cases=[['d12','ru',320],['investor','en',1280],['d12_extension','de',834],['knowledge_d12_180','ar',320]] as const;
  for(const [contentId,locale,width] of cases)test(`${locale} ${contentId} ${width}px: source, keyboard, support and axe`,async({page})=>{
      const errors:string[]=[],mutations:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
      await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
      await page.route('**/*',async route=>{
        if(!['GET','HEAD'].includes(route.request().method()))mutations.push(route.request().method()+' '+new URL(route.request().url()).pathname);
        const pathname=new URL(route.request().url()).pathname;
        if(pathname==='/api/catalog/pricing')return route.fulfill({json:fixture.projection});
        if(pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
        if(route.request().resourceType()!=='document')return route.continue();
        const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-security-policy':productionCsp}});
      });
      const entry=fixture.entries.find((row:any)=>row.contentId===contentId&&row.locale===locale);
      const response=await page.goto(entry.route);expect(response?.status()).toBe(200);
      const model=fixture.models[entry.route];
      await expect(page.locator('html')).toHaveAttribute('lang',entry.locale);await expect(page.locator('html')).toHaveAttribute('dir',entry.dir);
      await expect(page.locator('html')).toHaveAttribute('data-content-id',entry.contentId);
      await expect(page.locator('h1')).toHaveText(plain(model.titleHtml));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://safrway.online'+entry.route);
      await expect(page.locator('.faq-section')).toHaveCount(1);
      await expect(page.locator('.faq-section h3')).toHaveCount(model.faqSchema.length);
      const actionGroup=page.locator('.registry-cta-actions').first(),opener=actionGroup.locator('button[data-support-open]').first();
      await expect(opener).toBeVisible();
      if(contentId==='d12_extension')await expect(actionGroup.locator('button[data-support-open]')).toHaveCount(2);
      await opener.focus();await expect(opener).toBeFocused();await page.keyboard.press('Enter');
      await expect(page.locator('[data-support-panel]')).toBeVisible();await expect(page.locator('#support-title')).toBeFocused();
      await page.keyboard.press('Tab');await expect(page.locator('#support-name')).toBeFocused();
      await page.keyboard.press('Escape');await expect(page.locator('[data-support-panel]')).toBeHidden();await expect(opener).toBeFocused();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      expect(await page.locator('main').innerText()).not.toMatch(/\{\{(?:CATALOG_PRICE|USD)|RU_APPROVED|MODEL_TRANSLATED|Source revision|Editorial verification/);
      for(const price of await page.locator('[data-registry-price]').all()) {
        await expect(price).toHaveAttribute('data-projection-id',fixture.projection.projection_id);
        await expect(price).toHaveAttribute('data-catalog-version',String(fixture.projection.catalog_version_id));
        await expect(price).toHaveAttribute('data-fx-version',String(fixture.projection.fx_snapshot_id));
      }
      if(contentId==='knowledge_d12_180') {
        await expect(page.locator('main table')).toHaveCount(1);
        const scroll=page.locator('.table-scroll').first();await scroll.focus();await expect(scroll).toBeFocused();
        const overflow=await scroll.evaluate(node=>node.scrollWidth>node.clientWidth);
        if(overflow){await page.keyboard.press('ArrowLeft');await expect.poll(()=>scroll.evaluate(node=>Math.abs(node.scrollLeft))).toBeGreaterThan(0);}
      }
      const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      expect(accessibility.violations).toEqual([]);
      expect(mutations).toEqual([]);expect(errors).toEqual([]);
  });
});
