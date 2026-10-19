import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as policy from '../../shared/src/ui-locale-policy.mjs';

// Actual raw adapter bodies with one explicit dynamic-import seam and synthetic
// DOM/events/storage. Not a Browser, native navigation or rendered/CSP proof.
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const origin='https://fixture.invalid';
class Element{
  constructor(dataset={}){this.dataset=dataset;this.handlers=new Map();this.attributes=new Map();this.style={};this.hidden=false;this.open=false;}
  closest(){return this;}
  addEventListener(name,fn){this.handlers.set(name,fn);}
  setAttribute(name,value){this.attributes.set(name,value);}
  getAttribute(name){return this.attributes.get(name)??null;}
  removeAttribute(name){this.attributes.delete(name);}
  focus(){}
}
class HTMLAnchorElement extends Element{
  constructor(code,yoga=false,href=(code==='ru'?'/':'/en/')){
    super(yoga?{yogaLanguage:code}:{languageChoice:code});this.href=new URL(href,origin).href;this.origin=new URL(this.href).origin;
    this.attributes.set(yoga?'data-yoga-language':'data-language-choice',code);this.attributes.set('hreflang',code);
  }
}
class HTMLButtonElement extends Element{}
class HTMLDialogElement extends Element{
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function fixture(yoga,{blocked=false,explicit=false,browser=['en-US'],foreign=false}={}){
  const ru=new HTMLAnchorElement('ru',yoga),en=new HTMLAnchorElement('en',yoga,foreign?'https://foreign.invalid/en/':'/en/'),links=[ru,en];
  const trigger=new HTMLButtonElement(),dialog=new HTMLDialogElement({policyModule:'/assets/ui-locale-policy.fixture.mjs',currentLanguage:'ru',explicitLanguage:String(explicit)});
  const nav=new Element({...dialog.dataset}),fallback=new Element(),document=new Element();document.body={style:{}};
  nav.querySelectorAll=()=>links;dialog.querySelectorAll=()=>links;
  dialog.querySelector=selector=>selector.includes('data-language-choice=')?links.find(link=>selector.includes('"'+link.dataset.languageChoice+'"')):null;
  document.querySelector=selector=>({'[data-language-picker-open]':trigger,'#site-language-dialog':dialog,
    '[data-yoga-languages]':nav,'[data-language-fallback]':fallback}[selector]??null);
  const store=new Map(),storage={getItem:key=>{if(blocked)throw Error('SYNTHETIC_DENIAL');return store.get(key)??null;},
    setItem:(key,value)=>{if(blocked)throw Error('SYNTHETIC_DENIAL');store.set(key,value);}};
  const replacements=[],location={origin,replace:href=>replacements.push(href)};
  let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const filename=new URL('../src/client/'+(yoga?'yoga-language.js':'language-picker.js'),import.meta.url);
  const source=fs.readFileSync(filename,'utf8'),expression='await import('+(yoga?'navigation':'dialog')+'.dataset.policyModule)';
  assert.equal(source.split(expression).length,2);const body=source.replace(expression,'await loadPolicy()');
  const run=new AsyncFunction('document','HTMLButtonElement','HTMLDialogElement','HTMLElement','HTMLAnchorElement','Element',
    'localStorage','sessionStorage','navigator','location','addEventListener','loadPolicy','matchMedia','innerHeight','innerWidth',body);
  const task=run(document,HTMLButtonElement,HTMLDialogElement,Element,HTMLAnchorElement,Element,storage,storage,
    {languages:browser,language:browser[0]},location,()=>{},()=>pending,()=>({matches:true}),900,1440);
  const click=link=>{const fn=(yoga?nav:document).handlers.get('click');assert.equal(typeof fn,'function','Listener must exist before policy resolves');fn({target:link});};
  return{task,resolve:()=>resolve(policy),reject,click,ru,en,links,store,replacements,trigger,dialog};
}
for(const yoga of [false,true]){
  const brand=yoga?'Yoga':'Main';
  test(brand+': native manual gesture before delayed import fences auto redirect even with storage denied',async()=>{
    const f=fixture(yoga,{blocked:true});f.click(f.ru);assert.deepEqual(f.replacements,[]);f.resolve();await f.task;
    assert.deepEqual(f.replacements,[]);assert.equal(f.ru.href,origin+'/');
  });
  test(brand+': unsupported system language falls back to an actually supplied same-origin EN link',async()=>{
    const f=fixture(yoga,{browser:['xx']});f.resolve();await f.task;assert.deepEqual(f.replacements,[origin+'/en/']);
    assert.equal(f.store.size,0,'Automatic choice is not stored as manual');
  });
  test(brand+': explicit native URL never follows a different system language',async()=>{
    const f=fixture(yoga,{explicit:true});f.resolve();await f.task;assert.deepEqual(f.replacements,[]);
  });
  test(brand+': an emitted policy failure preserves native hrefs and the early manual listener',async()=>{
    const f=fixture(yoga);const failure=assert.rejects(f.task,/SYNTHETIC_MODULE/);f.reject(Error('SYNTHETIC_MODULE'));await failure;
    f.click(f.en);assert.equal(f.en.href,origin+'/en/');assert.deepEqual(f.replacements,[]);
    assert.equal(f.store.get(yoga?'yoga:public-locale:v1':policy.LANGUAGE_PREFERENCE_KEY),'en');
  });
  test(brand+': automatic target must be same-origin; no foreign route is invented',async()=>{
    const f=fixture(yoga,{foreign:true});f.resolve();await f.task;assert.deepEqual(f.replacements,[]);
  });
}
test('Yoga skips unsupported first candidates instead of immediately coercing them to EN',async()=>{
  const f=fixture(true,{browser:['de-DE','ru-RU']});f.resolve();await f.task;assert.deepEqual(f.replacements,[]);
});
test('shared raw policy has no unresolved source imports or dictionary/country dependency',()=>{
  const source=fs.readFileSync(new URL('../../shared/src/ui-locale-policy.mjs',import.meta.url),'utf8');
  assert.ok(!/\bimport\s|\bimport\s*\(|from\s+['"]/.test(source));
  assert.ok(!/client-runtime|COUNTRY_CODES|registry-copy|\.json/.test(source));
});
