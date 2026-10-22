import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import grant from '../../shared/content/registry-hospitality-editorial-public-build.v1.json' with {type:'json'};
const root=process.env.SAFRWAY_PUBLIC_TEST_OUTPUT;assert.equal(typeof root,'string','Exact fresh build output required');
const content=new URL('../../shared/content/',import.meta.url);
const decode=s=>s.replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,a,b)=>String.fromCodePoint(parseInt(a??b,a?16:10))).replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]));
const visible=s=>decode(s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim();
const bodyLine=s=>s.replace(/^#{1,3} /,'').replace(/^- |^\d+\. /,'').replaceAll('**','').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/gu,' ').trim();
for(const [locale,pin]of Object.entries(grant.records[0].locales))test('fresh emitted exact hospitality two-component page '+locale,()=>{
 const html=fs.readFileSync(path.join(root,pin.route.slice(1),'index.html'),'utf8');
 const mains=[...html.matchAll(/<main\b[^>]*\bid="content"[^>]*>([\s\S]*?)<\/main>/g)];assert.equal(mains.length,1);
 const main=mains[0][1],text=visible(main);assert.equal((main.match(/<h1(?:\s|>)/g)||[]).length,1);
 assert.equal((main.match(/<h2(?:\s|>)/g)||[]).length,2);assert.equal((main.match(/<h3(?:\s|>)/g)||[]).length,18);assert.equal((main.match(/<h4(?:\s|>)/g)||[]).length,14);
 for(const component of pin.components){
  const body=fs.readFileSync(new URL(component.bodyFile,content),'utf8'),meta=JSON.parse(fs.readFileSync(new URL(component.metadataFile,content),'utf8'));
  assert.ok(text.includes(meta.title));assert.ok(text.includes(meta.ctaLabelLiteral));
  for(const line of body.split('\n').slice(1).filter(line=>line.trim()))assert.ok(text.includes(bodyLine(line)),'Missing whole paragraph/FAQ '+locale+' '+component.component);
  assert.ok(main.includes('href="#hospitality-'+component.component+'"'));assert.ok(main.includes('id="hospitality-'+component.component+'"'));
 }
 assert.equal((main.match(/data-support-open/g)||[]).length,2);
 assert.ok(html.includes('<link rel="canonical" href="https://safrway.online'+pin.route+'"'));
 assert.ok(html.includes('<meta name="robots" content="index,follow"'));assert.equal((html.match(/rel="alternate" hreflang=/g)||[]).length,11);
 assert.match(html,new RegExp('<html\\b[^>]*\\blang="'+locale+'"'));assert.match(html,locale==='ar'?/dir="rtl"/:/dir="ltr"/);
 assert.ok(decode(html).includes(pin.seoTitle));assert.ok(decode(html).includes(pin.description));
 const graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match=>JSON.parse(match[1]));
 const faq=graphs.filter(row=>row['@type']==='FAQPage');assert.equal(faq.length,1);assert.equal(faq[0].mainEntity.length,14);
 assert.doesNotMatch(html,/ROOT_ACCEPTANCE|PEER_REVIEW|LOCAL_MODEL_TRANSLATION|WHOLE_NATIVE|DEV3_|DEV4_|articleNativeSpan|\.source\.json|\/Users\//);
 assert.ok(html.includes('data-content-id="hospitality"'));assert.ok(!html.includes('data-service-id='));
});
