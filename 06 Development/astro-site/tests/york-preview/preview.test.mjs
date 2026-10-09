import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {request} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewBrand,previewAuthorityAllowed,YORK_DEMO_ROUTES,previewHref} from '../../../shared/src/preview-brand.mjs';
import {publicBuildEntries,buildPublicRegistryModel} from '../../scripts/registry-publication.mjs';
import {yorkRoutes,yorkRegistryModel} from '../../src-york/lib/routes.ts';
import {yorkInformation,isYorkInformationRoute,YORK_INFORMATION_ROUTES} from '../../src-york/lib/information.ts';
import {visaChoices} from '../../src-york/lib/visa-navigation.ts';
import {mountYogaVideo} from '../../src-york/client/yoga-video.js';
import {getLocalizedPublicPages} from '../../src/lib/public-i18n.ts';
import {yogaRouteAllowed,yogaPublicPage,yogaRegistrySections,YOGA_CONTENT_POLICY} from '../../../shared/src/yoga-content-policy.mjs';
import {createYorkPreviewServer,PREVIEW_CSP} from '../../scripts/serve-york-preview.mjs';
import {initCountryMenus} from '../../src-york/public/country-menu.js';
import {initServiceCarousels,createLoopTrack,loopPosition,CAROUSEL_INTERVAL} from '../../src-york/public/service-carousel.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'dist-york-preview');
const brand=previewBrand('york-gangster');

test('brand is opt-in, unknown selections fail, request data cannot choose rights',()=>{
  assert.equal(previewBrand(undefined),null);assert.equal(previewBrand(''),null);
  assert.throws(()=>previewBrand('safrway.online'),/Unknown preview brand/);
  assert.equal(brand.siteOrigin,null);assert.equal(brand.telegramBotUsername,null);
  assert.equal(brand.displayName,'Yoga Ganster');
  assert.equal(brand.parentPlatform,'SAFRWAY');
  assert.equal(previewAuthorityAllowed(brand,'127.0.0.1:4380'),true);
  for(const authority of ['safrway.online','evil:4380','localhost:443','127.0.0.1:4380.evil'])assert.equal(previewAuthorityAllowed(brand,authority),false);
  for(const header of ['Forwarded','X-Forwarded-Host','X-Original-Host','Authorization'])assert.equal(previewAuthorityAllowed(brand,'127.0.0.1:4380',{[header]:'allowed'}),false);
  assert.throws(()=>previewHref('/','fr'));
});

