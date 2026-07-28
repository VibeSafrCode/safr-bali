import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://safrway.online",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  devToolbar: {
    enabled: false,
  },
});
