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
};

const SITE_ORIGIN = "https://safrway.online";

export function canonicalUrl(route: string): string {
  return new URL(route, SITE_ORIGIN).toString();
}

export function jsonLdForPage(input: SeoInput) {
  const canonical = canonicalUrl(input.route);
  const breadcrumbItems = [
    ...(input.route === "/" ? [] : [{ label: "Главная", href: "/" }]),
    ...input.breadcrumbs.filter((item) => item.href !== "/"),
    { label: input.title, href: input.route },
  ];

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
      inLanguage: "ru",
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
      inLanguage: "ru",
      isPartOf: {
        "@id": `${SITE_ORIGIN}/#website`,
      },
    },
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
