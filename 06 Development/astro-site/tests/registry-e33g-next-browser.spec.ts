import {expect,test} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {productionCsp} from './fixtures/production-csp';

// Only GitHub CI's isolated synthetic browser. No personal/local profile,
// authentication, real applicant documents or customer submissions.
const ci=Boolean(process.env.CI);
const cases=[['e33g_next_term','ru',1280],['employment_review','en',834],
  ['knowledge_e33g_extension','ja',320],['e33g_conversion','ar',320]] as const;
const loaded=ci?spawnSync(process.execPath,['--input-type=module','-e',`
  import {publicBuildEntries,buildPublicRegistryModel} from './scripts/registry-publication.mjs';
  import {e33gNextProjection} from './tests/fixtures/e33g-next-projection.mjs';
  const ids=new Set(['e33g_next_term/ru','employment_review/en','knowledge_e33g_extension/ja','e33g_conversion/ar']);
  const projection=e33gNextProjection();projection.derived_expires_at='2099-01-01T00:00:00Z';
  const entries=publicBuildEntries().filter(e=>ids.has(e.contentId+'/'+e.locale));
  const models=Object.fromEntries(entries.map(e=>[e.route,buildPublicRegistryModel(e,{projection})]));
  process.stdout.write(JSON.stringify({entries,models,projection}));
`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:15_000,maxBuffer:16_000_000}):null;
if(loaded&&loaded.status!==0)throw Error('E33G next-stage fixture failed: '+(loaded.error?.message??loaded.stderr));
const fixture=loaded?JSON.parse(loaded.stdout):{entries:[],models:{},projection:null};
test.describe('E33G next-stage isolated CI render checks',()=>{
  test.skip(!ci,'CI-only; preserve the existing local user browser');
  if(ci&&fixture.entries.length!==4)throw Error('Exactly four E33G next-stage representative routes required');
  for(const [contentId,locale,width] of cases)test(`${locale} ${contentId} ${width}px`,async({page})=>{
    const errors:string[]=[],mutations:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
    await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/*',async route=>{
      const request=route.request(),pathname=new URL(request.url()).pathname;
      if(!['GET','HEAD'].includes(request.method()))mutations.push(request.method()+' '+pathname);
      if(pathname==='/api/catalog/pricing')return route.fulfill({json:fixture.projection});
      if(pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
      if(request.resourceType()!=='document')return route.continue();
      const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),
        'content-security-policy':productionCsp}});
    });
    const entry=fixture.entries.find((e:any)=>e.contentId===contentId&&e.locale===locale);
    expect((await page.goto(entry.route))?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    await expect(page.locator('html')).toHaveAttribute('dir',entry.dir);
    await expect(page.locator('h1')).toHaveText(entry.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://safrway.online'+entry.route);
    await expect(page.locator('.faq-section')).toHaveCount(1);
    await expect(page.locator('.faq-section h3')).toHaveCount(fixture.models[entry.route].faqSchema.length);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await page.locator('main').innerText()).not.toMatch(/\{\{(?:CATALOG_PRICE|USD)|RU_APPROVED|MODEL_REVIEWED|RESOLVE_EXISTING|PREVIEW_PENDING/);
    for(const price of await page.locator('[data-registry-price]').all()) {
      await expect(price).toHaveAttribute('data-projection-id',fixture.projection.projection_id);
      await expect(price).toHaveAttribute('data-catalog-version',String(fixture.projection.catalog_version_id));
      await expect(price).toHaveAttribute('data-fx-version',String(fixture.projection.fx_snapshot_id));
    }
    const opener=page.locator('.registry-cta-actions button[data-support-open]').first();
    await opener.focus();await page.keyboard.press('Enter');
    await expect(page.locator('#support-title')).toBeFocused();
    await page.keyboard.press('Tab');await expect(page.locator('#support-name')).toBeFocused();
    await page.keyboard.press('Escape');await expect(page.locator('[data-support-panel]')).toBeHidden();
    await expect(opener).toBeFocused();
    const table=page.locator('.table-scroll').first();await expect(table).toBeVisible();
    await table.focus();await expect(table).toBeFocused();
    if(await table.evaluate(node=>node.scrollWidth>node.clientWidth)) {
      await page.keyboard.press(locale==='ar'?'ArrowLeft':'ArrowRight');
      await expect.poll(()=>table.evaluate(node=>Math.abs(node.scrollLeft))).toBeGreaterThan(0);
    }
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    expect(mutations).toEqual([]);expect(errors).toEqual([]);
  });
});
