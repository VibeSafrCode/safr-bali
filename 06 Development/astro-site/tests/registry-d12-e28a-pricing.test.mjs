import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import manifest from '../../shared/content/registry-d12-e28a-build.v1.json' with {type:'json'};
import occurrences from '../../shared/content/registry-copy/d12e28a_price_occurrences.json' with {type:'json'};
import {bindD12E28APayload,renderD12E28APriceTemplate} from '../scripts/registry-d12-e28a-pricing.mjs';
import {registryPrice,priceDisplay,unavailablePrice} from '../scripts/registry-price-bindings.mjs';
import {publicBuildEntries,buildPublicRegistryModel,publicTargetHref} from '../scripts/registry-publication.mjs';
import {d12E28AProjection} from './fixtures/d12-e28a-projection.mjs';

const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const ids=new Set(manifest.records.map(r=>r.contentId)),entries=publicBuildEntries().filter(e=>ids.has(e.contentId));
const now=Date.parse('2026-10-09T00:00:00Z'),projection=d12E28AProjection(now),expires=Date.parse(projection.derived_expires_at);
const get=(object,path)=>path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((value,key)=>value[key],object);
const metadata=entry=>JSON.parse(read(manifest.records.find(r=>r.contentId===entry.contentId).locales[entry.locale].metadataFile));
const html=model=>[model.introHtml,model.directHtml,model.factHtml,...model.sections.map(s=>s.html)].join('');
const numericAmounts=source=>[...source.matchAll(/(?<!\d)(?:\d{1,3}(?:[ ,.\u00a0]\d{3}){1,4}|\d{7,12})\s*IDR/g)]
  .map(match=>({literal:match[0],value:Number(match[0].replace(/\D/g,''))}));

