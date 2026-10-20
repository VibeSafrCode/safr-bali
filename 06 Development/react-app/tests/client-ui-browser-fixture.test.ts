import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIENT_FIXTURE_CSRF,clientPreference,createMiniPreferenceFixture,installClientFixtureReads,installMiniUiPreference,installWebUiPreference,webClientAuth} from './browser/fixtures/client-ui.ts';

test('browser fixture binds one actor, a real-shaped CSRF and independent UI projection',()=>{
  const auth=webClientAuth(618,'en',7);
  assert.equal(auth.telegram_id,618);assert.match(auth.csrf_token,/^[a-f0-9]{64}$/);
  assert.deepEqual(auth.client_ui_preference,{ui_locale:'en',revision:7});
  assert.equal(Object.hasOwn(auth,'locale'),false,'UI preference is not contact locale');
  for(const actor of [0,-1,NaN,1.5])assert.throws(()=>webClientAuth(actor,'ru'));
  assert.throws(()=>clientPreference('invalid'));assert.throws(()=>clientPreference('ru',-1));
});

test('Mini fixture keeps exact CAS body, rejects stale writes and preserves server revision',()=>{
  const fixture=createMiniPreferenceFixture(618,'en',7);
  assert.equal(fixture.read().telegram_id,618);
  assert.deepEqual(fixture.patch({ui_locale:'ru',expected_revision:7},CLIENT_FIXTURE_CSRF),{status:200,json:{ui_locale:'ru',revision:8}});
  assert.deepEqual(fixture.patch({ui_locale:'en',expected_revision:7},CLIENT_FIXTURE_CSRF),{status:409,json:{current:{ui_locale:'ru',revision:8}}});
  assert.deepEqual(fixture.read().client_ui_preference,{ui_locale:'ru',revision:8});
  assert.equal(fixture.writes.length,2);
  fixture.setServerPreference('en',9);
  assert.throws(()=>fixture.setServerPreference('ru',9));
  assert.throws(()=>fixture.setServerPreference('en',8));
  assert.deepEqual(fixture.read().client_ui_preference,{ui_locale:'en',revision:9});
});

test('Mini fixture refuses contact DTOs, extra authority fields and invalid CSRF',()=>{
  const fixture=createMiniPreferenceFixture(618,'en');
  for(const body of [{locale:'ru'},{ui_locale:'ru',expected_revision:0,telegram_id:1},{ui_locale:null,expected_revision:0}])
    assert.throws(()=>fixture.patch(body,CLIENT_FIXTURE_CSRF));
  assert.throws(()=>fixture.patch({ui_locale:'ru',expected_revision:0},'fixture'));
  assert.equal(fixture.writes.length,0);
  assert.deepEqual(fixture.read().client_ui_preference,{ui_locale:'en',revision:0});
});

test('route fixture handles only exact local preference GET/PATCH and rejects unknown authority or methods',async()=>{
  let handle!: (route:any)=>Promise<unknown>;
  const page={route:async(pattern:string,callback:typeof handle)=>{
    assert.equal(pattern,'**/mini-app/preferences/ui-locale');handle=callback;
  }} as unknown as Parameters<typeof installMiniUiPreference>[0];
  const fixture=await installMiniUiPreference(page,618,'en',7);
  let replies=0;
  const invoke=(url:string,method='GET',body:unknown=undefined,csrf=CLIENT_FIXTURE_CSRF,accept='application/json',contentType='application/json')=>handle({
    request:()=>({url:()=>url,method:()=>method,postDataJSON:()=>body,headers:()=>({'x-csrf-token':csrf,accept,'content-type':contentType})}),
    fulfill:async(response:unknown)=>{replies++;return response;},
  });
  const exact='http://127.0.0.1:4323/mini-app/preferences/ui-locale';
  assert.deepEqual(await invoke(exact),{status:200,json:fixture.read()});
  assert.deepEqual(await invoke(exact,'PATCH',{ui_locale:'ru',expected_revision:7}),{status:200,json:{ui_locale:'ru',revision:8}});
  for(const url of ['https://example.invalid/mini-app/preferences/ui-locale',exact+'?actor=1',exact.replace('/mini-app/','/yoga-preview/mini-app/api/mini-app/')])
    await assert.rejects(invoke(url));
  for(const method of ['POST','DELETE','HEAD'])await assert.rejects(invoke(exact,method));
  await assert.rejects(invoke(exact,'PATCH',{ui_locale:'en',expected_revision:8},'fixture'));
  await assert.rejects(invoke(exact,'GET',undefined,CLIENT_FIXTURE_CSRF,'text/html'));
  await assert.rejects(invoke(exact,'PATCH',{ui_locale:'en',expected_revision:8},CLIENT_FIXTURE_CSRF,'application/json','text/plain'));
  assert.equal(replies,2,'Rejected calls were never fulfilled');
  assert.deepEqual(fixture.writes,[{ui_locale:'ru',expected_revision:7}]);
});

