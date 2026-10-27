import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Harness} from './client-current-parent-integration.test';
import {requireClientUiBindings,CLIENT_UI_LANGUAGE_OPTIONS} from '../src/i18n/client-ui-bindings';
import {restoreAcceptedSourceHistory} from './fixtures/client-source-history';

const miniFallbackBefore='      <SectionBoundary key={segments.join(\'/\')} locale={locale}>';
const miniFallbackCurrent='      <SectionBoundary key={segments.join(\'/\')} locale={locale} errorFallback={ui ? <section className="panel" role="alert" lang={ui.locale} dir={ui.dir}>\n        <h2>{t(\'mini.error.title\')}</h2>\n        <button className="button secondary" type="button" onClick={() => window.location.reload()}>{t(\'mini.action.retry\')}</button>\n      </section> : undefined}>';
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');
function normalizeReviewedMiniFallback(file:string,source:string):string{
 if(file!=='MiniApp.tsx')return source;
 // Later bounded mini-section-ui10 delta, not a new historical donor. Reverse
 // its exact literal first; keep every existing history/caller hash unchanged.
 assert.equal(sha(source),'cd3ba27caff46eeb002dcde053abc6826242063201712b883e547895953cb6cc','Exact reviewed Mini section fallback source');
 assert.equal(source.split(miniFallbackCurrent).length,2,'Unique reviewed Mini section fallback');
 const before=source.replace(miniFallbackCurrent,miniFallbackBefore);
 assert.equal(sha(before),'2e59fceae97c0ba115e84b32b79b8ac304242ebef9cc94f1922bb6702b62c695','Entire earlier accepted Mini source after exact fallback reversal');
 return before;
}

