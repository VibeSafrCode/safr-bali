import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationsForLocale, activeServices, canonicalCatalogItemName } from '../src/catalog';
import { INSURANCE_COUNTRIES, insuranceCopy, insuranceEnquiry, insuranceProviders, insuranceRouteContext } from '../../shared/src/insurance';

for (const locale of ['ru', 'en'] as const) {
  test(`insurance is available once in every non-Russian destination (${locale})`, () => {
    for (const country of destinationsForLocale(locale)) {
      const services = activeServices(country, locale);
      const insurance = services.filter(service => service.id === 'insurance');
      assert.equal(insurance.length, country.id === 'russia' ? 0 : 1, country.id);
      if (country.id === 'russia') continue;
      assert.ok(INSURANCE_COUNTRIES.includes(country.id));
      assert.equal(insurance[0].name, insuranceCopy[locale].title);
      assert.equal(insurance[0].note, insuranceCopy[locale].price);
      assert.equal(insurance[0].status, 'available');
      assert.equal(canonicalCatalogItemName(country.id, 'insurance'), 'Страховки');
      for (const provider of insuranceProviders) assert.ok(insurance[0].content?.includes(provider.name));
      if (country.id === 'bali') assert.equal(services.findIndex(service => service.id === 'insurance'), services.findIndex(service => service.id === 'bikes') + 1);
    }
  });
}
test('brand links are official and enquiry preserves destination and provider', () => {
  assert.deepEqual(insuranceProviders.map(provider => provider.name), ['LUMA', 'SafetyWing']);
  for (const provider of insuranceProviders) {
    assert.equal(new URL(provider.url).protocol, 'https:');
    for (const locale of ['ru','en'] as const) {
      const message = insuranceEnquiry('ОАЭ',provider.name,locale);
      assert.ok(message.includes('ОАЭ') && message.includes(provider.name));
    }
  }
});
test('structured insurance context survives editing message text and excludes Russia', () => {
  for (const countryId of INSURANCE_COUNTRIES) for (const brand of ['LUMA','SafetyWing']) {
    const context = insuranceRouteContext(countryId,brand);
    assert.ok(context?.country);
    assert.equal(context?.section,'Страховки');
    assert.equal(context?.service,brand);
  }
  assert.equal(insuranceRouteContext('russia','LUMA'),null);
  assert.equal(insuranceRouteContext('bali','unknown'),null);
});
