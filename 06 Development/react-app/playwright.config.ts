import { defineConfig } from "@playwright/test";

const localChromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.CHROME_PATH ??
  (process.platform === "darwin" ? localChromePath : undefined);

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4323",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: `"${process.execPath}" tests/static-server.mjs`,
    port: 4323,
    reuseExistingServer: false,
  },
});
