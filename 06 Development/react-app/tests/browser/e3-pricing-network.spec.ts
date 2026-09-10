import {test, expect} from "@playwright/test";

test("nonpricing account and Mini App Home do not request catalog; pricing consumers share one request", async ({page}) => {
  let calls=0;
  await page.route("**/api/catalog/pricing", route=>{calls++;return route.fulfill({json:{projection_id:"e3",catalog_version_id:1,fx_snapshot_id:2,
    derived_expires_at:new Date(Date.now()+600000).toISOString(),fx:{status:"fresh"},items:[]}});});
  await page.route(/telegram-web-app\.js/, r=>r.fulfill({contentType:"application/javascript",body:""}));
  await page.addInitScript(()=>{window.Telegram={WebApp:{initData:"test",ready(){},expand(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};});
  await page.route("**/mini-app/me", r=>r.fulfill({json:{telegram_id:1,first_name:"Fixture",locale:"en",balance:0,referral_count:0,orders:[]}}));
  await page.route("**/api/web/auth/me", r=>r.fulfill({json:{authenticated:false,login_configured:true}}));
  await page.goto("/account/");
  await expect(page.getByRole("link",{name:/Telegram/})).toBeVisible();
  expect(calls).toBe(0);
  await page.goto("/#/home");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.evaluate(()=>{for(let i=0;i<20;i++)window.dispatchEvent(new Event("focus"));});
  expect(calls).toBe(0);
  await page.goto("/#/services/bali/visas");
  await expect.poll(()=>calls).toBe(1);
  await page.evaluate(()=>{for(let i=0;i<100;i++)window.dispatchEvent(new Event("focus"));});
  await page.waitForTimeout(100); expect(calls).toBe(1);
});
