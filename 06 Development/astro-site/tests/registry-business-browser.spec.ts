import {expect,test} from '@playwright/test';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import AxeBuilder from '@axe-core/playwright';

// Actual existing Astro protected renderer in an isolated GitHub Linux runner.
// NEVER start this fixture on the user's Mac, authenticate real users, send
// leads/messages, fetch rates, or claim native/legal/publication certification.
const isolated=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&process.platform==='linux';
const cwd=fileURLToPath(new URL('../',import.meta.url)),origin='http://127.0.0.1:4326';
const token=isolated?randomBytes(32).toString('hex'):'';
const loaded=isolated?spawnSync(process.execPath,['--input-type=module','-e',`
  import {readFileSync} from 'node:fs';
  import registry from '../shared/content/service-registry.v1.json' with {type:'json'};
  import build from '../shared/content/registry-business-build.v1.json' with {type:'json'};
  import {buildRegistryDocument} from './scripts/registry-document.mjs';
  const fixtures={};
  for(const record of build.records)for(const {code:locale} of registry.locales){
    const meta=JSON.parse(readFileSync('../shared/content/'+record.locales[locale].metadataFile));
    const model=buildRegistryDocument(registry,record.contentId,locale,{editorialPreview:true});
    if(!model||model.price||model.tariffPrices||model.faqSchema.length!==6)throw Error('Invalid protected Business model');
    fixtures[record.contentId+'/'+locale]={model,meta};
  }
  process.stdout.write(JSON.stringify(fixtures));
`],{cwd,encoding:'utf8',timeout:15_000,maxBuffer:16_000_000}):null;
if(loaded&&loaded.status!==0)throw Error('Business fixture source load failed: '+(loaded.error?.message??loaded.stderr));
const fixtures=loaded?JSON.parse(loaded.stdout):{};
const cases=[
  ['business','ru',1280],['pma','ru',1280],['nib_oss','ru',1280],
  ['corporate_changes','ru',1280],['liquidation','ru',1280],['knowledge_pt_pma_capital','ru',1280],
  ['business','zh-Hans',375],['pma','en',768],['knowledge_pt_pma_capital','ar',320],
] as const;
const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
test.use({serviceWorkers:'block',trace:'off'});

test.describe('Business exact draft protected-render gate',()=>{
  test.skip(!isolated,'Only the owned GitHub Linux CI runner; preserve every local browser/profile');
  let child:ChildProcess|null=null;
  test.beforeAll(async()=>{
    if(!isolated)return;
    if(Object.keys(fixtures).length!==60)throw Error('Exactly60 immutable Business fixtures required');
    let occupied=false;
    try{await fetch(origin,{signal:AbortSignal.timeout(500)});occupied=true;}catch{/* Require an unused CI-only port. */}
    if(occupied)throw Error('Business fixture port already occupied; refusing to reuse an unknown server');
    child=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port','4326'],{
      cwd,env:{...process.env,SAFRWAY_PREVIEW_BRAND:'',SAFRWAY_PREVIEW_BASE_PATH:'',SAFR_REGISTRY_PREVIEW_TOKEN:token},stdio:'ignore',
    });
    child.on('error',()=>{});
    const deadline=Date.now()+25_000;
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error('Owned Business fixture exited before readiness');
      try{
        const response=await fetch(origin+'/_registry/',{signal:AbortSignal.timeout(500)});
        if(response.status===401&&response.headers.get('www-authenticate')?.includes('SAFRWAY local preview'))return;
      }catch{/* Retry bounded startup only, never a remote request. */}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    throw Error('Owned Business fixture not ready');
  });
  test.afterAll(async()=>{
    if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise<void>(resolve=>{
      const timeout=setTimeout(resolve,5000);child!.once('exit',()=>{clearTimeout(timeout);resolve();});
    });}
  });

  for(const [id,locale,width] of cases)test(`${id}/${locale} ${width}px: actual source, protection, FAQ, CTA and layout`,async({page},testInfo)=>{
    const {model,meta}=fixtures[id+'/'+locale],writes:string[]=[],external:string[]=[],errors:string[]=[];
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){writes.push(request.method()+' '+url.pathname);return route.abort();}
      if(url.origin!==origin){external.push(url.origin+url.pathname);return route.abort();}
      return route.continue();
    });
    page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
    // No token in URL, source snapshots, screenshots, logs, or response body.
    await page.setExtraHTTPHeaders({Authorization:'Basic '+Buffer.from('preview:'+token).toString('base64')});
    const response=await page.goto(origin+'/_registry/'+id+'/?locale='+encodeURIComponent(locale));
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(response?.headers()['content-security-policy']).toContain("form-action 'none'");
    await expect(page).toHaveTitle(meta.sourceRecord.seo.title);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('h1')).toHaveText(meta.h1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',meta.sourceRecord.seo.description);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,nofollow');
    const expected=await page.evaluate(model=>{
      const text=(html:string)=>{const template=document.createElement('template');
        template.innerHTML=html.replace(/<br\s*\/?[^>]*>|<\/(?:p|h[1-6]|li|ul|ol|div|blockquote)>/g,' $&');
        return template.content.textContent??'';};
      return {direct:text(model.directHtml),sections:model.sections.map((section:any)=>({heading:section.heading,text:text(section.html)}))};
    },model);
    expect(normalize(await page.locator('.direct-answer').innerText())).toBe(normalize(expected.direct));
    const sections=page.locator('.reading-body > .article-section');await expect(sections).toHaveCount(model.sections.length);
    for(let index=0;index<expected.sections.length;index++){
      await expect(sections.nth(index).locator('h2')).toHaveText(expected.sections[index].heading);
      expect(normalize(await sections.nth(index).locator('.prose').innerText())).toBe(normalize(expected.sections[index].text));
    }
    await expect(page.locator('.faq-section h3')).toHaveCount(6);
    await expect(page.locator('.manager-button')).toHaveText(meta.sourceRecord.seo.cta);
    await expect(page.locator('.manager-button')).toBeDisabled();
    await expect(page.locator('form,[data-registry-price],.price-line')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    const axes=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(axes.violations).toEqual([]);expect(writes).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([]);
    await page.screenshot({path:testInfo.outputPath('business-'+id+'-'+locale+'-'+width+'.png'),fullPage:true});
  });
});