test('RU/EN information pages have static shared content and no invented stories or missing service links',()=>{
  for(const locale of ['ru','en']) {
    const names=new Set(yorkRoutes().map(item=>item.route));
    const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll("'",'&#39;');
    for(const source of YORK_INFORMATION_ROUTES) {
      const route=previewHref(source,locale);
      assert.equal(isYorkInformationRoute(route),true);
      const model=yorkInformation(route,locale);
      const html=readFileSync(path.join(output,route,'index.html'),'utf8');
      assert.ok(html.includes(escape(model.title)));
      assert.match(html,/<section[^>]*class="partners shell"[\s\S]*?SAFRWAY/);
      assert.doesNotMatch(html,/Авторский материал.*пока не предоставлен|authored material has not been supplied|Загрузка демонстрации|Loading the demo/);
      if(source!=='/contacts/')assert.doesNotMatch(html,/_york\/york-preview\.js|id="york-demo"/);
      if(source==='/services/') {
        assert.ok(model.groups.length>0);
        for(const group of model.groups)for(const card of group.cards) {
          assert.ok(names.has(card.href),card.href);
          assert.ok(html.includes('href="'+card.href+'"'),card.href);
          for(const text of [card.title,card.summary,card.note].filter(Boolean))assert.ok(html.includes(escape(text)),card.href);
        }
        assert.doesNotMatch(html,/href="\/(en\/)?uae\/(visas|housing|assistant)\//);
      }
      if(source==='/about/') {
        assert.ok(html.includes(escape(model.home.lead)));
        assert.match(html,/data-platform-relationship/);
      }
      if(source==='/stories/') {
        assert.equal(model.reading.filter(card=>card.contentId).length,17);
        for(const card of model.reading) {
          assert.ok(names.has(card.href));
          assert.ok(html.includes(escape(card.title)),card.href);
          if(card.contentId)assert.ok(html.includes('data-source-revision="'+card.sourceRevision+'"'),card.href);
        }
      }
      if(source==='/contacts/') {
        assert.match(html,/_york\/york-preview\.js/);
        assert.ok(html.includes(previewHref('/privacy/',locale)));
      }
    }
  }
  assert.equal(isYorkInformationRoute('/account/'),false);
  assert.throws(()=>yorkInformation('/account/','ru'),/Unknown Yoga information route/);
});

test('country cards become shared RU/EN navigation dropdowns without changing service cards',()=>{
  for(const [prefix,label] of [['','Страны'],['en/','Countries']]) {
    const home=readFileSync(path.join(output,prefix,'index.html'),'utf8');
    assert.match(home,/aria-label="Yoga Ganster"/);
    assert.match(home,/<h1><span>YOGA<\/span><span>GANSTER/);
    assert.ok(home.includes(label));
    assert.match(home,/<details class="country-menu" data-country-menu>/);
    assert.match(home,/<script type="module" src="\/country-menu.js"><\/script>/);
    assert.doesNotMatch(home,/class="catalog-grid"|class="catalog-card"|York Gangster|GANGSTER/);
    assert.equal((home.match(/data-country-id=/g)??[]).length,5);
    for(const id of ['bali','thailand','uae','nepal','russia'])assert.match(home,new RegExp(`href="/${prefix}${id}/" data-country-id="${id}"`));
    const country=readFileSync(path.join(output,prefix,'bali/index.html'),'utf8');
    assert.match(country,/data-service-carousel/);
    assert.match(country,/data-country-id="bali" aria-current="page"/);
  }
});

test('dropdown Escape closes and returns focus; outside click closes without focus theft',()=>{
  let focused=false,prevented=false;
  const inside={};const handlers={};
  const menu={open:true,contains:target=>target===inside,querySelector:()=>({focus:()=>focused=true})};
  const doc={querySelectorAll:()=>[menu],addEventListener:(key,handler)=>handlers[key]=handler,removeEventListener:key=>delete handlers[key]};
  const dispose=initCountryMenus(doc);
  handlers.pointerdown({target:inside});assert.equal(menu.open,true);
  handlers.pointerdown({target:{}});assert.equal(menu.open,false);assert.equal(focused,false);
  menu.open=true;handlers.keydown({key:'Escape',preventDefault:()=>prevented=true});
  assert.equal(menu.open,false);assert.equal(focused,true);assert.equal(prevented,true);
  dispose();assert.deepEqual(Object.keys(handlers),[]);
});

test('RU/EN inherit eligible approved/legacy routes and all bounded demos; Yoga excludes exchange only',()=>{
  const routes=yorkRoutes();const names=new Set(routes.map(item=>item.route));
  assert.equal(names.size,routes.length);
  for(const locale of ['ru','en']) {
    for(const page of getLocalizedPublicPages(locale))assert.equal(names.has(page.route),yogaRouteAllowed(page.route),page.route);
    for(const route of YORK_DEMO_ROUTES)assert.ok(names.has(previewHref(route,locale)),route);
  }
  for(const entry of publicBuildEntries().filter(entry=>['ru','en'].includes(entry.locale)))assert.ok(names.has(entry.route),entry.route);
  assert.ok(routes.every(route=>['ru','en'].includes(route.locale)));
  assert.ok(routes.every(route=>!/^\/(fr|de|es|zh|ja|ko|hi|ar)\//.test(route.route)));
  assert.equal(routes.length,195);
  const removed=['/bali/exchange/','/bali/exchange/usdt-idr/','/bali/exchange/other-exchange/','/thailand/exchange/'];
  for(const locale of ['ru','en'])for(const source of removed) {
    const route=previewHref(source,locale);
    assert.ok(getLocalizedPublicPages(locale).some(page=>page.route===route),'SAFRWAY route preserved '+route);
    assert.ok(!names.has(route),'Yoga excludes '+route);
    assert.ok(!existsSync(path.join(output,route,'index.html')),'No direct Yoga page '+route);
  }
});

test('Yoga projection does not mutate canonical input and removes exchange from nested navigation and overview copy',()=>{
  for(const locale of ['ru','en']) {
    const canonical=getLocalizedPublicPages(locale),before=JSON.stringify(canonical);
    const pages=canonical.filter(page=>yogaRouteAllowed(page.route)).map(yogaPublicPage);
    assert.doesNotMatch(JSON.stringify(pages),/обмен|currency exchange|cash delivery|\/(?:exchange)\//i);
    assert.equal(JSON.stringify(getLocalizedPublicPages(locale)),before);
    const groups=yorkInformation(previewHref('/services/',locale),locale).groups;
    assert.ok(groups.every(group=>group.cards.every(card=>yogaRouteAllowed(card.href))));
    const source=canonical.find(page=>page.route===previewHref('/bali/',locale));
    assert.equal(groups.find(group=>group.id==='bali').cards.length,source.cards.length-1);
  }
  assert.throws(()=>yogaPublicPage({route:'/bali/exchange/'}),/Excluded Yoga/);
  assert.equal(yogaRouteAllowed('/en/bali/exchange/child/?x=1'),false);
});

test('approved full body, facts, tables, prices and source revisions are not forked',()=>{
  for(const entry of publicBuildEntries().filter(entry=>['ru','en'].includes(entry.locale))) {
    const source=buildPublicRegistryModel(entry),preview=yorkRegistryModel(entry);
    for(const key of ['titleHtml','introHtml','directHtml','factHtml','sourceRevision','pricingRef','familyApplicabilityNote'])assert.deepEqual(preview[key],source[key],entry.route+' '+key);
    assert.deepEqual(preview.sections,yogaRegistrySections(source.sections,entry.contentId));
    if(!['voa','knowledge_evoa_online','knowledge_evoa_vs_voa'].includes(entry.contentId))assert.deepEqual(preview.sections,source.sections);
    assert.equal(preview.contentVisibilityPolicy,YOGA_CONTENT_POLICY);
    assert.equal(preview.languageChoices.length,2);
    const built=readFileSync(path.join(output,entry.route,'index.html'),'utf8');
    const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll("'",'&#39;');
    for(const action of preview.ctaActions??[{label:preview.managerLabel}])assert.ok(built.includes(escape(action.label)),entry.route+' approved CTA');
    if(entry.contentId==='knowledge_evoa_vs_voa') {
      assert.equal((preview.factHtml.match(/<table>/g)??[]).length,1);
      assert.equal((preview.sections.map(section=>section.html).join('').match(/<table>/g)??[]).length,1);
    }
    const html=[preview.factHtml,...preview.sections.map(section=>section.html)].join('');
    assert.doesNotMatch(html,/\{\{CATALOG_PRICE:|\/_registry\//);
  }
});

test('every built HTML including owner and 404 is inert/noindex without production chrome',()=>{
  const files=readdirSync(output,{recursive:true}).filter(file=>file.endsWith('.html'));
  assert.equal(files.length,yorkRoutes().length+1);
  for(const file of files) {
    const html=readFileSync(path.join(output,file),'utf8');
    assert.match(html,/data-preview-only="true"/);assert.match(html,/noindex,nofollow,noarchive/);
    assert.doesNotMatch(html,/rel=["']canonical|hreflang=|data-support-open|data-auth-|<iframe|<form|src=["']https?:\/\//i,file);
    assert.doesNotMatch(html,/href=["']https:\/\/(?:t\.me|app\.safrway\.online|api\.safrway\.online)/i,file);
    assert.doesNotMatch(html,/обмен|\bexchange\b(?! rate)|currency assistance|cash delivery|Exchanging cash/i,file);
    assert.match(html,/id="content"[^>]*tabindex="-1"/);
    for(const match of html.matchAll(/(?:href|src)=["'](\/[^"']*)["']/g)) {
      const url=match[1].split(/[?#]/)[0];
      assert.ok(existsSync(path.join(output,url.endsWith('/')?url+'index.html':url)),file+' → '+url);
    }
  }
  assert.equal(readFileSync(path.join(output,'robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n');
  assert.doesNotMatch(readFileSync(path.join(output,'sitemap.xml'),'utf8'),/<loc>/);
  const receipt=JSON.parse(readFileSync(path.join(output,'preview-build.json'),'utf8'));
  for(const field of ['liveApi','telegram','authentication','ledger','migrations'])assert.equal(receipt[field],false);
  assert.equal(receipt.contentVisibilityPolicy,YOGA_CONTENT_POLICY);
});

test('demo dependency roots contain no live account/auth/client transport or pricing math',()=>{
  const files=['DemoApp.tsx','main.tsx'].map(file=>readFileSync(path.resolve(root,'../react-app/src/york-preview',file),'utf8'));
  for(const source of files)assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Telegram\.\w|\/api\/|account-preview|PricingProvider|apiClient|display_usd_approx|pointsPerUsd/);
  const config=readFileSync(path.join(root,'astro.config.mjs'),'utf8');
  assert.match(config,/plugins: brand \? \[\] : \[youtubePreview\(\), registryPreview\(\)\]/);
  assert.match(config,/root:fileURLToPath\(new URL\('\.\/src-york\/',import\.meta\.url\)\)/);
  assert.match(config,/outDir:previewBase\?'\.\/dist-yoga-https-preview':'\.\/dist-york-preview'/);
  assert.match(config,/cacheDir:'\.\/node_modules\/\.astro-york'/);
  assert.match(PREVIEW_CSP,/connect-src 'none'/);assert.match(PREVIEW_CSP,/form-action 'none'/);
});

function get(pathname,{method='GET',headers={}}={}) {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:4381,path:pathname,method,headers},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
}

test('loopback server rejects writes, spoofed authorities, live/source routes and traversal',async()=>{
  const server=await createYorkPreviewServer({port:4381});
  try {
    const home=await get('/');assert.equal(home.status,200);assert.match(home.headers['x-robots-tag'],/noindex/);
    assert.equal(home.headers['cache-control'],'no-store');assert.equal(home.headers['content-security-policy'],PREVIEW_CSP);
    for(const pathname of ['/account/','/en/influencer/overview/','/owner/publications/','/bot-demo/'])assert.equal((await get(pathname)).status,200,pathname);
    assert.equal((await get('/account/',{method:'POST'})).status,405);
    assert.equal((await get('/',{headers:{host:'safrway.online'}})).status,421);
    assert.equal((await get('/',{headers:{host:'127.0.0.1:4380'}})).status,421);
    assert.equal((await get('/',{headers:{'x-forwarded-host':'localhost:4381'}})).status,421);
    for(const pathname of ['/api/catalog/pricing','/auth/start','/admin/','/mini/','/shared/content/service-registry.v1.json','/src/secrets','/node_modules/'])assert.equal((await get(pathname)).status,404,pathname);
    for(const pathname of ['/%2e%2e/config.py','/.env','/%252e%252e/','/x%5cy'])assert.equal((await get(pathname)).status,400,pathname);
    const missing=await get('/missing/',{headers:{accept:'text/html'}});assert.equal(missing.status,404);assert.match(missing.body,/noindex,nofollow,noarchive/);
    const missingEn=await get('/en/missing/',{headers:{accept:'text/html'}});assert.equal(missingEn.status,404);assert.match(missingEn.body,/<html lang="en"/);
    assert.equal((await get('/downloads/all-indonesia-client-guide-safrway-2026.pdf')).headers['content-type'],'application/pdf');
    assert.equal((await get('/',{method:'HEAD'})).body,'');
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('hover enhancement respects touch, one open menu, Escape, and mobile focus dismissal',async()=>{
  const make=()=>({handlers:new Map(),attrs:new Map(),children:new Set(),
    addEventListener(type,fn){const list=this.handlers.get(type)??[];list.push(fn);this.handlers.set(type,list);},
    removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)??[]).filter(item=>item!==fn));},
    emit(type,event={}){for(const fn of this.handlers.get(type)??[])fn(event);},
    setAttribute(key,value){this.attrs.set(key,value);},getAttribute(key){return this.attrs.get(key)??null;},removeAttribute(key){this.attrs.delete(key);},
    contains(target){return target===this||this.children.has(target);},focus(){doc.activeElement=this;}
  });
  const doc=make(),header=make(),toggle=make(),nav=make();
  const menus=[make(),make()],summaries=[make(),make()];
  menus.forEach((menu,i)=>{menu.open=false;menu.children.add(summaries[i]);menu.querySelector=()=>summaries[i];});
  for(const node of [toggle,nav,...menus,...summaries])header.children.add(node);
  header.querySelector=selector=>selector==='[data-nav-toggle]'?toggle:nav;
  doc.querySelector=()=>header;doc.querySelectorAll=()=>menus;
  const query=make();query.matches=true;doc.defaultView={matchMedia:()=>query};
  const dispose=initCountryMenus(doc);
  menus[0].emit('pointerenter',{pointerType:'touch'});assert.equal(menus[0].open,false);
  menus[0].emit('pointerenter',{pointerType:'mouse'});assert.equal(menus[0].open,true);
  menus[1].emit('pointerenter',{pointerType:'mouse'});assert.equal(menus[0].open,false);assert.equal(menus[1].open,true);
  let prevented=false;doc.emit('keydown',{key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(menus[1].open,false);assert.equal(doc.activeElement,summaries[1]);assert.equal(prevented,true);
  query.matches=false;menus[0].emit('pointerenter',{pointerType:'mouse'});assert.equal(menus[0].open,false);
  toggle.emit('click');assert.equal(toggle.getAttribute('aria-expanded'),'true');
  header.emit('focusout',{relatedTarget:summaries[0]});assert.equal(toggle.getAttribute('aria-expanded'),'true');
  const outside=make();doc.activeElement=outside;
  header.emit('focusout',{relatedTarget:outside});assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(doc.activeElement,outside);
  toggle.emit('click');doc.emit('keydown',{key:'Escape',preventDefault(){}});assert.equal(doc.activeElement,toggle);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  dispose();for(const node of [doc,header,toggle,nav,...menus])assert.ok([...node.handlers.values()].every(list=>list.length===0));
});

test('country submenus keep ancestors open and Escape returns through the hierarchy',()=>{
  const doc={activeElement:null,defaultView:{matchMedia:()=>({matches:true})},handlers:{},querySelectorAll:()=>menus,addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];}};
  const top={},list={};
  const make=parent=>({open:false,parentElement:parent,handlers:{},children:new Set(),contains(target){return this.children.has(target);},querySelector(){return this.summary;},querySelectorAll(){return [...this.children].filter(item=>item.open);},addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];}});
  const root=make(top),first=make(list),second=make(list),menus=[root,first,second];
  menus.forEach(menu=>{menu.summary={focus(){doc.activeElement=this;}};menu.children.add(menu.summary);});
  for(const child of [first,second,first.summary,second.summary])root.children.add(child);
  const dispose=initCountryMenus(doc);
  root.handlers.pointerenter({pointerType:'mouse'});first.handlers.pointerenter({pointerType:'mouse'});
  assert.equal(root.open,true);assert.equal(first.open,true);
  second.handlers.pointerenter({pointerType:'mouse'});assert.equal(first.open,false);assert.equal(second.open,true);assert.equal(root.open,true);
  doc.handlers.keydown({key:'Escape',preventDefault(){}});assert.equal(second.open,false);assert.equal(root.open,true);assert.equal(doc.activeElement,second.summary);
  doc.handlers.keydown({key:'Escape',preventDefault(){}});assert.equal(root.open,false);assert.equal(doc.activeElement,root.summary);
  dispose();
});

function eventNode() {
  return {handlers:new Map(),attrs:{},dataset:{},
    addEventListener(type,fn){const list=this.handlers.get(type)??[];list.push(fn);this.handlers.set(type,list);},
    removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)??[]).filter(item=>item!==fn));},
    emit(type,event={}){for(const fn of this.handlers.get(type)??[])fn(event);},
    setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},hasAttribute(key){return key in this.attrs;}};
}
function fakeTrack(count=3) {
  const track=eventNode();track.width=194;track.clientWidth=400;track.scrollLeft=0;track.moves=[];track.captured=null;
  track.setPointerCapture=id=>{track.captured=id;};track.hasPointerCapture=id=>track.captured===id;track.releasePointerCapture=()=>{track.captured=null;};
  const makeSlide=index=>{const slide=eventNode(),link=eventNode();slide.index=index;slide.link=link;link.href='/service/'+index+'/';link.attrs.id='link-'+index;
    link.closest=selector=>selector==='.carousel-slide'?slide:selector==='[data-carousel-copy]'&&slide.hasAttribute('data-carousel-copy')?slide:null;
    slide.attrs.id='slide-'+index;slide.getBoundingClientRect=()=>({width:track.width});
    slide.cloneNode=()=>makeSlide(index);slide.querySelectorAll=()=>[link];
    slide.remove=()=>{track.slides=track.slides.filter(item=>item!==slide);};return slide;};
  track.slides=Array.from({length:count},(_,index)=>makeSlide(index));
  track.querySelectorAll=()=>track.slides;track.prepend=(...nodes)=>track.slides.unshift(...nodes);track.append=(...nodes)=>track.slides.push(...nodes);
  track.scrollTo=options=>{track.moves.push(options);track.scrollLeft=options.left;};return track;
}
function fakeClock() {
  const view=eventNode();let time=0,id=0;view.frames=new Map();view.timers=new Map();view.observers=[];
  view.performance={now:()=>time};view.requestAnimationFrame=fn=>{view.frames.set(++id,fn);return id;};view.cancelAnimationFrame=id=>view.frames.delete(id);
  view.setTimeout=(fn,ms)=>{view.timers.set(++id,{fn,at:time+ms,ms});return id;};view.clearTimeout=id=>view.timers.delete(id);
  view.ResizeObserver=class{constructor(fn){this.fn=fn;this.nodes=[];view.observers.push(this);}observe(node){this.nodes.push(node);}disconnect(){this.disconnected=true;}};
  view.advance=ms=>{time+=ms;let loops=0;while([...view.timers.values()].some(item=>item.at<=time)){if(++loops>30)throw Error('timer loop');for(const [id,item] of [...view.timers])if(item.at<=time){view.timers.delete(id);item.fn();}}};
  view.frame=ms=>{view.advance(ms);const pending=[...view.frames.values()];view.frames.clear();for(const fn of pending)fn(time);};
  view.finish=()=>{for(let i=0;i<50&&view.frames.size;i++)view.frame(20);assert.equal(view.frames.size,0);};return view;
}
function carouselFixture(count=6) {
  const view=fakeClock(),doc=eventNode(),reduce=eventNode(),carousel=eventNode(),track=fakeTrack(count),prev=eventNode(),next=eventNode(),play=eventNode();
  reduce.matches=false;view.matchMedia=()=>reduce;doc.defaultView=view;doc.visibilityState='visible';doc.querySelectorAll=()=>[carousel];
  carousel.contains=target=>[track,prev,next,play].includes(target)||track.slides.some(slide=>slide.link===target);
  const selectors={'[data-carousel-track]':track,'[data-carousel-prev]':prev,'[data-carousel-next]':next,'[data-carousel-play]':play};carousel.querySelector=key=>selectors[key];
  play.dataset={pauseLabel:'Pause',playLabel:'Play',reducedLabel:'Reduced motion'};play.focus=()=>{doc.activeElement=play;carousel.emit('focusin',{target:play});};
  return {view,doc,reduce,carousel,track,prev,next,play,autoTimers:()=>[...view.timers.values()].filter(item=>item.ms===CAROUSEL_INTERVAL)};
}

test('rapid commands accumulate independently of intermediate animation frames and obsolete callbacks',()=>{
  for(const elapsed of [0,30,180]){
    const track=fakeTrack(6),view=fakeClock(),loop=createLoopTrack(track,view);const start=track.scrollLeft;
    loop.move(1,false);view.frame(elapsed);const obsolete=[...view.frames.values()][0];
    loop.move(1,false);loop.move(1,false);const before=track.scrollLeft;obsolete?.(10000);assert.equal(track.scrollLeft,before);
    view.finish();assert.equal(track.scrollLeft,start+618);
    loop.move(1,false);view.frame(40);loop.move(-1,false);view.finish();assert.equal(track.scrollLeft,start+618);
    loop.move(-1,false);loop.move(-1,false);loop.move(1,false);view.finish();assert.equal(track.scrollLeft,start+412);
    loop.dispose();assert.equal(view.frames.size,0);
  }
});

test('seams use one animation owner, preserve copy accessibility, and defer hidden measurements',()=>{
  const track=fakeTrack(),originals=[...track.slides],view=fakeClock(),loop=createLoopTrack(track,view);const start=2472;
  assert.equal(track.scrollLeft,start);assert.equal(track.slides.length,27);
  for(const copy of track.slides.filter(slide=>slide.hasAttribute('data-carousel-copy'))){assert.equal(copy.attrs['aria-hidden'],'true');assert.equal(copy.link.attrs.tabindex,'-1');assert.equal(copy.hasAttribute('id'),false);assert.equal(copy.link.hasAttribute('id'),false);assert.equal(copy.link.href,originals[copy.index].link.href);}
  assert.ok(originals.every(slide=>!slide.link.hasAttribute('tabindex')));
  for(let i=0;i<20;i++){loop.move(1,false);view.finish();assert.ok(track.scrollLeft>=start&&track.scrollLeft<start+618);}
  assert.equal(track.scrollLeft,start+412);loop.move(1,false);view.finish();assert.equal(track.scrollLeft,start);loop.move(-1,false);view.finish();assert.equal(track.scrollLeft,start+412);
  assert.ok(track.moves.every(move=>move.behavior==='instant'));
  track.width=164;track.clientWidth=900;loop.layout();assert.equal(track.scrollLeft,2112+352);
  loop.move(1,false);view.frame(50);track.width=160;loop.layout();assert.equal(view.frames.size,0);
  loop.dispose();assert.deepEqual(track.slides,originals);
  const hidden=fakeTrack();hidden.width=0;const deferred=createLoopTrack(hidden,view);assert.equal(deferred.enabled(),false);assert.equal(hidden.slides.length,3);
  hidden.width=194;deferred.layout();assert.equal(deferred.enabled(),true);assert.equal(hidden.slides.length,27);deferred.dispose();
  const only=fakeTrack(1),single=createLoopTrack(only,view);assert.equal(single.enabled(),false);assert.equal(only.slides.length,1);single.dispose();
});

test('native momentum is not rebased during an active touch and stale scrollend cannot cancel arrow motion',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc),start=f.track.scrollLeft;
  f.track.emit('touchstart');f.track.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:0});
  f.doc.emit('pointercancel',{pointerId:1});f.track.scrollLeft=start+1236+40;f.track.emit('scroll');f.track.emit('scrollend');f.view.advance(300);
  assert.equal(f.track.scrollLeft,start+1276);
  f.doc.emit('touchend',{touches:[]});f.view.advance(160);assert.equal(f.track.scrollLeft,start+40);
  f.next.emit('click');f.view.frame(20);f.track.emit('scrollend');assert.ok(f.view.frames.size>0);f.next.emit('click');f.view.finish();assert.equal(f.track.scrollLeft,start+412);
  dispose();
});

test('Play starts with keyboard focus, pointer Pause retains intent, and vertical wheel does not latch pause',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc);assert.equal(f.autoTimers().length,1);
  f.track.emit('wheel',{deltaX:0,deltaY:60});assert.equal(f.autoTimers().length,1);assert.equal(f.play.dataset.paused,'false');
  f.play.emit('pointerdown');f.play.focus();f.play.emit('click');assert.equal(f.play.attrs['aria-label'],'Play');assert.equal(f.autoTimers().length,0);
  f.play.emit('keydown');f.play.emit('click');assert.equal(f.play.attrs['aria-label'],'Pause');assert.equal(f.autoTimers().length,1);
  f.view.advance(CAROUSEL_INTERVAL);assert.ok(f.view.frames.size>0);f.view.finish();assert.equal(f.autoTimers().length,1);
  f.carousel.emit('focusin',{target:f.track.slides.find(slide=>!slide.hasAttribute('data-carousel-copy')).link});assert.equal(f.autoTimers().length,0);
  f.carousel.emit('focusout',{relatedTarget:{}});assert.equal(f.autoTimers().length,0);
  f.play.emit('click');assert.equal(f.autoTimers().length,1);
  f.reduce.matches=true;f.reduce.emit('change');assert.equal(f.autoTimers().length,0);assert.equal(f.play.disabled,true);assert.equal(f.view.frames.size,0);
  f.next.emit('click');assert.equal(f.view.frames.size,0);f.play.emit('click');assert.equal(f.autoTimers().length,0);
  dispose();
});

