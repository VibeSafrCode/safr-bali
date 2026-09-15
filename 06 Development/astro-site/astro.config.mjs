import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://safrway.online",
  output: "static",
  trailingSlash: "always",
  // Keep the bundled pricing module external under the existing strict CSP.
  vite: { build: { assetsInlineLimit: 0 } },
  build: {
    format: "directory",
    // Production CSP permits only same-origin stylesheets, including tiny scoped CSS.
    inlineStylesheets: "never",
  },
  devToolbar: {
    enabled: false,
  },
});
