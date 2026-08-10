import type { APIRoute } from "astro";

import { getLocalizedPublicPages, localizedRoute, sourceRoute } from "../lib/public-i18n";
import { canonicalUrl } from "../lib/seo";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const pages = [
    ...getLocalizedPublicPages("ru"),
    ...getLocalizedPublicPages("en"),
  ].filter((page) => page.indexable);
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${escapeXml(canonicalUrl(page.route))}</loc>
    <xhtml:link rel="alternate" hreflang="ru" href="${escapeXml(canonicalUrl(localizedRoute(sourceRoute(page.route), "ru")))}" />
    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(canonicalUrl(localizedRoute(sourceRoute(page.route), "en")))}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(canonicalUrl(localizedRoute(sourceRoute(page.route), "ru")))}" />
    <lastmod>2026-07-28</lastmod>
  </url>`,
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};
