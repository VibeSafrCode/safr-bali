import { defineConfig } from "astro/config";
import { youtubePreview } from "./scripts/youtube-preview.mjs";
import { registryPreview } from "./scripts/registry-preview.mjs";

export default defineConfig({
  site: "https://safrway.online",
  output: "static",
  trailingSlash: "always",
  // Keep the bundled pricing module external under the existing strict CSP.
  vite: {
    plugins: [youtubePreview(), registryPreview()],
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
