import {expect,test} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {productionCsp} from './fixtures/production-csp';

// GitHub CI owns the isolated synthetic browser/server. Never launch a local
// personal profile, authenticate, submit a form or contact a real API here.
// These checks do not attest native translation, immigration law or deployment.
const ci=Boolean(process.env.CI);
const cases=[['family','ru',1280],['family_spouse','en',320],['family_child','de',834],
  ['family_parent','zh-Hans',320],['knowledge_family_documents','ja',1280],
  ['knowledge_e33g_family','ar',320],['family','ar',320]] as const;
const loaded=ci?spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {readFileSync} from 'node:fs';
  import {publicBuildEntries,buildPublicRegistryModel} from './scripts/registry-publication.mjs';
  import {e33gNextProjection} from './tests/fixtures/e33g-next-projection.mjs';
  import {priceDisplay} from './scripts/registry-price-bindings.mjs';
  import registry from '../shared/content/service-registry.v1.json' with {type:'json'};
  import occurrences from '../shared/content/registry-copy/family_kitas_price_occurrences.json' with {type:'json'};
  const familyIds=new Set(['family','family_spouse','family_child','family_parent','knowledge_family_documents']);
  const ids=new Set(['family/ru','family_spouse/en','family_child/de','family_parent/zh-Hans',
    'knowledge_family_documents/ja','knowledge_e33g_family/ar','family/ar']);
  const allEntries=publicBuildEntries(),familyEntries=allEntries.filter(e=>familyIds.has(e.contentId));
  assert.equal(familyEntries.length,50,'All five Family pages must exist in all ten supplied locales');
  for(const id of familyIds)assert.equal(familyEntries.filter(e=>e.contentId===id).length,10);
  // One existing canonical fixture/version for every model and browser request;
  // no new Family catalog row, conversion math or production fallback.
  const projection=e33gNextProjection();projection.derived_expires_at='2099-01-01T00:00:00Z';
  const entries=allEntries.filter(e=>ids.has(e.contentId+'/'+e.locale));
  const models={},sources={};
  for(const entry of entries){
    const record=registry.records.find(row=>row.contentId===entry.contentId);
    const payload=entry.locale==='ru'?record?.candidate.ru:record?.candidate.translations[entry.locale];
    assert.ok(payload?.metadataFile,'Representative route needs its existing canonical source payload');
    const meta=JSON.parse(readFileSync('../shared/content/'+payload.metadataFile,'utf8'));
    assert.equal(meta.h1,entry.title,'DOM H1 expectation must come from the pinned authored metadata');
    const principal=occurrences.occurrences.filter(row=>row.contentId===entry.contentId&&row.locale===entry.locale);
    for(const row of principal){
      assert.equal(row.meaning,'PRINCIPAL_E33G_REFERENCE_NOT_DEPENDENT_PRICE');
      assert.equal(meta.bodyMarkdown.slice(row.fieldSpan.utf16Start,row.fieldSpan.utf16End),row.fieldSpan.literal);
      assert.deepEqual(row.operationIds,['e33g_standard','e33g_express']);
    }
    if(familyIds.has(entry.contentId)){
      assert.equal(meta.quotePolicy.familyFixedPriceApproved,false);
      assert.equal(meta.quotePolicy.familyRate,'INDIVIDUAL_PER_APPLICANT');
      assert.equal(entry.pricingRef,null);
    }
    const operations=principal.flatMap(row=>row.operationIds);
    assert.deepEqual(operations,entry.contentId==='family_spouse'?['e33g_standard','e33g_express']:[]);
    const key=entry.contentId+'/'+entry.locale;
    const model=buildPublicRegistryModel(entry,{projection});models[key]=model;
    sources[key]={h1:meta.h1,faqQuestions:meta.faq?.map(row=>row.question)??null,
      operations,priceText:Object.fromEntries(operations.map(op=>[op,priceDisplay(op,projection,entry.locale,Date.now())])),
      alternates:entry.indexable?[...allEntries.filter(e=>e.contentId===entry.contentId&&e.indexable)
        .map(e=>({locale:e.locale,href:e.route})),{locale:'x-default',
          href:allEntries.find(e=>e.contentId===entry.contentId&&e.locale==='ru').route}]:[]};
  }
  process.stdout.write(JSON.stringify({entries,models,sources,projection}));
