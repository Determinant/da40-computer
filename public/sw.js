const CACHE_PREFIX = "da40-";
const CACHE_NAME = `${CACHE_PREFIX}static-__DA40_BUILD_ID__`;
const PRECACHE_URLS = /* __DA40_PRECACHE_URLS__ */ [];
const APP_URLS = [
  new URL("./da40.html", self.registration.scope),
  new URL("./da62.html", self.registration.scope),
];
const SCOPE_URL = new URL(self.registration.scope);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = PRECACHE_URLS.map(relativeUrl => new Request(
      new URL(relativeUrl, self.registration.scope),
      { cache: "reload" },
    ));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
      .map(cacheName => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const requestedAppUrl = APP_URLS.find(appUrl => requestUrl.pathname === appUrl.pathname);
    const isAppNavigation = event.request.mode === "navigate" &&
      (requestedAppUrl !== undefined || requestUrl.pathname === SCOPE_URL.pathname);
    if (isAppNavigation) {
      const appShell = await caches.match(requestedAppUrl ?? APP_URLS[0]);
      if (appShell) {
        return appShell;
      }
    }

    return fetch(event.request);
  })());
});
