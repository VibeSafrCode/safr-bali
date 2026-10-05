import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import registry from '../../shared/content/service-registry.v1.json' with {type:'json'};
import manifest from '../../shared/content/registry-d1-d2-build.v1.json' with {type:'json'};
import occurrences from '../../shared/content/registry-copy/d1d2_price_occurrences.json' with {type:'json'};
import {bindD1Payload,d1PageKeys} from '../scripts/registry-d1-d2-pricing.mjs';
import {registryPrice,priceDisplay,registryPriceTemplate} from '../scripts/registry-price-bindings.mjs';
import {validateD1Build,D1_GATE_KEYS} from '../scripts/registry-d1-d2-publication.mjs';
import {publicBuildEntries,buildPublicRegistryModel,publicTargetHref} from '../scripts/registry-publication.mjs';
import {d1D2Projection} from './fixtures/d1-d2-projection.mjs';
const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const now=Date.parse('2026-10-05T00:00:00Z'),projection=d1D2Projection(now);
const entries=publicBuildEntries().filter(e=>Object.hasOwn(d1PageKeys,e.contentId));
const html=m=>[m.directHtml,m.factHtml,m.introHtml,...m.sections.map(s=>s.html)].join('');
const get=(o,path)=>path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((v,key)=>v[key],o);

