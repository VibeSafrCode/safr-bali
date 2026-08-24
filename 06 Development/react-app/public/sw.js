const CACHE_VERSION = "safrway-shell-v1";
const STATIC_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/pwa/icon.svg",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isSafeStatic(request, url) {
  return request.method === "GET" && url.origin === self.location.origin && (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/mini-app/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (!isSafeStatic(request, url)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
