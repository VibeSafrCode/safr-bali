import { YOGA_MINI_APP } from "../runtime/yoga-mini-app";
import { insuranceProviders, insuranceCopy } from '../../../shared/src/insurance';
import '../../../shared/styles/insurance.css';
import {requireClientUiBindings, type ClientUiBindings} from '../i18n/client-ui-bindings';
import {clientInsuranceSourceCopy} from '../i18n/client-insurance-source';
import {clientJourneyText} from '../i18n/client-catalog-journey';

export function InsuranceOptions({ locale, onContact, ui }: { locale: 'ru' | 'en'; onContact: (brand: string) => void; ui?:ClientUiBindings }) {
  const client=YOGA_MINI_APP || ui===undefined?undefined:requireClientUiBindings(ui),source=client?clientInsuranceSourceCopy(client):null;
  const text = source?{...source,brandLink:clientJourneyText(client!,'insurance.brandLink')}:insuranceCopy[locale];
  const providers=source?source.providers:insuranceProviders.map(provider=>({...provider,description:provider.description[locale]}));
  return <section aria-label={text.title}>
    <p className="insurance-note">{text.price} {text.contact}</p>
    <div className="insurance-providers">{providers.map(provider => <article className="insurance-provider" key={provider.name}>
      <h2>{provider.name}</h2>
      <p>{provider.description}</p>
      <a href={provider.url} target="_blank" rel="noopener noreferrer">{text.brandLink}: {provider.name} ↗</a>
      <button className="button primary" type="button" aria-label={`${text.cta}: ${provider.name}`} onClick={() => onContact(provider.name)}>{text.cta}</button>
    </article>)}</div>
    <p className="insurance-note">{text.availability}</p>
  </section>;
}
