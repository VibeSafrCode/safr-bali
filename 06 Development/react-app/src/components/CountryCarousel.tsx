import type { Destination } from "../catalog";
import { countryTheme, countryThemeStyle } from "../countryThemes";

export function CountryCarousel({
  destinations,
  selectedId,
  onSelect,
}: {
  destinations: readonly Destination[];
  selectedId: Destination["id"] | null;
  onSelect: (destinationId: Destination["id"]) => void;
}) {
  return (
    <section
      className="country-carousel"
      aria-label="Доступные направления"
    >
      <div
        className="country-carousel-track"
        style={{
          gridTemplateColumns: `repeat(${Math.max(destinations.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {destinations.map((destination) => {
          const theme = countryTheme(destination);
          const selected = destination.id === selectedId;
          const available = destination.services.some(
            (service) => service.status !== "soon",
          );
          return (
            <button
              className={`country-slide ${selected ? "selected" : ""}`}
              data-country-id={destination.id}
              key={destination.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${destination.name}, ${available ? "доступные услуги" : "услуги готовятся"}`}
              style={countryThemeStyle(theme)}
              onClick={() => onSelect(destination.id)}
            >
              {theme.hero && (
                <img
                  src={theme.hero.src}
                  srcSet={theme.hero.srcSet}
                  sizes="(max-width: 640px) 78vw, 300px"
                  alt={theme.hero.alt}
                  loading={selected ? "eager" : "lazy"}
                  style={{ objectPosition: theme.hero.position }}
                />
              )}
              <span className="country-slide-shade" aria-hidden="true" />
              <span className="country-slide-copy">
                <small>{available ? "Доступно" : "Скоро"}</small>
                <strong>{destination.name}</strong>
              </span>
              {selected && <span className="country-selected-mark" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
