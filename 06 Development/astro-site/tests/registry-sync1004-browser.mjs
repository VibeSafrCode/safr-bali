// One owned, isolated run. No personal profile, real forms, media or remote requests.
import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dev} from "astro";
import {chromium} from "@playwright/test";
import {readRegistry} from "../../shared/scripts/validate-service-registry.mjs";
import {buildRegistryDocument} from "../scripts/registry-document.mjs";
import {syncPageIds} from "../../shared/scripts/import-sync-bundle.mjs";

const output=fileURLToPath(new URL("../../../AUDIT/SYNC_2026-10-04/",import.meta.url));
mkdirSync(output+"screenshots",{recursive:true});
const registry=readRegistry();
const manifest=JSON.parse(readFileSync(new URL("../../shared/content/registry-copy/sync1004_manifest.json",import.meta.url)));
const token=randomBytes(32).toString("hex");
process.env.SAFR_REGISTRY_PREVIEW_TOKEN=token; // transient; never persisted or logged
let server,browser;
const results={status:"RUNNING",dom:[],visual:[],consoleErrors:[],externalRequestsBlocked:0,mutatingRequestsBlocked:0,
  personalProfileUsed:false,realSubmissions:false,autoplay:false,
  sourceHashes:Object.fromEntries(["../scripts/registry-document.mjs","../scripts/registry-extension-pricing.mjs",
    "../src/components/registry/RegistryServicePage.astro","../src/styles/registry-preview.css",
    "../../shared/content/service-registry.v1.json"].map(file=>[file,createHash("sha256").update(readFileSync(new URL(file,import.meta.url))).digest("hex")]))};
try {
  server=await dev({root:fileURLToPath(new URL("../",import.meta.url)),server:{host:"127.0.0.1",port:0},logLevel:"error"});
  const base="http://127.0.0.1:"+server.address.port;
  browser=await chromium.launch({headless:true,executablePath:process.env.REGISTRY_BROWSER_EXECUTABLE,
    args:["--autoplay-policy=user-gesture-required","--disable-background-networking"]});
  const context=await browser.newContext({httpCredentials:{username:"preview",password:token},viewport:{width:1280,height:900},locale:"en"});
  await context.route("**/*",route=>{
    const req=route.request();
    if(!req.url().startsWith(base+"/")){results.externalRequestsBlocked++;return route.abort();}
    if(!["GET","HEAD"].includes(req.method())){results.mutatingRequestsBlocked++;return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();
  page.on("pageerror",e=>results.consoleErrors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")results.consoleErrors.push(m.text());});
  // Immediate browser gut-check after starting the owned dev server.
  assert.equal((await page.goto(base+"/_registry/c1/?locale=ru",{waitUntil:"load"})).status(),200);
  assert.equal(await page.locator("h1").count(),1);
  for(const entry of manifest.records){
    const id=syncPageIds[entry.pageKey],locale=entry.locale;
    const model=buildRegistryDocument(registry,id,locale);
    assert.equal((await page.goto(base+"/_registry/"+id+"/?locale="+locale,{waitUntil:"load"})).status(),200);
    assert.equal(await page.locator("h1").textContent(),model.title);
    assert.equal(await page.title(),model.seoTitle);
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"),model.description);
    assert.equal(await page.locator("html").getAttribute("lang"),locale);
    assert.equal(await page.locator("html").getAttribute("dir"),model.dir);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"),"noindex,nofollow");
    assert.equal(await page.locator('link[rel="canonical"]').count(),0); // protected preview, not public SEO
    assert.equal(await page.locator("form,iframe,video,audio").count(),0);
    assert.equal(await page.locator(".manager-button:not([disabled])").count(),0);
    const completeness=await page.evaluate(m=>{
      const normal=s=>s.replace(/\s+/g," ").trim();
      const plain=html=>normal(new DOMParser().parseFromString(html,"text/html").body.textContent);
      const main=normal(document.querySelector("main").textContent);
      const missing=[m.directHtml,m.introHtml,m.factHtml].filter(Boolean).filter(html=>!main.includes(plain(html)));
      for(const section of m.sections){
        const el=document.getElementById(section.id)?.closest("section");
        if(!el || !normal(el.textContent).includes(normal(section.heading)) || !normal(el.textContent).includes(plain(section.html)))missing.push(section.id);
      }
      return missing;
    },model);
    assert.deepEqual(completeness,[],id+"/"+locale+" missing DOM copy");
    if(id==="knowledge_evoa_vs_voa")assert.equal(await page.locator("table").count(),2);
    results.dom.push({contentId:id,locale,status:"PASS",revision:entry.sourceRevision,bodySha256:entry.bodySha256,metadataSha256:entry.metadataSha256,sections:model.sections.length});
  }
  const samples=[["ru",1280],["ru",375],["en",1280],["en",375],["de",1280],["zh-Hans",375],["ja",375],["ar",1280],["ar",375],["hi",375],["ko",375]];
  for(const [locale,width] of samples){
    await page.setViewportSize({width,height:900});
    for(const id of ["c1_extension","knowledge_evoa_vs_voa","e33g","knowledge_e33g_family"]){
      await page.goto(base+"/_registry/"+id+"/?locale="+locale,{waitUntil:"load"});
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify({id,locale,...dimensions}));
      await page.screenshot({path:output+"screenshots/"+id+"-"+locale+"-"+width+".png",fullPage:false});
      if(["e33g","knowledge_e33g_family"].includes(id) && ["ru","ar"].includes(locale)){
        const unit=page.locator('[data-price-unit="per_person"]').first();
        assert.equal(await unit.count(),1);
        await unit.scrollIntoViewIfNeeded();
        await page.screenshot({path:output+"screenshots/unit-"+id+"-"+locale+"-"+width+".png"});
      }
      if(id==="knowledge_evoa_vs_voa" && width===375 && ["ru","ar"].includes(locale)){
        for(let n=0;n<2;n++){
          const table=page.locator(".table-scroll").nth(n);
          await table.scrollIntoViewIfNeeded();
          await page.screenshot({path:output+"screenshots/table"+n+"-"+locale+"-start.png"});
          await table.evaluate(el=>{el.scrollLeft=getComputedStyle(el).direction==="rtl" ? -el.scrollWidth : el.scrollWidth;});
          await page.screenshot({path:output+"screenshots/table"+n+"-"+locale+"-end.png"});
        }
      }
      results.visual.push({contentId:id,locale,width,status:"PASS_LAYOUT",darkTheme:"NOT_IMPLEMENTED_IN_PREVIEW"});
    }
    await page.locator("[data-language-button]").click();
    assert.equal(await page.locator("dialog").evaluate(d=>d.open),true);
    assert.equal(await page.locator("[data-language-choice]").count(),10);
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("[data-language-button]").evaluate(b=>b===document.activeElement));
  }
  assert.deepEqual(results.consoleErrors,[]);
  assert.equal(results.mutatingRequestsBlocked,0);
  results.status="PASS";
  console.log(JSON.stringify({domCases:results.dom.length,layoutCases:results.visual.length,status:results.status}));
  await context.close();
}catch(error){results.status="FAIL";results.error=String(error);throw error;
}finally{
  if(browser)await browser.close();
  if(server)await server.stop();
  delete process.env.SAFR_REGISTRY_PREVIEW_TOKEN;
  results.browserClosed=true;results.ownedServerStopped=true;
  writeFileSync(output+"BROWSER_VERIFICATION.json",JSON.stringify(results,null,2)+"\n");
}
