import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {bindFamilyPayload} from '../scripts/registry-family-kitas-pricing.mjs';
import {buildPublicRegistryModel,publicBuildEntries} from '../scripts/registry-publication.mjs';
import {e33gNextProjection} from './fixtures/e33g-next-projection.mjs';
const root=new URL('../../shared/content/',import.meta.url),read=file=>readFileSync(new URL(file,root));
const build=JSON.parse(read('registry-family-kitas-build.v1.json')),entries=publicBuildEntries().filter(e=>build.records.some(r=>r.contentId===e.contentId));
const metadata=entry=>JSON.parse(read(build.records.find(r=>r.contentId===entry.contentId).locales[entry.locale].metadataFile));
const now=Date.parse('2026-10-09T12:00:00Z'),projection=e33gNextProjection(now),allHtml=model=>model.directHtml+model.factHtml+model.sections.map(s=>s.html).join('');
test('all50 are family quote-only; only ten explicit NOT-family principal references follow independent live E33G standard/express prices',()=>{
  const changed=structuredClone(projection);
  for(const item of changed.items)if(item.entity_type==='VISA'&&item.entity_key==='E33G') {
    if(item.option_code==='standard'){item.amount_idr='13000000';item.display_usd_approx='780';}
    if(item.option_code==='express'){item.amount_idr='16000000';item.display_usd_approx='960';}
  }
  changed.items.push({entity_type:'VISA',entity_key:'Family',option_code:'standard',amount_idr:'99999999',display_usd_approx:'6000',show_price:true,price_qualifier:'EXACT',fee_verification_status:'VERIFIED'});
  for(const entry of entries) {
    const meta=metadata(entry),bound=bindFamilyPayload(meta,{contentId:entry.contentId,locale:entry.locale}),model=buildPublicRegistryModel(entry,{projection:changed,now}),html=allHtml(model);
    assert.equal(meta.quotePolicy.familyFixedPriceApproved,false);assert.equal(entry.pricingRef,null);assert.ok(!html.includes('99 999 999'));
    assert.equal((html.match(/data-registry-price=/g)??[]).length,entry.contentId==='family_spouse'?2:0);
    if(entry.contentId==='family_spouse') {
      assert.ok(bound.bodyMarkdown.includes('{{CATALOG_PRICE:e33g_standard}} / {{CATALOG_PRICE:e33g_express}}'));
      assert.ok(html.includes('13 000 000 IDR')&&html.includes('16 000 000 IDR'));assert.ok(!html.includes('12 000 000 IDR')&&!html.includes('14 000 000 IDR'));
    } else assert.equal(bound.bodyMarkdown,meta.body_markdown);
    if(entry.contentId==='knowledge_family_documents') {
      const eligibility=meta.body_markdown.split('\n').find(line=>/2[ ,.\u00a0]000/.test(line));assert.ok(eligibility);assert.ok(bound.bodyMarkdown.includes(eligibility),'USD2k eligibility example unchanged');
      assert.ok(bound.bodyMarkdown.includes('12'),'Principal-only banking-history condition unchanged');
    }
    assert.deepEqual(bound.faq,meta.faq);assert.deepEqual(bound.seo,meta.seo);
  }
});
test('all50 body/revision pins reject stale content; outages have no authored numeric fallback and expired FX hides approximate USD',()=>{
  for(const entry of entries) {
    const meta=metadata(entry),stale=structuredClone(meta);stale.sourceRevision='sha256:'+'0'.repeat(64);assert.throws(()=>bindFamilyPayload(stale,{contentId:entry.contentId,locale:entry.locale}),/revision drift/);
    const changed=structuredClone(meta);changed.bodyMarkdown+=' drift';assert.throws(()=>bindFamilyPayload(changed,{contentId:entry.contentId,locale:entry.locale}),/body drift/);
    const outage=allHtml(buildPublicRegistryModel(entry,{projection:null,now}));assert.ok(!outage.includes('12 000 000 IDR')&&!outage.includes('14 000 000 IDR'));
    const staleFx=structuredClone(projection);staleFx.derived_expires_at=new Date(now-1).toISOString();const html=allHtml(buildPublicRegistryModel(entry,{projection:staleFx,now}));
    if(entry.contentId==='family_spouse'){assert.ok(!html.includes('≈ $'));assert.equal((html.match(/data-registry-price=/g)??[]).length,2);}
  }
});
