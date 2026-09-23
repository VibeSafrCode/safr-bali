import { insuranceProviders, insuranceCopy } from '../../../shared/src/insurance';
import '../../../shared/styles/insurance.css';

export function InsuranceOptions({ locale, onContact }: { locale: 'ru' | 'en'; onContact: (brand: string) => void }) {
  const text = insuranceCopy[locale];
  return <section aria-label={text.title}>
    <p className="insurance-note">{text.price} {text.contact}</p>
    <div className="insurance-providers">{insuranceProviders.map(provider => <article className="insurance-provider" key={provider.name}>
      <h2>{provider.name}</h2>
      <p>{provider.description[locale]}</p>
      <a href={provider.url} target="_blank" rel="noopener noreferrer">{text.brandLink}: {provider.name} ↗</a>
      <button className="button primary" type="button" aria-label={`${text.cta}: ${provider.name}`} onClick={() => onContact(provider.name)}>{text.cta}</button>
    </article>)}</div>
    <p className="insurance-note">{text.availability}</p>
  </section>;
}