test('all seventy localized models bind approved prices, FAQ and SEO without mutating supplied sources',()=>{
  assert.equal(entries.length,70);assert.equal(new Set(entries.map(e=>e.route)).size,70);
  let commercialPages=0;
  for(const entry of entries) {
    const source=metadata(entry),before=JSON.stringify(source),bound=bindD12E28APayload(source,entry);
    assert.equal(JSON.stringify(source),before,'Approved metadata stays immutable');
    const model=buildPublicRegistryModel(entry,{projection,now}),rendered=html(model);
    assert.equal(model.faqSchema.length,source.faq.length);assert.equal(model.sections.filter(s=>s.faq).length,1,'One visible FAQ section: '+entry.route);
    assert.doesNotMatch(rendered,/\{\{(?:USD|PRICE_IDR|CATALOG_PRICE)|RU_APPROVED|MODEL_TRANSLATED|Source revision|Editorial verification|\/_registry\//);
    assert.doesNotMatch(model.seoTitle,/\{\{/);assert.doesNotMatch(model.description,/\{\{/);
    assert.equal(model.seoTitle,renderD12E28APriceTemplate(bound.seo.title,projection,entry.locale,now));
    assert.equal(model.description,renderD12E28APriceTemplate(bound.seo.description,projection,entry.locale,now));
    for(const [i,faq] of model.faqSchema.entries()) {
      assert.equal(faq.question,renderD12E28APriceTemplate(bound.faq[i].question,projection,entry.locale,now));
      assert.equal(faq.answer,renderD12E28APriceTemplate(faq.answerTemplate,projection,entry.locale,now));
    }
    for(const link of model.related)assert.equal(link.href,publicTargetHref(link.contentId,entry.locale));
    const pins=occurrences.occurrences.filter(row=>row.contentId===entry.contentId&&row.locale===entry.locale);
    if(pins.length)commercialPages++;
    else assert.equal(bound.bodyMarkdown,source.bodyMarkdown,'No-price documents never receive commercial replacements');
    for(const pin of pins)assert.ok(get(bound,pin.fieldProperty).includes('{{CATALOG_PRICE:'+pin.operationId+'}}'));
    for(const match of rendered.matchAll(/data-registry-price="([^"]+)"[^>]*><bdi dir="ltr">([^<]+)<\/bdi>/g))
      assert.equal(match[2],priceDisplay(match[1],projection,entry.locale,now));
  }
  assert.equal(commercialPages,60);
});

test('admin edits change every commercial mirror while statutory shares and disputed bank balances remain exact',()=>{
  const changed=structuredClone(projection);
  for(const row of changed.items.filter(row=>row.entity_key==='D12'||row.entity_key==='E28A'||row.option_code==='d12-extension')) {
    if(!row.show_price)continue;row.amount_idr=String(BigInt(row.amount_idr)+350000n);row.display_usd_approx='555';
  }
  let protectedThresholds=0,protectedBalances=0;
  for(const entry of entries) {
    const source=metadata(entry),bound=bindD12E28APayload(source,entry),model=buildPublicRegistryModel(entry,{projection:changed,now});
    const rendered=html(model),prices=[...rendered.matchAll(/data-registry-price="([^"]+)"[^>]*><bdi dir="ltr">([^<]+)<\/bdi>/g)];
    for(const match of prices)assert.equal(match[2],priceDisplay(match[1],changed,entry.locale,now));
    for(const threshold of numericAmounts(source.bodyMarkdown).filter(row=>row.value>=1000000000)) {
      assert.ok(bound.bodyMarkdown.includes(threshold.literal),'Statutory threshold not mapped to service tariff');protectedThresholds++;
    }
    if(entry.contentId==='knowledge_d12_documents')for(const value of ['2','5']) {
      const pattern=new RegExp('(?<!\\d)'+value+'[ ,.\\u00a0]?000(?!\\d)','g');
      assert.ok((source.bodyMarkdown.match(pattern)??[]).length>0);
      assert.equal((bound.bodyMarkdown.match(pattern)??[]).length,(source.bodyMarkdown.match(pattern)??[]).length);protectedBalances++;
    }
    if(entry.contentId==='d12')assert.match(rendered,/7 850 000 IDR \(≈ \$555\)/);
    if(entry.contentId==='investor')assert.match(rendered,/16 350 000 IDR \(≈ \$555\)/);
    for(const faq of model.faqSchema)assert.equal(faq.answer,renderD12E28APriceTemplate(faq.answerTemplate,changed,entry.locale,now));
  }
  assert.ok(protectedThresholds>=20);assert.equal(protectedBalances,20);
  assert.equal(priceDisplay('conversion_from_d12',projection,'ru',now),'17 000 000 IDR (≈ $1020)');
});

test('all seventy cold-outage and expired-FX models avoid snapshot-price fallback and expired approximate dollars',()=>{
  for(const entry of entries) {
    const source=metadata(entry),pins=occurrences.occurrences.filter(row=>row.contentId===entry.contentId&&row.locale===entry.locale);
    const missing=buildPublicRegistryModel(entry,{projection:null,now}),expired=buildPublicRegistryModel(entry,{projection,now:expires+1});
    assert.doesNotMatch(html(missing),/\{\{CATALOG_PRICE|≈ \$/);assert.doesNotMatch(html(expired),/≈ \$/);
    assert.doesNotMatch(missing.seoTitle,/\{\{|≈ \$/);assert.doesNotMatch(missing.description,/\{\{|≈ \$/);
    for(const pin of pins)if(pin.fieldProperty==='bodyMarkdown')assert.ok(html(missing).includes(unavailablePrice[entry.locale]));
    for(const faq of expired.faqSchema)assert.doesNotMatch(faq.answer,/≈ \$/);
    for(const amount of numericAmounts(source.bodyMarkdown).filter(row=>row.value<1000000000))
      assert.doesNotMatch(html(missing),new RegExp(String(amount.value).replace(/(\d)(?=(?:\d{3})+$)/g,'$1[ ,.\\u00a0]?')+'\\s*IDR'));
  }
  assert.equal(registryPrice('d12-one-year-standard',projection,expires).usd,'450');
  assert.equal(registryPrice('d12-one-year-standard',projection,expires+1).usd,null);
});

test('duplicate, hidden, unverified and mismatched identities fail closed without affecting another operation',()=>{
  for(const operation of ['d12-one-year-standard','d12-one-year-express','d12-two-year-standard','d12-two-year-express','d12_extension','e28a-two-year-standard']) {
    const spec=occurrences.operations[operation],find=p=>p.items.find(item=>['entity_type','entity_key','option_code'].every(key=>item[key]===spec[key]));
    for(const mutate of [p=>p.items.push({...find(p)}),p=>find(p).show_price=false,p=>find(p).fee_verification_status='UNVERIFIED',
      p=>find(p).price_qualifier='CONTACT',p=>find(p).amount_idr=null,p=>find(p).option_code='unknown-unapproved']) {
      const candidate=structuredClone(projection);mutate(candidate);assert.equal(registryPrice(operation,candidate,now),null,operation);
      assert.equal(priceDisplay(operation,candidate,'ru',now),unavailablePrice.ru);
      assert.equal(registryPrice('c1',candidate,now).idr,'2 000 000','Legacy accepted operations retain existing behavior');
    }
  }
  const badFormula=structuredClone(projection);badFormula.display_usd_approx_formula_version='unapproved';
  assert.equal(registryPrice('e28a-two-year-standard',badFormula,now).usd,null);
  const badFx=structuredClone(projection);badFx.fx.status='missing';assert.equal(registryPrice('d12_extension',badFx,now).usd,null);
});

test('source/revision/locale or bound SEO drift is refused',()=>{
  const entry=entries.find(e=>e.contentId==='d12_extension'&&e.locale==='ru');
  for(const mutate of [source=>source.bodyMarkdown+='x',source=>source.sourceRevision='sha256:'+'0'.repeat(64),
    source=>source.seo.title+='x',source=>source.seo.description+='x',source=>source.locale='en']) {
    const source=metadata(entry);mutate(source);assert.throws(()=>bindD12E28APayload(source,entry));
  }
});