test('vertical touch temporarily blocks autoplay; horizontal intent pauses it',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc);
  f.track.emit('touchstart');f.track.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:100});
  f.track.emit('pointermove',{pointerId:1,clientX:102,clientY:20});f.doc.emit('pointercancel',{pointerId:1});
  f.view.advance(300);assert.equal(f.autoTimers().length,0);assert.equal(f.play.dataset.paused,'false');
  f.doc.emit('touchend',{touches:[]});f.view.advance(160);assert.equal(f.autoTimers().length,1);
  f.track.emit('touchstart');f.track.emit('pointerdown',{pointerId:2,pointerType:'touch',clientX:100,clientY:100});
  f.track.emit('pointermove',{pointerId:2,clientX:30,clientY:102});f.doc.emit('pointercancel',{pointerId:2});
  f.doc.emit('touchend',{touches:[]});f.view.advance(160);assert.equal(f.play.dataset.paused,'true');assert.equal(f.autoTimers().length,0);
  dispose();
});

test('resize waits for touch release and momentum before rebuilding the visible track',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc),start=f.track.scrollLeft,copies=[...f.track.slides];
  f.track.emit('touchstart');f.track.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:0});
  f.track.scrollLeft=start+100;f.track.emit('scroll');
  const writes=f.track.moves.length;f.track.width=164;f.track.clientWidth=900;f.view.observers[0].fn();f.view.emit('resize');
  f.doc.emit('pointercancel',{pointerId:1});f.view.advance(300);
  assert.deepEqual(f.track.slides,copies);assert.equal(f.track.moves.length,writes);
  f.doc.emit('touchend',{touches:[]});f.view.advance(80);f.track.scrollLeft=start+150;f.track.emit('scroll');
  f.view.advance(100);assert.deepEqual(f.track.slides,copies);assert.equal(f.track.moves.length,writes);
  f.view.advance(60);assert.notEqual(f.track.slides[0],copies[0]);
  assert.ok(Math.abs(f.track.scrollLeft-(4224+150*176/206))<.0001);
  dispose();
});

