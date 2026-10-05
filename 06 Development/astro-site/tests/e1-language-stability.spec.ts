import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { productionCsp as csp } from "./fixtures/production-csp";

const preferenceKey = "safr:public-locale:v1";
const languageAsset = /\/language-picker\.[^/]+\.js$/;
test.use({locale:"en-US"});

async function prepare(page:Page,theme:"light"|"dark"="dark",preference?:string,unknown=false) {
  const violations:string[]=[];
  page.on("console",message=>{if(message.text().includes("Content Security Policy"))violations.push(message.text());});
  await page.addInitScript(({theme,saved,key,unknown})=>{
    localStorage.setItem("safrway:appearance",theme);
    if(saved)localStorage.setItem(key,saved);
    if(unknown){
      Object.defineProperty(navigator,"languages",{get:()=>["xx-ZZ"]});
      Object.defineProperty(navigator,"language",{get:()=>"xx-ZZ"});
    }
    const state=window as typeof window & {e1MainShifts:number[]};state.e1MainShifts=[];
    new PerformanceObserver(list=>{
      for(const raw of list.getEntries()){
        const entry=raw as PerformanceEntry & {hadRecentInput:boolean;value:number;sources:Array<{node?:Node}>};
        if(!entry.hadRecentInput&&entry.sources.some(({node})=>node instanceof HTMLElement&&node.id==="content"))state.e1MainShifts.push(entry.value);
      }
    }).observe({type:"layout-shift",buffered:true});
  },{theme,saved:preference,key:preferenceKey,unknown});
  await page.route("**/*",async route=>{
    if(new URL(route.request().url()).pathname.startsWith("/api/"))return route.fulfill({status:503,json:{}});
    if(route.request().resourceType()!=="document")return route.continue();
    const response=await route.fetch();
    return route.fulfill({response,headers:{...response.headers(),"content-security-policy":csp}});
  });
  return violations;
}

async function assertContained(page:Page){
  const geometry=await page.locator("#site-language-dialog").evaluate(element=>{
    const box=element.getBoundingClientRect();
    return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,
      items:[...element.querySelectorAll(".lp-list li")].map(item=>({left:item.getBoundingClientRect().left,top:item.getBoundingClientRect().top}))};
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-.5);expect(geometry.right).toBeLessThanOrEqual(geometry.width+.5);
  expect(geometry.top).toBeGreaterThanOrEqual(-.5);expect(geometry.bottom).toBeLessThanOrEqual(geometry.height+.5);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width+1);expect(geometry.items).toHaveLength(10);
  expect(Math.abs(geometry.items[0].top-geometry.items[1].top)).toBeLessThan(2);
  expect(geometry.items[0].left).not.toBe(geometry.items[1].left);
}