// Actual parent hook fixture with explicit children stubs. Child rendering and
// deferred mutations are independently exercised by client-visa-cabinet/Life.
// This is not Browser, real sessions, server ACL or production verification.
async function child(h:Harness,name:string){
 const direct=h.component(name);if(direct)return direct;
 const nodes=(v:any):any[]=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
 // React 19 lazy is kept real. Resolve its actual module factory through the
 // fixture's component-only import facade, not a synchronous production rewrite.
 for(const n of nodes(h.tree))if(n.type?.$$typeof===Symbol.for('react.lazy')){
  let resolved:any;try{resolved=n.type._init(n.type._payload);}catch(pending){if(!pending||typeof(pending as any).then!=='function')throw pending;await pending;resolved=n.type._init(n.type._payload);}
  if(resolved===h.stub(name))return n;
 }
 return undefined;
}
for(const kind of ['web','mini'] as const)for(const route of ['life','visas'] as const){
 const name=route==='life'?'BaliLifeCabinet':'VisaCabinet';
 const make=()=>{const h=new Harness(kind,kind==='web'?`/account/${route}/`:'/mini-app/');if(kind==='mini')h.location.hash='#/'+route;return h;};
 test(kind+' '+route+': all ten accepted UI locales reach canonical actor-bound child without changing contact',async()=>{
  const h=make();h.mount();await h.settle();
  for(const {code}of CLIENT_UI_LANGUAGE_OPTIONS){await h.client.controller.choose(code);await h.settle();const rendered=await child(h,name);assert.ok(rendered);assert.equal(requireClientUiBindings(rendered.props.ui),h.client.ui);assert.equal(rendered.props.ui.locale,code);assert.equal(rendered.props.userId,101);assert.equal(rendered.props.locale,'en');assert.equal(rendered.props.apiPrefix,kind==='web'?'/api/web':'/mini-app');}
  assert.ok(h.calls.every(c=>!c.path.endsWith('/locale')));h.unmount();
 });
 test(kind+' '+route+': refresh unmounts old child before B and logout removes same-actor child',async()=>{
  const h=make();h.mount();await h.settle();assert.equal((await child(h,name))?.props.userId,101);
  h.actor=202;h.fire('focus');assert.equal(await child(h,name),undefined);h.clock.tick(50);await h.settle();assert.equal((await child(h,name))?.props.userId,202);
  h.fire('fixture-logout');await h.settle();assert.equal(await child(h,name),undefined);h.unmount();
 });
}
for(const route of ['life','visas'] as const)test('Yoga '+route+': existing RUEN/no Main binding and no optional dashboard-key adoption',async()=>{
 const h=new Harness('mini','/mini-app/',true);h.location.hash='#/'+route;h.mount();await h.settle();const rendered=await child(h,route==='life'?'BaliLifeCabinet':'VisaCabinet');assert.ok(rendered);assert.equal(rendered.props.ui,undefined);assert.equal(rendered.props.userId,undefined);assert.equal(rendered.props.locale,'en');if(route==='life')assert.ok(rendered.props.viewInstanceKey);assert.equal(h.client.controller,null);h.unmount();
});
test('preview Life/Visa stay legacy read-only, no User UI bindings or persistence',async()=>{
 for(const route of ['life','visas']){const h=new Harness('web',`/account/preview/303/${route}/`);h.mount();await h.settle();const rendered=await child(h,route==='life'?'BaliLifeCabinet':'VisaCabinet');assert.ok(rendered);assert.equal(rendered.props.ui,undefined);assert.equal(h.client.controller,null);assert.equal(h.logoutSubscriptions,0);h.unmount();}
});
test('only the reviewed fallback and caller spans change; auth/referral/session code reverses to pinned baseline',()=>{
 const restore=(file:string,spans:Array<[string,string]>,hash:string)=>{
  const currentSource=fs.readFileSync(new URL('../src/surfaces/'+file,import.meta.url),'utf8');
  for(const[current]of spans)assert.equal(currentSource.split(current).length-1,1,file+' original caller before history normalization');
  const historyId=file==='AccountApp.tsx'?'visaActivationAccount':'visaActivationMini';
  for(const[current]of spans)assert.throws(()=>restoreAcceptedSourceHistory(historyId,normalizeReviewedMiniFallback(file,currentSource.replace(current,''))),'Missing current caller must fail before normalization');
  let source=restoreAcceptedSourceHistory(historyId,normalizeReviewedMiniFallback(file,currentSource));
  for(const [current,previous]of spans){assert.equal(source.split(current).length-1,1,file+' unique reviewed span');source=source.replace(current,previous);}
  assert.equal(createHash('sha256').update(source).digest('hex'),hash);
 };
 restore('AccountApp.tsx',[
  ['<BaliLifeEntry ui={ui} locale={locale} onOpen={openLife} />','<BaliLifeEntry locale={locale} onOpen={openLife} />'],
  ['{tab === "visas" && dashboard && (','{tab === "visas" && ('],
  ['              ui={ui}\n              userId={dashboard.telegram_id}\n',''],
  ['<BaliLifeCabinet ui={ui} apiPrefix="/api/web"','<BaliLifeCabinet apiPrefix="/api/web"'],
 ],'b7b0c6cb9e6113575f0ee5911bb4be8cb5972f2cf33d119981dbd47e3beade6b');
 restore('MiniApp.tsx',[
  ['{YOGA_MINI_APP\n            ? <VisaCabinet apiPrefix="/mini-app" locale={locale} />\n            : dashboard && <VisaCabinet ui={ui} userId={dashboard.telegram_id} apiPrefix="/mini-app" locale={locale} />}','<VisaCabinet apiPrefix="/mini-app" locale={locale} />'],
  [': dashboard && <BaliLifeCabinet ui={ui} apiPrefix="/mini-app"',': dashboard && <BaliLifeCabinet apiPrefix="/mini-app"'],
 ],'684881bb2820f47033c766d4ec5788220d003b5ef2aab9a27c616c120bfc53e3');
});

test('reviewed fallback normalization refuses omission, duplication and unrelated source drift',()=>{
 const source=fs.readFileSync(new URL('../src/surfaces/MiniApp.tsx',import.meta.url),'utf8');
 assert.equal(sha(normalizeReviewedMiniFallback('MiniApp.tsx',source)),'2e59fceae97c0ba115e84b32b79b8ac304242ebef9cc94f1922bb6702b62c695');
 for(const changed of [source.replace(miniFallbackCurrent,''),source.replace(miniFallbackCurrent,miniFallbackCurrent+miniFallbackCurrent),
  source.replace('window.location.reload()','window.location.reload(true)'),source+'\n',source.replace('supportIntentMemory.clear();','')])
  assert.throws(()=>normalizeReviewedMiniFallback('MiniApp.tsx',changed));
});
