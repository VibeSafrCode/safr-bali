import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validatePartnersBuild,PARTNERS_GATE_KEYS} from '../scripts/registry-partners-publication.mjs';
import {publicBuildEntries,publicEntryForRoute,publicTargetHref,publicAlternatesForRoute,buildPublicRegistryModel} from '../scripts/registry-publication.mjs';
const root=new URL('../../shared/content/',import.meta.url),readContent=file=>readFileSync(new URL(file,root));
const build=JSON.parse(readContent('registry-partners-build.v1.json')),registry=JSON.parse(readContent('service-registry.v1.json'));
const html=model=>model.directHtml+model.factHtml+model.sections.map(s=>s.html).join('');
const text=value=>value.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");
test('all ten exact Partners models preserve90single FAQs/SEO, real secondary anchor and protected CRM public attribution without new visa/price/referral identities',()=>{
  const entries=validatePartnersBuild(build,registry,{readContent});assert.equal(entries.length,10);assert.equal(publicBuildEntries().length,370);
  for(const entry of entries){const pin=build.records[0].locales[entry.locale],meta=JSON.parse(readContent(pin.metadataFile)),model=buildPublicRegistryModel(entry),visible=text(html(model));
    assert.equal(model.seoTitle,meta.sourceRecord.seo.title);assert.equal(model.description,meta.sourceRecord.seo.description);assert.equal(model.title,meta.sourceRecord.seo.h1);
    assert.equal(model.dir,entry.locale==='ar'?'rtl':'ltr');assert.equal(model.sections.length,7);assert.equal(model.sections.filter(s=>s.faq).length,1);assert.equal(model.faqSchema.length,9);
    for(const item of model.faqSchema)assert.equal(visible.split(item.question).length-1,1,'FAQ visible exactly once');
    assert.deepEqual(model.sourceContext,{section:'partners',content_id:'partners',source_revision:entry.sourceRevision,path:entry.route,locale:entry.locale});
    assert.deepEqual(model.ctaActions,[{label:meta.sourceRecord.cta.primaryLabel,href:null,manager:true,intent:'existing_b2b_lead_or_contact_flow'},
      {label:meta.sourceRecord.cta.secondaryAnchorLabel,href:'#partner-services',manager:false,intent:'scroll_to_partner_services_section'}]);
    assert.equal(model.sections[1].id,'partner-services');assert.equal(model.finalCtaActions[0].label,meta.sourceRecord.cta.finalLabel);assert.equal(model.finalCtaActions[0].manager,true);
    assert.equal(entry.serviceId,null);assert.equal(entry.pricingRef,null);assert.equal(model.price,null);assert.equal(model.pricingHref,undefined);assert.equal(model.tariffPrices,null);
    assert.equal(model.indexable,false);assert.deepEqual(publicAlternatesForRoute(entry.route),[]);assert.equal(publicTargetHref('partners',entry.locale),entry.route);
    assert.ok(!/Content references for Codex|RU_REVIEW|MODEL_TRANSLATED|\*\*Status|data-registry-price|Referral|\/referral\//.test(html(model)),'No internal Referral program/editorial/price leakage');
    assert.ok(!html(model).includes(meta.sourceRecord.cta.secondaryReferralCopy));assert.equal(model.sourceRecord,undefined,'Immutable source record is server-only');
    const injected=buildPublicRegistryModel(entry,{projection:{items:[{entity_type:'SERVICE',entity_key:'partners',amount_idr:'99999999',show_price:true}]}});assert.equal(html(injected),html(model),'Catalog data cannot create a Partners price');
  }
  assert.ok(PARTNERS_GATE_KEYS.every(g=>build.publicationGates[g]===false));for(const route of ['/referral/','/en/referral/','/account/partners/','/partners-b2b/'])assert.equal(publicEntryForRoute(route),null);
});
test('all source/metadata/revision/direction/quote/CTA pins and fabricated ready evidence fail closed',()=>{
  for(const locale of registry.locales){const pin=build.records[0].locales[locale.code];for(const field of ['bodyFile','metadataFile','sourceFile','sourceMarkdownFile'])assert.throws(()=>validatePartnersBuild(build,registry,{readContent:file=>file===pin[field]?Buffer.from(readContent(file).toString()+'drift'):readContent(file)}));}
  const revision=structuredClone(build);revision.records[0].sourceRevision='sha256:'+'0'.repeat(64);assert.throws(()=>validatePartnersBuild(revision,registry,{readContent}));
  const direction=structuredClone(build);direction.records[0].locales.ar.direction='ltr';assert.throws(()=>validatePartnersBuild(direction,registry,{readContent}));
  const tariff=structuredClone(registry);tariff.records.find(r=>r.contentId==='partners').serviceId='visa';assert.throws(()=>validatePartnersBuild(build,tariff,{readContent}));
  const fakeReady=structuredClone(build);for(const gate of PARTNERS_GATE_KEYS)fakeReady.publicationGates[gate]=true;fakeReady.stage='LOCAL_READY_NO_DEPLOY';assert.throws(()=>validatePartnersBuild(fakeReady,registry,{readContent}));
});
