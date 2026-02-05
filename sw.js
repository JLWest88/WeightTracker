const CACHE_NAME = "wt-cache-2026-02-05.1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: cache the app shell for offline use
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches and take control immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch:
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests (your site)
  if (url.origin !== self.location.origin) return;

  // 1) Page navigations — network first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 2) Core assets that must update reliably — network first
  const isCoreAsset =
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/manifest.json");

  if (isCoreAsset) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) Everything else — cache first (fine for icons, etc.)
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
