function routeHarness() {
  const handlers=new Map<string|((url:URL)=>boolean),(route:any)=>unknown>();
  let replies=0;
  const page={route:async(pattern:string|((url:URL)=>boolean),callback:(route:any)=>unknown)=>{handlers.set(pattern,callback);}} as unknown as Parameters<typeof installMiniUiPreference>[0];
  return {page,handlers,get replies(){return replies;},
    async invoke(pattern:string|((url:URL)=>boolean),url:string,method='GET',body:unknown=undefined,
      csrf=CLIENT_FIXTURE_CSRF,accept='application/json',contentType='application/json') {
      const handler=handlers.get(pattern);assert.ok(handler,'Fixture handler must be registered');
      return handler({request:()=>({url:()=>url,method:()=>method,postDataJSON:()=>body,
        headers:()=>({'x-csrf-token':csrf,accept,'content-type':contentType})}),
        fulfill:async(response:unknown)=>{replies++;return response;}});
    },
  };
}

test('Life Mini preference explicitly permits only 4367 with exact actor/CSRF/projection and CAS',async()=>{
  const h=routeHarness(),pattern='**/mini-app/preferences/ui-locale',origin='http://127.0.0.1:4367';
  const fixture=await installMiniUiPreference(h.page,5,'ru',0,origin),exact=origin+'/mini-app/preferences/ui-locale';
  assert.deepEqual(await h.invoke(pattern,exact),{status:200,json:{telegram_id:5,csrf_token:CLIENT_FIXTURE_CSRF,
    client_ui_preference:{ui_locale:'ru',revision:0}}});
  assert.deepEqual(await h.invoke(pattern,exact,'PATCH',{ui_locale:'en',expected_revision:0}),{status:200,json:{ui_locale:'en',revision:1}});
  assert.deepEqual(await h.invoke(pattern,exact,'PATCH',{ui_locale:'ru',expected_revision:0}),{status:409,json:{current:{ui_locale:'en',revision:1}}});
  for(const url of [exact.replace(':4367',':4323'),exact.replace(':4367',':4368'),exact.replace('127.0.0.1','localhost'),
    exact.replace('http:','https:'),exact.replace('127.0.0.1','example.invalid'),exact+'?actor=6',exact+'#actor6',
    exact.replace('/mini-app/','/yoga-preview/mini-app/'),exact.replace('127.0.0.1','actor:secret@127.0.0.1')])
    await assert.rejects(h.invoke(pattern,url));
  for(const method of ['POST','PUT','DELETE','HEAD'])await assert.rejects(h.invoke(pattern,exact,method));
  for(const body of [{locale:'en'},{ui_locale:'en',expected_revision:1,telegram_id:6},{ui_locale:'en',expected_revision:1,extra:true},
    {ui_locale:null,expected_revision:1},{ui_locale:'bad',expected_revision:1}])
    await assert.rejects(h.invoke(pattern,exact,'PATCH',body));
  for(const csrf of ['fixture','f'.repeat(64),''])await assert.rejects(h.invoke(pattern,exact,'PATCH',{ui_locale:'ru',expected_revision:1},csrf));
  await assert.rejects(h.invoke(pattern,exact,'GET',undefined,CLIENT_FIXTURE_CSRF,'text/html'));
  await assert.rejects(h.invoke(pattern,exact,'PATCH',{ui_locale:'ru',expected_revision:1},CLIENT_FIXTURE_CSRF,'application/json','text/plain'));
  assert.equal(h.replies,3);assert.deepEqual(fixture.read().client_ui_preference,{ui_locale:'en',revision:1});
  assert.deepEqual(fixture.writes,[{ui_locale:'en',expected_revision:0},{ui_locale:'ru',expected_revision:0}]);
});

