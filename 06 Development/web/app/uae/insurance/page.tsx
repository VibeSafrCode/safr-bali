import type { Metadata } from 'next';
import { insuranceProviders, insuranceCopy } from '../../../../shared/src/insurance';
import { ManagerButton } from '../../../components/ManagerButton';
import { SiteHeader } from '../../../components/SiteHeader';
import { SiteFooter } from '../../../components/SiteFooter';
import { StaticLink } from '../../../components/StaticLink';

export const metadata: Metadata = {title:'Страховки — ОАЭ',description:insuranceCopy.ru.summary,alternates:{canonical:'/uae/insurance/'}};
export default function UaeInsurance() {
  const text = insuranceCopy.ru;
  return <main className="service-page"><SiteHeader/><section className="service-page-content">
    <StaticLink className="catalog-back-link" href="/">← Все направления</StaticLink>
    <h1>Страховки — ОАЭ</h1><p>{text.summary}</p><p>{text.price} {text.contact}</p>
    {insuranceProviders.map(provider => <article key={provider.name}><h2>{provider.name}</h2><p>{provider.description.ru}</p>
      <ManagerButton className="button button-primary" context={{country:'ОАЭ',section:'Страховки',service:provider.name}}>{text.cta}: {provider.name}</ManagerButton>
    </article>)}<p>{text.availability}</p>
  </section><SiteFooter/></main>;
}
