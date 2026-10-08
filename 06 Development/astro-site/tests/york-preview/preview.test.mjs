import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {request} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewBrand,previewAuthorityAllowed,YORK_DEMO_ROUTES,previewHref} from '../../../shared/src/preview-brand.mjs';
import {publicBuildEntries,buildPublicRegistryModel} from '../../scripts/registry-publication.mjs';
import {yorkRoutes,yorkRegistryModel} from '../../src-york/lib/routes.ts';
import {getLocalizedPublicPages} from '../../src/lib/public-i18n.ts';
import {createYorkPreviewServer,PREVIEW_CSP} from '../../scripts/serve-york-preview.mjs';
import {initCountryMenus} from '../../src-york/public/country-menu.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'dist-york-preview');
const brand=previewBrand('york-gangster');

test('brand is opt-in, unknown selections fail, request data cannot choose rights',()=>{
  assert.equal(previewBrand(undefined),null);assert.equal(previewBrand(''),null);
  assert.throws(()=>previewBrand('safrway.online'),/Unknown preview brand/);
  assert.equal(brand.siteOrigin,null);assert.equal(brand.telegramBotUsername,null);
  assert.equal(brand.displayName,'Yoga Ganster');
  assert.equal(previewAuthorityAllowed(brand,'127.0.0.1:4380'),true);
  for(const authority of ['safrway.online','evil:4380','localhost:443','127.0.0.1:4380.evil'])assert.equal(previewAuthorityAllowed(brand,authority),false);
  for(const header of ['Forwarded','X-Forwarded-Host','X-Original-Host','Authorization'])assert.equal(previewAuthorityAllowed(brand,'127.0.0.1:4380',{[header]:'allowed'}),false);
  assert.throws(()=>previewHref('/','fr'));
});

test('country cards become shared RU/EN navigation dropdowns without changing service cards',()=>{
  for(const [prefix,label] of [['','Страны'],['en/','Countries']]) {
    const home=readFileSync(path.join(output,prefix,'index.html'),'utf8');
    assert.match(home,/aria-label="Yoga Ganster"/);
    assert.match(home,/<h1>Yoga Ganster<\/h1>/);
    assert.ok(home.includes(label));
    assert.match(home,/<details class="country-menu" data-country-menu>/);
    assert.match(home,/<script type="module" src="\/country-menu.js"><\/script>/);
    assert.doesNotMatch(home,/class="catalog-grid"|class="catalog-card"|York Gangster|GANGSTER/);
    assert.equal((home.match(/data-country-id=/g)??[]).length,5);
    for(const id of ['bali','thailand','uae','nepal','russia'])assert.match(home,new RegExp(`href="/${prefix}${id}/" data-country-id="${id}"`));
    const country=readFileSync(path.join(output,prefix,'bali/index.html'),'utf8');
    assert.match(country,/class="catalog-card"/);
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

test('RU/EN inherit every current approved/legacy route and all bounded demos',()=>{
  const routes=yorkRoutes();const names=new Set(routes.map(item=>item.route));
  assert.equal(names.size,routes.length);
  for(const locale of ['ru','en']) {
    for(const page of getLocalizedPublicPages(locale))assert.ok(names.has(page.route),page.route);
    for(const route of YORK_DEMO_ROUTES)assert.ok(names.has(previewHref(route,locale)),route);
  }
  for(const entry of publicBuildEntries().filter(entry=>['ru','en'].includes(entry.locale)))assert.ok(names.has(entry.route),entry.route);
  assert.ok(routes.every(route=>['ru','en'].includes(route.locale)));
  assert.ok(routes.every(route=>!/^\/(fr|de|es|zh|ja|ko|hi|ar)\//.test(route.route)));
  assert.equal(routes.length,171);
});

test('approved full body, facts, tables, prices and source revisions are not forked',()=>{
  for(const entry of publicBuildEntries().filter(entry=>['ru','en'].includes(entry.locale))) {
    const source=buildPublicRegistryModel(entry),preview=yorkRegistryModel(entry);
    for(const key of ['titleHtml','introHtml','directHtml','factHtml','sections','sourceRevision','pricingRef','familyApplicabilityNote'])assert.deepEqual(preview[key],source[key],entry.route+' '+key);
    assert.equal(preview.languageChoices.length,2);
    const built=readFileSync(path.join(output,entry.route,'index.html'),'utf8');
    const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
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
  assert.equal(files.length,172);
  for(const file of files) {
    const html=readFileSync(path.join(output,file),'utf8');
    assert.match(html,/data-preview-only="true"/);assert.match(html,/noindex,nofollow,noarchive/);
    assert.doesNotMatch(html,/rel=["']canonical|hreflang=|data-support-open|data-auth-|<iframe|<form|src=["']https?:\/\//i,file);
    assert.doesNotMatch(html,/href=["']https:\/\/(?:t\.me|app\.safrway\.online|api\.safrway\.online)/i,file);
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
