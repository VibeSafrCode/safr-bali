import catalogSnapshot from "../../../shared/content/generated/catalog-runtime.v1.json";
import routeContract from "../../../shared/contracts/ecosystem-routes.v1.json";
import pilotSnapshot from "../data/generated/pilot-snapshot.v1.json";

export type CatalogItem = {
  id: string;
  name: string;
  icon: string;
  summary: string;
  status?: "available" | "soon";
  note?: string;
  content?: string;
  publiclyHidden?: boolean;
  download?: PublicDownload;
  children?: CatalogItem[];
};

export type PublicDownload = {
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

export type Destination = {
  id: string;
  number: string;
  name: string;
  icon: string;
  color: "coral" | "blue" | "violet" | "orange";
  className: string;
  eyebrow: string;
  description: string;
  services: CatalogItem[];
};

export type PublicCard = {
  icon: string;
  title: string;
  summary: string;
  note?: string;
  href: string;
  status: "available" | "soon";
  presentation?: "country" | "service";
  tone?: Destination["color"];
};

export type VerificationStatus = {
  status:
    | "draft"
    | "legacy_needs_sources"
    | "needs_review"
    | "verified";
  lastVerifiedAt: string | null;
  productionCutoverAllowed: boolean;
  sources: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    url: string;
  }>;
};

export type PublicPage = {
  route: string;
  title: string;
  description: string;
  eyebrow: string;
  kind: "landing" | "directions" | "direction" | "service" | "article" | "legal";
  indexable: boolean;
  verification: VerificationStatus | null;
  lead: string;
  body: string;
  download?: PublicDownload;
  breadcrumbs: Array<{ label: string; href: string }>;
  cards: PublicCard[];
  relatedRoutes: Array<{ label: string; href: string }>;
  managerContext: string;
};

export const destinations = catalogSnapshot.destinations as Destination[];

function seoDescription(summary: string, context: string): string {
  let value = `${summary.trim()} ${context}.`;
  if (value.length < 70) {
    value += " Узнайте детали услуги и доступные варианты сопровождения SAFRWAY.";
  }
  if (value.length > 180) {
    value = `${value.slice(0, 176).trimEnd()}…`;
  }
  return value;
}

function routeFor(
  destination: Destination,
  service?: CatalogItem,
  item?: CatalogItem,
): string {
  const segments = [destination.id, service?.id, item?.id].filter(Boolean);
  return `/${segments.join("/")}/`;
}

function cardFor(
  destination: Destination,
  service: CatalogItem,
  item?: CatalogItem,
): PublicCard {
  const target = item ?? service;
  return {
    icon: target.icon,
    title: target.name,
    summary: target.summary,
    note: target.note,
    href: routeFor(destination, service, item),
    status: target.status ?? "available",
  };
}

function isLegacyVisaRoute(route: string): boolean {
  return route.startsWith("/bali/visas/");
}

function verificationForRoute(route: string): VerificationStatus | null {
  if (!isLegacyVisaRoute(route)) return null;

  const snapshotContent = pilotSnapshot.entries.find(
    (entry) => entry.content.route === route,
  )?.content;
  if (snapshotContent) {
    return {
      status: snapshotContent.status as VerificationStatus["status"],
      lastVerifiedAt: snapshotContent.lastVerifiedAt,
      productionCutoverAllowed: snapshotContent.productionCutoverAllowed,
      sources: snapshotContent.sources,
    };
  }

  return {
    status: "legacy_needs_sources",
    lastVerifiedAt: null,
    productionCutoverAllowed: false,
    sources: [],
  };
}

const specialPages: PublicPage[] = [
  {
    route: "/",
    title: "Путешествия и жизнь без лишнего хаоса",
    description:
      "Визы, жильё, трансферы, туры и проверенные люди на месте: выберите направление и откройте подробную страницу нужной услуги SAFRWAY.",
    eyebrow: "Ваш человек в другой стране",
    kind: "landing",
    indexable: true,
    verification: null,
    lead:
      "Выберите страну и услугу — детали, поддержка и понятный путь к менеджеру уже внутри SAFRWAY.",
    body:
      "Выберите страну, затем нужную услугу. У каждого направления есть собственная страница, каталог и понятный путь к менеджеру.",
    breadcrumbs: [],
    cards: destinations.map((destination) => ({
      icon: destination.icon,
      title: destination.name,
      summary: destination.description,
      href: routeFor(destination),
      status: "available",
      presentation: "country",
      tone: destination.color,
    })),
    relatedRoutes: [],
    managerContext: "поездке или переезду",
  },
  {
    route: "/privacy/",
    title: "Политика конфиденциальности SAFRWAY",
    description:
      "Как SAFRWAY обрабатывает данные сайта, Telegram Mini App и личного кабинета, а также как связаться с командой по вопросам конфиденциальности.",
    eyebrow: "Правовая информация",
    kind: "legal",
    indexable: false,
    verification: null,
    lead:
      "Как SAFRWAY использует данные для авторизации, поддержки и ведения заявок.",
    body:
      "SAFRWAY обрабатывает только данные, необходимые для авторизации, ответа на обращение, ведения заявки, реферального учёта и SAFR Points.\n\nСессионные данные хранятся на сервере и не передаются через URL. Telegram initData проверяется backend. Внутренние заметки менеджеров не показываются клиенту.\n\nДля запроса доступа, исправления или удаления данных напишите менеджеру и укажите контакт, по которому можно подтвердить вашу личность.",
    breadcrumbs: [{ label: "Главная", href: "/" }],
    cards: [],
    relatedRoutes: [],
    managerContext: "персональным данным",
  },
];

