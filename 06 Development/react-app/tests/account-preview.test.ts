import assert from "node:assert/strict";
import test from "node:test";
import { accountPreview, previewAccountPath, previewRequestPath } from "../src/api/account-preview";
import { accountRouteTab } from "../src/components/client-navigation";
import { createApiClient } from "../src/api/client";

const path = "/account/preview/14/life/";
test("preview navigation preserves the target through all customer sections", () => {
  for (const section of ["life", "visas", "profile", "orders", "referrals", "points", "overview", "home", "services/bali/visas"]) {
    const next = previewAccountPath(`/account/${section}/`, path);
    assert.equal(accountPreview(next)?.userId, 14);
    assert.equal(accountPreview(next)?.accountPath, `/account/${section}/`);
    assert.equal(accountRouteTab(accountPreview(next)!.accountPath), section.startsWith("services") ? "services" : section);
  }
  assert.equal(previewAccountPath("/account/life/", "/account/profile/"), "/account/life/");
});

test("only supported reads map to a client-scoped admin endpoint", () => {
  for (const resource of ["account", "life-services", "visa-cases", "visa-cases/51", "chat"]) {
    assert.equal(previewRequestPath(`/api/web/${resource}`, "GET", path), `/api/web/admin/clients/14/account-preview/${resource}`);
  }
  assert.equal(previewRequestPath("/api/catalog/pricing", "GET", path), "/api/catalog/pricing");
  for (const request of ["/api/web/auth/me", "/api/web/admin/session", "/api/web/account?user_id=9", "/mini-app/dashboard", "https://evil.example/api/web/account", "/api/web/visa-cases/1/documents/4", "/api/web/account/../auth/me"]) {
    assert.throws(() => previewRequestPath(request, "GET", path));
  }
});

test("malformed preview targets fail closed and all writes are blocked", () => {
  for (const pathname of ["/account/preview/0/life/", "/account/preview/-14/life/", "/account/preview/abc/life/", "/account/preview/9007199254740993/life/"]) {
    assert.equal(accountPreview(pathname), null);
    assert.throws(() => previewRequestPath("/api/web/account", "GET", pathname));
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) assert.throws(() => previewRequestPath("/api/web/chat", method, path));
  assert.equal(previewRequestPath("/api/web/chat/messages", "POST", "/account/support/"), "/api/web/chat/messages");
});

test("preview transport never fetches blocked writes or the administrator's own account", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: { url: string; options?: RequestInit }[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://app.example", pathname: path } } });
  try {
    const api = createApiClient({ fetchImplementation: (async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ items: [] }), { headers: { "Content-Type": "application/json" } });
    }) as typeof fetch });
    await api.request("/api/web/life-services");
    assert.equal(calls[0].url, "https://app.example/api/web/admin/clients/14/account-preview/life-services");
    assert.equal(calls[0].options?.cache, "no-store");
    assert.equal(calls[0].options?.credentials, "include");
    await assert.rejects(api.request("/api/web/chat/messages", { method: "POST", body: "test" }));
    await assert.rejects(api.request("/api/web/auth/logout", { method: "POST" }));
    await assert.rejects(api.request("/api/web/auth/me"));
    assert.equal(calls.length, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
