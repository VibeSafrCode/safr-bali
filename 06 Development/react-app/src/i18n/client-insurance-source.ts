import {insuranceCopy, insuranceProviders} from '../../../shared/src/insurance';
import {clientDestinationById} from './client-card-destination';
import {requireClientUiBindings, type ClientUiBindings} from './client-ui-bindings';

/** Literal decomposition of the fixed, accepted five-paragraph insurance body.
 * This is not retranslation, new coverage advice, role authority, or activation.
 * The missing separate brand-link label is deliberately not invented here. */
export function clientInsuranceSourceCopy(value: ClientUiBindings) {
  const ui = requireClientUiBindings(value);
  const insurance = clientDestinationById('bali', ui.locale)?.services.find(row => row.id === 'insurance');
  if (!insurance?.content) throw new Error('CLIENT_INSURANCE_SOURCE_MISSING');
  const paragraphs = insurance.content.split('\n\n');
  if (paragraphs.length !== 5 || paragraphs.slice(2).some(p => p.includes('\n'))) {
    throw new Error('CLIENT_INSURANCE_PARAGRAPH_CONTRACT');
  }
  const providers = insuranceProviders.map((provider, index) => {
    const lines = paragraphs[index].split('\n');
    if (lines.length !== 2 || lines[0] !== provider.name || lines[1].length === 0) {
      throw new Error('CLIENT_INSURANCE_PROVIDER_CONTRACT');
    }
    return Object.freeze({name: provider.name, url: provider.url, description: lines[1]});
  });
  if (ui.locale === 'ru' || ui.locale === 'en') {
    for (const [field, index] of [['price', 2], ['contact', 3], ['availability', 4]] as const) {
      if (paragraphs[index] !== insuranceCopy[ui.locale][field]) throw new Error('CLIENT_INSURANCE_RUEN_DRIFT');
    }
    providers.forEach((provider, index) => {
      if (provider.description !== insuranceProviders[index].description[ui.locale as 'ru' | 'en']) {
        throw new Error('CLIENT_INSURANCE_RUEN_DRIFT');
      }
    });
  }
  return Object.freeze({
    title: insurance.name, summary: insurance.summary,
    providers: Object.freeze(providers),
    price: paragraphs[2], contact: paragraphs[3], availability: paragraphs[4],
    cta: ui.text('catalog.writeManager'),
    sourceContent: insurance.content,
  });
}
