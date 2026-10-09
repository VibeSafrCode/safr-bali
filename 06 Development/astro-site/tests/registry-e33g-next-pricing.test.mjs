import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import manifest from '../../shared/content/registry-e33g-next-build.v1.json' with {type:'json'};
import occurrences from '../../shared/content/registry-copy/e33g_next_price_occurrences.json' with {type:'json'};
import {bindE33GNextPayload,renderE33GNextPriceTemplate as render} from '../scripts/registry-e33g-next-pricing.mjs';
import {registryPrice,priceDisplay,unavailablePrice} from '../scripts/registry-price-bindings.mjs';
import {publicBuildEntries,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
import {e33gNextMoneySpans} from '../../shared/scripts/import-e33g-next-bundle.mjs';
import {e33gNextProjection} from './fixtures/e33g-next-projection.mjs';
const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const ids=new Set(manifest.records.map(r=>r.contentId)),entries=publicBuildEntries().filter(e=>ids.has(e.contentId));
const now=Date.parse('2026-10-09T00:00:00Z'),projection=e33gNextProjection(now);
const metadata=entry=>JSON.parse(read(manifest.records.find(r=>r.contentId===entry.contentId).locales[entry.locale].metadataFile));
const html=model=>[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join('');
const get=(value,path)=>path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((v,key)=>v[key],value);
test('all40 exact full models bind every commercial body/SEO/FAQ/table mirror with one visible FAQ and immutable sources',()=>{
  assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.route)).size,40);let faqCount=0;
  for(const entry of entries) {
    const source=metadata(entry),before=JSON.stringify(source),bound=bindE33GNextPayload(source,entry),model=buildPublicRegistryModel(entry,{projection,now});
    assert.equal(JSON.stringify(source),before);assert.equal(e33gNextMoneySpans(bound.bodyMarkdown).length,0,'Every implicit or explicit commercial source amount is bound');
    assert.equal(model.faqSchema.length,source.faq.length);assert.equal(model.sections.filter(s=>s.faq).length,1);faqCount+=model.faqSchema.length;
    assert.equal(model.seoTitle,render(bound.seo.title,projection,entry.locale,now));assert.equal(model.description,render(bound.seo.description,projection,entry.locale,now));
    assert.doesNotMatch(html(model),/\{\{(?:CATALOG_PRICE|USD)|RU_APPROVED|MODEL_REVIEWED|contentId \(предложение\)|Дата редакционной проверки/);
    for(const pin of occurrences.occurrences.filter(r=>r.contentId===entry.contentId&&r.locale===entry.locale)) {
      const operation=pin.operationIds?'e33g-conversion-voa-d12-equal':pin.operationId;assert.ok(get(bound,pin.fieldProperty).includes('{{CATALOG_PRICE:'+operation+'}}'));
    }
    for(const faq of model.faqSchema){assert.equal(faq.question,render(faq.questionTemplate,projection,entry.locale,now));assert.equal(faq.answer,render(faq.answerTemplate,projection,entry.locale,now));}
    for(const match of html(model).matchAll(/data-registry-price="([^"]+)"[^>]*><bdi dir="ltr">([^<]+)<\/bdi>/g))assert.equal(match[2],priceDisplay(match[1],projection,entry.locale,now));
    assert.equal(model.ctaActions.length,source.cta.length); // one knowledge CTA / two commercial CTAs
  }
  assert.equal(faqCount,270);
});
test('independent admin changes keep extension/initial12m and VOA/D1217m distinct; ambiguous dual17m fails closed on divergence',()=>{
  const changed=structuredClone(projection),find=id=>{const spec=occurrences.operations[id];return changed.items.find(row=>['entity_type','entity_key','option_code'].every(k=>row[k]===spec[k]));};
  find('e33g_extension').amount_idr='12350000';find('e33g_standard').amount_idr='12750000';find('conversion_from_d12').amount_idr='17650000';
  assert.equal(registryPrice('e33g-conversion-voa-d12-equal',projection,now).idr,'17 000 000');
  assert.equal(registryPrice('e33g-conversion-voa-d12-equal',changed,now),null);
  for(const entry of entries) {
    const source=metadata(entry),bound=bindE33GNextPayload(source,entry),model=buildPublicRegistryModel(entry,{projection:changed,now});
    for(const literal of [...source.bodyMarkdown.matchAll(/(?:60[ ,.\u00a0]000|2[ ,.\u00a0]000)\s*USD/g)].map(m=>m[0]))
      assert.equal(bound.bodyMarkdown.split(literal).length,source.bodyMarkdown.split(literal).length,'Eligibility USD/3 or12month statements never become tariffs');
    for(const match of html(model).matchAll(/data-registry-price="([^"]+)"[^>]*><bdi dir="ltr">([^<]+)<\/bdi>/g))assert.equal(match[2],priceDisplay(match[1],changed,entry.locale,now));
    if(entry.contentId==='e33g_next_term'){assert.match(html(model),/12 350 000 IDR/);assert.match(html(model),/12 750 000 IDR/);}
    if(entry.contentId==='e33g_conversion'){assert.match(html(model),/17 000 000 IDR/);assert.match(html(model),/17 650 000 IDR/);assert.ok(model.faqSchema[4].question.includes(unavailablePrice[entry.locale]));}
  }
});
test('all40 cold catalog outage and expired FX models never show source-price fallback or expired approximateUSD',()=>{
  const expiry=Date.parse(projection.derived_expires_at);
  for(const entry of entries) {
    const missing=buildPublicRegistryModel(entry,{projection:null,now}),expired=buildPublicRegistryModel(entry,{projection,now:expiry+1});
    for(const value of [html(missing),missing.seoTitle,missing.description,...missing.faqSchema.flatMap(q=>[q.question,q.answer])]) {
      assert.doesNotMatch(value,/\{\{CATALOG_PRICE|≈ \$/);assert.equal(e33gNextMoneySpans(value).length,0,'No static commercial snapshot survives outage');
    }
    assert.ok(html(missing).includes(unavailablePrice[entry.locale]));assert.doesNotMatch(html(expired),/≈ \$/);
    for(const q of expired.faqSchema)assert.doesNotMatch(q.question+q.answer,/≈ \$/);
  }
});
test('duplicate/hidden/mismatched rows and unverified new operations fail closed; field, identity or approved-source drift is refused',()=>{
  const newlyActivated=new Set(['e33g_extension','employment_review','conversion_from_voa','conversion_from_c1','conversion_from_d12','conversion_from_kitas']);
  for(const [id,spec] of Object.entries(occurrences.operations)) {
    const find=p=>p.items.find(row=>['entity_type','entity_key','option_code'].every(k=>row[k]===spec[k]));
    const mutations=[p=>p.items.push({...find(p)}),p=>find(p).show_price=false,p=>find(p).price_qualifier='CONTACT',p=>find(p).amount_idr=null,p=>find(p).option_code='unknown'];
    if(newlyActivated.has(id))mutations.push(p=>find(p).fee_verification_status='UNVERIFIED');
    for(const mutate of mutations){const p=structuredClone(projection);mutate(p);assert.equal(registryPrice(id,p,now),null,id);}
  }
  const entry=entries.find(e=>e.contentId==='e33g_next_term'&&e.locale==='ru');
  for(const mutate of [m=>m.bodyMarkdown+='x',m=>m.sourceRevision='sha256:'+'0'.repeat(64),m=>m.seo.title+='x',m=>m.seoTitle+='x',
    m=>m.directAnswer+='x',m=>m.faq[1].answerMarkdown+='x',m=>m.tables[0].markdown+='x',m=>m.locale='en',m=>m.resolvedContentId='e33g']) {
    const m=metadata(entry);mutate(m);assert.throws(()=>bindE33GNextPayload(m,entry));
  }
});
