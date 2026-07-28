import type { APIRoute } from "astro";

import { getPublicPages } from "../lib/public-catalog";
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
  const pages = getPublicPages().filter((page) => page.indexable);
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${escapeXml(canonicalUrl(page.route))}</loc>
    <lastmod>2026-07-28</lastmod>
  </url>`,
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