test('an arrow immediately after touch release flushes a pending resize before its next step',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc),start=f.track.scrollLeft;
  f.track.emit('touchstart');f.track.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:0});
  f.track.scrollLeft=start+200;f.track.emit('scroll');f.track.width=164;f.track.clientWidth=900;f.view.observers[0].fn();
  f.doc.emit('pointercancel',{pointerId:1});f.doc.emit('touchend',{touches:[]});
  f.next.emit('click');f.view.finish();assert.equal(f.track.scrollLeft,4224+352);
  f.next.emit('click');f.view.finish();assert.equal(f.track.scrollLeft,4224+528);
  dispose();
});

test('hover and control focus stop current autoplay while rapid manual commands retain their target',()=>{
  for(const pause of ['hover','focus']){
    const f=carouselFixture(),dispose=initServiceCarousels(f.doc);
    f.view.advance(CAROUSEL_INTERVAL);f.view.frame(70);const position=f.track.scrollLeft;
    if(pause==='hover')f.carousel.emit('pointerenter',{pointerType:'mouse'});
    else f.carousel.emit('focusin',{target:f.next});
    assert.equal(f.view.frames.size,0);f.view.advance(500);assert.equal(f.track.scrollLeft,position);assert.equal(f.autoTimers().length,0);
    if(pause==='hover'){f.carousel.emit('pointerleave');assert.equal(f.autoTimers().length,1);}
    dispose();
  }
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc),start=f.track.scrollLeft;
  f.carousel.emit('focusin',{target:f.next});f.next.emit('click');f.view.frame(70);
  f.carousel.emit('focusin',{target:f.prev});f.prev.emit('click');f.view.finish();assert.equal(f.track.scrollLeft,start);
  f.next.emit('click');f.view.frame(30);f.carousel.emit('pointerenter',{pointerType:'mouse'});f.next.emit('click');f.view.finish();assert.equal(f.track.scrollLeft,start+412);
  dispose();
});

