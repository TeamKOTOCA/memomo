const CACHE = 'memomo-static-v1';
const OFFLINE_URLS = ['/', '/app.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const network = await fetch(request);
      const cache = await caches.open(CACHE);
      cache.put(request, network.clone());
      return network;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return caches.match('/');
    }
  })());
});
