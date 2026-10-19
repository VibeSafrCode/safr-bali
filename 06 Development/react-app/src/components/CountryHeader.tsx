import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import type { Destination } from "../catalog";
import type {LocationHeaderTheme} from "../countryThemes";
import { useI18n } from "../i18n/runtime";
import { requireClientUiBindings, type ClientUiBindings } from "../i18n/client-ui-bindings";

export function CountryHeader({
  destination,
  context,
  backLabel,
  onBack,
  location,
  ui,
}: {
  destination: Destination;
  context?: string;
  backLabel?: string;
  onBack?: () => void;
  location?: LocationHeaderTheme | null;
  ui?: ClientUiBindings;
}) {
  const { t } = useI18n();
  const client = YOGA_MINI_APP || ui === undefined ? undefined : requireClientUiBindings(ui);
  if (client && !["bali", "thailand", "uae", "nepal", "russia"].includes(destination.id)) throw new Error("CLIENT_HEADER_DESTINATION_NOT_BOUND");

  return <header className="country-header"><button className="country-header-back" type="button" onClick={onBack}><span aria-hidden="true">←</span>{backLabel??(client ? client.text('catalog.back') : t('catalog.back'))}</button></header>;
}
