import { useEffect, useRef } from "react";

import type { Destination } from "../catalog";
import { countryTheme, countryThemeStyle } from "../countryThemes";

export function CountryCarousel({
  destinations,
  selectedId,
  onSelect,
  onOpenHub,
}: {
  destinations: readonly Destination[];
  selectedId: Destination["id"] | null;
  onSelect: (destinationId: Destination["id"]) => void;
  onOpenHub: (destinationId: Destination["id"]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const selected = track?.querySelector<HTMLElement>(
      `[data-country-id="${selectedId ?? ""}"]`,
    );
    if (!track || !selected) return;
    const left = selected.offsetLeft - (track.clientWidth - selected.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [destinations, selectedId]);

  function move(offset: number) {
    if (!destinations.length) return;
    const current = destinations.findIndex((destination) => destination.id === selectedId);
    const base = current < 0 ? 0 : current;
    const next = (base + offset + destinations.length) % destinations.length;
    onSelect(destinations[next].id);
  }

  return (
    <section
      className="country-carousel"
      aria-label="Доступные направления"
      aria-roledescription="карусель"
    >
      <div className="country-carousel-controls">
        <button
          type="button"
          aria-label="Предыдущее направление"
          disabled={destinations.length < 2}
          onClick={() => move(-1)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Следующее направление"
          disabled={destinations.length < 2}
          onClick={() => move(1)}
        >
          →
        </button>
      </div>
      <div className="country-carousel-track" ref={trackRef}>
        {destinations.map((destination) => {
          const theme = countryTheme(destination);
          const selected = destination.id === selectedId;
          return (
            <article
              className={`country-slide ${selected ? "selected" : ""}`}
              data-country-id={destination.id}
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
              <button
                className="country-slide-select"
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(destination.id)}
              >
                <span>Направление</span>
                <strong>{destination.name}</strong>
                <small>{theme.locativeName}</small>
              </button>
              <button
                className="country-hub-action"
                type="button"
                aria-label={`Открыть раздел: ${destination.name}`}
                onClick={() => onOpenHub(destination.id)}
              >
                Открыть раздел <span aria-hidden="true">→</span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
