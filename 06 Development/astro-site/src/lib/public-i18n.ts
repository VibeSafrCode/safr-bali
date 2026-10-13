import runtime from "../../../shared/content/generated/i18n/public.v1.json";
import approvedVisaSummaries from "../../../shared/content/d12-e28a-bot-summaries.v1.json";
import { applyPublication } from "./public-publication";
import { insuranceService } from "../../../shared/src/insurance";
import { preserveRegistryProjection } from "./service-registry";
import {standalonePublicAlternates} from './standalone-publication.mjs';
import { localizedPublicRoute, publicSourceRoute } from "./public-locale";
import { PUBLIC_ROUTE_LOCALES, publicLocaleInfo, type PublicRouteLocale } from "./public-locale";
import { createHash } from "node:crypto";
import { publicEntryForRoute } from "../../scripts/registry-publication.mjs";
import { getPublicInsuranceCopy, getPublicInsuranceProviders } from "./public-insurance";
import { getPublicOtherVisaCopy, getPublicUaeCopy, PUBLIC_EDITORIAL_INPUT_SHA256 } from "./public-editorial-live";
import { publicChromeText } from "./public-chrome";
import { publicLegacyContentVersion, legacyPublicSourceFields } from "./public-content-version.mjs";
import {
  destinations,
  getPublicPages,
  type CatalogItem,
  type Destination,
  type PublicCard,
  type PublicPage,
} from "./public-catalog";

export type PublicLocale = "ru" | "en";
// Existing published callers retain their RU/EN contract until the separate
// caller/publication closure. Source-only projection below accepts all ten.
export type PublicSourceLocale = PublicRouteLocale;
type RuntimeEntry = { ru: string; en: string } & Partial<Record<PublicSourceLocale, string>>;
type Variables = Record<string, string | number>;

const entries = runtime.entries as Record<string, RuntimeEntry>;

export function publicText(
  key: string,
  locale: PublicSourceLocale,
  variables: Variables = {},
) {
  publicLocaleInfo(locale);
  const value = sourceEntries[key]?.[locale];
  if (typeof value !== "string" || !value) throw new Error(`Missing public translation: ${key}.${locale}`);
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : token,
  );
}

export function localizedRoute(route: string, locale: PublicSourceLocale) {
  return localizedPublicRoute(route, locale);
}

