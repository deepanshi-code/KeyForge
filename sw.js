// Service worker: lets the installed app open offline.
// Strategy: network first (so updates show up immediately), falling back to
// the cached copy when offline. The whole app is one HTML file, so caching
// it plus the manifest and icon is enough.

const CACHE = "keyforge-v2";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  // Delete caches from older versions.
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  // Only handle our own GET requests.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Only keep good copies: caching a 404 or error page would show it offline.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached ?? caches.match("./index.html"))),
  );
});
