import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIENT_FIXTURE_CSRF,clientPreference,createMiniPreferenceFixture,installMiniUiPreference,webClientAuth} from './browser/fixtures/client-ui.ts';

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
