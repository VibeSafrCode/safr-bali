// This namespace belongs only to this worker. Never delete other apps' caches.
const CACHE_PREFIX = "safrway-shell-";
const CACHE_VERSION = `${CACHE_PREFIX}v3`;
const STATIC_SHELL = [
  "/offline.html",
  "/assets/pwa/offline.css",
  "/manifest.webmanifest",
  "/assets/pwa/icon.svg",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png",
];
const SHELL_TYPES = {
  "/offline.html": ["text/html"],
  "/assets/pwa/offline.css": ["text/css"],
  "/manifest.webmanifest": ["application/manifest+json", "application/json"],
  "/assets/pwa/icon.svg": ["image/svg+xml"],
  "/assets/pwa/icon-192.png": ["image/png"],
  "/assets/pwa/icon-512.png": ["image/png"],
};

function isPublicShellResponse(response, path) {
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const cacheControl = response.headers.get("cache-control") || "";
  return response.ok && response.type === "basic" && !response.redirected &&
    SHELL_TYPES[path]?.includes(type) && !/\b(private|no-store)\b/i.test(cacheControl) &&
    !response.headers.get("vary")?.split(",").some((value) => ["*", "cookie", "authorization"].includes(value.trim().toLowerCase()));
}

function fetchPublicShell(path) {
  // Fixed public resources only; never carry a signed-in session into CacheStorage.
  return fetch(new Request(new URL(path, self.location.origin), {
    credentials: "omit", cache: "no-cache", redirect: "error",
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const responses = await Promise.all(STATIC_SHELL.map(async (path) => {
      const response = await fetchPublicShell(path);
      if (!isPublicShellResponse(response, path)) throw new Error("Invalid public offline shell");
      return response;
    }));
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(STATIC_SHELL.map((path, index) => cache.put(path, responses[index])));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

function isSafeStatic(request, url) {
  // The finite keyspace bounds this cache to six entries, including under
  // concurrent fetches. Query variants, bundles and user uploads stay network-only.
  return request.method === "GET" && url.origin === self.location.origin &&
    !url.search && STATIC_SHELL.includes(url.pathname) &&
    !request.headers.has("authorization") && !request.headers.has("range");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname === "/api" || url.pathname.startsWith("/api/") ||
      url.pathname === "/mini-app" || url.pathname.startsWith("/mini-app/")) return;
  if (request.mode === "navigate") {
    // Authenticated HTML is always network-only. Only a connection failure gets
    // the generic offline screen, never a cached account or an HTTP-error mask.
    event.respondWith(fetch(request).catch(async () => {
      let cached;
      try { cached = await (await caches.open(CACHE_VERSION)).match("/offline.html"); } catch { /* Storage may be disabled. */ }
      return cached || new Response("Offline", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }));
    return;
  }
  if (!isSafeStatic(request, url)) return;
  const responsePromise = (async () => {
    // Network-first keeps non-fingerprinted manifest/icons current. Offline
    // fallback is scoped to this version, not another application's cache.
    let cache;
    try { cache = await caches.open(CACHE_VERSION); } catch { /* Storage may be disabled. */ }
    let response;
    try { response = await fetchPublicShell(url.pathname); } catch (error) {
      const cached = await cache?.match(url.pathname);
      if (cached) return cached;
      throw error;
    }
    if (cache && isPublicShellResponse(response, url.pathname)) {
      try { await cache.put(url.pathname, response.clone()); } catch { /* Quota must not break a successful fetch. */ }
    }
    return response;
  })();
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise.then(() => undefined, () => undefined));
});
