import type { PublicCard } from './public-catalog';
import { localizedRoute, sourceRoute, type PublicLocale } from './public-i18n';
export function appPresentation(card: PublicCard, locale: PublicLocale) {
  const route = sourceRoute(card.href).split('?')[0];
  const key = card.href.includes('service=bikes') ? 'bikes' : route.split('/').filter(Boolean)[1] ?? 'guide';
  const options: Record<string, [string, string, string, string]> = {
    visas: ['Визы', 'Visas', '▣', 'blue'], housing: ['Жильё', 'Stays', '⌂', 'coral'],
    property: ['Жильё', 'Property', '⌂', 'coral'], bikes: ['Байки', 'Bikes', 'bike', 'orange'],
    exchange: ['Обмен', 'Exchange', '↔', 'green'], assistant: ['Ассистент', 'Assistant', '✦', 'purple'],
    guides: ['Гайды', 'Guides', '▤', 'gold'], yachts: ['Яхты', 'Yachts', '≈', 'cyan'],
  };
  const data = options[key];
  return { label: data ? data[locale === 'en' ? 1 : 0] : card.title, icon: data?.[2] ?? card.icon, tone: data?.[3] ?? 'blue' };
}
export function serviceApps(cards: PublicCard[], country: string, locale: PublicLocale) {
  const apps = [...cards];
  if (country === 'bali' && apps.some(c => sourceRoute(c.href) === '/bali/assistant/')) {
    apps.splice(2, 0, {title: locale === 'en' ? 'Bikes' : 'Байки', icon: 'bike', summary: locale === 'en' ? 'Bike enquiries through your travel assistant.' : 'Помощь с выбором байка через тревел-ассистента.', href: localizedRoute('/bali/assistant/', locale) + '?service=bikes', status: 'available'});
  }
  return apps;
}
