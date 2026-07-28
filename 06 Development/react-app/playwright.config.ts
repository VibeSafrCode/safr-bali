import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4323",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
  webServer: {
    command: "node tests/static-server.mjs",
    port: 4323,
    reuseExistingServer: false,
  },
});
