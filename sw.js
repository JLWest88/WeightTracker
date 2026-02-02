const CACHE_NAME = "wt-cache-v6";
const ASSETS = [
  "./",
  "./index.html",
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
// - For the main page load (navigation), try the network first so updates come through.
// - For everything else, use cache first for speed/offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Page navigations (loading the app) — network first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return resp;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Everything else — cache first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});





