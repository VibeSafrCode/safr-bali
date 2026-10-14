import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import {publicOgTypeface} from "../../lib/public-og-typeface.mjs";
import {renderPublicOgTitle} from "../../lib/public-og-layout.mjs";
import {publicSiteEntries} from '../../lib/public-site-publication';
import {publicOgCategory} from '../../lib/public-display-captions.js';

export const getStaticPaths: GetStaticPaths = () => {
  const pages=publicSiteEntries().map(row=>({...row.page,locale:row.locale}));
  return pages.map((page) => ({
    params: { path: page.route.replace(/^\/|\/$/g, "") || "home" },
    props: { title: page.title, visa: page.route.includes("/visas/"), guide: page.route.includes("/guides/"), locale: "locale" in page?page.locale:page.route.startsWith("/en/")?"en":"ru" },
  }));
};

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export const GET: APIRoute = async ({ props }) => {
  const typeface = publicOgTypeface(props.locale);
  const title = await renderPublicOgTitle(sharp, props.title, props.locale);
  const category = xml(publicOgCategory(props.visa,props.guide,props.locale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xml:lang="${typeface.language}" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#080c15"/><rect x="24" y="24" width="1152" height="582" rx="28" fill="#111827" stroke="#39465d"/><circle cx="1090" cy="110" r="56" fill="#f58260"/><text x="72" y="104" font-family="${xml(typeface.brandFamily)}" font-size="42" letter-spacing="6" fill="#f5f1e7">SAFRWAY</text><text x="72" y="159" font-family="${xml(typeface.family)}" font-size="20" letter-spacing="3" fill="#f58260">${category}</text><text x="72" y="565" font-family="${xml(typeface.family)}" font-size="22" fill="#bdc7d8">safrway.online</text></svg>`;
  const png = await sharp(Buffer.from(svg))
    .composite([{input:title.data,left:title.left,top:title.top}])
    .png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
