import type { Destination } from "../catalog";
import {
  countryTheme,
  countryThemeStyle,
  type LocationHeaderTheme,
} from "../countryThemes";
import { useI18n } from "../i18n/runtime";

export function CountryHeader({
  destination,
  context,
  backLabel,
  onBack,
  location,
}: {
  destination: Destination;
  context?: string;
  backLabel?: string;
  onBack?: () => void;
  location?: LocationHeaderTheme | null;
}) {
  const { locale, t } = useI18n();
  const theme = countryTheme(destination, locale);
  const hero = location?.hero ?? theme.hero;

  return <header className="country-header"><button className="country-header-back" type="button" onClick={onBack}><span aria-hidden="true">←</span>{backLabel??t('catalog.back')}</button></header>;
}
