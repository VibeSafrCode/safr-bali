import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import source from '../../shared/content/registry-vietnam-editorial-build.v1.json' with {type:'json'};
import grant from '../../shared/content/registry-vietnam-editorial-public-build.v1.json' with {type:'json'};
const root=process.env.SAFRWAY_PUBLIC_TEST_OUTPUT;assert.equal(typeof root,'string','Exact fresh build output required');
const content=new URL('../../shared/content/',import.meta.url);
const decode=s=>s.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,a,b)=>String.fromCodePoint(parseInt(a??b,a?16:10)))
  .replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));
const text=s=>decode(s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/g,'')
  .replace(/<\/(?:p|li|tr|th|td|h[1-6]|section|div)>/g,' ').replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim();
for(const [locale,pin]of Object.entries(source.records[0].locales))test('fresh emitted full Vietnam content '+locale,()=>{
  const meta=JSON.parse(fs.readFileSync(new URL(pin.metadataFile,content),'utf8')),route=grant.records[0].locales[locale].route;
  const html=fs.readFileSync(path.join(root,route.slice(1),'index.html'),'utf8');
  const mains=[...html.matchAll(/<main\b[^>]*\bid="content"[^>]*>([\s\S]*?)<\/main>/g)];assert.equal(mains.length,1,locale);
  const main=mains[0][1],visible=text(main);
  assert.equal((main.match(/<table(?:\s|>)/g)||[]).length,1,locale);
  assert.equal((main.match(/<tr(?:\s|>)/g)||[]).length,5,locale);
  assert.equal((main.match(/<li(?:\s|>)/g)||[]).length,5,locale);
  assert.equal((main.match(/<h2(?:\s|>)/g)||[]).length,10,locale);
  for(const line of meta.bodyMarkdown.split('\n').filter(x=>x.trim()&&!/^(?:#|\||- )/.test(x))){
    const expected=line.replace(/\*\*/g,'').replace(/\x60/g,'').replace(/\s+/gu,' ').trim();
    assert.ok(visible.includes(expected),'Missing literal emitted paragraph '+locale);
  }
  for(const q of meta.faq)assert.ok(visible.includes(q.question),'Missing visible FAQ '+locale);
  assert.ok(visible.includes(meta.cta[0].label),'Missing supplied CTA '+locale);
  assert.match(main,/data-support-open/);
  const graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>JSON.parse(m[1]));
  const faq=graphs.filter(x=>x['@type']==='FAQPage');assert.equal(faq.length,1,locale);assert.equal(faq[0].mainEntity.length,6,locale);
  for(let i=0;i<6;i++)assert.equal(faq[0].mainEntity[i].name,meta.faq[i].question,locale);
  assert.ok(html.includes('<link rel="canonical" href="https://safrway.online'+route+'"'),locale);
  assert.ok(html.includes('<meta name="robots" content="index,follow"'),locale);
  assert.equal((html.match(/rel="alternate" hreflang=/g)||[]).length,11,locale);
  assert.doesNotMatch(html,/DEV4_|RU_REVIEW|MODEL_TRANSLATED|privateEditorialNotes|NATIVE_LF_ARCHIVE/);
  assert.equal(fs.existsSync(path.join(root,locale==='ru'?'visas/vietnam/index.html':(locale==='zh-Hans'?'zh-cn':locale)+'/visas/vietnam/index.html')),false,locale);
});
