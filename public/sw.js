// =========================================================================
// SERVICE WORKER MOTORS 2L - OFFLINE CACHE & MOBILE PWA ENGINE
// =========================================================================

const CACHE_NAME = 'motors2l-cache-v16';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/css/style.css',
  '/js/app.js',
  '/js/i18n.js',
  '/js/admin.js',
  '/i18n/fr.json',
  '/i18n/en.json',
  '/manifest.json',
  '/logo/1000087306.jpg',
  '/header-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching core assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Clearing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes d'API et WebSockets (laisser passer en réseau direct)
  if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        return response;
      }).catch(() => {
        // Fallback si hors ligne
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});