test('Life web auth read and PATCH use one actor/current CSRF, independent UI locale and exact CAS',async()=>{
  const h=routeHarness(),origin='http://127.0.0.1:4367',read='**/api/web/auth/me',write='**/api/web/preferences/ui-locale';
  const fixture=await installWebUiPreference(h.page,5,'en',4,origin),readUrl=origin+'/api/web/auth/me',writeUrl=origin+'/api/web/preferences/ui-locale';
  assert.deepEqual(await h.invoke(read,readUrl),{status:200,json:{authenticated:true,telegram_id:5,csrf_token:CLIENT_FIXTURE_CSRF,
    client_ui_preference:{ui_locale:'en',revision:4}}});
  assert.deepEqual(await h.invoke(write,writeUrl,'PATCH',{ui_locale:'ru',expected_revision:4}),{status:200,json:{ui_locale:'ru',revision:5}});
  assert.deepEqual(await h.invoke(write,writeUrl,'PATCH',{ui_locale:'en',expected_revision:4}),{status:409,json:{current:{ui_locale:'ru',revision:5}}});
  assert.deepEqual(await h.invoke(read,readUrl),{status:200,json:{authenticated:true,...fixture.read()}});
  assert.equal(Object.hasOwn(fixture.read(),'locale'),false,'Contact preference is never invented');
  for(const [pattern,url,method] of [[read,readUrl,'PATCH'],[write,writeUrl,'GET'],[write,writeUrl,'POST'],[write,writeUrl,'DELETE']])
    await assert.rejects(h.invoke(pattern,url,method));
  for(const [pattern,url] of [[read,readUrl],[write,writeUrl]])for(const bad of [url.replace(':4367',':4323'),url.replace(':4367',':4368'),
    url.replace('127.0.0.1','example.invalid'),url+'?actor=6',url.replace('/api/web/','/yoga/api/web/')])
    await assert.rejects(h.invoke(pattern,bad,pattern===read?'GET':'PATCH',{ui_locale:'en',expected_revision:5}));
  for(const body of [{locale:'en'},{ui_locale:'en',expected_revision:5,telegram_id:6},{ui_locale:'en',expected_revision:5,extra:true}])
    await assert.rejects(h.invoke(write,writeUrl,'PATCH',body));
  for(const csrf of ['fixture','f'.repeat(64),''])await assert.rejects(h.invoke(write,writeUrl,'PATCH',{ui_locale:'en',expected_revision:5},csrf));
  await assert.rejects(h.invoke(read,readUrl,'GET',undefined,CLIENT_FIXTURE_CSRF,'text/html'));
  await assert.rejects(h.invoke(write,writeUrl,'PATCH',{ui_locale:'en',expected_revision:5},CLIENT_FIXTURE_CSRF,'application/json','text/plain'));
  assert.equal(h.replies,4);assert.equal(fixture.writes.length,2);
});

test('fixture origin is a two-value allowlist and defaults remain isolated to 4323',async()=>{
  for(const origin of ['http://127.0.0.1:4368','http://localhost:4367','https://127.0.0.1:4367','https://example.invalid']){
    const h=routeHarness();
    await assert.rejects(installMiniUiPreference(h.page,5,'ru',0,origin as any));
    await assert.rejects(installWebUiPreference(h.page,5,'ru',0,origin as any));
    await assert.rejects(installClientFixtureReads(h.page,origin as any,new Map()));
    assert.equal(h.handlers.size,0);
  }
  const h=routeHarness();await installWebUiPreference(h.page,5,'ru');
  await h.invoke('**/api/web/auth/me','http://127.0.0.1:4323/api/web/auth/me');
  await assert.rejects(h.invoke('**/api/web/auth/me','http://127.0.0.1:4367/api/web/auth/me'));
  assert.equal(h.replies,1);
});

test('client reads are exact GETs and unknown paths/query/methods close with recorded 404, never success',async()=>{
  const h=routeHarness(),origin='http://127.0.0.1:4367';
  const unexpected=await installClientFixtureReads(h.page,origin,new Map([
    ['/api/web/account',{json:{telegram_id:5}}],
    ['/api/catalog/pricing',{status:503,json:{detail:'Synthetic pricing unavailable'}}],
  ]));
  const predicate=[...h.handlers.keys()][0];assert.equal(typeof predicate,'function');
  const matches=predicate as (url:URL)=>boolean;
  assert.equal(matches(new URL(origin+'/api/web/account')),true);
  for(const url of ['http://127.0.0.1:4323/api/web/account','http://127.0.0.1:4368/api/web/account',
    'https://example.invalid/api/web/account',origin+'/assets/site.js'])assert.equal(matches(new URL(url)),false);
  assert.deepEqual(await h.invoke(predicate,origin+'/api/web/account'),{status:200,json:{telegram_id:5}});
  assert.deepEqual(await h.invoke(predicate,origin+'/api/catalog/pricing'),{status:503,json:{detail:'Synthetic pricing unavailable'}});
  for(const [path,method] of [['/api/web/account?actor=6','GET'],['/api/web/account','POST'],['/api/web/unknown','GET'],
    ['/mini-app/auth/session','POST'],['/api/web/account','PATCH']]){
    const reply=await h.invoke(predicate,origin+path,method) as {status:number};assert.equal(reply.status,404);
  }
  const reply=await h.invoke(predicate,origin+'/api/web/account','GET',undefined,CLIENT_FIXTURE_CSRF,'text/html') as {status:number};
  assert.equal(reply.status,404);assert.equal(unexpected.length,6);
  for(const path of ['/api/web/auth/me','/api/web/unknown','/mini-app/preferences/ui-locale'])
    await assert.rejects(installClientFixtureReads(routeHarness().page,origin,new Map([[path,{json:{}}]])));
  await assert.rejects(installClientFixtureReads(routeHarness().page,origin,new Map([['/api/web/account',{status:503,json:{}}]])));
});