test('mouse drag suppresses navigation while taps keep links; focus reveals the original card',()=>{
  const f=carouselFixture(),originals=[...f.track.slides],dispose=initServiceCarousels(f.doc);const start=f.track.scrollLeft;
  const press=()=>f.track.emit('pointerdown',{pointerId:1,pointerType:'mouse',button:0,clientX:100,clientY:0});
  let prevented=false,stopped=false;const click={preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};
  press();f.doc.emit('pointerup',{pointerId:1});f.track.emit('click',click);assert.equal(prevented,false);
  press();f.track.emit('pointermove',{pointerId:1,clientX:40,clientY:2,preventDefault(){}});assert.equal(f.track.scrollLeft,start+60);assert.equal(f.track.captured,1);
  f.doc.emit('pointerup',{pointerId:1});f.track.emit('click',click);assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(f.track.captured,null);
  prevented=false;press();f.doc.emit('pointerup',{pointerId:1});f.track.emit('click',click);assert.equal(prevented,false);
  f.track.scrollLeft=start+700;f.carousel.emit('focusin',{target:originals[0].link});assert.equal(f.track.scrollLeft,start);
  f.track.emit('mousedown',{target:f.track.slides[0].link,preventDefault(){prevented=true;}});assert.equal(prevented,true);
  dispose();
});

