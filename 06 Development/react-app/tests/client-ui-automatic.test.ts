import assert from 'node:assert/strict';
import test from 'node:test';
import {MAIN_UI_LOCALES,YOGA_UI_LOCALES,resolveUiLocale,normalizeLanguage,explicitUiLocaleFromPath} from '../../shared/src/ui-locale-policy.mjs';
import {browserUiInitialLocale} from '../src/i18n/system-ui-locale';
import {createClientUiSurfaceController} from '../src/i18n/client-ui-surface';
import {createClientUiLocaleSession} from '../src/i18n/client-ui-locale';
import type {ClientUiLocale10} from '../src/i18n/client-ui-bindings';

test('system candidates are normalized and filtered per brand, without Telegram or contact coercion',()=>{
  for(const [input,output] of [['zh_CN','zh-Hans'],['zh-Hans-CN','zh-Hans'],['ru_RU','ru'],['EN-gb','en'],['ar-SA','ar']] as const)
    assert.equal(normalizeLanguage(input),output);
  for(const input of ['zh-Hant','zh-TW','zh-HK','rubbish','ru.foo','en-???','',null,{},'ru--RU'])assert.equal(normalizeLanguage(input),null);
  assert.deepEqual(resolveUiLocale({allowed:YOGA_UI_LOCALES,browser:['de-DE','ru-RU']}),{locale:'ru',source:'automatic'});
  assert.equal(resolveUiLocale({allowed:MAIN_UI_LOCALES,browser:['xx','de-DE','ru-RU']}).locale,'de');
  assert.equal(resolveUiLocale({browser:['zh-Hant','ja-JP']}).locale,'ja');
  assert.equal(resolveUiLocale({allowed:YOGA_UI_LOCALES,browser:['rubbish','zh-CN']}).locale,'en');
  assert.deepEqual(resolveUiLocale(),{locale:'en',source:'automatic'});
  assert.deepEqual(resolveUiLocale({browser:[]}),{locale:'en',source:'automatic'});
  assert.equal(resolveUiLocale({saved:'ar',browser:['en']}).source,'cached');
  assert.equal(resolveUiLocale({route:'fr',saved:'ar',browser:['en']}).locale,'fr');
  assert.equal(resolveUiLocale({allowed:YOGA_UI_LOCALES,saved:'ar',browser:['ru']}).locale,'ru');
  assert.equal(resolveUiLocale({saved:'en-US',browser:['ru']}).locale,'ru');
  assert.throws(()=>resolveUiLocale({allowed:['ru'] as any}),/ALLOWLIST/);
  assert.throws(()=>resolveUiLocale({allowed:['en','en']}),/ALLOWLIST/);
  assert.equal(explicitUiLocaleFromPath('/zh-cn/account/'),'zh-Hans');
  assert.equal(explicitUiLocaleFromPath('/account/'),null);
  assert.equal(explicitUiLocaleFromPath('/ar/',YOGA_UI_LOCALES),null);
  assert.equal(explicitUiLocaleFromPath('/enough/'),null);
});

