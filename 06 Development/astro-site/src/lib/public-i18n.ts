import runtime from "../../../shared/content/generated/i18n/public.v1.json";
import {
  destinations,
  getPublicPages,
  type CatalogItem,
  type Destination,
  type PublicCard,
  type PublicPage,
} from "./public-catalog";

export type PublicLocale = "ru" | "en";
type RuntimeEntry = { ru: string; en: string };
type Variables = Record<string, string | number>;

const entries = runtime.entries as Record<string, RuntimeEntry>;

export function publicText(
  key: string,
  locale: PublicLocale,
  variables: Variables = {},
) {
  const value = entries[key]?.[locale];
  if (!value) throw new Error(`Missing public translation: ${key}.${locale}`);
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : token,
  );
}

export function localizedRoute(route: string, locale: PublicLocale) {
  return locale === "en" ? (route === "/" ? "/en/" : `/en${route}`) : route;
}

export function sourceRoute(route: string) {
  if (route === "/en" || route === "/en/") return "/";
  return route.startsWith("/en/") ? route.slice(3) : route;
}

function localizedHref(href: string, locale: PublicLocale) {
  return href.startsWith("/") ? localizedRoute(href, locale) : href;
}

function entityKey(destinationId: string, serviceId?: string, itemId?: string) {
  if (!serviceId) return `catalog.destination.${destinationId}`;
  return ["catalog", destinationId, serviceId, itemId].filter(Boolean).join(".");
}

function translatedValue(key: string, locale: PublicLocale, fallback: string | undefined) {
  return entries[key]?.[locale] ?? fallback;
}

function localizedItem(
  item: CatalogItem,
  prefix: string,
  locale: PublicLocale,
): CatalogItem {
  return {
    ...item,
    name: translatedValue(`${prefix}.name`, locale, item.name) ?? item.name,
    summary: translatedValue(`${prefix}.summary`, locale, item.summary) ?? item.summary,
    note: translatedValue(`${prefix}.note`, locale, item.note),
    content: translatedValue(`${prefix}.content`, locale, item.content),
    download: item.download
      ? {
          ...item.download,
          label:
            translatedValue(`${prefix}.downloadLabel`, locale, item.download.label) ??
            item.download.label,
          recommendation:
            translatedValue(
              `${prefix}.downloadRecommendation`,
              locale,
              item.download.recommendation,
            ) ?? item.download.recommendation,
          meta:
            translatedValue(`${prefix}.downloadMeta`, locale, item.download.meta) ??
            item.download.meta,
        }
      : undefined,
    children: item.children?.map((child) =>
      localizedItem(child, `${prefix}.${child.id}`, locale),
    ),
  };
}

function localizedDestination(source: Destination, locale: PublicLocale): Destination {
  const prefix = entityKey(source.id);
  return {
    ...source,
    name: translatedValue(`${prefix}.name`, locale, source.name) ?? source.name,
    eyebrow: translatedValue(`${prefix}.eyebrow`, locale, source.eyebrow) ?? source.eyebrow,
    description:
      translatedValue(`${prefix}.description`, locale, source.description) ?? source.description,
    services: source.services.map((service) =>
      localizedItem(service, entityKey(source.id, service.id), locale),
    ),
  };
}

export function getLocalizedDestinations(locale: PublicLocale) {
  return destinations.map((destination) => localizedDestination(destination, locale));
}

function seoDescription(summary: string, context: string, locale: PublicLocale) {
  let value = `${summary.trim()} ${context}.`;
  if (value.length < 70) value += ` ${publicText("template.seo.moreDetails", locale)}`;
  if (value.length > 180) value = `${value.slice(0, 176).trimEnd()}…`;
  return value;
}

function cardFor(
  source: PublicCard,
  target: CatalogItem | Destination,
  locale: PublicLocale,
): PublicCard {
  return {
    ...source,
    title: target.name,
    summary: "summary" in target ? target.summary : target.description,
    note: "note" in target ? target.note : undefined,
    href: localizedHref(source.href, locale),
  };
}

