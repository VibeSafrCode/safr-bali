import { defineConfig } from "astro/config";
import { fileURLToPath } from 'node:url';
import { youtubePreview } from "./scripts/youtube-preview.mjs";
import { registryPreview } from "./scripts/registry-preview.mjs";
import { previewBrand } from '../shared/src/preview-brand.mjs';

const brand=previewBrand(process.env.SAFRWAY_PREVIEW_BRAND);
const previewBase=process.env.SAFRWAY_PREVIEW_BASE_PATH??'';
if(!['','/yoga-preview'].includes(previewBase)||(!brand&&previewBase))throw new Error('Invalid preview base');
if(brand&&process.argv.some(arg=>arg==='dev'||arg==='preview'))
  throw new Error('York is served only by scripts/serve-york-preview.mjs, never the live Astro preview plugins');

export default defineConfig({
  site: brand ? undefined : "https://safrway.online",
  // Astro writes generated collection types relative to root, not cacheDir.
  // A separate root prevents preview builds from replacing SAFRWAY's types.
  ...(brand ? {
    root:fileURLToPath(new URL('./src-york/',import.meta.url)),srcDir:'./src-york',
    outDir:previewBase?'./dist-yoga-https-preview':'./dist-york-preview',publicDir:'./src-york/public',
    cacheDir:'./node_modules/.astro-york',
  } : {}),
  output: "static",
  trailingSlash: "always",
  // Keep the bundled pricing module external under the existing strict CSP.
  vite: {
    plugins: brand ? [] : [youtubePreview(), registryPreview()],
    build: { assetsInlineLimit: 0 },
    // Raw-file URLs must not bypass the protected editorial preview.
    server: { fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**",
      "**/shared/content/service-registry.v1.json", "**/shared/content/registry-approvals.v1.json",
      "**/shared/content/registry-presentation-approvals.v1.json",
      "**/shared/content/registry-public-build.v1.json",
      "**/shared/content/registry-d1-d2-build.v1.json",
      "**/shared/content/registry-copy/**"] } },
  },
  build: {
    format: "directory",
    // Production CSP permits only same-origin stylesheets, including tiny scoped CSS.
    inlineStylesheets: "never",
  },
  devToolbar: {
    enabled: false,
  },
});
