import type { APIRoute } from "astro";

import { getPilotPages } from "../lib/pilot-content";
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
  const pages = (await getPilotPages()).filter((page) => page.data.indexable);
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${escapeXml(canonicalUrl(page.data.route))}</loc>
    <lastmod>${page.data.lastmod.toISOString().slice(0, 10)}</lastmod>
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
