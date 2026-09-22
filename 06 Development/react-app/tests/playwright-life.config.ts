import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./browser",
  testMatch: ["life-services.spec.ts", "life-integrated.spec.ts"],
  timeout: 25_000,
  use: { baseURL: "http://127.0.0.1:4367", browserName: "chromium", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure", launchOptions: { executablePath: process.env.CHROME_PATH ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined) } },
  webServer: { command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4367 --strictPort`, cwd: fileURLToPath(new URL("..", import.meta.url)), port: 4367, reuseExistingServer: false },
});
