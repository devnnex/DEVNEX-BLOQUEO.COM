const CACHE_NAME = "devnex-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/backgrounds/stars.svg",
  "./assets/icons/favicon.png",
  "./assets/icons/favicon-192.png",
  "./assets/icons/favicon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/notification-badge.png",
  "./assets/logos/devnex-mark.svg",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/animations.css",
  "./css/responsive.css",
  "./css/payments.css",
  "./js/app.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/auth.js",
  "./js/charts.js",
  "./js/projects.js",
  "./js/project-guard.js",
  "./js/pwa.js",
  "./js/private-store.js",
  "./js/payment-model.js",
  "./js/payments.js",
  "./js/notifications.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch (_) { /* Always display incoming pushes. */ }
  const base = new URL(self.registration.scope);
  let target = new URL(payload.url || "./index.html#payments", base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) target = new URL("./index.html#payments", base);
  event.waitUntil(self.registration.showNotification(String(payload.title || "DEVNEX · Recordatorio").slice(0,100), {
    body: String(payload.body || "Tienes una novedad en tu panel de control.").slice(0,240),
    icon: new URL("./assets/icons/favicon-192.png", base).href,
    badge: new URL("./assets/icons/notification-badge.png", base).href,
    tag: String(payload.tag || "devnex-update"),
    data: { url: target.href },
    actions: [{ action: "open", title: "Ver en DEVNEX" }]
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const base = new URL(self.registration.scope);
  let target = new URL(event.notification.data?.url || "./index.html#payments", base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) target = new URL("./index.html#payments", base);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(client => client.url.startsWith(base.href));
    if (client) { await client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("devnex-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || !APP_SHELL.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Fresh source online, cached shell offline. Never cache project/API responses.
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(() => caches.match(request)));
});
