import assert from 'node:assert/strict';
import type {Page,Route} from '@playwright/test';

export const CLIENT_FIXTURE_CSRF = 'a'.repeat(64);
const locales = new Set(['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar']);
type Locale = 'ru'|'en';
type Preference = {ui_locale:string|null;revision:number};
type FixtureOrigin = 'http://127.0.0.1:4323'|'http://127.0.0.1:4367';
const defaultOrigin:FixtureOrigin='http://127.0.0.1:4323';
const readPaths=new Set(['/api/web/account','/api/web/life-services','/api/web/visa-cases','/api/catalog/pricing',
  '/mini-app/me','/mini-app/life-services','/mini-app/visa-cases']);
function fixtureOrigin(origin:FixtureOrigin) {
  assert.ok(origin===defaultOrigin||origin==='http://127.0.0.1:4367','Synthetic fixture origin only');
}
function preferenceRequest(route:Route,origin:FixtureOrigin,path:string) {
  const request=route.request(),url=new URL(request.url());
  assert.equal(url.origin,origin,'Synthetic fixture origin only');
  assert.equal(url.pathname,path);assert.equal(url.search,'');
  assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.hash,'');
  assert.equal(request.headers()['accept'],'application/json');
  return request;
}

/** Closed client-only read fixture. Install before the exact auth/preference
 * handlers. Unknown API routes/methods never receive a successful fallback. */
export async function installClientFixtureReads(page:Page,origin:FixtureOrigin,
  reads:ReadonlyMap<string,{json:unknown;status?:number}>) {
  fixtureOrigin(origin);
  for(const [path,response] of reads){
    assert.ok(readPaths.has(path),'Unknown client fixture read path');
    assert.ok(response.status===undefined||response.status===200||
      (path==='/api/catalog/pricing'&&response.status===503),'Unexpected client fixture status');
  }
  const unexpected:string[]=[];
  await page.route(url=>url.origin===origin&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/mini-app/')),route=>{
    const request=route.request(),url=new URL(request.url()),response=reads.get(url.pathname);
    if(response&&request.method()==='GET'&&url.search===''&&url.username===''&&url.password===''&&url.hash===''&&request.headers()['accept']==='application/json')
      return route.fulfill({status:response.status??200,json:response.json});
    unexpected.push(`${request.method()} ${url.pathname}${url.search}`);
    return route.fulfill({status:404,json:{detail:'Unmocked synthetic client API request'}});
  });
  return unexpected;
}

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

export async function installWebUiPreference(page:Page,telegram_id:number,locale:Locale,revision=0,origin:FixtureOrigin=defaultOrigin) {
  fixtureOrigin(origin);
  const fixture=createMiniPreferenceFixture(telegram_id,locale,revision);
  await page.route('**/api/web/auth/me',async route=>{
    const request=preferenceRequest(route,origin,'/api/web/auth/me');
    assert.equal(request.method(),'GET','Unexpected authenticated read method');
    return route.fulfill({status:200,json:{authenticated:true,...fixture.read()}});
  });
  await page.route('**/api/web/preferences/ui-locale',async route=>{
    const request=preferenceRequest(route,origin,'/api/web/preferences/ui-locale');
    assert.equal(request.method(),'PATCH','Unexpected preference method');
    assert.equal(request.headers()['content-type'],'application/json');
    return route.fulfill(fixture.patch(request.postDataJSON(),request.headers()['x-csrf-token']));
  });
  return fixture;
}

export async function installMiniUiPreference(page:Page,telegram_id:number,locale:Locale,revision=0,origin:FixtureOrigin=defaultOrigin) {
  fixtureOrigin(origin);
  const fixture=createMiniPreferenceFixture(telegram_id,locale,revision);
  await page.route('**/mini-app/preferences/ui-locale',async route=>{
    const request=preferenceRequest(route,origin,'/mini-app/preferences/ui-locale');
    if(request.method()==='GET')return route.fulfill({status:200,json:fixture.read()});
    assert.equal(request.method(),'PATCH','Unexpected preference method');
    assert.equal(request.headers()['content-type'],'application/json');
    return route.fulfill(fixture.patch(request.postDataJSON(),request.headers()['x-csrf-token']));
  });
  return fixture;
}
