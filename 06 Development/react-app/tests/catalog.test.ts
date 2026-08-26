import assert from "node:assert/strict";
import test from "node:test";

import {
  activeDestinations,
  activeServices,
  catalogSnapshotMeta,
  destinations,
  destinationsForLocale,
  canonicalDestinationName,
} from "../src/catalog";
import {
  countryTheme,
  locationHeaderTheme,
  serviceVisualForRoute,
} from "../src/countryThemes";
import { initialCountryId, matchingCountries } from "../src/homeCountries";

test("React reads the immutable shared B4 catalog snapshot", () => {
  assert.match(catalogSnapshotMeta.id, /^catalog-runtime-v1-[a-f0-9]{12}$/);
  assert.match(catalogSnapshotMeta.revision, /^sha256:[a-f0-9]{64}$/);
});

test("React catalog preserves all four current bot directions", () => {
  assert.deepEqual(
    destinations.map((destination) => destination.id),
    ["bali", "thailand", "russia", "nepal"],
  );
});

test("localized catalog changes display copy but preserves route-context names", () => {
  const english = destinationsForLocale("en");
  assert.deepEqual(
    english.map((destination) => destination.name),
    ["Bali", "Thailand", "Russia", "Nepal"],
  );
  assert.equal(
    english.find((destination) => destination.id === "thailand")?.services[0]?.summary,
    "Currency exchange in Thailand.",
  );
  assert.equal(canonicalDestinationName("thailand"), "Таиланд");
});

test("Bali catalog preserves independent service and detail screens", () => {
  const bali = destinations.find((destination) => destination.id === "bali");
  assert.ok(bali);
  assert.deepEqual(
    bali.services.map((service) => service.id),
    ["visas", "housing", "exchange", "assistant", "guides"],
  );
  const visas = bali.services.find((service) => service.id === "visas");
  assert.ok(visas?.children?.some((item) => item.id === "e33g"));
  assert.ok(visas?.children?.some((item) => item.id === "d12"));
  assert.ok(visas?.children?.some((item) => item.id === "voa"));

  const exchange = bali.services.find((service) => service.id === "exchange");
  const legacyManualRoute = exchange?.children?.find(
    (item) => item.id === "other-exchange",
  );
  assert.equal(legacyManualRoute?.publiclyHidden, true);
  assert.deepEqual(
    exchange?.children
      ?.filter((item) => !item.publiclyHidden)
      .map((item) => item.id),
    ["usdt-idr"],
  );

  const allIndonesia = bali.services
    .find((service) => service.id === "guides")
    ?.children?.find((item) => item.id === "all-indonesia");
  assert.equal(allIndonesia?.download?.mediaType, "application/pdf");
  assert.equal(allIndonesia?.download?.language, "ru");
  assert.equal(allIndonesia?.download?.sizeBytes, 98_182);
  assert.equal(
    allIndonesia?.download?.href,
    "https://safrway.online/downloads/all-indonesia-client-guide-safrway-2026.pdf",
  );
  assert.match(allIndonesia?.content ?? "", /официальной формы/);

  const englishGuide = destinationsForLocale("en")
    .find((destination) => destination.id === "bali")
    ?.services.find((service) => service.id === "guides")
    ?.children?.find((item) => item.id === "all-indonesia");
  assert.equal(englishGuide?.download?.label, "Download the PDF guide");
  assert.match(englishGuide?.content ?? "", /official portal/);
});

test("country discovery exposes all destinations and preparation services", () => {
  assert.deepEqual(
    activeDestinations().map((destination) => destination.id),
    ["bali", "thailand", "russia", "nepal"],
  );
  const thailand = destinations.find((destination) => destination.id === "thailand");
  assert.ok(thailand);
  assert.ok(activeServices(thailand).length > 0);
  assert.ok(activeServices(thailand).every((service) => service.status === "soon"));
});

test("country themes use only Founder-approved artwork and canonical city headers", () => {
  const bali = destinations.find((destination) => destination.id === "bali");
  assert.ok(bali);
  const theme = countryTheme(bali);
  assert.equal(theme.locativeName, "на Бали");
  assert.match(theme.hero?.src ?? "", /bali-country-hero-approved\.jpg$/);
  assert.equal(theme.hero?.position, "60% 16%");
  assert.equal(theme.accent, "#103c32");

  assert.ok(destinations.every((destination) => countryTheme(destination).hero));
  assert.equal(
    locationHeaderTheme("russia", "spb")?.name,
    "Санкт-Петербург",
  );
  assert.match(
    locationHeaderTheme("russia", "spb")?.hero.src ?? "",
    /russia-spb-city-header-approved\.jpg$/,
  );
  assert.equal(locationHeaderTheme("russia", "ural")?.label, "Регион");
  assert.match(
    locationHeaderTheme("russia", "ural")?.hero.src ?? "",
    /russia-ural-region-header-approved\.jpg$/,
  );
  assert.equal(locationHeaderTheme("russia", "caucasus")?.label, "Регион");
  assert.match(
    locationHeaderTheme("russia", "caucasus")?.hero.src ?? "",
    /russia-caucasus-region-header-approved\.jpg$/,
  );
});

test("service photography stays limited to the two approved factual examples", () => {
  assert.match(
    serviceVisualForRoute("bali", "housing", "villa")?.src ?? "",
    /bali-villa-service-approved\.jpg$/,
  );
  assert.match(
    serviceVisualForRoute("russia", "spb", "boat-spb")?.src ?? "",
    /russia-spb-boat-service-approved\.jpg$/,
  );
  assert.equal(serviceVisualForRoute("bali", "housing", "guesthouse"), null);
  assert.equal(serviceVisualForRoute("thailand", "yachts"), null);
});

test("country search uses prefixes and persisted selection keeps every catalog country", () => {
  const active = activeDestinations();
  assert.deepEqual(
    matchingCountries(active, "Ро").map((destination) => destination.id),
    ["russia"],
  );
  assert.deepEqual(
    matchingCountries(active, "Та").map((destination) => destination.id),
    ["thailand"],
  );
  assert.equal(initialCountryId(active, "russia"), "russia");
  assert.equal(initialCountryId(active, "thailand"), "thailand");
});
