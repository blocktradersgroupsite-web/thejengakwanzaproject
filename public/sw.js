// JENGAKWANZA Progressive Web App Service Worker
// Provides high-speed asset caching and full offline capability

const CACHE_NAME = 'jengakwanza-cache-v1';
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'assets/logo.jpg',
  'js/print.js',
  'js/state.js',
  'js/firebase-config.js',
  'js/firebase-adapter.js',
  'js/api.js',
  'js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache error (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip caching non-GET requests or Firebase RTDB data requests (handled by OfflineStore)
  if (req.method !== 'GET' || url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // Cache-First strategy for local static assets
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset immediately, but fetch update in background (Stale-While-Revalidate)
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // If not in cache, fetch from network and cache for next time
      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML page navigation when offline
        if (req.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
