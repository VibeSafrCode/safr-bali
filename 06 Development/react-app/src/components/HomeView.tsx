import { useEffect, useMemo, useState } from "react";

import type { RouteContext } from "../api/types";
import {
  activeDestinations,
  activeServices,
  canonicalDestinationName,
  type Destination,
} from "../catalog";
import { countryTheme } from "../countryThemes";
import {
  initialCountryId,
  matchingCountries,
  SELECTED_COUNTRY_STORAGE_KEY,
} from "../homeCountries";
import { ServiceGrid } from "./CatalogGrids";
import { CountryCarousel } from "./CountryCarousel";
import { ManagerContactCard } from "./ManagerContactCard";
import { useI18n } from "../i18n/runtime";

function storedCountryId() {
  try {
    return window.localStorage.getItem(SELECTED_COUNTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function HomeView({
  navigate,
  onManager,
  pointsBalance,
}: {
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
  pointsBalance: number;
}) {
  const { locale, t } = useI18n();
  const destinations = useMemo(() => activeDestinations(locale), [locale]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<Destination["id"] | null>(() =>
    initialCountryId(destinations, storedCountryId()),
  );
  const visibleDestinations = useMemo(
    () => matchingCountries(destinations, query),
    [destinations, query],
  );
  const selected =
    visibleDestinations.find((destination) => destination.id === selectedId) ??
    visibleDestinations[0] ??
    null;

  function selectCountry(destinationId: Destination["id"]) {
    setSelectedId(destinationId);
    try {
      window.localStorage.setItem(SELECTED_COUNTRY_STORAGE_KEY, destinationId);
    } catch {
      // Storage can be disabled in embedded browsers; in-memory selection remains valid.
    }
  }

  useEffect(() => {
    if (
      visibleDestinations.length &&
      !visibleDestinations.some((destination) => destination.id === selectedId)
    ) {
      selectCountry(visibleDestinations[0].id);
    }
  }, [selectedId, visibleDestinations]);

  return (
    <section className="page-stack home-view">
      <header className="home-heading">
        <span className="eyebrow">SAFRWAY</span>
        <h1>{t("home.heading")}</h1>
        <label className="country-search">
          <span className="visually-hidden">{t("home.searchAria")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("home.searchPlaceholder")}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      {visibleDestinations.length ? (
        <CountryCarousel
          destinations={visibleDestinations}
          selectedId={selectedId}
          onSelect={selectCountry}
          onOpen={(destinationId) => navigate(`services/${destinationId}`)}
        />
      ) : (
        <div className="empty-state" role="status">
          <strong>{t("home.empty.title")}</strong>
          <p>{t("home.empty.detail")}</p>
        </div>
      )}

      {selected && visibleDestinations.length > 0 && (
        <div className="home-dashboard">
          <section className="home-services" aria-labelledby="home-services-title">
            <div className="section-heading home-section-heading">
              <div>
                <span className="eyebrow">{t("home.services.eyebrow")}</span>
                <h2 id="home-services-title">
                  {t("home.services.heading", { location: countryTheme(selected, locale).locativeName })}
                </h2>
              </div>
              <button
                className="home-country-action"
                type="button"
                aria-label={t("home.openDestinationAria", { destination: selected.name })}
                onClick={() => navigate(`services/${selected.id}`)}
              >
                {t("home.allServices")} <span aria-hidden="true">→</span>
              </button>
            </div>
            <ServiceGrid
              destination={selected}
              services={activeServices(selected)}
              onSelect={(serviceId) =>
                navigate(`services/${selected.id}/${serviceId}`)
              }
            />
          </section>
          <aside className="home-side-rail" aria-label={t("home.sideRailAria")}>
            <ManagerContactCard
              destination={selected}
              onContact={() =>
                onManager({ country: canonicalDestinationName(selected.id), section: "Главная" })
              }
            />
            <button
              className="home-points-card"
              type="button"
              onClick={() => navigate("profile")}
            >
              <span>SAFR Points</span>
              <strong>{new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU").format(pointsBalance)}</strong>
              <small>{t("home.openProfile")} <span aria-hidden="true">→</span></small>
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