export function sourceRoute(route: string) {
  return publicSourceRoute(route);
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
    // The original translation corpus remains archival; this approved batch
    // supplies the same exact D12 excerpt used by the bot and Mini App.
    content: prefix === "catalog.bali.visas.d12"
      ? approvedVisaSummaries.entries.D12[locale].body
      : translatedValue(`${prefix}.content`, locale, item.content),
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

export function getLocalizedDestinations(locale: PublicSourceLocale) {
  publicLocaleInfo(locale);
  if (locale !== "ru" && locale !== "en") return getSourceProjectedDestinations(locale);
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

export function localizedPage(source: PublicPage, locale: PublicLocale): PublicPage {
  if (locale !== "ru" && locale !== "en") throw new Error("New public locale requires source projection and a separate owner overlay");
  const route = localizedRoute(source.route, locale);
  if (source.route === "/uae/insurance/") {
    const service = insuranceService(locale);
    const country = locale === "en" ? "UAE" : "ОАЭ";
    return { ...source, route, title: `${service.name} — ${country}`, description: `${service.summary} ${locale === 'en' ? 'Individual insurance enquiries for your trip to the UAE.' : 'Индивидуальный подбор страховки для поездки в ОАЭ.'}`,
      eyebrow: `${country} · SAFRWAY`, lead: service.summary, body: service.content,
      managerContext: locale === "en" ? "insurance in UAE" : "страховке в ОАЭ",
      breadcrumbs: [{label:publicText("ui.nav.home",locale),href:localizedRoute("/",locale)}] };
  }
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
  if (locale !== "ru" && locale !== "en") throw new Error("New public locale requires source projection and a separate owner overlay");
  return preserveRegistryProjection(getPublicPages().map((page) => applyPublication(localizedPage(page, locale), locale, publicationAsOf, hasLocaleCoverage(page, locale))), locale);
}

// All projections in a static build share a clock, including expiry boundaries.
const publicationAsOf = new Date();

function hasLocaleCoverage(page: PublicPage, locale: PublicLocale) {
  const parts = page.route.split("/").filter(Boolean);
  const prefix = page.route === "/" ? "page.home" : page.route === "/privacy/" ? "page.privacy" : parts.length === 1 ? `catalog.destination.${parts[0]}` : `catalog.${parts.join(".")}`;
  const fields = parts.length === 0 || page.route === "/privacy/"
    ? ["title", "description", "lead", "body"]
    : parts.length === 1 ? ["name", "description"] : ["name", "summary"];
  const target = destinations.find((d) => d.id === parts[0])?.services.find((s) => s.id === parts[1]);
  const raw = parts[2] ? target?.children?.find((i) => i.id === parts[2]) : target;
  if (raw?.content) fields.push("content");
  return fields.every((field) => Boolean(entries[`${prefix}.${field}`]?.[locale]?.trim()));
}

export function publicAlternates(route: string): Array<{ locale: string; href: string }> {
  const raw = getPublicPages().find((page) => page.route === sourceRoute(route));
  if (!raw) return standalonePublicAlternates(route);
  const eligible = (["ru", "en"] as const).filter((locale) =>
    applyPublication(localizedPage(raw, locale), locale, publicationAsOf, hasLocaleCoverage(raw, locale)).indexable);
  const ownLocale = route.startsWith("/en/") ? "en" : "ru";
  if (!eligible.includes(ownLocale)) return [];
  const values = eligible.map((locale) => ({ locale: String(locale), href: localizedRoute(raw.route, locale) }));
  return values.length ? [...values, { locale: "x-default", href: values[0].href }] : [];
}

export function getLocalizedPublicPage(route: string, locale: PublicLocale) {
  const source = sourceRoute(route);
  const page = getLocalizedPublicPages(locale).find((entry) => sourceRoute(entry.route) === source);
  if (!page) throw new Error(`Localized public page is missing for ${route}`);
  return page;
}

export const PUBLIC_LEGACY_SOURCE_INPUT_SHA256 = "f460406e4623997cf1a960ff0cbfb9d6d9f0772fe633df246290a8b7a80cd943";
const sourceDictionaryHash = createHash("sha256").update(JSON.stringify(runtime, null, 2) + "\n").digest("hex");
if (sourceDictionaryHash !== PUBLIC_LEGACY_SOURCE_INPUT_SHA256)
  throw new Error("Public legacy source dictionary drift");
// A private immutable copy prevents later server-code mutation from changing
// the already pinned source. No raw input/provenance is a client-side payload.
const sourceEntries = Object.freeze(Object.fromEntries(Object.entries(entries).map(([key, row]) =>
  [key, Object.freeze({ ...row })]))) as Readonly<Record<string, Readonly<RuntimeEntry>>>;

type SourceRead = (key: string, locale: PublicSourceLocale) => void;
type SourceOptions = { onSourceRead?: SourceRead };
type BodyRecipe = "received_dictionary_body" | "received_other_visa_body_and_disclaimers"
  | "existing_insurance_provider_join" | "received_summary_or_soon_template";
export type PublicLegacySourceProjection = {
  locale: PublicSourceLocale;
  sourceRoute: string;
  page: PublicPage;
  bodyRecipe: BodyRecipe;
  sourceKeys: readonly string[];
  sourceInputs: Readonly<{ dictionary: string; editorialLive: string; insuranceLive: string; chrome: string }>;
  contentVersion: string;
  publicationAuthorized: boolean;
  status: "RETAINED_EXISTING_PUBLIC_VERSION" | "SOURCE_ONLY_PENDING_OWNER_OVERLAY";
  independentReviewClaim: false;
};

function sourceReader(locale: PublicSourceLocale, used: Set<string>, options: SourceOptions) {
  publicLocaleInfo(locale);
  const mark = (key: string) => {
    options.onSourceRead?.(key, locale);
    used.add(key);
  };
  const read = (key: string): string => {
    mark(key);
    const value = sourceEntries[key]?.[locale];
    if (typeof value !== "string" || !value) throw new Error(`Missing received public source: ${key}.${locale}`);
    return value;
  };
  const format = (key: string, variables: Variables = {}): string => read(key).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_token, name) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Missing public source placeholder: ${key}.${name}`);
    return String(variables[name]);
  });
  return { read, format, mark };
}

type Reader = ReturnType<typeof sourceReader>;
function sourceItemMetadata(item: CatalogItem, prefix: string, reader: Reader): CatalogItem {
  // Explicit metadata fields: do not spread/read content, including D12 or
  // the four unused insurance article slots, while building navigation cards.
  return {
    id: item.id, icon: item.icon,
    name: reader.read(prefix + ".name"), summary: reader.read(prefix + ".summary"),
    ...(item.status === undefined ? {} : { status: item.status }),
    ...(item.publiclyHidden === undefined ? {} : { publiclyHidden: item.publiclyHidden }),
    // Existing dictionary-only catalog notes (notably canonical price-loader
    // captions) are operative even when the raw catalog object has no note.
    ...(Object.hasOwn(sourceEntries, prefix + ".note") || item.note !== undefined
      ? { note: reader.read(prefix + ".note") } : {}),
    ...(item.download ? { download: {
      ...item.download,
      label: reader.read(prefix + ".downloadLabel"),
      recommendation: reader.read(prefix + ".downloadRecommendation"),
      meta: reader.read(prefix + ".downloadMeta"),
    } } : {}),
    ...(item.children ? { children: item.children.map((child) => sourceItemMetadata(child, prefix + "." + child.id, reader)) } : {}),
  };
}

function sourceDestinationMetadata(source: Destination, reader: Reader): Destination {
  const prefix = entityKey(source.id);
  return { id: source.id, number: source.number, icon: source.icon, color: source.color, className: source.className,
    name: reader.read(prefix + ".name"),
    // Bali has an explicitly absent native eyebrow and no translation record.
    // Preserve that optional absence; it is not a missing body/source fallback.
    eyebrow: source.eyebrow === "" ? "" : reader.read(prefix + ".eyebrow"), description: reader.read(prefix + ".description"),
    services: source.services.map((service) => sourceItemMetadata(service, entityKey(source.id, service.id), reader)) };
}

export function getSourceProjectedDestinations(locale: PublicSourceLocale, options: SourceOptions = {}): Destination[] {
  const reader = sourceReader(locale, new Set(), options);
  return destinations.map((destination) => sourceDestinationMetadata(destination, reader));
}

export const getLocalizedSourceDestinations = getSourceProjectedDestinations;

function sourceTargetName(href: string, reader: Reader): string {
  const [country, service, item] = sourceRoute(href).split("/").filter(Boolean);
  if (!country) return reader.read("ui.nav.home");
  return reader.read(entityKey(country, service, item) + ".name");
}

function sourceCard(source: PublicCard, target: CatalogItem | Destination, locale: PublicSourceLocale): PublicCard {
  return { ...source, title: target.name, summary: "summary" in target ? target.summary : target.description,
    note: "note" in target ? target.note : undefined, href: localizedRoute(source.href, locale) };
}

function sourceDescription(summary: string, context: string, locale: PublicSourceLocale, reader: Reader) {
  // Preserve the immutable old RU/EN algorithm; do not truncate a received
  // new-language value merely to meet an old static-description recommendation.
  if (locale === "ru" || locale === "en") return seoDescription(summary, context, locale);
  let value = `${summary.trim()} ${context}.`;
  if (value.length < 70) value += " " + reader.read("template.seo.moreDetails");
  return value;
}

function sourceInsuranceBody(locale: PublicSourceLocale, reader: Reader): string {
  for (const key of ["catalog.bali.insurance.name", "catalog.bali.insurance.summary", "catalog.bali.insurance.note", "ui.manager.button",
    "public.live.insurance.contact", "public.live.insurance.availability", "public.live.insurance.brandLink",
    "public.live.insurance.provider.luma.description", "public.live.insurance.provider.safetyWing.description"])
    reader.mark(key);
  const copy = getPublicInsuranceCopy(locale), providers = getPublicInsuranceProviders(locale);
  // This is exactly insuranceService's existing native composition recipe,
  // with received full component values. No archival .content slot is filled.
  return [...providers.map((provider) => `${provider.name}\n${provider.description}`), copy.price, copy.contact, copy.availability].join("\n\n");
}

function projectLegacySource(source: PublicPage, locale: PublicSourceLocale, options: SourceOptions): PublicLegacySourceProjection {
  publicLocaleInfo(locale);
  const route = localizedRoute(source.route, locale);
  // Positive actual Registry ownership precedes metadata traversal/body reads.
  if (publicEntryForRoute(route)) throw new Error(`Registry owns public source route: ${route}`);
  const used = new Set<string>(), reader = sourceReader(locale, used, options);
  const ruen = locale === "ru" || locale === "en";
  const base = { route, kind: source.kind, verification: ruen ? source.verification : null, indexable: false };
  let page: PublicPage, bodyRecipe: BodyRecipe = "received_summary_or_soon_template";
  // Nested customer-field order is part of the old JSON version recipe.
  const related = () => source.relatedRoutes.map((entry) => ({ ...entry, label: sourceTargetName(entry.href, reader), href: localizedRoute(entry.href, locale) }));
  if (source.route === "/uae/insurance/") {
    const body = sourceInsuranceBody(locale, reader), copy = getPublicInsuranceCopy(locale);
    const country = publicChromeText("uae.shortName", locale);
    reader.mark("public.chrome.uae.shortName");
    reader.mark("public.live.uae.insurance.descriptionSuffix");
    page = { ...base, title: `${copy.title} — ${country}`, description: `${copy.summary} ${getPublicUaeCopy(locale).insuranceDescriptionSuffix}`,
      eyebrow: `${country} · SAFRWAY`, lead: copy.summary, body,
      managerContext: ruen ? (locale === "en" ? "insurance in UAE" : "страховке в ОАЭ") : reader.format("template.service.managerContext", { service: copy.title }),
      breadcrumbs: [{ label: reader.read("ui.nav.home"), href: localizedRoute("/", locale) }], cards: [], relatedRoutes: [] };
    bodyRecipe = "existing_insurance_provider_join";
  } else if (source.route === "/" || source.route === "/privacy/") {
    const prefix = source.route === "/" ? "page.home" : "page.privacy";
    page = { ...base, title: reader.read(prefix + ".title"), description: reader.read(prefix + ".description"),
      eyebrow: reader.read(prefix + ".eyebrow"), lead: reader.read(prefix + ".lead"), body: reader.read(prefix + ".body"),
      managerContext: reader.read(prefix + ".managerContext"),
      breadcrumbs: source.breadcrumbs.map((crumb) => ({ label: reader.read("ui.nav.home"), href: localizedRoute(crumb.href, locale) })),
      cards: source.route === "/" ? destinations.map((destination, index) => sourceCard(source.cards[index], sourceDestinationMetadata(destination, reader), locale)) : [],
      relatedRoutes: related() };
    bodyRecipe = "received_dictionary_body";
  } else {
    const [countryId, serviceId, itemId] = source.route.split("/").filter(Boolean);
    const rawDestination = destinations.find((entry) => entry.id === countryId);
    if (!rawDestination) throw new Error("Unknown legacy source destination");
    const destination = sourceDestinationMetadata(rawDestination, reader);
    const service = destination.services.find((entry) => entry.id === serviceId);
    const item = service?.children?.find((entry) => entry.id === itemId);
    if ((serviceId && !service) || (itemId && !item)) throw new Error("Unknown legacy source item");
    const breadcrumbs = [{ label: reader.read("ui.nav.home"), href: localizedRoute("/", locale) },
      { label: reader.read("ui.nav.directions"), href: localizedRoute("/", locale) },
      ...(service ? [{ label: destination.name, href: localizedRoute(`/${countryId}/`, locale) }] : []),
      ...(item && service ? [{ label: service.name, href: localizedRoute(`/${countryId}/${serviceId}/`, locale) }] : [])];
    if (!service) {
      page = { ...base, title: reader.format("template.direction.title", { destination: destination.name }),
        description: sourceDescription(destination.description, reader.format("template.direction.descriptionContext", { destination: destination.name }), locale, reader),
        eyebrow: destination.eyebrow, lead: destination.description, body: destination.description, breadcrumbs,
        cards: source.cards.map((card) => {
          const target = destination.services.find((candidate) => card.href.endsWith(`/${candidate.id}/`));
          if (!target) throw new Error("Unknown destination card target");
          return sourceCard(card, target, locale);
        }), relatedRoutes: related(), managerContext: reader.format("template.direction.managerContext", { destination: destination.name }) };
    } else {
      const target = item ?? service, prefix = entityKey(countryId, serviceId, itemId);
      const rawService = rawDestination.services.find((entry) => entry.id === serviceId)!;
      const rawTarget = itemId ? rawService.children!.find((entry) => entry.id === itemId)! : rawService;
      const isInsurance = serviceId === "insurance";
      const hasBody = Object.hasOwn(rawTarget, "content");
      const body = isInsurance ? sourceInsuranceBody(locale, reader) : hasBody ? reader.read(prefix + ".content")
        : target.status === "soon" ? reader.format(item ? "template.item.soonBody" : "template.service.soonBody", { summary: target.summary }) : target.summary;
      bodyRecipe = isInsurance ? "existing_insurance_provider_join" : hasBody ? "received_dictionary_body" : "received_summary_or_soon_template";
      page = { ...base,
        title: reader.format(item ? "template.item.title" : "template.service.title", { item: target.name, service: service.name, destination: destination.name }),
        description: sourceDescription(target.summary, reader.format(item ? "template.item.descriptionContext" : "template.service.descriptionContext", { item: target.name, service: service.name, destination: destination.name }), locale, reader),
        eyebrow: reader.format("template.service.eyebrow", { destination: destination.name, service: service.name }), lead: target.summary, body,
        ...(target.download ? { download: target.download } : {}), breadcrumbs,
        cards: source.cards.map((card) => {
          const child = service.children?.find((candidate) => card.href.endsWith(`/${candidate.id}/`));
          if (!child) throw new Error("Unknown service card target");
          return sourceCard(card, child, locale);
        }), relatedRoutes: related(), managerContext: reader.format(item ? "template.item.managerContext" : "template.service.managerContext", { item: target.name, service: target.name }) };
      if (source.route === "/bali/visas/other-visa/") {
        const copy = getPublicOtherVisaCopy(locale);
        if (copy.fullBody !== body) throw new Error("Other visa received body source mismatch");
        for (const key of ["public.live.visa.disclaimer.conditionsMayChange", "public.live.visa.disclaimer.verifyBeforePayment", "public.live.visa.disclaimer.writeNext"]) reader.mark(key);
        page = { ...page, title: copy.title, lead: copy.lead, body: copy.fullBody };
        bodyRecipe = "received_other_visa_body_and_disclaimers";
      }
    }
  }
  if (!page.body) throw new Error("Empty public source body cannot attest coverage");
  if (ruen) page = applyPublication(page, locale, publicationAsOf, true);
  return { locale, sourceRoute: source.route, page, bodyRecipe, sourceKeys: Object.freeze([...used].sort()),
    sourceInputs: Object.freeze({ dictionary: PUBLIC_LEGACY_SOURCE_INPUT_SHA256, editorialLive: PUBLIC_EDITORIAL_INPUT_SHA256,
      insuranceLive: "7fd35b8f19ee68d3d91e55758dba2917be4b80e3d611d682e1e95a2a564c3fae",
      chrome: "45d203211332f788cdc8e9febde27a5016350806232faaa4c836c146a8421ad2" }),
    contentVersion: publicLegacyContentVersion(page), publicationAuthorized: ruen,
    status: ruen ? "RETAINED_EXISTING_PUBLIC_VERSION" : "SOURCE_ONLY_PENDING_OWNER_OVERLAY", independentReviewClaim: false };
}

export function getSourceProjectedPublicPages(locale: PublicSourceLocale, options: SourceOptions = {}): PublicLegacySourceProjection[] {
  publicLocaleInfo(locale);
  return getPublicPages().filter((page) => !publicEntryForRoute(localizedRoute(page.route, locale)))
    .map((page) => projectLegacySource(page, locale, options));
}

export function getSourceProjectedPublicPage(route: string, locale: PublicSourceLocale, options: SourceOptions = {}): PublicLegacySourceProjection {
  publicLocaleInfo(locale);
  const canonical = sourceRoute(route);
  if (publicEntryForRoute(localizedRoute(canonical, locale))) throw new Error("Registry owns public source route");
  const source = getPublicPages().find((page) => page.route === canonical);
  if (!source) throw new Error("Unknown public legacy source route");
  return projectLegacySource(source, locale, options);
}

// Exact source/customer versions for a subsequent owner overlay. This does not
// mutate the old grant, static-path enumeration, source QA or indexing state.
export function publicLegacySourceManifest() {
  return { schemaVersion: 1, stage: "SOURCE_ONLY_NOT_NEW_RUNTIME_AUTHORIZATION", sourceFields: [...legacyPublicSourceFields],
    records: PUBLIC_ROUTE_LOCALES.flatMap((locale) => getSourceProjectedPublicPages(locale).map((projection) => ({
      kind: "legacy" as const, route: projection.page.route, sourceRoute: projection.sourceRoute, locale,
      contentVersion: projection.contentVersion, bodyRecipe: projection.bodyRecipe, sourceKeys: [...projection.sourceKeys],
      sourceInputs: projection.sourceInputs, publicationAuthorized: projection.publicationAuthorized,
    }))) };
}
