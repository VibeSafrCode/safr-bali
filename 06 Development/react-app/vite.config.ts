import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = process.env.SAFRWAY_BUILD_ID ?? "local";

export default defineConfig({
  plugins: [react(), {
    name: "safrway-build-version",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "build-version.json", source: JSON.stringify({ build_id: buildId }) });
    },
  }],
  define: {
    __SAFRWAY_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep the existing route-level lazy boundaries and byte budget. This
        // immutable public caption dataset is shared data, not app startup code.
        codeSplitting: {
          groups: [{ name: "public-i18n", test: /[\\/]shared[\\/]content[\\/]generated[\\/]i18n[\\/]public\.v1\.json(?:\?|$)/ }],
        },
      },
      input: {
        miniApp: resolve(__dirname, "index.html"),
        account: resolve(__dirname, "account/index.html"),
        admin: resolve(__dirname, "admin/index.html"),
      },
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, "..")],
    },
  },
});