// Founder-approved modal replaces the retired banner. Delayed enhancement must
// not shift main content. Ten language choices remain two columns at every size.
for(const width of [320,390,1440])for(const theme of ["light","dark"] as const)for(const route of ["/","/bali/"]){
  test(`unknown-language dialog is contained without main CLS: ${route} ${width} ${theme}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:width===320?568:900});
    const violations=await prepare(page,theme,undefined,true);
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route(languageAsset,async request=>{await gate;await request.continue();});
    try{
      await page.goto(route,{waitUntil:"commit"});
      await expect(page.locator("main")).toBeVisible();await expect(page.locator("#site-language-dialog")).toBeHidden();
    }finally{release();}
    await page.waitForLoadState("load");await expect(page.locator("#site-language-dialog")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme",theme);
    await expect(page).toHaveURL(new RegExp(`${route}$`));await assertContained(page);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const shifts=await page.evaluate(()=>(window as typeof window & {e1MainShifts:number[]}).e1MainShifts);
    expect(shifts.reduce((sum,value)=>sum+value,0)).toBeLessThan(.001);
    expect(violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath("language-modal-contained.png"),fullPage:true});
  });
}

for(const preference of ["ru","en"]){
  test(`saved ${preference} preference preserves explicit deep-link locale`,async({page})=>{
    await prepare(page,"dark",preference);await page.goto("/bali/");
    await expect(page.locator("#site-language-dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/bali\/$/);await expect(page.locator("html")).toHaveAttribute("lang","ru");
  });
}

test("unknown-language prompt dismisses by keyboard and persists for the session",async({page})=>{
  await prepare(page,"dark",undefined,true);await page.goto("/bali/");
  const close=page.locator("[data-language-picker-close]");await close.focus();await expect(close).toBeFocused();await close.press("Enter");
  await expect(page.locator("#site-language-dialog")).toBeHidden();await expect(page.locator("[data-language-picker-open]")).toBeFocused();
  await page.reload();await expect(page.locator("#site-language-dialog")).toBeHidden();await expect(page).toHaveURL(/\/bali\/$/);
});

test("manual choice preserves exact localized route and stores preference",async({page})=>{
  await prepare(page);await page.goto("/russia/spb/boat-spb/");
  await expect(page.locator("#site-language-dialog")).toBeHidden();await page.locator("[data-language-picker-open]").click();
  const choice=page.locator("#site-language-dialog [data-language-choice='en']");
  await expect(choice).toHaveAttribute("href","/en/russia/spb/boat-spb/");await choice.click();
  await expect(page).toHaveURL(/\/en\/russia\/spb\/boat-spb\/$/);
  expect(await page.evaluate(key=>localStorage.getItem(key),preferenceKey)).toBe("en");
});

test("blocked picker asset leaves main and native fallback language links usable",async({page})=>{
  await prepare(page);await page.route(languageAsset,route=>route.abort());await page.goto("/bali/");
  await expect(page.locator("main")).toBeVisible();await expect(page.locator("#site-language-dialog")).toBeHidden();
  const choice=page.locator('[data-language-fallback] a[href="/en/bali/"]');
  await expect(choice).toBeVisible();await choice.click();await expect(page).toHaveURL(/\/en\/bali\/$/);
});

test("no-JS visit keeps prompt hidden and native exact language links usable",async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,javaScriptEnabled:false,locale:"en-US"});
  try{const page=await context.newPage();await page.goto("/bali/");
    await expect(page.locator("#site-language-dialog")).toBeHidden();
    const choice=page.locator('[data-language-fallback] a[href="/en/bali/"]');
    await expect(choice).toBeVisible();await choice.click();await expect(page).toHaveURL(/\/en\/bali\/$/);
    await expect(page.locator("main")).toBeVisible();
  }finally{await context.close();}
});

test("visible unknown-language dialog has no WCAG A/AA violations",async({page})=>{
  await page.setViewportSize({width:320,height:568});await prepare(page,"dark",undefined,true);await page.goto("/");
  await expect(page.getByRole("dialog",{name:"Выберите язык"})).toBeVisible();
  const result=await new AxeBuilder({page}).include("#site-language-dialog").withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
});

test("Russian browser stays on unqualified Russian home without prompting",async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,locale:"ru-RU"});
  try{const page=await context.newPage();await prepare(page);await page.goto("/");
    await expect(page.locator("#site-language-dialog")).toBeHidden();await expect(page).toHaveURL(/\/$/);
  }finally{await context.close();}
});

test("browser detection selects English only on an unqualified entry",async({page})=>{
  await prepare(page);await page.goto("/");await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang","en");
});

test("storage denial keeps prompt dismissible without forced deep-link navigation",async({page})=>{
  await prepare(page,"dark",undefined,true);
  await page.addInitScript(()=>{Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Synthetic storage denial","SecurityError");}});});
  await page.goto("/bali/");await page.locator("[data-language-picker-close]").click();
  await expect(page.locator("#site-language-dialog")).toBeHidden();await expect(page).toHaveURL(/\/bali\/$/);
});

test("200 percent zoom-equivalent viewport contains dialog and keyboard targets",async({browser,baseURL},testInfo)=>{
  const context=await browser.newContext({baseURL,viewport:{width:320,height:568},deviceScaleFactor:2,locale:"en-US"});
  try{const page=await context.newPage();await prepare(page,"dark",undefined,true);await page.goto("/");
    await expect(page.locator("#site-language-dialog")).toBeVisible();await assertContained(page);
    const close=page.locator("[data-language-picker-close]");await close.focus();await expect(close).toBeFocused();
    await page.screenshot({path:testInfo.outputPath("language-200-percent-zoom-equivalent.png"),fullPage:true});
    await close.press("Enter");await expect(page.locator("#site-language-dialog")).toBeHidden();
  }finally{await context.close();}
});
