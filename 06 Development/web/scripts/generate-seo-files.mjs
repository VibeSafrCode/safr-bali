import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const routes = JSON.parse(
  await readFile(resolve("tests", "public-routes.json"), "utf8"),
);
const indexableRoutes = routes.filter(
  ({ buildPath }) =>
    !["/account/", "/mini-app/", "/privacy/"].includes(buildPath),
);
const allowGptBot = process.env.SAFR_ALLOW_GPTBOT === "true";
const privatePaths = ["/account/", "/mini-app/", "/api/", "/auth/"];

const robots = [
  "User-Agent: *",
  "Allow: /",
  ...privatePaths.map((path) => `Disallow: ${path}`),
  "",
  "User-Agent: OAI-SearchBot",
  "Allow: /",
  ...privatePaths.map((path) => `Disallow: ${path}`),
  "",
  "User-Agent: GPTBot",
  ...(allowGptBot
    ? ["Allow: /", ...privatePaths.map((path) => `Disallow: ${path}`)]
    : ["Disallow: /"]),
  "",
  "Sitemap: https://safrway.online/sitemap.xml",
  "",
].join("\n");

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexableRoutes.map(
    ({ buildPath, publicUrl }) =>
      [
        "  <url>",
        `    <loc>${publicUrl}</loc>`,
        `    <changefreq>${buildPath === "/" ? "weekly" : "monthly"}</changefreq>`,
        `    <priority>${
          buildPath === "/" ? "1.0" : buildPath === "/catalog/" ? "0.9" : "0.7"
        }</priority>`,
        "  </url>",
      ].join("\n"),
  ),
  "</urlset>",
  "",
].join("\n");

await mkdir("public", { recursive: true });
await writeFile(resolve("public", "robots.txt"), robots, "utf8");
await writeFile(resolve("public", "sitemap.xml"), sitemap, "utf8");
