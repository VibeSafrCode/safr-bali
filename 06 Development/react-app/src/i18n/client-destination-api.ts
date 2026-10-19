import type { Destination } from "../catalog";
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import type {ClientCatalogNode} from "./client-catalog-model";
import { requireClientUiLocale } from "./client-ui-bindings";

export function createClientDestinationApi({clientCatalogDestinations,inspectClientCatalogActiveServices}: {clientCatalogDestinations:(locale:unknown)=>readonly ClientCatalogNode[];inspectClientCatalogActiveServices:(id:unknown,locale:unknown)=>readonly ClientCatalogNode[]}){
/** Explicit client10 catalog entry; lightweight/legacy callers never import its article payload. */
function clientDestinationById(id: unknown, locale: unknown): Destination | null {
  if(YOGA_MINI_APP)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const supported = ["bali", "thailand", "russia", "nepal", "uae"];
  if (typeof id !== "string" || !supported.includes(id)) throw new Error("CLIENT_CATALOG_DESTINATION_ID");
  const found = clientCatalogDestinations(requireClientUiLocale(locale)).find(row => row.id === id);
  if (!found) return null;
  const strings = (value: ClientCatalogNode): boolean =>
    typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.icon === "string" &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.content === undefined || typeof value.content === "string") &&
    (value.note === undefined || typeof value.note === "string") &&
    (value.children === undefined || value.children.every(strings)) &&
    (value.download === undefined ||
      typeof value.download.href === "string" && typeof value.download.fileName === "string" &&
      value.download.mediaType === "application/pdf" && value.download.language === "ru" &&
      typeof value.download.sizeBytes === "number" && typeof value.download.updatedAt === "string" &&
      typeof value.download.label === "string" && typeof value.download.recommendation === "string" &&
      typeof value.download.meta === "string");
  function assertDestination(value: ClientCatalogNode): asserts value is ClientCatalogNode & Destination {
    if (!strings(value) || typeof value.number !== "string" || typeof value.className !== "string" ||
      !["coral", "blue", "violet", "orange"].includes(value.color ?? "") ||
      typeof value.eyebrow !== "string" || typeof value.description !== "string" ||
      !Array.isArray(value.services) || !value.services.every(strings)) {
      throw new Error("CLIENT_CATALOG_DESTINATION_SHAPE");
    }
  }
  assertDestination(found);
  return found;
}

/** Same visible destination order as the canonical legacy caller; never use
 * legacy activeServices on this projection (that would insert RUEN bikes twice). */
function clientActiveDestinations(locale: unknown): readonly Destination[] {
  if(YOGA_MINI_APP)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const language = requireClientUiLocale(locale);
  return ["bali", "thailand", "uae", "nepal", "russia"].map(id => {
    const destination = clientDestinationById(id, language);
    if (!destination) throw new Error("CLIENT_CATALOG_DESTINATION_MISSING");
    return destination;
  });
}

function clientActiveServicesById(id: unknown, locale: unknown) {
  if(YOGA_MINI_APP)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const destination = clientDestinationById(id, locale);
  if (!destination) throw new Error("CLIENT_CATALOG_DESTINATION_MISSING");
  const services = inspectClientCatalogActiveServices(destination.id, requireClientUiLocale(locale));
  // The fixed catalog decoder already checks the source graph. Retain the
  // existing Destination caller's field contract for the derived bike too.
  function assertServices(value: readonly ClientCatalogNode[]): asserts value is readonly (ClientCatalogNode & Destination["services"][number])[] {
    if (!value.every(row => typeof row.id === "string" && typeof row.name === "string" &&
      typeof row.summary === "string" && typeof row.icon === "string" &&
      (row.status === undefined || row.status === "available" || row.status === "soon") &&
      (row.content === undefined || typeof row.content === "string"))) {
      throw new Error("CLIENT_CATALOG_ACTIVE_SERVICE_SHAPE");
    }
  }
  assertServices(services);
  return services;
}

return Object.freeze({clientDestinationById,clientActiveDestinations,clientActiveServicesById});
}
