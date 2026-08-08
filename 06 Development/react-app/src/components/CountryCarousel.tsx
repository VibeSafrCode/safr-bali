import type { Destination } from "../catalog";
import { countryTheme, countryThemeStyle } from "../countryThemes";

export function CountryCarousel({
  destinations,
  selectedId,
  onSelect,
  onOpen,
}: {
  destinations: readonly Destination[];
  selectedId: Destination["id"] | null;
  onSelect: (destinationId: Destination["id"]) => void;
  onOpen: (destinationId: Destination["id"]) => void;
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
            <article
              className={`country-slide ${selected ? "selected" : ""}`}
              key={destination.id}
              style={countryThemeStyle(theme)}
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
              <button
                className="country-slide-select"
                data-country-id={destination.id}
                type="button"
                aria-pressed={selected}
                aria-label={`Показать услуги: ${destination.name}`}
                onClick={() => onSelect(destination.id)}
              >
                <span>{available ? "Доступно" : "Скоро"}</span>
                <strong>{destination.name}</strong>
              </button>
              <button
                className="country-hub-action"
                type="button"
                aria-label={`Подробнее: ${destination.name}`}
                onClick={() => onOpen(destination.id)}
              >
                Подробнее <span aria-hidden="true">→</span>
              </button>
              {selected && <span className="country-selected-mark" aria-hidden="true">✓</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
