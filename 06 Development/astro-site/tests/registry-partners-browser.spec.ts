import {expect,test} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import {productionCsp} from './fixtures/production-csp';

// GitHub CI's isolated synthetic browser only. Never open a local profile,
// authenticate, submit a lead, send a message or invoke payment/Referral APIs.
// Source approval and these checks are not native/legal/deployment certification.
const ci=Boolean(process.env.CI);
const cases=[['ru',1280],['en',375],['ar',320]] as const;
const loaded=ci?spawnSync(process.execPath,['--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import {readFileSync} from 'node:fs';
  import {createHash} from 'node:crypto';
  import registry from '../shared/content/service-registry.v1.json' with {type:'json'};
  import {publicBuildEntries,publicTargetHref,buildPublicRegistryModel} from './scripts/registry-publication.mjs';
  import {safeMarkdown} from './scripts/registry-document.mjs';
  import {e33gNextProjection} from './tests/fixtures/e33g-next-projection.mjs';
  const entries=publicBuildEntries().filter(entry=>entry.contentId==='partners');
  assert.equal(entries.length,10,'All ten approved Partners models need offline coverage');
  assert.equal(new Set(entries.map(entry=>entry.locale)).size,10);
  const record=registry.records.find(row=>row.contentId==='partners');
  assert.equal(record.serviceId,null);assert.equal(record.pricingRef,null);
  // Existing canonical synthetic projection/version, never a Partners tariff.
  const projection=e33gNextProjection();projection.derived_expires_at='2099-01-01T00:00:00Z';
  const plain=html=>html.replace(/<br\\s*\\/?[^>]*>|<\\/(?:p|h[1-6]|li|ul|ol|div|blockquote)>/g,' ')
    .replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"')
    .replaceAll('&lt;','<').replaceAll('&gt;','>').replace(/\\s+/gu,' ').trim();
  const models={},sources={};
  for(const entry of entries){
    const key='partners/'+entry.locale,payload=entry.locale==='ru'?record.candidate.ru:record.candidate.translations[entry.locale];
    assert.ok(payload?.metadataFile);
    const bytes=readFileSync('../shared/content/'+payload.metadataFile),meta=JSON.parse(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),payload.metadataSha256);
    assert.equal(meta.fullPayloadKind,'PARTNERS_B2B_FULL_JSON_V1');assert.equal(meta.locale,entry.locale);
    assert.equal(meta.quotePolicy.fixedPriceApproved,false);assert.equal(meta.quotePolicy.businessServiceCreated,false);
    assert.equal(meta.quotePolicy.referral,'INTERNAL_PREVIEW_ONLY_NO_PUBLIC_LINK');
    assert.equal(meta.h1,meta.sourceRecord.seo.h1);assert.equal(meta.h1,entry.title);assert.equal(meta.faq.length,9);
    const markdown=raw=>plain(safeMarkdown(raw,{registry,locale:entry.locale,targetHref:publicTargetHref}));
    const starts=[...meta.bodyMarkdown.matchAll(/^## (.+)$/gm)];assert.equal(starts.length,7);
    const sections=starts.map((match,index)=>({heading:match[1],
      text:markdown(meta.bodyMarkdown.slice(match.index+match[0].length,starts[index+1]?.index??meta.bodyMarkdown.length))}));
    const model=buildPublicRegistryModel(entry,{projection});
    assert.equal(model.title,meta.h1);assert.equal(model.seoTitle,meta.sourceRecord.seo.title);
    assert.equal(model.description,meta.sourceRecord.seo.description);assert.equal(model.sections.length,7);
    assert.equal(model.faqSchema.length,9);assert.equal(model.sections.filter(section=>section.faq).length,1);
    assert.deepEqual(model.sourceContext,{section:'partners',content_id:'partners',source_revision:entry.sourceRevision,path:entry.route,locale:entry.locale});
    assert.equal(model.price,null);assert.equal(model.tariffPrices,null);
    assert.deepEqual(model.ctaActions,[{label:meta.sourceRecord.cta.primaryLabel,href:null,manager:true,intent:'existing_b2b_lead_or_contact_flow'},
      {label:meta.sourceRecord.cta.secondaryAnchorLabel,href:'#partner-services',manager:false,intent:'scroll_to_partner_services_section'}]);
    assert.equal(model.sections[1].id,'partner-services');assert.equal(model.finalCtaActions.length,1);
    assert.equal(model.finalCtaActions[0].label,meta.sourceRecord.cta.finalLabel);assert.equal(model.finalCtaActions[0].manager,true);
    model.sections.forEach((section,index)=>{assert.equal(section.heading,sections[index].heading);assert.equal(plain(section.html),sections[index].text);});
    const html=model.directHtml+model.introHtml+model.factHtml+model.sections.map(section=>section.html).join('');
    assert.doesNotMatch(html,/data-registry-price|CATALOG_PRICE|USD_12M|USD_14M|Content references for Codex|RU_REVIEW|MODEL_TRANSLATED/);
    assert.ok(!html.includes(meta.sourceRecord.cta.secondaryReferralCopy));
    models[key]=model;sources[key]={h1:meta.h1,seo:meta.sourceRecord.seo,
      directText:markdown(meta.directAnswer),sections,faq:meta.faq.map(row=>({question:row.question,answer:markdown(row.answerMarkdown)})),
      primaryLabel:meta.sourceRecord.cta.primaryLabel,secondaryLabel:meta.sourceRecord.cta.secondaryAnchorLabel,
      finalLabel:meta.sourceRecord.cta.finalLabel,referralCopy:meta.sourceRecord.cta.secondaryReferralCopy};
  }
  process.stdout.write(JSON.stringify({entries,models,sources,projection}));
`],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:15_000,maxBuffer:16_000_000}):null;
if(loaded&&loaded.status!==0)throw Error('Partners CI fixture load failed: '+(loaded.error?.message??loaded.stderr));
const fixture=loaded?JSON.parse(loaded.stdout):{entries:[],models:{},sources:{},projection:null};
const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
test.use({serviceWorkers:'block'});

test.describe('Partners B2B isolated synthetic CI render checks',()=>{
  test.skip(!ci,'CI-only; preserve the existing local user browser and profile');
  if(ci&&fixture.entries.length!==10)throw Error('Exactly ten pinned Partners models required');
  for(const [locale,width] of cases)test(`${locale} partners ${width}px: full source, attribution, CTAs, CSP and axe`,async({page,baseURL})=>{
    const errors:string[]=[],mutations:string[]=[],external:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.text().includes('Content Security Policy'))errors.push(message.text());});
    await page.addInitScript(()=>{
      const state=window as Window&{__partnersCspViolations?:string[]};state.__partnersCspViolations=[];
      document.addEventListener('securitypolicyviolation',event=>state.__partnersCspViolations!.push(event.violatedDirective));
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
    const entry=fixture.entries.find((row:any)=>row.locale===locale),key='partners/'+locale;
    const model=fixture.models[key],source=fixture.sources[key];
    expect((await page.goto(entry.route))?.status()).toBe(200);
    const article=page.locator('main article');await expect(article).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-content-id','partners');
    await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('h1')).toHaveText(source.h1);
    const title=source.seo.title.includes('SAFRWAY')?source.seo.title:source.seo.title+' — SAFRWAY';
    await expect(page).toHaveTitle(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',source.seo.description);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content',source.seo.description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://safrway.online'+entry.route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',entry.indexable?'index,follow':'noindex,follow');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(model.alternates.length);
    for(const alternate of model.alternates)await expect(page.locator(`link[rel="alternate"][hreflang="${alternate.locale}"]`))
      .toHaveAttribute('href','https://safrway.online'+alternate.href);
    const context=JSON.parse((await article.getAttribute('data-route-context'))!);
    expect(context).toEqual({section:'partners',content_id:'partners',source_revision:entry.sourceRevision,path:entry.route,locale});
    expect(context).not.toHaveProperty('country');expect(context).not.toHaveProperty('service');
    expect(normalize(await article.locator('.direct-answer').innerText())).toBe(source.directText);
    const sections=article.locator('.article-section');await expect(sections).toHaveCount(7);
    for(let index=0;index<source.sections.length;index++){
      await expect(sections.nth(index).locator('h2').first()).toHaveText(source.sections[index].heading);
      expect(normalize(await sections.nth(index).locator('.prose').innerText())).toBe(source.sections[index].text);
    }
    const faq=article.locator('.faq-section');await expect(faq).toHaveCount(1);await expect(faq.locator('h3')).toHaveCount(9);
    for(const row of source.faq)await expect(article.getByRole('heading',{name:row.question,exact:true})).toHaveCount(1);
    const faqSchemas=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes
      .flatMap(node=>{const value=JSON.parse(node.textContent??'[]');return Array.isArray(value)?value:[value];})
      .filter(value=>value['@type']==='FAQPage'));
    expect(faqSchemas).toHaveLength(1);expect(faqSchemas[0].mainEntity).toHaveLength(9);
    expect(faqSchemas[0].mainEntity.map((row:any)=>({question:row.name,answer:normalize(row.acceptedAnswer.text)}))).toEqual(source.faq);
    const articleText=await article.innerText();
    expect(articleText).not.toMatch(/\b(?:IDR|USD)\b|\$\d|\d\s*%|CATALOG_PRICE|USD_12M|USD_14M|Content references for Codex|RU_REVIEW|MODEL_TRANSLATED|Source revision|Editorial verification|bodyMarkdown|sourceRecord/);
    expect(articleText).not.toContain(source.referralCopy);
    await expect(article.locator('[data-registry-price],[data-canonical-price],[data-payment],[data-checkout],form,input,textarea')).toHaveCount(0);
    const forbiddenLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')??'')
      .filter(href=>/\/(?:referral|account\/partners)(?:[/?#]|$)/i.test(href)));
    expect(forbiddenLinks).toEqual([]);
    const hero=article.locator('.service-hero .registry-cta-actions');await expect(hero).toHaveCount(1);
    const primary=hero.locator('button[data-support-open]');await expect(primary).toHaveCount(1);await expect(primary).toHaveText(source.primaryLabel);
    const secondary=hero.getByRole('link',{name:source.secondaryLabel,exact:true});await expect(secondary).toHaveAttribute('href','#partner-services');
    const target=page.locator('h2#partner-services');await expect(target).toHaveCount(1);await expect(target).toHaveText(source.sections[1].heading);
    await secondary.focus();await expect(secondary).toBeFocused();await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#partner-services$/);await expect(target).toBeInViewport();
    const final=article.locator('.reading-body > .registry-cta-actions button[data-support-open]');
    await expect(final).toHaveCount(1);await expect(final).toHaveText(source.finalLabel);
    for(const opener of [primary,final]){
      await expect(opener).toHaveAttribute('aria-controls','support-panel');await opener.focus();await expect(opener).toBeFocused();
      await page.keyboard.press('Enter');await expect(page.locator('[data-support-panel]')).toBeVisible();
      await expect(opener).toHaveAttribute('aria-expanded','true');await expect(page.locator('#support-title')).toBeFocused();
      await page.keyboard.press('Tab');await expect(page.locator('#support-name')).toBeFocused();
      await page.keyboard.press('Escape');await expect(page.locator('[data-support-panel]')).toBeHidden();
      await expect(opener).toHaveAttribute('aria-expanded','false');await expect(opener).toBeFocused();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const box=await article.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>(window as Window&{__partnersCspViolations?:string[]}).__partnersCspViolations??[])).toEqual([]);
    expect(mutations).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([]);
  });
});
