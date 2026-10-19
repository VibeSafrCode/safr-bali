import supplement from '../../../shared/content/client-ui/client-catalog-journey.v1.json';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {requireClientUiBindings, type ClientUiBindings} from './client-ui-bindings';
const entries=YOGA_MINI_APP?null:supplement.entries;

export type ClientJourneyKey = keyof typeof supplement.entries;
/** Fixed customer-only source module. Compilation/source replay pins every value;
 * no arbitrary packet, locale fallback, API, storage or role grant. */
export function clientJourneyText(value: ClientUiBindings, key: ClientJourneyKey) {
  if(!entries)throw new Error('CLIENT_JOURNEY_MAIN_BUILD_ONLY');
  const ui = requireClientUiBindings(value);
  if (!Object.hasOwn(entries, key)) throw new Error('CLIENT_JOURNEY_UNKNOWN_KEY');
  return entries[key][ui.locale];
}
export function clientCompactPriceLabels(ui: ClientUiBindings) {
  if(YOGA_MINI_APP)throw new Error('CLIENT_JOURNEY_MAIN_BUILD_ONLY');
  return {contact: clientJourneyText(ui, 'pricing.compact.contact'),
    from: clientJourneyText(ui, 'pricing.compact.fromPrefix')};
}
export const clientPlannerKeys = {
  title:'2ac3fb91ba6c', lead:'fa2ab2a9538f', plan:'a3e9ee564ec6',
  catalog:'23686ba412f8', status:'2b01af97a887', trip:'8ef972356468',
  question:'66d0d155b901', holiday:'2bff2ed22fff', business:'d63d9486a0c3',
  remote:'699c4da75668', unknown:'cc2cc10070d7', month:'2a5bc45c9d53',
  twoMonths:'bc701558e1b6', longer:'641e330bf792', withYou:'8aa158dca3bf',
  next:'e2a96e5e943f', step1:'f9bee57a5908', step2:'769ffc393925',
  step3:'7a68c7c4eaf4', detail1:'929b0be312d2', detail2:'8728ab99c909',
  detail3:'c4070e64d3fe',
} as const;
export function clientPlannerText(value: ClientUiBindings, key: keyof typeof clientPlannerKeys) {
  if(YOGA_MINI_APP)throw new Error('CLIENT_JOURNEY_MAIN_BUILD_ONLY');
  return requireClientUiBindings(value).text(`inline:06 Development/react-app/src/components/VisaPlanner.tsx#${clientPlannerKeys[key]}`);
}
