// Service Worker - SIG Louga PWA
// Support hors-ligne et mise en cache stratégique

const CACHE_NAME = 'sig-louga-v1';
const RUNTIME_CACHE = 'sig-louga-runtime-v1';
const RESOURCES_CACHE = 'sig-louga-resources-v1';

// Resources essentielles pour fonctionner hors-ligne
const ESSENTIAL_FILES = [
  '/sig_louga2/index.html',
  '/sig_louga2/css/custom.css',
  '/sig_louga2/js/custom_ui.js',
  '/sig_louga2/js/leaflet.js',
  '/sig_louga2/manifest.json',
  '/sig_louga2/icons/icon-192.png'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Mise en cache des fichiers essentiels');
      return cache.addAll(ESSENTIAL_FILES).catch((err) => {
        console.warn('Service Worker: Erreur lors du cache des fichiers essentiels', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activation en cours...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== RESOURCES_CACHE) {
            console.log('Service Worker: Suppression du cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de cache: Network first pour HTML, Cache first pour les assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-HTTP(S)
  if (!url.protocol.startsWith('http')) return;

  // HTML: Network first
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((response) => {
            return response || new Response('Hors-ligne. Essayez une version en cache.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
        })
    );
    return;
  }

  // CSS, JS, images: Cache first
  if (request.method === 'GET' && 
      (request.url.includes('.css') || request.url.includes('.js') || request.url.includes(('icon' || 'image' || 'png' || 'jpg' )))) {
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) return response;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          const responseToCache = response.clone();
          caches.open(RESOURCES_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        }).catch(() => {
          // Fallback pour images manquantes
          if (request.url.includes('icon') || request.url.includes('image') || request.url.includes('.png')) {
            return new Response('', { status: 404 });
          }
          throw new Error('Network request failed');
        });
      })
    );
    return;
  }

  // Données GeoJSON: Network first avec fallback
  if (request.url.includes('.js') && request.url.includes('data')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Autres requêtes: Network first avec cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Gestion des messages depuis les clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    });
  }
});

// Notification de mise à jour
self.addEventListener('install', () => {
  self.addEventListener('activate', () => {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED' });
      });
    });
  });
});
