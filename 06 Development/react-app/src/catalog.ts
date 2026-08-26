import catalogSnapshot from "../../shared/content/generated/catalog-runtime.v1.json";
import publicI18n from "../../shared/content/generated/i18n/public.v1.json";
import type { LocaleCode } from "./i18n/locale";

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
  download?: {
    href: string;
    fileName: string;
    mediaType: "application/pdf";
    sizeBytes: number;
    language: "ru";
    updatedAt: string;
    label: string;
    recommendation: string;
    meta: string;
  };
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

type PublicRuntimeEntry = { ru: string; en: string };

function localizedValue(
  key: string,
  locale: LocaleCode,
  fallback: string | undefined,
) {
  const entry = (publicI18n.entries as Record<string, PublicRuntimeEntry>)[key];
  return entry?.[locale] ?? fallback;
}

function localizedItem(
  item: CatalogItem,
  prefix: string,
  locale: LocaleCode,
): CatalogItem {
  return {
    ...item,
    name: localizedValue(`${prefix}.name`, locale, item.name) ?? item.name,
    summary: localizedValue(`${prefix}.summary`, locale, item.summary) ?? item.summary,
    note: localizedValue(`${prefix}.note`, locale, item.note),
    content: localizedValue(`${prefix}.content`, locale, item.content),
    download: item.download
      ? {
          ...item.download,
          label:
            localizedValue(`${prefix}.downloadLabel`, locale, item.download.label) ??
            item.download.label,
          recommendation:
            localizedValue(
              `${prefix}.downloadRecommendation`,
              locale,
              item.download.recommendation,
            ) ?? item.download.recommendation,
          meta:
            localizedValue(`${prefix}.downloadMeta`, locale, item.download.meta) ??
            item.download.meta,
        }
      : undefined,
    children: item.children?.map((child) =>
      localizedItem(child, `${prefix}.${child.id}`, locale),
    ),
  };
}

const localizedDestinations = new Map<LocaleCode, readonly Destination[]>();

export function destinationsForLocale(locale: LocaleCode = "ru") {
  const cached = localizedDestinations.get(locale);
  if (cached) return cached;
  const translated = destinations.map((destination) => ({
    ...destination,
    name:
      localizedValue(
        `catalog.destination.${destination.id}.name`,
        locale,
        destination.name,
      ) ?? destination.name,
    eyebrow:
      localizedValue(
        `catalog.destination.${destination.id}.eyebrow`,
        locale,
        destination.eyebrow,
      ) ?? destination.eyebrow,
    description:
      localizedValue(
        `catalog.destination.${destination.id}.description`,
        locale,
        destination.description,
      ) ?? destination.description,
    services: destination.services.map((service) =>
      localizedItem(
        service,
        `catalog.${destination.id}.${service.id}`,
        locale,
      ),
    ),
  })) as readonly Destination[];
  localizedDestinations.set(locale, translated);
  return translated;
}

export function destinationById(id: string | null, locale: LocaleCode = "ru") {
  return destinationsForLocale(locale).find((destination) => destination.id === id) ?? null;
}

export function canonicalDestinationName(id: Destination["id"]) {
  return destinations.find((destination) => destination.id === id)?.name ?? id;
}

export function canonicalCatalogItemName(
  destinationId: Destination["id"],
  serviceId: string,
  itemId?: string,
) {
  const destination = destinations.find((entry) => entry.id === destinationId);
  const service = destination?.services.find((entry) => entry.id === serviceId);
  if (!itemId) return service?.name ?? serviceId;
  return service?.children?.find((entry) => entry.id === itemId)?.name ?? itemId;
}

export function activeServices(destination: Destination) {
  return destination.services;
}

export function activeDestinations(locale: LocaleCode = "ru") {
  return destinationsForLocale(locale);
}

export const catalogSnapshotMeta = {
  id: catalogSnapshot.snapshotId,
  revision: catalogSnapshot.contentRevision,
};
