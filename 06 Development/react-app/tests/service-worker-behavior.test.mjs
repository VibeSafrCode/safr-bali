import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://app.safrway.online";
const currentCache = "safrway-shell-v3";
const shell = ["/offline.html", "/manifest.webmanifest", "/assets/pwa/icon.svg", "/assets/pwa/icon-192.png", "/assets/pwa/icon-512.png", "/assets/pwa/offline.css"];
const absolute = (input) => new URL(typeof input === "string" ? input : input.url, origin).href;

function response(body = "public", { type = "basic", redirected = false, contentType = "image/png", headers = {}, status = 200 } = {}) {
  const value = new Response(body, { status, headers: { "content-type": contentType, ...headers } });
  Object.defineProperties(value, { type: { value: type }, redirected: { value: redirected } });
  value.clone = () => response(body, { type, redirected, contentType, headers, status });
  return value;
}

function harness() {
  const listeners = new Map();
  const stores = new Map();
  const requests = [];
  let claims = 0;
  let skipped = 0;
  const state = { failOpen: false, failPut: false, beforePut: async () => {} };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async open(name) {
      if (state.failOpen) throw new Error("Storage unavailable");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) { return store.get(absolute(key))?.clone(); },
        async put(key, value) {
          await state.beforePut();
          if (state.failPut) throw new Error("Quota exceeded");
          store.set(absolute(key), value.clone());
        },
      };
    },
  };
  state.network = async (request) => {
    const path = new URL(request.url).pathname;
    const contentType = path === "/offline.html" ? "text/html" : path.endsWith("webmanifest") ? "application/manifest+json" : path.endsWith("svg") ? "image/svg+xml" : path.endsWith("css") ? "text/css" : "image/png";
    return response("network:" + path, { contentType });
  };
  vm.runInNewContext(source, {
    URL, Request, Response, caches,
    fetch: async (request) => { requests.push(request); return state.network(request); },
    self: {
      location: { origin },
      clients: { async claim() { claims += 1; } },
      async skipWaiting() { skipped += 1; },
      addEventListener(name, listener) { listeners.set(name, listener); },
    },
  });
  function dispatch(name, data = {}) {
    const pending = [];
    let result;
    const event = {
      ...data,
      waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { assert.equal(result, undefined); result = promise; },
    };
    listeners.get(name)(event);
    return { get response() { return result; }, get lifetimeCount() { return pending.length; }, done: () => Promise.all(pending) };
  }
  function request(path, { method = "GET", mode = "cors", headers = {} } = {}) {
    return dispatch("fetch", { request: { url: new URL(path, origin).href, method, mode, headers: new Headers(headers) } });
  }
  return { caches, stores, requests, state, dispatch, request, claims: () => claims, skipped: () => skipped };
}

test("install fetches only six public shell resources without session credentials", async () => {
  const h = harness();
  await h.dispatch("install").done();
  assert.deepEqual(h.requests.map((request) => new URL(request.url).pathname).sort(), [...shell].sort());
  assert.ok(h.requests.every((request) => request.credentials === "omit" && request.redirect === "error" && request.cache === "no-cache"));
  assert.equal(h.stores.get(currentCache).size, 6);
  assert.equal(h.skipped(), 0, "updates require explicit acceptance");
});

test("invalid install does not publish a partial cache or accept an HTML fallback as an icon", async () => {
  const h = harness();
  h.state.network = async () => response("login page", { contentType: "text/html" });
  await assert.rejects(h.dispatch("install").done(), /Invalid public offline shell/);
  assert.equal(h.stores.has(currentCache), false);
});

test("activation deletes only older owned cache versions before claiming clients", async () => {
  const h = harness();
  for (const name of ["safrway-shell-v1", "safrway-shell-v2", currentCache, "another-app-v1", "safrway-other"]) await h.caches.open(name);
  await h.dispatch("activate").done();
  assert.deepEqual(await h.caches.keys(), [currentCache, "another-app-v1", "safrway-other"]);
  assert.equal(h.claims(), 1);
});

test("explicit update message extends the worker lifetime; other messages do nothing", async () => {
  const h = harness();
  assert.equal(h.dispatch("message", { data: { type: "OTHER" } }).lifetimeCount, 0);
  const event = h.dispatch("message", { data: { type: "SKIP_WAITING" } });
  assert.equal(event.lifetimeCount, 1);
  await event.done();
  assert.equal(h.skipped(), 1);
});

