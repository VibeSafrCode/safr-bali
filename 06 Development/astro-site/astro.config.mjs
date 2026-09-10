import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://safrway.online",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
    // Production CSP permits only same-origin stylesheets, including tiny scoped CSS.
    inlineStylesheets: "never",
  },
  devToolbar: {
    enabled: false,
  },
  // Bundled pricing code must remain external under script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
