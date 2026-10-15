import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { yogaCatalogI18nPlugin } from "./scripts/yoga-public-i18n.mjs";

export default defineConfig({
  base: "/yoga-preview/mini-app/",
  plugins: [react(), yogaCatalogI18nPlugin(), {
    name: "yoga-mini-app-entry",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html
        .replace('<html lang="ru">', '<html lang="ru" data-app-design="true" data-app-night="true" data-client-brand="yoga-gangster" class="dark" style="color-scheme:dark">')
        .replace('content="#f5f2ea"', 'content="#090909"')
        .replace('content="Telegram Mini App SAFRWAY: услуги, заявки и профиль."', 'content="Yoga Ganster Mini App: услуги, заявки и личный кабинет."')
        .replace('<title>SAFRWAY · Mini App</title>', '<title>Yoga Ganster · Mini App</title>')
        .replace('    <script src="/theme-init.js"></script>\n', '')
        .replace(/    <script\s+src="https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63"\s+data-safr-telegram-sdk="true"\s*><\/script>/,
          '    <script src="/yoga-telegram-sdk.js" defer data-yoga-telegram-bootstrap="true"></script>')
        .replace('<div id="root"></div>', '<div id="root"><div class="destination-backdrop" aria-hidden="true"></div><main class="status-screen" aria-busy="true"><h1>Yoga Ganster</h1><p id="yoga-bootstrap-status" role="status">Загрузка / Loading…</p></main></div>')
        .replace('src="/src/main.tsx"', 'src="/src/yoga-main.tsx"'),
    },
    async closeBundle() {
      // Build-only brand projection; leave the shared/Main public source intact.
      const source = await readFile(resolve(__dirname, "public/offline.html"), "utf8");
      await writeFile(resolve(__dirname, "dist-yoga-mini-app/offline.html"), source.replaceAll("SAFRWAY", "Yoga Ganster"));
    },
  }],
  define: {
    // This entry is always Yoga, even in a clean or contradictory build env.
    // Shared/Main presentation defaults and all business/auth code stay intact.
    "import.meta.env.VITE_CLIENT_BRAND": JSON.stringify("yoga-gangster"),
    __YOGA_MINI_APP__: "true",
    __SAFRWAY_BUILD_ID__: JSON.stringify(process.env.SAFRWAY_BUILD_ID ?? "yoga-mini-app-local"),
  },
  build: {
    outDir: "dist-yoga-mini-app",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: resolve(__dirname, "index.html") },
  },
  server: { fs: { allow: [resolve(__dirname, "..")] } },
});
