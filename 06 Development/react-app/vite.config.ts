import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
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
