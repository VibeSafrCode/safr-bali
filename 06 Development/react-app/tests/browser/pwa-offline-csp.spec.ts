import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Playwright 1.51 needs this for setOffline AND routing to cover the worker,
// otherwise the page is offline while its worker can still fetch online HTML.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const root = fileURLToPath(new URL("../../", import.meta.url));
const productionConfig = readFileSync(new URL("../../../deploy/nginx/safr-target-production.conf", import.meta.url), "utf8");
const expectedKeys = ["/assets/pwa/icon-192.png", "/assets/pwa/icon-512.png", "/assets/pwa/icon.svg", "/assets/pwa/offline.css", "/manifest.webmanifest", "/offline.html"];
let server: ChildProcess;
let origin: string;

async function startOrigin(port = "0") {
  server = spawn(process.execPath, ["tests/static-server.mjs"], {
    cwd: root,
    env: { ...process.env, SAFR_REACT_TEST_PORT: port, SAFR_REACT_TEST_PWA_CSP: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  origin = await new Promise<string>((resolve, reject) => {
    let output = "";
    server.on("error", reject);
    server.on("exit", (code) => reject(new Error(`CSP fixture exited: ${code}`)));
    server.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/SAFR React test server (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    server.stderr!.on("data", (chunk) => { output += String(chunk); });
  });
}

async function stopOrigin() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
    server.kill("SIGTERM");
    await stopped;
  }
}

test.beforeAll(async () => { await startOrigin(); });
test.afterAll(stopOrigin);

for (const routePath of ["/account/", "/admin/"]) {
  test(`real CSP offline navigation, native retry and recovery: ${routePath}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", serviceWorkers: "allow" });
    const page = await context.newPage();
    const cspViolations: string[] = [];
    const mutations: string[] = [];
    await context.exposeBinding("recordCspViolation", (_source, directive: string) => cspViolations.push(directive));
    await context.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => {
      void (window as typeof window & { recordCspViolation: (directive: string) => Promise<void> }).recordCspViolation(event.violatedDirective);
    }));
    await context.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") { mutations.push(route.request().method()); return route.abort(); }
      const path = new URL(route.request().url()).pathname;
      const body = path === "/api/web/admin/session"
        ? { authenticated: true, actor: { first_name: "Fixture", role: "admin", locale: "en" }, csrf_token: "fixture" }
        : path === "/api/web/auth/me" ? { authenticated: true, first_name: "Fixture", csrf_token: "fixture" }
          : path === "/api/web/account" ? { telegram_id: 618, first_name: "Fixture", locale: "en", balance: 0, referral_count: 0, referral_link: null, orders: [] }
            : { new_users_7d: 0, active_visa_cases: 0, open_conversations: 0, orders_attention: 0, referral_missing_rows: 0, visa_cases_attention: 0 };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    try {
      const response = await page.goto(origin + routePath);
      const csp = response!.headers()["content-security-policy"];
      expect(csp).toBeTruthy();
      expect(productionConfig).toContain(`Content-Security-Policy "${csp}"`);
      expect(csp).not.toContain("unsafe-inline");
      for (const resource of expectedKeys) {
        const shellResponse = await page.request.get(origin + resource);
        expect(shellResponse.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
        expect(shellResponse.headers()["content-security-policy"]).toBe(csp);
      }
      const missingResponse = await page.request.get(origin + "/assets/pwa/missing.png");
      expect(missingResponse.status()).toBe(404);
      expect(missingResponse.headers()["cache-control"]).toBe("no-store, no-cache, must-revalidate");
      const onlineHeading = routePath === "/account/" ? /Hello, Fixture/ : "Overview";
      await expect(page.getByRole("heading", { name: onlineHeading, level: 1 })).toBeVisible();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      const cacheKeys = await page.evaluate(async () => (await (await caches.open("safrway-shell-v3")).keys()).map((entry) => new URL(entry.url).pathname).sort());
      expect(cacheKeys).toEqual(expectedKeys);
      // Chromium 134 can report worker navigator.onLine=false yet still fetch
      // online after a native form retry. Stop our isolated origin as well:
      // real connection failure must exercise the worker's actual fallback.
      const originPort = new URL(origin).port;
      await stopOrigin();
      await expect(fetch(origin + "/offline.html", { cache: "no-store" })).rejects.toThrow();
      await context.setOffline(true);
      const offlineResponse = await page.goto(origin + routePath);
      expect(offlineResponse!.fromServiceWorker()).toBe(true);
      expect(await offlineResponse!.text()).toBe(readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8"));
      await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 25, 20)");
      await expect(page.locator("body")).toHaveCSS("color", "rgb(244, 239, 230)");
      await expect(page.getByRole("button", { name: "Повторить" })).toHaveCSS("min-height", "48px");
      const [retried] = await Promise.all([
        page.waitForNavigation(),
        page.getByRole("button", { name: "Повторить" }).click(),
      ]);
      expect(retried!.fromServiceWorker()).toBe(true);
      expect(await retried!.text()).toBe(readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8"));
      expect(new URL(page.url()).pathname).toBe(routePath);
      await expect(page.getByRole("heading", { name: "Нет соединения" })).toBeVisible();
      await startOrigin(originPort);
      await context.setOffline(false);
      await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Повторить" }).click()]);
      expect(new URL(page.url()).pathname).toBe(routePath);
      await expect(page.getByRole("heading", { name: onlineHeading, level: 1 })).toBeVisible();
      expect(cspViolations).toEqual([]);
      expect(mutations).toEqual([]);
      const finalKeys = await page.evaluate(async () => (await (await caches.open("safrway-shell-v3")).keys()).map((entry) => new URL(entry.url).pathname).sort());
      expect(finalKeys).toEqual(expectedKeys);
    } finally {
      await context.close();
    }
  });
}
