import type { PublicCard } from './public-catalog';
import { localizedRoute, sourceRoute, type PublicSourceLocale } from './public-i18n';
import {publicSupplementalControl} from './public-supplemental-controls';
import {publicComponentText} from './public-component-copy';
import {getPublicUaeCopy} from './public-editorial-live';
import {publicLocaleInfo} from './public-locale';
type ServiceAppCard=Pick<PublicCard,'title'|'href'|'icon'|'status'> & Partial<Pick<PublicCard,'summary'>>;
export function appPresentation(card: ServiceAppCard, locale: PublicSourceLocale) {
  publicLocaleInfo(locale);
  const route = sourceRoute(card.href).split('?')[0];
  const key = card.href.includes('service=bikes') ? 'bikes' : route.split('/').filter(Boolean)[1] ?? 'guide';
  const options: Record<string, [() => string, string, string]> = {
    insurance: [()=>publicComponentText('label.insurance',locale), 'shield', 'cyan'],
    visas: [()=>publicComponentText('label.visas',locale), '▣', 'blue'],
    housing: [()=>getPublicUaeCopy(locale).staysLabel, '⌂', 'coral'],
    property: [()=>publicSupplementalControl('serviceApps.propertyLabel',locale), '⌂', 'coral'],
    bikes: [()=>publicComponentText('bike.title',locale), 'bike', 'orange'],
    exchange: [()=>publicComponentText('label.exchange',locale), '↔', 'green'],
    assistant: [()=>getPublicUaeCopy(locale).assistantLabel, '✦', 'purple'],
    guides: [()=>publicComponentText('label.guides',locale), '▤', 'gold'],
    yachts: [()=>publicComponentText('label.yachts',locale), '≈', 'cyan'],
  };
  const data = options[key];
  return { label: data ? data[0]() : card.title, icon: data?.[1] ?? card.icon, tone: data?.[2] ?? 'blue' };
}
export function serviceApps(cards: PublicCard[], country: string, locale: PublicSourceLocale) {
  publicLocaleInfo(locale);
  const apps: ServiceAppCard[] = [...cards];
  if (country === 'bali' && apps.some(c => sourceRoute(c.href) === '/bali/assistant/')) {
    // The app renderer never consumes this injected card's archival summary.
    // Retain its original RU/EN metadata; do not create an unused new-locale translation or fallback.
    const legacySummary=locale==='ru'||locale==='en'
      ? {summary:locale==='en'?'Bike enquiries through your travel assistant.':'Помощь с выбором байка через тревел-ассистента.'}
      : {};
    apps.splice(2, 0, {title:publicComponentText('bike.title',locale),icon:'bike',...legacySummary,
      href:localizedRoute('/bali/assistant/',locale)+'?service=bikes',status:'available'});
  }
  return apps;
}
