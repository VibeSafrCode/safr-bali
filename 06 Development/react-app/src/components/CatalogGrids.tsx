import type { CatalogItem, Destination } from "../catalog";
import { countryTheme, countryThemeStyle } from "../countryThemes";
import { useI18n } from "../i18n/runtime";

const localCountryNames: Partial<Record<Destination["id"], string>> = {
  bali: "Bali",
  thailand: "ไทย",
  nepal: "नेपाल",
};

type CountryGridProps = {
  destinations: readonly Destination[];
  onSelect: (destinationId: Destination["id"]) => void;
};

export function CountryGrid({ destinations, onSelect }: CountryGridProps) {
  const { locale, t } = useI18n();
  return (
    <div className="country-grid" aria-label={t("catalog.countriesAria")}>
      {destinations.map((destination) => (
        <button
          className="country-card neutral-country-card"
          key={destination.id}
          type="button"
          style={countryThemeStyle(countryTheme(destination, locale))}
          onClick={() => onSelect(destination.id)}
        >
          <span className="country-card-accent" aria-hidden="true" />
          <span className="country-card-copy">
            <strong>{destination.name}</strong>
            {localCountryNames[destination.id] && (
              <small aria-hidden="true">{localCountryNames[destination.id]}</small>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

type ServiceGridProps = {
  destination: Destination;
  services: readonly CatalogItem[];
  onSelect: (serviceId: string) => void;
};

export function ServiceGrid({
  destination,
  services,
  onSelect,
}: ServiceGridProps) {
  const { t } = useI18n();
  return (
    <div className="service-grid" aria-label={t("catalog.servicesAria", { destination: destination.name })}>
      {services.map((service) => (
        <button
          className="service-card"
          key={service.id}
          type="button"
          onClick={() => onSelect(service.id)}
        >
          <span className="service-card-icon" aria-hidden="true">
            {service.icon}
          </span>
          <strong>{service.name}</strong>
          <small>{service.summary}</small>
          {service.status === "soon" && <em>{t("catalog.soon")}</em>}
        </button>
      ))}
    </div>
  );
}
