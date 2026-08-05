import catalogSnapshot from "../../shared/content/generated/catalog-runtime.v1.json";

export type CatalogStatus = "available" | "soon";

export type CatalogItem = {
  id: string;
  name: string;
  icon: string;
  summary: string;
  status?: CatalogStatus;
  note?: string;
  content?: string;
  publiclyHidden?: boolean;
  children?: readonly CatalogItem[];
};

export type Destination = {
  id: "bali" | "thailand" | "russia" | "nepal";
  number: string;
  name: string;
  icon: string;
  color: "coral" | "blue" | "violet" | "orange";
  className: string;
  eyebrow: string;
  description: string;
  services: readonly CatalogItem[];
};

export const destinations =
  catalogSnapshot.destinations as readonly Destination[];

export function destinationById(id: string | null) {
  return destinations.find((destination) => destination.id === id) ?? null;
}

export function activeServices(destination: Destination) {
  return destination.services.filter((service) => service.status !== "soon");
}

export function activeDestinations() {
  return destinations.filter((destination) => activeServices(destination).length > 0);
}

export const catalogSnapshotMeta = {
  id: catalogSnapshot.snapshotId,
  revision: catalogSnapshot.contentRevision,
};
