const CACHE = 'da40-v21';
const CDN = 'https://cdn.jsdelivr.net/gh/masotime/json-url@master/dist/browser/json-url.js';
const FILES = [
  './',
  './da40.html',
  './assets/js/chart-trace.js',
  './assets/js/da40.js',
  './assets/fonts/B612-Regular.ttf',
  './assets/charts/takeoff-chart.svg',
  './assets/charts/landing-chart.svg',
  './assets/charts/takeoff-climb-chart.svg',
  './assets/charts/cruise-climb-chart.svg',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(FILES);
      await cache.add(CDN).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, {ignoreSearch: true}).then(cached => cached || fetch(event.request))
  );
});
