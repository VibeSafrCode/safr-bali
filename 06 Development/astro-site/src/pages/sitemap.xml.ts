import type { APIRoute } from "astro";

import { getLocalizedPublicPages, publicAlternates } from "../lib/public-i18n";
import { canonicalUrl } from "../lib/seo";
import {publicBuildEntries,publicEntryForRoute,publicAlternatesForRoute} from "../../scripts/registry-publication.mjs";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const legacyPages = [
    ...getLocalizedPublicPages("ru"),
    ...getLocalizedPublicPages("en"),
  ];
  const pages=[...new Map([...legacyPages,...publicBuildEntries().map(entry=>({route:entry.route,indexable:entry.indexable,
    publication:{lastmod:entry.lastModified}}))].map(page=>[page.route,page])).values()].filter(page=>page.indexable);
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${escapeXml(canonicalUrl(page.route))}</loc>
    ${(publicEntryForRoute(page.route)?publicAlternatesForRoute(page.route):publicAlternates(page.route)).map((entry) => `<xhtml:link rel="alternate" hreflang="${entry.locale}" href="${escapeXml(canonicalUrl(entry.href))}" />`).join("\n    ")}
    ${page.publication?.lastmod ? `<lastmod>${escapeXml(page.publication.lastmod)}</lastmod>` : ""}
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