`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:15_000,maxBuffer:16_000_000}):null;
if(loaded&&loaded.status!==0)throw Error('Family CI fixture load failed: '+(loaded.error?.message??loaded.stderr));
const fixture=loaded?JSON.parse(loaded.stdout):{entries:[],models:{},sources:{},projection:null};
const plain=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
  .replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/gu,' ').trim();

// Exact supplied excerpts, not authored translations or independent legal claims.
const conditionalCopy:Record<string,string>={
  'family/ru':'Общая классификация E31B/E31E/E31H не означает, что все три категории технически доступны каждому обладателю E33G/Golden Visa.',
  'family_spouse/en':'Although E31B is included in the general family classification, its applicability to a particular E33G/Golden Visa holder must be confirmed through the current eVisa route.',
  'family_child/de':'Bei E33G/Golden Visa muss die tatsächliche Verwendbarkeit der Kategorie jedoch zusätzlich im aktuellen eVisa-System geprüft werden.',
  'family_parent/zh-Hans':'一般 E31 分类表不能保证所有此类身份都可以搭配 E31H 使用。',
  'knowledge_family_documents/ja':'すべての短期滞在資格から出国せずに家族ITASへ変更できるわけではありません。',
  'knowledge_e33g_family/ar':'في التصنيف العائلي العام، تشمل E31B زوج أو زوجة حامل ITAS/ITAP، وتشمل E31E الطفل البيولوجي المؤهل غير المتزوج الذي لم يبلغ 18 عامًا. لكن يجب التحقق من انطباقهما الفعلي على حامل E33G/Golden Visa محدد وفق قواعد الهجرة الحالية ومسار eVisa قبل تأكيد إمكانية الطلب. كما تتطلب E31H للوالدين تقييمًا فرديًا.',
  'family/ar':'لا يعني التصنيف العام E31B/E31E/E31H أن الفئات الثلاث متاحة تقنيًا لكل حامل E33G/Golden Visa.',
};
const quoteCopy:Record<string,string>={
  'family/ru':'Фиксированный тариф для Family KITAS пока не утверждён.',
  'family_spouse/en':'The E31B fee is calculated individually per applicant.',
  'family_child/de':'Der KITAS-Preis wird für jedes Kind individuell ermittelt.',
  'family_parent/zh-Hans':'E31H 按每位父母分别报价。',
  'knowledge_e33g_family/ar':'تقدم SAFRWAY عرض سعر فرديًا لكل متقدم بعد التحقق من الفئة والمدة وطريقة التقديم. لا يوجد سعر ثابت معتمد لتصاريح التابعين من فئة E31.',
  'family/ar':'لم يُعتمد حتى الآن سعر ثابت لخدمة Family KITAS.',
};
const requiredCodes:Record<string,string[]>={'family/ru':['E31B','E31E','E31H'],'family_spouse/en':['E31B'],
  'family_child/de':['E31E'],'family_parent/zh-Hans':['E31H'],'knowledge_family_documents/ja':['E31B','E31E','E31H'],
  'knowledge_e33g_family/ar':['E31B','E31E','E31H'],'family/ar':['E31B','E31E','E31H']};
test.use({serviceWorkers:'block'});

test.describe('Family KITAS isolated synthetic CI render checks',()=>{
  test.skip(!ci,'CI-only synthetic browser; preserve the existing local user browser');
  if(ci&&fixture.entries.length!==7)throw Error('Exactly seven representative Family routes required');
  for(const [contentId,locale,width] of cases)test(`${locale} ${contentId} ${width}px: source, quote, keyboard, support and axe`,async({page,baseURL})=>{
    const errors:string[]=[],mutations:string[]=[],external:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
    await page.addInitScript(()=>{
      const state=window as Window&{__familyCspViolations?:string[]};state.__familyCspViolations=[];
      document.addEventListener('securitypolicyviolation',event=>state.__familyCspViolations!.push(event.violatedDirective));
    });
    await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
    const localOrigin=new URL(baseURL!).origin;
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){
        mutations.push(request.method()+' '+url.pathname);
        return route.fulfill({status:403,json:{detail:'Synthetic CI denies every write'}});
      }
      if(url.origin!==localOrigin){external.push(url.origin+url.pathname);return route.fulfill({status:503,body:''});}
      if(url.pathname==='/api/catalog/pricing')return route.fulfill({json:fixture.projection});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
      if(request.resourceType()!=='document')return route.continue();
      const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),
        'content-security-policy':productionCsp}});
    });
    const caseKey=contentId+'/'+locale;
    const entry=fixture.entries.find((row:any)=>row.contentId===contentId&&row.locale===locale);
    const model=fixture.models[caseKey],source=fixture.sources[caseKey];
    expect((await page.goto(entry.route))?.status()).toBe(200);
    const article=page.locator('main article');await expect(article).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-content-id',contentId);
    await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('h1')).toHaveText(source.h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://safrway.online'+entry.route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',entry.indexable?'index,follow':'noindex,follow');
    // Pending render evidence must not silently fabricate indexability/hreflang.
    const alternates=page.locator('link[rel="alternate"][hreflang]');
    await expect(alternates).toHaveCount(source.alternates.length);
    if(entry.indexable)expect(source.alternates).toHaveLength(11);
    for(const alternate of source.alternates){
      const node=page.locator(`link[rel="alternate"][hreflang="${alternate.locale}"]`);
      await expect(node).toHaveCount(1);await expect(node).toHaveAttribute('href','https://safrway.online'+alternate.href);
    }
    const faq=article.locator('.faq-section');await expect(faq).toHaveCount(1);
    const expectedQuestions=source.faqQuestions??model.sections.filter((section:any)=>section.faq)
      .flatMap((section:any)=>[...section.html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(match=>plain(match[1])));
    expect(expectedQuestions.length).toBeGreaterThan(0);
    await expect(faq.locator('h3')).toHaveCount(expectedQuestions.length);
    for(const question of expectedQuestions)await expect(article.getByRole('heading',{name:plain(question),exact:true})).toHaveCount(1);
    const faqSchemas=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes
      .flatMap(node=>{const value=JSON.parse(node.textContent??'[]');return Array.isArray(value)?value:[value];})
      .filter(value=>value['@type']==='FAQPage'));
    expect(faqSchemas).toHaveLength(model.faqSchema?.length?1:0);
    if(model.faqSchema?.length)expect(faqSchemas[0].mainEntity.map((row:any)=>row.name)).toEqual(expectedQuestions);
    expect(conditionalCopy[caseKey]).toBeTruthy();await expect(article).toContainText(conditionalCopy[caseKey]);
    for(const code of requiredCodes[caseKey])await expect(article).toContainText(code);
    if(quoteCopy[caseKey])await expect(article).toContainText(quoteCopy[caseKey]);
    const mainText=await article.innerText();
    expect(mainText).not.toMatch(/\{\{(?:CATALOG_PRICE|USD)|USD_12M|USD_14M|RU_APPROVED|MODEL_REVIEWED|RESOLVE_EXISTING|PREVIEW_PENDING|QUOTE_ONLY_NO_APPROVED_FIXED_FAMILY_RATE/);
    await expect(article.locator('[data-canonical-price],.e33g-tariff-card')).toHaveCount(0);
    const prices=article.locator('[data-registry-price]');
    await expect(prices).toHaveCount(source.operations.length);
    expect(await prices.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-registry-price')))).toEqual(source.operations);
    for(const operation of source.operations){
      const price=article.locator(`[data-registry-price="${operation}"]`);
      await expect(price).toHaveText(source.priceText[operation]);
      await expect(price).toHaveAttribute('data-projection-id',fixture.projection.projection_id);
      await expect(price).toHaveAttribute('data-catalog-version',String(fixture.projection.catalog_version_id));
      await expect(price).toHaveAttribute('data-fx-version',String(fixture.projection.fx_snapshot_id));
      await expect(price.locator('xpath=ancestor::p[1]')).toContainText('This is not the');
      await expect(price.locator('xpath=ancestor::p[1]')).toContainText('principal E33G visa');
    }
    if(contentId==='knowledge_e33g_family'){
      await expect(article.locator('.direct-answer')).toContainText(conditionalCopy[caseKey]);
      await expect(article.getByRole('heading',{name:'ما تكلفة Family KITAS لأحد أفراد الأسرة؟',exact:true})).toHaveCount(1);
      expect(mainText).not.toMatch(/(?:12|14)[ ,.\u00a0]000[ ,.\u00a0]000|12\/14/);
      expect(JSON.stringify(faqSchemas)).not.toMatch(/USD_12M|USD_14M|(?:12|14)[ ,.\u00a0]000[ ,.\u00a0]000/);
    }
    const contained=async()=>{
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const box=await article.boundingBox();expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual((await page.viewportSize())!.width+1);
    };
    await contained();
    if(contentId==='family'){
      const scroll=article.locator('.table-scroll').first();await expect(scroll).toBeVisible();
      await expect(scroll).toHaveAttribute('tabindex','0');await expect(scroll).toHaveAttribute('aria-label',/\S/);
      await expect(scroll.locator('table thead th')).toHaveCount(3);
      // Same CI browser/page: prove narrow-table keyboard scrolling in both
      // LTR and RTL; no additional case, browser or local profile is created.
      await page.setViewportSize({width:320,height:844});await contained();
      expect(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
      if(locale==='ar')for(const code of requiredCodes[caseKey])await expect(scroll.locator('bdi[dir="ltr"]').filter({hasText:code})).toHaveCount(1);
      await scroll.focus();await expect(scroll).toBeFocused();await page.keyboard.press(locale==='ar'?'ArrowLeft':'ArrowRight');
      await expect.poll(()=>scroll.evaluate(node=>Math.abs(node.scrollLeft)),{timeout:3000}).toBeGreaterThan(0);
      if(locale==='ar')expect(await scroll.evaluate(node=>node.scrollLeft)).toBeLessThan(0);
      await page.setViewportSize({width,height:844});await contained();
    }
    const opener=article.locator('.registry-cta-actions button[data-support-open]').first();
    await expect(opener).toBeVisible();await opener.focus();await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');await expect(page.locator('[data-support-panel]')).toBeVisible();
    await expect(opener).toHaveAttribute('aria-expanded','true');await expect(page.locator('#support-title')).toBeFocused();
    await page.keyboard.press('Tab');await expect(page.locator('#support-name')).toBeFocused();
    await page.keyboard.press('Escape');await expect(page.locator('[data-support-panel]')).toBeHidden();
    await expect(opener).toHaveAttribute('aria-expanded','false');await expect(opener).toBeFocused();
    await contained();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>(window as Window&{__familyCspViolations?:string[]}).__familyCspViolations??[])).toEqual([]);
    expect(mutations).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([]);
  });
});
