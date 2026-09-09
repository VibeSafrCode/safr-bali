type Breadcrumb = {
  label: string;
  href: string;
};

type SeoInput = {
  route: string;
  title: string;
  description: string;
  indexable: boolean;
  breadcrumbs: Breadcrumb[];
  locale: "ru" | "en";
  homeLabel: string;
  lastModified?: string;
  download?: {
    href: string;
    fileName: string;
    mediaType: string;
    sizeBytes: number;
    language: string;
    updatedAt: string;
  };
};

const SITE_ORIGIN = "https://safrway.online";

export function canonicalUrl(route: string): string {
  return new URL(route, SITE_ORIGIN).toString();
}

export function ogImagePath(route: string): string {
  return route === "/404/" ? "/og.png" : `/og/${route.replace(/^\/|\/$/g, "") || "home"}.png`;
}

export function jsonLdForPage(input: SeoInput) {
  const canonical = canonicalUrl(input.route);
  const breadcrumbCandidates = [
    ...(input.route === "/" || input.route === "/en/"
      ? []
      : [{ label: input.homeLabel, href: input.locale === "en" ? "/en/" : "/" }]),
    ...input.breadcrumbs,
    { label: input.title, href: input.route },
  ];
  const breadcrumbItems = breadcrumbCandidates.filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) => canonicalUrl(candidate.href) === canonicalUrl(item.href),
      ) === index,
  );

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "SAFRWAY",
      url: `${SITE_ORIGIN}/`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: "SAFRWAY",
      url: `${SITE_ORIGIN}/`,
      inLanguage: input.locale,
      publisher: {
        "@id": `${SITE_ORIGIN}/#organization`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: input.title,
      description: input.description,
      inLanguage: input.locale,
      isPartOf: {
        "@id": `${SITE_ORIGIN}/#website`,
      },
      ...(input.lastModified ? { dateModified: input.lastModified } : {}),
    },
    ...(input.download
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": `${canonical}#article`,
            headline: input.title,
            description: input.description,
            inLanguage: input.locale,
            ...(input.lastModified ? { dateModified: input.lastModified } : {}),
            mainEntityOfPage: {
              "@id": `${canonical}#webpage`,
            },
            publisher: {
              "@id": `${SITE_ORIGIN}/#organization`,
            },
            associatedMedia: {
              "@type": "DigitalDocument",
              name: input.download.fileName,
              contentUrl: input.download.href,
              encodingFormat: input.download.mediaType,
              inLanguage: input.download.language,
              contentSize: `${input.download.sizeBytes} B`,
              dateModified: input.download.updatedAt,
            },
          },
        ]
      : []),
    ...(breadcrumbItems.length > 1
      ? [
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.label,
              item: canonicalUrl(item.href),
            })),
          },
        ]
      : []),
  ];
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
