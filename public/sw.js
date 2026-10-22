// JENGAKWANZA Progressive Web App Service Worker
// Ultra-fast Offline Support + Instant Asset Updates
const CACHE_NAME = 'jengakwanza-cache-v14';
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
        console.warn('Pre-cache warning (non-fatal):', err);
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
            console.log('Purging previous cache:', key);
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

  // Never intercept non-GET requests, API routes, Firebase cloud RTDB or Google endpoints
  if (
    req.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('postimg.cc')
  ) {
    return;
  }

  // Network-First with Cache Fallback for instant updates + reliable offline operation
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('index.html');
          if (fallback) return fallback;
        }
        return new Response('Network unavailable and resource not cached offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
