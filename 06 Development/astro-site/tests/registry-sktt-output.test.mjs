import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-sktt-editorial-public-build.v1.json' with {type:'json'};
const root=process.env.SAFRWAY_PUBLIC_TEST_OUTPUT;assert.equal(typeof root,'string','Exact fresh build output required');
const content=new URL('../../shared/content/',import.meta.url),record=registry.records.find(row=>row.contentId==='sktt');
const decode=s=>s.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,a,b)=>String.fromCodePoint(parseInt(a??b,a?16:10)))
 .replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));
const text=s=>decode(s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/g,'')
 .replace(/<\/(?:p|li|h[1-6]|section|div)>/g,' ').replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim();
function assertRootLocale(html,locale){
 const roots=[...html.matchAll(/<html\b([^>]*)>/g)];assert.equal(roots.length,1);
 const langs=[...roots[0][1].matchAll(/(?:^|\s)lang="([^"]*)"/g)],dirs=[...roots[0][1].matchAll(/(?:^|\s)dir="([^"]*)"/g)];
 assert.equal(langs.length,1);assert.equal(dirs.length,1);
 assert.equal(langs[0][1],locale);assert.equal(dirs[0][1],locale==='ar'?'rtl':'ltr');
}
test('root locale assertion accepts leading attributes but rejects wrong/missing/duplicate root language and direction',()=>{
 assertRootLocale('<html data-public-night="true" lang="ar" dir="rtl">','ar');
 assertRootLocale('<html dir="ltr" data-locale="en" lang="en">','en');
 assertRootLocale('<html data-lang="irrelevant" data-dir="irrelevant" lang="ar" dir="rtl">','ar');
 for(const html of ['<html lang="en" dir="rtl">','<html lang="ar" dir="ltr">','<html dir="rtl">',
  '<html lang="ar" lang="ar" dir="rtl">','<html lang="ar" dir="rtl" dir="rtl">','<html lang="ar" dir="rtl"><html lang="ar" dir="rtl">'])
  assert.throws(()=>assertRootLocale(html,'ar'));
});
for(const [locale,pin]of Object.entries(grant.records[0].locales))test('fresh emitted whole SKTT '+locale,()=>{
 const payload=locale==='ru'?record.candidate.ru:record.candidate.translations[locale],meta=JSON.parse(fs.readFileSync(new URL(payload.metadataFile,content),'utf8'));
 const html=fs.readFileSync(path.join(root,pin.route.slice(1),'index.html'),'utf8');
 const mains=[...html.matchAll(/<main\b[^>]*\bid="content"[^>]*>([\s\S]*?)<\/main>/g)];assert.equal(mains.length,1);
 const main=mains[0][1],visible=text(main);
 assert.equal((main.match(/<h2(?:\s|>)/g)||[]).length,3);assert.equal((main.match(/<table(?:\s|>)/g)||[]).length,0);
 for(const line of meta.bodyMarkdown.split('\n').filter(value=>value.trim()&&!value.startsWith('#')))
  assert.ok(visible.includes(line.replaceAll('**','').replace(/\s+/gu,' ').trim()),'Missing whole paragraph/FAQ '+locale);
 assert.ok(visible.includes(meta.cta[0].label));assert.match(main,/data-support-open/);
 assert.equal((main.match(/<h1(?:\s|>)/g)||[]).length,1);
 const graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match=>JSON.parse(match[1]));
 const faq=graphs.filter(value=>value['@type']==='FAQPage');assert.equal(faq.length,1);assert.equal(faq[0].mainEntity.length,2);
 for(let i=0;i<2;i++)assert.equal(faq[0].mainEntity[i].name,meta.faq[i].question);
 assert.ok(html.includes('<link rel="canonical" href="https://safrway.online'+pin.route+'"'));
 assert.ok(html.includes('<meta name="robots" content="index,follow"'));assert.equal((html.match(/rel="alternate" hreflang=/g)||[]).length,11);
 assertRootLocale(html,locale);
 assert.ok(decode(html).includes(meta.seoTitle));assert.ok(decode(html).includes(meta.metaDescription));
 assert.doesNotMatch(html,/ROOT_ACCEPTANCE|PEER_REVIEW|LOCAL_MODEL_TRANSLATION|NATIVE_RECEIVED|DEV4_|\.source\.json|sourceEnvelopeSha256|\/Users\//);
});