function localizedPage(source: PublicPage, locale: PublicLocale): PublicPage {
  const route = localizedRoute(source.route, locale);
  if (source.route === "/" || source.route === "/privacy/") {
    const prefix = source.route === "/" ? "page.home" : "page.privacy";
    return {
      ...source,
      route,
      title: publicText(`${prefix}.title`, locale),
      description: publicText(`${prefix}.description`, locale),
      eyebrow: publicText(`${prefix}.eyebrow`, locale),
      lead: publicText(`${prefix}.lead`, locale),
      body: publicText(`${prefix}.body`, locale),
      managerContext: publicText(`${prefix}.managerContext`, locale),
      breadcrumbs: source.breadcrumbs.map((crumb) => ({
        label: publicText("ui.nav.home", locale),
        href: localizedHref(crumb.href, locale),
      })),
      cards:
        source.route === "/"
          ? destinations.map((destination, index) =>
              cardFor(source.cards[index], localizedDestination(destination, locale), locale),
            )
          : source.cards.map((card) => ({
              ...card,
              href: localizedHref(card.href, locale),
            })),
    };
  }

  const [destinationId, serviceId, itemId] = source.route.split("/").filter(Boolean);
  const rawDestination = destinations.find((entry) => entry.id === destinationId)!;
  const destination = localizedDestination(rawDestination, locale);
  const service = destination.services.find((entry) => entry.id === serviceId);
  const item = service?.children?.find((entry) => entry.id === itemId);
  const breadcrumbs = [
    { label: publicText("ui.nav.home", locale), href: localizedRoute("/", locale) },
    { label: publicText("ui.nav.directions", locale), href: localizedRoute("/", locale) },
    ...(service ? [{ label: destination.name, href: localizedRoute(`/${destination.id}/`, locale) }] : []),
    ...(item && service
      ? [{ label: service.name, href: localizedRoute(`/${destination.id}/${service.id}/`, locale) }]
      : []),
  ];

  if (!service) {
    return {
      ...source,
      route,
      title: publicText("template.direction.title", locale, { destination: destination.name }),
      description: seoDescription(
        destination.description,
        publicText("template.direction.descriptionContext", locale, { destination: destination.name }),
        locale,
      ),
      eyebrow: destination.eyebrow,
      lead: destination.description,
      body: destination.description,
      breadcrumbs,
      cards: source.cards.map((card) =>
        cardFor(
          card,
          destination.services.find((candidate) => card.href.endsWith(`/${candidate.id}/`))!,
          locale,
        ),
      ),
      managerContext: publicText("template.direction.managerContext", locale, { destination: destination.name }),
    };
  }

  if (!item) {
    return {
      ...source,
      route,
      title: publicText("template.service.title", locale, {
        service: service.name,
        destination: destination.name,
      }),
      description: seoDescription(
        service.summary,
        publicText("template.service.descriptionContext", locale, {
          service: service.name,
          destination: destination.name,
        }),
        locale,
      ),
      eyebrow: publicText("template.service.eyebrow", locale, {
        destination: destination.name,
        service: service.name,
      }),
      lead: service.summary,
      body:
        service.content ??
        (service.status === "soon"
          ? publicText("template.service.soonBody", locale, { summary: service.summary })
          : service.summary),
      download: service.download,
      breadcrumbs,
      cards: source.cards.map((card) =>
        cardFor(
          card,
          service.children!.find((candidate) => card.href.endsWith(`/${candidate.id}/`))!,
          locale,
        ),
      ),
      relatedRoutes: source.relatedRoutes.map((related) => ({
        ...related,
        label:
          destination.services.find((candidate) =>
            related.href.endsWith(`/${candidate.id}/`),
          )?.name ?? related.label,
        href: localizedHref(related.href, locale),
      })),
      managerContext: publicText("template.service.managerContext", locale, { service: service.name }),
    };
  }

  return {
    ...source,
    route,
    title: publicText("template.item.title", locale, {
      item: item.name,
      service: service.name,
      destination: destination.name,
    }),
    description: seoDescription(
      item.summary,
      publicText("template.item.descriptionContext", locale, {
        item: item.name,
        service: service.name,
      }),
      locale,
    ),
    eyebrow: publicText("template.service.eyebrow", locale, {
      destination: destination.name,
      service: service.name,
    }),
    lead: item.summary,
    body:
      item.content ??
      (item.status === "soon"
        ? publicText("template.item.soonBody", locale, { summary: item.summary })
        : item.summary),
    download: item.download,
    breadcrumbs,
    relatedRoutes: source.relatedRoutes.map((related) => ({
      ...related,
      label:
        service.children?.find((candidate) =>
          related.href.endsWith(`/${candidate.id}/`),
        )?.name ?? related.label,
      href: localizedHref(related.href, locale),
    })),
    managerContext: publicText("template.item.managerContext", locale, { item: item.name }),
  };
}

export function getLocalizedPublicPages(locale: PublicLocale) {
  return getPublicPages().map((page) => localizedPage(page, locale));
}

export function getLocalizedPublicPage(route: string, locale: PublicLocale) {
  const source = sourceRoute(route);
  const page = getLocalizedPublicPages(locale).find((entry) => sourceRoute(entry.route) === source);
  if (!page) throw new Error(`Localized public page is missing for ${route}`);
  return page;
}
