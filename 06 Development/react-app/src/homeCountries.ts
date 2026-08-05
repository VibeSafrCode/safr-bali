import type { Destination } from "./catalog";

export const SELECTED_COUNTRY_STORAGE_KEY = "safr:selected-country:v1";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").normalize("NFKD");
}

export function matchingCountries(
  destinations: readonly Destination[],
  query: string,
) {
  const candidate = normalized(query);
  if (!candidate) return destinations;
  return destinations.filter((destination) =>
    normalized(destination.name).startsWith(candidate),
  );
}

export function initialCountryId(
  destinations: readonly Destination[],
  storedId: string | null,
) {
  return destinations.some((destination) => destination.id === storedId)
    ? (storedId as Destination["id"])
    : (destinations[0]?.id ?? null);
}