function fixture(initial:ClientUiLocale10='en',saved:string|null=null,surface:'web'|'mini'='web'){
  const requests:{path:string;options:RequestInit}[]=[],writes:(string|null)[]=[],applies:string[]=[];
  const api={async request<T>(path:string,options:RequestInit={}):Promise<T>{
    requests.push({path,options});const body=JSON.parse(String(options.body));
    return {ui_locale:body.ui_locale,revision:body.expected_revision+1} as T;
  }};
  const controller=createClientUiSurfaceController({surface,api,environment:{initial,read:()=>saved,
    write:v=>writes.push(v),apply:v=>applies.push(v)}});controller.mount();
  const bind=(token:number,actor=101,ui_locale:ClientUiLocale10|null='ru',revision=9,contact='ru')=>
    controller.bind(token,{actor,csrf:'a'.repeat(64),preference:{ui_locale,revision}},contact);
  return {controller,requests,writes,applies,bind};
}
for(const surface of ['web','mini'] as const){
  test(surface+': automatic AR/contact RU/null preference remains automatic AR, zero writes',()=>{
    const f=fixture('ar',null,surface);f.bind(f.controller.beginLoad(),101,null);
    assert.equal(f.controller.locale.snapshot().locale,'ar');assert.equal(f.controller.locale.snapshot().source,'automatic');
    assert.equal(f.controller.locale.snapshot().contactLocale,'ru');assert.deepEqual(f.requests,[]);
    assert.ok(f.writes.every(x=>x===null));f.controller.dispose();
  });
  test(surface+': a verified nonempty server preference can replace cached UI, never contact',()=>{
    const f=fixture('en','ar',surface);f.bind(f.controller.beginLoad(),101,'de');
    assert.equal(f.controller.locale.snapshot().locale,'de');assert.equal(f.controller.locale.snapshot().source,'server');
    assert.equal(f.controller.locale.snapshot().contactLocale,'ru');assert.deepEqual(f.requests,[]);f.controller.dispose();
  });
  for(const same of [false,true])test(surface+': '+(same?'equal':'different')+' early gesture wins, but late credentials/revision still enable next explicit write',async()=>{
    const f=fixture('en',null,surface),token=f.controller.beginLoad();
    const choice=same?'en':'ar';assert.equal(await f.controller.choose(choice),'local');
    f.bind(token,101,'ru',9);assert.equal(f.controller.locale.snapshot().locale,choice);
    assert.equal(f.controller.locale.snapshot().source,'manual');assert.equal(f.controller.preference.snapshot().enabled,true);
    assert.equal(f.controller.preference.snapshot().projection?.revision,9);assert.deepEqual(f.requests,[]);
    assert.equal(await f.controller.choose(choice),'saved');
    assert.deepEqual(JSON.parse(String(f.requests[0].options.body)),{ui_locale:choice,expected_revision:9});
    assert.equal(f.requests[0].path,surface==='web'?'/api/web/preferences/ui-locale':'/mini-app/preferences/ui-locale');
    assert.equal(f.controller.locale.snapshot().contactLocale,'ru');f.controller.dispose();
  });
  test(surface+': same-user manual intent survives later reload; different actor never inherits it',async()=>{
    const f=fixture('en',null,surface);f.bind(f.controller.beginLoad(),101,null);
    await f.controller.choose('fr');const count=f.requests.length;
    f.bind(f.controller.beginLoad(),101,'ru',10);assert.equal(f.controller.locale.snapshot().locale,'fr');
    f.bind(f.controller.beginLoad(),202,'ja',2);assert.equal(f.controller.locale.snapshot().locale,'ja');
    assert.equal(f.controller.locale.snapshot().source,'server');assert.equal(f.requests.length,count);
    f.controller.logout();assert.equal(f.controller.locale.snapshot().locale,'en');assert.equal(f.controller.locale.snapshot().actor,null);
    f.bind(f.controller.beginLoad(),303,null);assert.equal(f.controller.locale.snapshot().locale,'en');f.controller.dispose();
  });
  test(surface+': initial gesture spans both Mini-equivalent reads; metadata-only bind does not become a gesture',async()=>{
    const f=fixture('en',null,surface),token=f.controller.beginLoad();
    await f.controller.choose('en');f.controller.bind(token,{actor:101,preference:undefined},'ru');
    f.bind(token,101,'ar',4);assert.equal(f.controller.locale.snapshot().locale,'en');
    assert.equal(f.controller.preference.snapshot().projection?.revision,4);assert.deepEqual(f.requests,[]);f.controller.dispose();
  });
}
test('route UI wins cache/server, logout recalculates system/route without retaining another actor cache',()=>{
  let system:ClientUiLocale10='ja';const writes:(string|null)[]=[];
  const session=createClientUiLocaleSession({initial:'ar',initialSource:'route',read:()=> 'de',write:v=>writes.push(v),apply:()=>{},
    reset:()=>({locale:system,source:'automatic'})});
  session.mount();assert.equal(session.snapshot().locale,'ar');assert.equal(session.snapshot().source,'route');
  session.bindPrincipal(101,'ru');assert.equal(session.snapshot().locale,'ar');
  system='fr';session.logout();assert.equal(session.snapshot().locale,'fr');assert.equal(session.snapshot().source,'automatic');
  assert.equal(writes.at(-1),null);session.dispose();
});
test('browser adapter ignores generic document.lang, supports SSR and route priority',()=>{
  const keys=['window','document','navigator'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
    for(const key of keys)Reflect.deleteProperty(globalThis,key);
    assert.deepEqual(browserUiInitialLocale(),{locale:'en',source:'automatic'});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{lang:'ru'}}});
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{languages:['de-DE','ru-RU'],language:'de-DE'}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{pathname:'/account/'}}});
    assert.equal(browserUiInitialLocale().locale,'de');assert.equal(browserUiInitialLocale(YOGA_UI_LOCALES).locale,'ru');
    (globalThis.window as any).location.pathname='/ar/account/';assert.deepEqual(browserUiInitialLocale(),{locale:'ar',source:'route'});
  }finally{for(const key of keys){const descriptor=saved.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