const catalogPages: PublicPage[] = destinations.flatMap((destination) => {
  const directionRoute = routeFor(destination);
  const directionPage: PublicPage = {
    route: directionRoute,
    title: `Услуги: ${destination.name}`,
    description: seoDescription(
      destination.description,
      `Каталог направления «${destination.name}» от SAFRWAY`,
    ),
    eyebrow: destination.eyebrow,
    kind: "direction",
    indexable: true,
    verification: null,
    lead: destination.description,
    body: destination.description,
    breadcrumbs: [
      { label: "Главная", href: "/" },
      { label: "Направления", href: "/" },
    ],
    cards: destination.services
      .filter((service) => !service.publiclyHidden)
      .map((service) => cardFor(destination, service)),
    relatedRoutes: [],
    managerContext: `услугам направления «${destination.name}»`,
  };

  const servicePages = destination.services.flatMap((service) => {
    const serviceRoute = routeFor(destination, service);
    const verification = verificationForRoute(serviceRoute);
    const siblingRoutes = destination.services
      .filter(
        (candidate) =>
          candidate.id !== service.id && !candidate.publiclyHidden,
      )
      .map((candidate) => ({
        label: candidate.name,
        href: routeFor(destination, candidate),
      }));
    const servicePage: PublicPage = {
      route: serviceRoute,
      title: `${service.name} — ${destination.name}`,
      description: seoDescription(
        service.summary,
        `Раздел «${service.name}» направления «${destination.name}»`,
      ),
      eyebrow: `${destination.name} · ${service.name}`,
      kind: service.children?.length ? "service" : "article",
      indexable: verification === null,
      verification,
      lead: service.summary,
      body:
        service.content ??
        (service.status === "soon"
          ? `${service.summary}\n\nУслуга находится в подготовке. Оставьте обращение, чтобы уточнить текущую доступность и получить ответ менеджера.`
          : service.summary),
      download: service.download,
      breadcrumbs: [
        { label: "Главная", href: "/" },
        { label: "Направления", href: "/" },
        { label: destination.name, href: directionRoute },
      ],
      cards: (service.children ?? [])
        .filter((item) => !item.publiclyHidden)
        .map((item) => cardFor(destination, service, item)),
      relatedRoutes: siblingRoutes,
      managerContext: `услуге «${service.name}»`,
    };

    const itemPages = (service.children ?? []).map((item) => {
      const itemRoute = routeFor(destination, service, item);
      const itemVerification = verificationForRoute(itemRoute);
      return {
        route: itemRoute,
        title: `${item.name} — ${service.name}, ${destination.name}`,
        description: seoDescription(
          item.summary,
          `Услуга «${item.name}» в разделе «${service.name}»`,
        ),
        eyebrow: `${destination.name} · ${service.name}`,
        kind: "article",
        indexable: itemVerification === null,
        verification: itemVerification,
        lead: item.summary,
        body:
          item.content ??
          (item.status === "soon"
            ? `${item.summary}\n\nУслуга находится в подготовке. Напишите менеджеру, чтобы узнать актуальную доступность.`
            : item.summary),
        download: item.download,
        breadcrumbs: [
          { label: "Главная", href: "/" },
          { label: "Направления", href: "/" },
          { label: destination.name, href: directionRoute },
          { label: service.name, href: serviceRoute },
        ],
        cards: [],
        relatedRoutes: (service.children ?? [])
          .filter(
            (candidate) =>
              candidate.id !== item.id && !candidate.publiclyHidden,
          )
          .map((candidate) => ({
            label: candidate.name,
            href: routeFor(destination, service, candidate),
          })),
        managerContext: `услуге «${item.name}»`,
      } satisfies PublicPage;
    });

    return [servicePage, ...itemPages];
  });

  return [directionPage, ...servicePages];
});

const allPages = [...specialPages, ...catalogPages];
const pageByRoute = new Map(allPages.map((page) => [page.route, page]));
const contractedRoutes = routeContract.astroPublicRoutes;

if (allPages.length !== contractedRoutes.length) {
  throw new Error(
    `Astro catalog has ${allPages.length} pages; contract requires ${contractedRoutes.length}`,
  );
}
for (const route of contractedRoutes) {
  if (!pageByRoute.has(route)) {
    throw new Error(`Astro page is missing for contracted route ${route}`);
  }
}
for (const page of allPages) {
  if (!contractedRoutes.includes(page.route)) {
    throw new Error(`Astro page is outside route contract: ${page.route}`);
  }
}

export function getPublicPages(): PublicPage[] {
  return contractedRoutes.map((route) => pageByRoute.get(route)!);
}

export function getPublicPage(route: string): PublicPage {
  const page = pageByRoute.get(route);
  if (!page) throw new Error(`Public page is missing for ${route}`);
  return page;
}

export const catalogSnapshotMeta = {
  id: catalogSnapshot.snapshotId,
  revision: catalogSnapshot.contentRevision,
  generatedAt: catalogSnapshot.generatedAt,
};
