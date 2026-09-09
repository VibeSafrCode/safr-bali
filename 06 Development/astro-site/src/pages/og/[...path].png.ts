import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { getLocalizedPublicPages } from "../../lib/public-i18n";

export const getStaticPaths: GetStaticPaths = () =>
  [...getLocalizedPublicPages("ru"), ...getLocalizedPublicPages("en")].map((page) => ({
    params: { path: page.route.replace(/^\/|\/$/g, "") || "home" },
    props: { title: page.title, visa: page.route.includes("/visas/"), guide: page.route.includes("/guides/"), en: page.route.startsWith("/en/") },
  }));

const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export const GET: APIRoute = async ({ props }) => {
  const words = String(props.title).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).length > 32 && current) { lines.push(current); current = ""; }
    current += (current ? " " : "") + word;
  }
  if (current) lines.push(current);
  const title = lines.slice(0, 4).map((line, index) => `<text x="72" y="${245 + index * 70}" font-family="sans-serif" font-size="54" fill="#f5f1e7">${xml(line)}</text>`).join("");
  const category = xml(props.visa ? (props.en ? "VISA OVERVIEW" : "ВИЗОВАЯ СПРАВКА") : props.guide ? (props.en ? "TRAVEL GUIDE" : "ПУТЕВОДИТЕЛЬ") : (props.en ? "TRAVEL & SERVICES" : "ПОЕЗДКИ И УСЛУГИ"));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1914"/><rect x="24" y="24" width="1152" height="582" rx="28" fill="#142e24" stroke="#486356"/><circle cx="1090" cy="110" r="56" fill="#f58260"/><text x="72" y="104" font-family="serif" font-size="42" letter-spacing="6" fill="#f5f1e7">SAFRWAY</text><text x="72" y="159" font-family="sans-serif" font-size="20" letter-spacing="3" fill="#f58260">${category}</text>${title}<text x="72" y="565" font-family="sans-serif" font-size="22" fill="#b8c7be">safrway.online</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
