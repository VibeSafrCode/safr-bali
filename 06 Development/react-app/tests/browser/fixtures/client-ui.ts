import assert from 'node:assert/strict';
import type {Page} from '@playwright/test';

export const CLIENT_FIXTURE_CSRF = 'a'.repeat(64);
const locales = new Set(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
type Locale = 'ru'|'en';
type Preference = {ui_locale:string|null;revision:number};

export function clientPreference(ui_locale:string|null,revision=0):Preference {
  assert.ok(ui_locale===null||locales.has(ui_locale),'Unknown fixture UI locale');
  assert.ok(Number.isSafeInteger(revision)&&revision>=0&&revision<=2147483647,'Invalid fixture revision');
  return {ui_locale,revision};
}

export function webClientAuth(telegram_id:number,ui_locale:Locale,revision=0) {
  assert.ok(Number.isSafeInteger(telegram_id)&&telegram_id>0,'Invalid fixture actor');
  return {authenticated:true,telegram_id,csrf_token:CLIENT_FIXTURE_CSRF,
    client_ui_preference:clientPreference(ui_locale,revision)};
}

export function createMiniPreferenceFixture(telegram_id:number,initial:Locale,revision=0) {
  assert.ok(Number.isSafeInteger(telegram_id)&&telegram_id>0,'Invalid fixture actor');
  let current=clientPreference(initial,revision);
  const writes:Array<{ui_locale:string;expected_revision:number}>=[];
  return {
    writes,
    read:()=>({telegram_id,csrf_token:CLIENT_FIXTURE_CSRF,client_ui_preference:{...current}}),
    setServerPreference(ui_locale:Locale,revision:number) {
      const next=clientPreference(ui_locale,revision);
      assert.ok(next.revision>=current.revision&&(next.revision!==current.revision||next.ui_locale===current.ui_locale),'Invalid fixture projection transition');
      current=next;
    },
    patch(body:unknown,csrf:string|undefined) {
      assert.equal(csrf,CLIENT_FIXTURE_CSRF,'Fixture requires its authenticated CSRF');
      assert.ok(body&&typeof body==='object'&&!Array.isArray(body),'Invalid preference body');
      assert.deepEqual(Object.keys(body).sort(),['expected_revision','ui_locale']);
      const value=body as {ui_locale:string;expected_revision:number};
      clientPreference(value.ui_locale,value.expected_revision);
      assert.notEqual(value.ui_locale,null,'Manual choice cannot be null');
      writes.push({...value});
      if(value.expected_revision!==current.revision)return {status:409,json:{current:{...current}}};
      current=clientPreference(value.ui_locale,current.revision+1);
      return {status:200,json:{...current}};
    },
  };
}

export async function installMiniUiPreference(page:Page,telegram_id:number,locale:Locale,revision=0) {
  const fixture=createMiniPreferenceFixture(telegram_id,locale,revision);
  await page.route('**/mini-app/preferences/ui-locale',async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.origin,'http://127.0.0.1:4323','Synthetic fixture origin only');
    assert.equal(url.pathname,'/mini-app/preferences/ui-locale');
    assert.equal(url.search,'');
    assert.equal(request.headers()['accept'],'application/json');
    if(request.method()==='GET')return route.fulfill({status:200,json:fixture.read()});
    assert.equal(request.method(),'PATCH','Unexpected preference method');
    assert.equal(request.headers()['content-type'],'application/json');
    return route.fulfill(fixture.patch(request.postDataJSON(),request.headers()['x-csrf-token']));
  });
  return fixture;
}