test('container-only resize, hidden tabs, and disposal cancel pending animation and observers',()=>{
  const f=carouselFixture(),dispose=initServiceCarousels(f.doc);
  f.next.emit('click');f.view.frame(50);const fraction=(f.track.scrollLeft-4944)/1236;
  f.track.width=164;f.track.clientWidth=900;f.view.observers[0].fn();assert.equal(f.view.frames.size,0);
  assert.ok(Math.abs((f.track.scrollLeft-4224)/1056-fraction)<.0001);
  f.next.emit('click');assert.ok(f.view.frames.size>0);f.doc.visibilityState='hidden';f.doc.emit('visibilitychange');assert.equal(f.view.frames.size,0);assert.equal(f.autoTimers().length,0);
  f.doc.visibilityState='visible';f.doc.emit('visibilitychange');f.next.emit('click');assert.ok(f.view.frames.size>0);
  dispose();assert.equal(f.view.frames.size,0);assert.equal(f.view.timers.size,0);assert.equal(f.track.slides.length,6);assert.equal(f.view.observers[0].disconnected,true);
  for(const node of [f.doc,f.view,f.reduce,f.carousel,f.track,f.prev,f.next,f.play])assert.ok([...node.handlers.values()].every(list=>list.length===0));
});

test('every visa submenu uses published choices and every service catalog uses a carousel',()=>{
  for(const locale of ['ru','en']){
    const choices=visaChoices('/bali/visas/',locale),routes=new Set(yorkRoutes().map(item=>item.route));assert.ok(choices.length>3);
    const home=readFileSync(path.join(output,previewHref('/',locale),'index.html'),'utf8');
    assert.match(home,/class="visa-menu" data-country-menu/);
    assert.match(home,/class="nav-menu bali-visa-menu" data-country-menu/);
    const headerVisas=home.match(/<nav id="menu-bali-visas"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(headerVisas);
    for(const choice of choices)assert.ok(headerVisas.includes('href="'+choice.href+'"'),choice.href);
    for(const choice of choices){assert.ok(routes.has(choice.href));assert.ok(home.includes('href="'+choice.href+'"'));}
    for(const route of ['/services/','/bali/','/bali/visas/','/thailand/']){
      const html=readFileSync(path.join(output,previewHref(route,locale),'index.html'),'utf8');assert.match(html,/data-service-carousel/);assert.doesNotMatch(html,/class="catalog-grid"/);
    }
  }
  assert.deepEqual(visaChoices('/missing/visas/','ru'),[]);
});

test('pinned YouTube is poster-only until explicit Watch and removes the player on close/pagehide',()=>{
  const doc=eventNode();doc.defaultView=eventNode();const section=eventNode(),watch=eventNode(),close=eventNode(),slot=eventNode(),poster=eventNode();
  section.dataset={embedUrl:'https://www.youtube-nocookie.com/embed/GhVWrSzvW5w?autoplay=1&playsinline=1&rel=0',frameTitle:'YouTube video'};
  section.querySelector=selector=>({'[data-video-watch]':watch,'[data-video-frame]':slot,'[data-video-close]':close,'[data-video-poster]':poster}[selector]);
  slot.childElementCount=0;slot.replaceChildren=()=>{slot.childElementCount=0;};slot.append=frame=>{slot.frame=frame;slot.childElementCount++;};watch.focus=()=>{watch.focused=true;};
  close.focus=()=>{close.focused=true;};
  let created=0;doc.createElement=tag=>{assert.equal(tag,'iframe');created++;return {focus(){}};};
  const dispose=mountYogaVideo(section,doc);assert.equal(created,0);assert.equal(poster.src,'https://i.ytimg.com/vi/GhVWrSzvW5w/hqdefault.jpg');
  watch.emit('click',{ctrlKey:true});assert.equal(created,0);
  watch.emit('click',{preventDefault(){}});assert.equal(created,1);assert.equal(slot.frame.src,section.dataset.embedUrl);assert.equal(slot.frame.referrerPolicy,'strict-origin-when-cross-origin');assert.equal(watch.hidden,true);assert.equal(close.focused,true);
  close.emit('click');assert.equal(slot.childElementCount,0);assert.equal(watch.focused,true);
  watch.emit('click',{preventDefault(){}});doc.defaultView.emit('pagehide');assert.equal(slot.childElementCount,0);dispose();
  for(const prefix of ['','en/']){const html=readFileSync(path.join(output,prefix,'index.html'),'utf8');assert.match(html,/data-yoga-video/);assert.match(html,/data-video-poster/);assert.match(html,/GhVWrSzvW5w/);assert.doesNotMatch(html,/<iframe/);}
  assert.match(PREVIEW_CSP,/img-src 'self' data: https:\/\/i.ytimg.com;/);assert.match(PREVIEW_CSP,/frame-src https:\/\/www.youtube-nocookie.com;/);assert.match(PREVIEW_CSP,/connect-src 'none'/);
});
