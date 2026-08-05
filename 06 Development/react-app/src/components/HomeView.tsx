import { useEffect, useMemo, useState } from "react";

import type { RouteContext } from "../api/types";
import {
  activeDestinations,
  activeServices,
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
}: {
  navigate: (path: string) => void;
  onManager: (context: RouteContext) => void;
}) {
  const destinations = useMemo(() => activeDestinations(), []);
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
        <h1>Куда вы направляетесь?</h1>
        <label className="country-search">
          <span className="visually-hidden">Найти страну по первым буквам</span>
          <input
            type="search"
            value={query}
            placeholder="Найти страну"
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
          onOpenHub={(destinationId) => navigate(`services/${destinationId}`)}
        />
      ) : (
        <div className="empty-state" role="status">
          <strong>Направление не найдено</strong>
          <p>Показаны только страны, где сейчас есть активные услуги.</p>
        </div>
      )}

      {selected && visibleDestinations.length > 0 && (
        <>
          <ManagerContactCard
            destination={selected}
            onContact={() =>
              onManager({ country: selected.name, section: "Главная" })
            }
          />
          <section className="home-services" aria-labelledby="home-services-title">
            <div className="section-heading">
              <span className="eyebrow">Доступные услуги</span>
              <h2 id="home-services-title">
                Чем помочь {countryTheme(selected).locativeName}?
              </h2>
            </div>
            <ServiceGrid
              destination={selected}
              services={activeServices(selected)}
              onSelect={(serviceId) =>
                navigate(`services/${selected.id}/${serviceId}`)
              }
            />
          </section>
        </>
      )}
    </section>
  );
}
