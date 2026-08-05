import type { Destination } from "../catalog";
import {
  countryTheme,
  countryThemeStyle,
  type LocationHeaderTheme,
} from "../countryThemes";

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
  const theme = countryTheme(destination);
  const hero = location?.hero ?? theme.hero;

  return (
    <header
      className={`country-header ${hero ? "has-country-art" : "neutral-country-art"}`}
      style={countryThemeStyle(theme)}
    >
      {hero && (
        <img
          className="country-header-art"
          src={hero.src}
          srcSet={hero.srcSet}
          sizes="(max-width: 640px) 100vw, 640px"
          alt={hero.alt}
          style={{ objectPosition: hero.position }}
        />
      )}
      <div className="country-header-shade" aria-hidden="true" />
      <div className="country-header-content">
        {onBack && (
          <button className="country-header-back" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span>
            {backLabel ?? "Назад"}
          </button>
        )}
        <div>
          <span className="country-header-label">
            {location?.label ?? "Направление"}
          </span>
          <strong>{location?.name ?? theme.name}</strong>
          {context && <small>{context}</small>}
        </div>
      </div>
    </header>
  );
}
