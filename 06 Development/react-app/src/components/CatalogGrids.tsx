import type { CatalogItem, Destination } from "../catalog";

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
  return (
    <div className="country-grid" aria-label="Страны SAFRWAY">
      {destinations.map((destination) => (
        <button
          className={`country-card ${destination.className}`}
          key={destination.id}
          type="button"
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
  return (
    <div className="service-grid" aria-label={`Услуги: ${destination.name}`}>
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
          {service.status === "soon" && <em>Скоро</em>}
        </button>
      ))}
    </div>
  );
}