test("API, mutation, arbitrary assets, query variants, signed and cross-origin requests are not intercepted", () => {
  const h = harness();
  for (const path of ["/api", "/api/web/account", "/mini-app", "/mini-app/me", "/assets/private.pdf", "/assets/build.js", "/build-version.json", "/manifest.webmanifest?v=123", "https://other.example/assets/pwa/icon.svg"]) {
    assert.equal(h.request(path).response, undefined, path);
  }
  assert.equal(h.request("/api/web/account", { mode: "navigate" }).response, undefined);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) assert.equal(h.request(shell[2], { method }).response, undefined);
  assert.equal(h.request(shell[2], { headers: { authorization: "Bearer example" } }).response, undefined);
  assert.equal(h.request(shell[2], { headers: { range: "bytes=0-10" } }).response, undefined);
  assert.equal(h.requests.length, 0);
  assert.equal(h.stores.size, 0);
});

test("account navigation always reaches network and is never stored, including HTTP errors", async () => {
  const h = harness();
  h.state.network = async () => response("private account", { contentType: "text/html" });
  assert.equal(await (await h.request("/account/", { mode: "navigate" }).response).text(), "private account");
  h.state.network = async () => response("unavailable", { status: 503, contentType: "text/html" });
  assert.equal((await h.request("/admin/", { mode: "navigate" }).response).status, 503);
  assert.equal(h.stores.size, 0);
});

test("navigation outage uses only the current version's generic offline page", async () => {
  const h = harness();
  await (await h.caches.open("other-app")).put("/offline.html", response("foreign HTML"));
  await (await h.caches.open(currentCache)).put("/offline.html", response("generic offline", { contentType: "text/html" }));
  h.state.network = async () => { throw new Error("Offline"); };
  assert.equal(await (await h.request("/account/", { mode: "navigate" }).response).text(), "generic offline");
  h.stores.delete(currentCache);
  const fallback = await h.request("/account/", { mode: "navigate" }).response;
  assert.equal(fallback.status, 503);
  assert.equal(await fallback.text(), "Offline");
  h.state.failOpen = true;
  assert.equal((await h.request("/admin/", { mode: "navigate" }).response).status, 503);
});

test("non-fingerprinted shell refreshes online and falls back to that version offline", async () => {
  const h = harness();
  await h.dispatch("install").done();
  h.state.network = async () => response("updated icon", { contentType: "image/svg+xml" });
  const event = h.request(shell[2]);
  assert.equal(await (await event.response).text(), "updated icon");
  await event.done();
  h.state.network = async () => { throw new Error("Offline"); };
  assert.equal(await (await h.request(shell[2]).response).text(), "updated icon");
  assert.equal(h.stores.get(currentCache).size, 6);
});

test("concurrent fetches remain bounded to the six canonical keys", async () => {
  const h = harness();
  const events = Array.from({ length: 100 }, (_, index) => h.request(shell[index % shell.length]));
  await Promise.all(events.map(async (event) => { await event.response; await event.done(); }));
  assert.equal(h.stores.get(currentCache).size, 6);
  assert.deepEqual([...h.stores.get(currentCache).keys()].sort(), shell.map(absolute).sort());
});

test("cache write stays within fetch lifetime rather than an untracked promise", async () => {
  const h = harness();
  let release;
  h.state.beforePut = () => new Promise((resolve) => { release = resolve; });
  const event = h.request(shell[3]);
  let finished = false;
  const done = event.done().then(() => { finished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(event.lifetimeCount, 1);
  assert.equal(finished, false);
  assert.equal(h.stores.get(currentCache).size, 0);
  release();
  await done;
  assert.equal((await event.response).status, 200);
  assert.equal(h.stores.get(currentCache).size, 1);
});

test("quota or unavailable storage cannot break a successful network response", async () => {
  for (const field of ["failOpen", "failPut"]) {
    const h = harness();
    h.state[field] = true;
    const event = h.request(shell[3]);
    assert.equal((await event.response).status, 200);
    await event.done();
  }
});

test("private, no-store, redirected, opaque, HTML and unsuccessful responses are never cached", async () => {
  for (const options of [
    { headers: { "cache-control": "private, max-age=60" } },
    { headers: { "cache-control": "no-store" } },
    { headers: { vary: "Accept-Encoding, Cookie" } },
    { headers: { vary: "Authorization" } },
    { headers: { vary: "*" } },
    { redirected: true }, { type: "opaque" }, { contentType: "text/html" }, { status: 500 },
  ]) {
    const h = harness();
    h.state.network = async () => response("do not store", options);
    const event = h.request(shell[3]);
    await event.response;
    await event.done();
    assert.equal(h.stores.get(currentCache).size, 0, JSON.stringify(options));
  }
});

test("missing offline static resource fails without reading a foreign cache", async () => {
  const h = harness();
  await (await h.caches.open("other-app")).put(shell[3], response("foreign asset"));
  h.state.network = async () => { throw new Error("Offline"); };
  const event = h.request(shell[3]);
  await assert.rejects(event.response, /Offline/);
  await event.done();
});
