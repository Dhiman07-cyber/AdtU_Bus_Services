// public/sw.js - Service Worker for PWA
const CACHE_NAME = 'adtubus-cache-v1';
const isDevelopment = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

const urlsToCache = [
  '/',
  '/manifest.json',
  '/icons/icon-72x72.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event fired');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Cache installation failed:', err);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip caching for API routes and HMR
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/_next/') ||
      url.pathname.includes('hot-update')) {
    return;
  }

  // In development, only handle basic caching for PWA functionality
  if (isDevelopment) {
    // For development, just handle basic caching for the main routes
    if (url.pathname === '/' || url.pathname === '/manifest.json') {
      event.respondWith(
        caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            return fetch(event.request);
          })
      );
    }
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Don't cache if not a success response
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
      .catch((error) => {
        console.error('[SW] Fetch failed:', error);
        throw error;
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event fired');

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

