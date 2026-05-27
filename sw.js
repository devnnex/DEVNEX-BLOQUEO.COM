const CACHE_NAME = "devnex-pwa-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/backgrounds/stars.svg",
  "./assets/icons/favicon.png",
  "./assets/icons/favicon-192.png",
  "./assets/icons/favicon-512.png",
  "./assets/logos/devnex-mark.svg",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/animations.css",
  "./css/responsive.css",
  "./js/app.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/auth.js",
  "./js/charts.js",
  "./js/projects.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