test('six complete source-pinned families x10 with original fields and locale-specific links',()=>{
 assert.equal(entries.length,60);assert.equal(validateD1Build(manifest,registry,{readContent:read}).length,60);
 for(const e of entries) {
  const record=manifest.records.find(r=>r.contentId===e.contentId),pin=record.locales[e.locale];
  const meta=JSON.parse(read(pin.metadataFile)),source=JSON.parse(read(pin.sourceFile));
  const before=JSON.stringify(meta),bound=bindD1Payload(meta,{contentId:e.contentId,locale:e.locale});
  assert.equal(JSON.stringify(meta),before,'binding never modifies approved source');
  for(const key of Object.keys(source))assert.deepEqual(meta[key],source[key]);
  const m=buildPublicRegistryModel(e,{projection,now}),rendered=html(m);
  assert.equal(m.faqSchema.length,meta.faq.length);assert.equal(m.ctaActions.length,meta.cta.length);
  assert.equal(m.sections.filter(s=>s.faq).length,1,'FAQ rendered once');
  for(const question of meta.faq)assert.equal(m.faqSchema.filter(q=>q.question===question.question).length,1);
  assert.doesNotMatch(rendered,/\{\{(?:USD|PRICE_IDR|CATALOG_PRICE)|MODEL_REVIEWED|PNBP|sourceUnitId|\/_registry\//);
  assert.doesNotMatch(m.description,/\{\{/);
  for(const action of m.ctaActions)if(action.href)assert.ok(action.href.startsWith(e.locale==='ru'?'/bali/':registry.locales.find(l=>l.code===e.locale).prefix+'/bali/'));
  for(const related of m.related)assert.equal(related.href,publicTargetHref(related.contentId,e.locale));
  const operations=occurrences.occurrences.filter(o=>o.pageKey===e.contentId||o.pageKey===d1PageKeys[e.contentId]);
  for(const operation of operations) {
   const pin=operation.locales[e.locale],field=get(bound,pin.fieldProperty);
   assert.ok(field.includes('{{CATALOG_PRICE:'+operation.operationId+'}}'));
   if(pin.fieldProperty==='bodyMarkdown')assert.ok(rendered.includes('data-registry-price="'+operation.operationId+'"'),e.route);
  }
 }
 assert.equal(publicTargetHref('knowledge_d1_vs_d2','en'),null,'no seventh duplicate page');
});

test('changed Admin prices bind body, fact, FAQ and SEO without replacing proof of funds',()=>{
 const changed=structuredClone(projection);
 const row=changed.items.find(i=>i.option_code==='d1-one-year-standard');row.amount_idr='5250000';row.display_usd_approx='315';
 for(const e of entries) {
  const m=buildPublicRegistryModel(e,{projection:changed,now}),rendered=html(m);
  if(['d1','d1_d2'].includes(e.contentId))assert.match(rendered,/5 250 000 IDR \(≈ \$315\)/);
  for(const match of rendered.matchAll(/data-registry-price="([^"]+)"[^>]*><bdi dir="ltr">([^<]+)<\/bdi>/g))
    assert.equal(match[2],priceDisplay(match[1],changed,e.locale,now));
  for(const faq of m.faqSchema)assert.equal(faq.answer,registryPriceTemplate(faq.answerTemplate,changed,e.locale,now));
  if(e.contentId==='knowledge_d1_d2_documents')assert.match(rendered,/2[,. ]000|2000/,'USD2,000 balance not commercial tariff');
 }
 assert.equal(priceDisplay('d1-d2-extension-x2',changed,'ru',now),'5 000 000 IDR (≈ $300)');
 for(const code of ['d1-extension','d2-extension'])changed.items.find(i=>i.option_code===code).amount_idr='2700000';
 for(const e of entries.filter(e=>e.contentId==='d1_d2_extension'))
  assert.match(buildPublicRegistryModel(e,{projection:changed,now}).description,/2 700 000 IDR/);
});

test('shared extension never silently picks D1 when Admin variants or versions differ',()=>{
 for(const mutate of [
  p=>p.items.find(i=>i.option_code==='d2-extension').amount_idr='3000000',
  p=>p.items.find(i=>i.option_code==='d2-extension').display_usd_approx='155',
  p=>p.items=p.items.filter(i=>i.option_code!=='d2-extension'),
  p=>p.items.push(p.items.find(i=>i.option_code==='d1-extension')),
 ]) {
  const p=structuredClone(projection);mutate(p);
  assert.equal(registryPrice('d1-d2-extension-equal',p,now),null);
 }
 const wrongVersion=structuredClone(projection);wrongVersion.compositions.find(i=>i.recipe_code==='d2-extension-x2').fx_version=99;
 assert.equal(registryPrice('d1-d2-extension-x2',wrongVersion,now),null);
});

test('missing or expired projection hides untrusted USD and never falls back to snapshot prices',()=>{
 for(const e of entries) {
  const missing=buildPublicRegistryModel(e,{now});
  assert.doesNotMatch(html(missing),/IDR \(≈ \$|\{\{USD|5 000 000 IDR|2 500 000 IDR/);
  const stale=buildPublicRegistryModel(e,{projection,now:now+3600001});
  assert.doesNotMatch(html(stale),/≈ \$/);assert.doesNotMatch(stale.description,/≈ \$/);
  for(const faq of stale.faqSchema)assert.doesNotMatch(faq.answer,/≈ \$/);
 }
 assert.equal(registryPrice('d1-five-year-standard',projection,now),null);
});

test('source/field/approval drift and empty or incomplete publication gates are rejected',()=>{
 for(const mutate of [
  p=>p.bodyMarkdown+='x',p=>p.seo.description+='x',p=>p.factBlockMarkdown+='x',
 ]) {
  const pin=manifest.records.find(r=>r.contentId==='d1_d2_extension').locales.ru;
  const p=JSON.parse(read(pin.metadataFile));mutate(p);assert.throws(()=>bindD1Payload(p,{contentId:'d1_d2_extension',locale:'ru'}));
 }
 for(const mutate of [
  m=>m.publicationGates={},m=>delete m.publicationGates.render,
  m=>m.stage='DEPLOYED',m=>m.priceOccurrences.sha256='0'.repeat(64),
  m=>{m.publicationGates=Object.fromEntries(D1_GATE_KEYS.map(k=>[k,true]));m.stage='LOCAL_READY_NO_DEPLOY';delete m.renderEvidence;},
 ]) {const copy=structuredClone(manifest);mutate(copy);assert.throws(()=>validateD1Build(copy,registry,{readContent:read}));}
});
