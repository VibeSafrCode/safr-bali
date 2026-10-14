import assert from "node:assert/strict";
import test from "node:test";

// This test process emulates the explicit compile-time Yoga flag, not a URL.
Object.defineProperty(globalThis, "__YOGA_MINI_APP__", { value: true, configurable: true });
Object.defineProperty(globalThis, "window", { value: { location: {
  origin: "https://yoga.example.invalid", pathname: "/yoga-preview/mini-app/",
} }, configurable: true });
const { createApiClient } = await import("../src/api/client");
const { authenticateYogaMiniApp, miniAppDocumentPath, miniAppSrcSet } = await import("../src/runtime/yoga-mini-app");

test("Actual Yoga client ignores a Main API origin and keeps cookies on nested same-origin paths", async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const api = createApiClient({ baseUrl: "https://main.example.invalid", fetchImplementation: async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(String(url).endsWith("/yoga-account") ? {
      telegram_id: 987654321, locale: "ru", balance: 0, referral_count: 0, orders: [], referral_payload: "r_ABCDEFGH",
    } : { authenticated: true }), { headers: { "content-type": "application/json" } });
  } });
  const dashboard = await authenticateYogaMiniApp(api, "query_id=opaque&hash=signature");
  assert.equal(api.origin, "https://yoga.example.invalid");
  assert.deepEqual(calls.map((row) => row.url), [
    "https://yoga.example.invalid/yoga-preview/mini-app/api/mini-app/auth/yoga-session",
    "https://yoga.example.invalid/yoga-preview/mini-app/api/mini-app/yoga-account",
  ]);
  assert.ok(calls.every((row) => row.options?.credentials === "include"));
  assert.equal(dashboard?.referral_link, "https://t.me/Yoga_ganster_bot?start=r_ABCDEFGH");
});

test("Actual Yoga client refuses unexpected Main/admin requests before transport", async () => {
  let sent = 0;
  const api = createApiClient({ fetchImplementation: async () => { sent++; throw new Error("must not send"); } });
  await assert.rejects(api.request("/api/web/admin/clients"), /Unsupported Mini App request/);
  await assert.rejects(api.request("https://other.invalid/mini-app/me"), /Unsupported Mini App request/);
  await assert.rejects(api.request("/mini-app/auth/session", { method: "POST" }), /Unsupported Mini App request/);
  assert.equal(sent, 0);
});

test("Yoga srcset and protected document navigation do not escape to the Main root", () => {
  assert.equal(miniAppSrcSet("/assets/heroes/night-768.webp 768w, /assets/heroes/night-1536.webp 1536w"),
    "/yoga-preview/mini-app/assets/heroes/night-768.webp 768w, /yoga-preview/mini-app/assets/heroes/night-1536.webp 1536w");
  assert.equal(miniAppDocumentPath("/mini-app/visa-cases/1/documents/2"),
    "/yoga-preview/mini-app/api/mini-app/visa-cases/1/documents/2");
});
