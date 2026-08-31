// Service worker con cache shell dell'app e fallback offline.
const APP_CACHE = "diritti-visita-app-shell-v7";
const RUNTIME_CACHE = "diritti-visita-runtime-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app-core.js",
  "./app-bootstrap.js",
  "./app-events.js",
  "./app-pdf.js",
  "./pdf-lib.min.js",
  "./modulo-ufficiale.pdf",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const cloned = response.clone();
          const shouldCache =
            request.url.startsWith(self.location.origin) &&
            (request.destination === "image" || request.url.includes(".pdf"));

          if (shouldCache) {
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned));
          }

          return response;
        })
        .catch(() => {
          if (request.destination === "image") {
            return caches.match("./icon-192.png");
          }
          return caches.match("./index.html");
        });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});