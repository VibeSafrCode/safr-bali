const {chromium}=await import(process.env.REGISTRY_PLAYWRIGHT_MODULE ?? "@playwright/test");
import assert from "node:assert/strict";
const base="http://127.0.0.1:4398";
const browser=await chromium.launch({headless:true,...(process.env.REGISTRY_BROWSER_EXECUTABLE ? {executablePath:process.env.REGISTRY_BROWSER_EXECUTABLE} : {})});
const auth={username:"preview",password:process.env.SAFR_REGISTRY_PREVIEW_TOKEN};
const ids=process.env.REGISTRY_CONTENT_IDS?.split(",") ?? ["c1","c1_extension","knowledge_c1_overview","knowledge_c1_extension","knowledge_c1_price"];
const screenshotIds=process.env.REGISTRY_SCREENSHOT_IDS?.split(",") ?? ["c1","knowledge_c1_price"];
const results=[],errors=[];
try {
  const samples=process.env.REGISTRY_SAMPLES_JSON ? JSON.parse(process.env.REGISTRY_SAMPLES_JSON) :
    process.env.T2_PHASE==="targeted" ? [["ru",375],["ar",375]] :
    process.env.T2_PHASE==="ru" ? [["ru",1280],["ru",375]] :
    [["ru",1280],["ru",375],["en",1280],["en",375],["de",1280],["zh-Hans",375],["ja",375],["ar",1280],["ar",375]];
  for(const [locale,width] of samples) {
    const context=await browser.newContext({httpCredentials:auth,viewport:{width,height:900},locale:locale==="zh-Hans"?"zh-CN":locale});
    await context.route("**/*",route=>route.request().url().startsWith(base+"/") ? route.continue() : route.abort());
    const page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    for(const id of (process.env.T2_PHASE==="targeted"?["knowledge_c1_price"]:ids)) {
      const response=await page.goto(base+"/_registry/"+id+"/?locale="+locale,{waitUntil:"load"});
      assert.equal(response.status(),200);
      assert.equal(await page.locator("h1").count(),1);
      assert.equal(await page.locator("html").getAttribute("lang"),locale);
      assert.equal(await page.locator("html").getAttribute("dir"),locale==="ar"?"rtl":"ltr");
      assert.ok(await page.locator(".article-section").count()>=8);
      const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(size.scroll<=size.viewport+1,JSON.stringify({id,locale,width,...size}));
      assert.equal(await page.locator("form,iframe").count(),0);
      results.push({id,locale,width,status:200,overflow:false,sections:await page.locator(".article-section").count()});
      if(screenshotIds.includes(id)) {
        await page.screenshot({path:process.env.T2_SCREENSHOTS+"/"+id+"-"+locale+"-"+width+".png",fullPage:false});
      }
      if(width===375 && ["ru","ar"].includes(locale) && ["knowledge_c1_price","knowledge_evoa_vs_voa"].includes(id)) {
        const table=page.locator(".table-scroll").first();
        await table.scrollIntoViewIfNeeded();
        await page.screenshot({path:process.env.T2_SCREENSHOTS+"/table-"+locale+"-"+width+".png"});
        if(await page.locator(".faq-section").count()) {
          await page.locator(".faq-section").scrollIntoViewIfNeeded();
          await page.screenshot({path:process.env.T2_SCREENSHOTS+"/faq-"+locale+"-"+width+".png"});
        }
      }
    }
    await page.locator("[data-language-button]").click();
    if(["ru","en","ar"].includes(locale)) await page.screenshot({path:process.env.T2_SCREENSHOTS+"/language-"+locale+"-"+width+".png"});
    assert.ok(await page.locator("dialog").evaluate(d=>d.open));
    assert.equal(await page.locator("[data-language-choice]").count(),10);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog").evaluate(d=>d.open),false);
    assert.ok(await page.locator("[data-language-button]").evaluate(b=>b===document.activeElement));
    await context.close();
  }
  if(process.env.T2_PHASE==="all") {
    const context=await browser.newContext({httpCredentials:auth,viewport:{width:375,height:900},locale:"es"});
    const page=await context.newPage();
    await page.goto(base+"/_registry/c1/");
    await page.waitForURL("**locale=es");
    assert.equal(await page.locator("html").getAttribute("lang"),"es");
    await page.evaluate(()=>localStorage.setItem("safr:registry-preview-locale:v1","ja"));
    await page.goto(base+"/_registry/c1/?locale=en");
    assert.equal(await page.locator("html").getAttribute("lang"),"en");
    assert.equal(await page.evaluate(()=>localStorage.getItem("safr:registry-preview-locale:v1")),"ja");
    await page.goto(base+"/_registry/c1/");
    await page.waitForURL("**locale=ja");
    await page.locator("[data-language-button]").click();
    await page.locator('[data-language-choice="ar"]').click();
    await page.waitForURL("**locale=ar");
    assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
    await context.close();
    const unknown=await browser.newContext({httpCredentials:auth,locale:"it"});
    const p=await unknown.newPage();
    await p.goto(base+"/_registry/c1/");
    assert.ok(await p.locator("dialog").evaluate(d=>d.open));
    await p.keyboard.press("Escape");
    await p.waitForFunction(()=>sessionStorage.getItem("safr:registry-preview-locale:v1:dismissed")==="1");
    await p.reload();
    assert.equal(await p.locator("dialog").evaluate(d=>d.open),false);
    await unknown.close();
    const denied=await browser.newContext({httpCredentials:auth,locale:"en"});
    await denied.addInitScript(()=> {
      Object.defineProperty(window,"localStorage",{get(){throw new DOMException("denied","SecurityError");}});
      Object.defineProperty(window,"sessionStorage",{get(){throw new DOMException("denied","SecurityError");}});
    });
    const d=await denied.newPage();
    d.on("pageerror",e=>errors.push(e.message));
    await d.goto(base+"/_registry/c1/?locale=en");
    await d.locator("[data-language-button]").click();
    await d.locator('[data-language-choice="ar"]').click();
    await d.waitForURL("**locale=ar");
    assert.equal(await d.locator("html").getAttribute("dir"),"rtl");
    await d.locator("[data-language-button]").click();
    await d.keyboard.press("Escape");
    assert.equal(await d.locator("dialog").evaluate(d=>d.open),false);
    await denied.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({phase:process.env.T2_PHASE,results,consoleErrors:errors,languageDialog:"PASS",browserClosed:true}));
} finally {await browser.close();}
