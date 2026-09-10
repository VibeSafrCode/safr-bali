import {test, expect} from "@playwright/test";

function projection(expires: number) {
  return {projection_id:"e3-test",catalog_version_id:1,fx_snapshot_id:2,derived_expires_at:new Date(expires).toISOString(),
    items:[{sku:"c1",entity_type:"VISA",entity_key:"C1",show_price:true,amount_idr:"1000000",display_usdt:"60.00",price_qualifier:"EXACT"}]};
}
test("pages without price slots perform zero catalog requests even on focus", async ({page}) => {
  let calls=0;
  await page.route("**/api/catalog/pricing", r=>{calls++; return r.fulfill({json:projection(Date.now()+60000)});});
  await page.goto("/privacy/");
  await page.evaluate(()=>{for(let i=0;i<20;i++)window.dispatchEvent(new Event("focus"));});
  await page.waitForTimeout(100);
  expect(calls).toBe(0);
});
test("catalog has one request per refresh period and no polling while hidden", async ({page}) => {
  const now=Date.now(); await page.clock.install({time:now}); let calls=0;
  await page.route("**/api/catalog/pricing", r=>{calls++;return r.fulfill({json:projection(now+600000)});});
  await page.goto("/bali/visas/c1/");
  await expect(page.locator('[data-canonical-price]')).toContainText("60.00 USDT");
  await page.evaluate(()=>{for(let i=0;i<100;i++)window.dispatchEvent(new Event("focus"));});
  expect(calls).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.fastForward(180000); expect(calls).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("focus"));});
  await expect.poll(()=>calls).toBe(2);
});
test("expired FX disappears during source outage; failures do not spin expiry or focus requests", async ({page}) => {
  const now=Date.now(); await page.clock.install({time:now}); let calls=0;
  await page.route("**/api/catalog/pricing", r=>{calls++;return calls===1 ? r.fulfill({json:projection(now+5000)}) : r.fulfill({status:503,body:"{}"});});
  await page.goto("/bali/visas/c1/");
  const price=page.locator('[data-canonical-price]'); await expect(price).toContainText("60.00 USDT");
  await page.clock.fastForward(6000); await expect(price).not.toContainText("USDT"); await expect(price).toContainText("IDR");
  await page.clock.fastForward(55000); await expect.poll(()=>calls).toBe(2);
  await page.evaluate(()=>{for(let i=0;i<100;i++)window.dispatchEvent(new Event("focus"));});
  await page.clock.fastForward(1000); expect(calls).toBe(2);
});
