import { defineConfig } from "@playwright/test";

const smokeBuild =
  process.env.SAFR_SMOKE_BUILD ?? "artifacts/build-next-export";

export default defineConfig({
  testDir: "./tests",
  testMatch: /browser-smoke\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
  webServer: {
    command: `node tests/static-server.mjs ${smokeBuild} 4173`,
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
