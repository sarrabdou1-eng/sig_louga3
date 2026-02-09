// Service Worker - SIG Louga PWA
// Gestion avancée du cache et support complet du offline
// Version: 2.0

const CACHE_VERSION = 'sig-louga-v2';
const CACHE_NAME = `${CACHE_VERSION}-${new Date().toISOString().split('T')[0]}`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const RESOURCES_CACHE = `${CACHE_VERSION}-resources`;
const API_CACHE = `${CACHE_VERSION}-api`;
const GEO_CACHE = `${CACHE_VERSION}-geolocation`;

// Resources essentielles pour fonctionner hors-ligne
const ESSENTIAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/custom.css',
  './css/leaflet.css',
  './js/leaflet.js',
  './sw.js'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installation en cours...', CACHE_NAME);
  
  event.waitUntil(
    Promise.all([
      // Mettre en cache les fichiers essentiels
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Mise en cache des fichiers essentiels');
        return cache.addAll(ESSENTIAL_FILES).catch((err) => {
          console.warn('[SW] Erreur lors du cache des fichiers essentiels:', err);
          // Continuer même si quelques fichiers manquent
          return ESSENTIAL_FILES.reduce((promise, url) => {
            return promise.then(() =>
              cache.add(url).catch(() => console.warn(`[SW] Impossible de cacher: ${url}`))
            );
          }, Promise.resolve());
        });
      })
    ]).then(() => {
      console.log('[SW] Installation terminée');
      return self.skipWaiting();
    })
  );
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation en cours...');
  
  event.waitUntil(
    // Nettoyer les anciens caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.startsWith(CACHE_VERSION)) {
            console.log('[SW] Suppression du cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation terminée');
      return self.clients.claim();
    })
  );
});

// Stratégies de cache
// 1. Network First: Essayer le réseau d'abord, puis le cache
const networkFirst = (request, cacheName) => {
  return fetch(request)
    .then((response) => {
      if (!response || response.status !== 200 || response.type === 'error') {
        return response;
      }
      
      // Cloner la réponse pour la mettre en cache
      const responseToCache = response.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, responseToCache);
      });
      
      return response;
    })
    .catch(() => caches.match(request));
};

// 2. Cache First: Vérifier le cache d'abord, puis le réseau
const cacheFirst = (request, cacheName) => {
  return caches.match(request).then((response) => {
    if (response) return response;
    
    return fetch(request).then((response) => {
      if (!response || response.status !== 200) return response;
      
      const responseToCache = response.clone();
      caches.open(cacheName).then((cache) => {
        cache.put(request, responseToCache);
      });
      
      return response;
    });
  });
};

// 3. Stale While Revalidate: Retourner le cache immédiatement, puis mettre à jour
const staleWhileRevalidate = (request, cacheName) => {
  return caches.match(request).then((response) => {
    const fetchPromise = fetch(request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(cacheName).then((cache) => {
          cache.put(request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => response);
    
    return response || fetchPromise;
  });
};

// Traitement des requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-HTTP(S)
  if (!url.protocol.startsWith('http')) return;
  
  // Ignorer certains domaines
  if (url.hostname.includes('google-analytics') || 
      url.hostname.includes('tracking')) {
    return;}
  
  // ========== STRATÉGIE: HTML - Network First ==========
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      networkFirst(request, RUNTIME_CACHE)
        .catch(() => caches.match('./index.html') || 
          new Response('Page non disponible. Vérifiez votre connexion.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          })
        )
    );
    return;
  }
  
  // ========== STRATÉGIE: CSS & JS - Cache First avec revalidation ==========
  if (request.method === 'GET' && (
      request.url.includes('.css') || 
      request.url.includes('.js') ||
      request.url.includes('.woff') ||
      request.url.includes('.woff2') ||
      request.url.includes('.ttf')
  )) {
    event.respondWith(
      staleWhileRevalidate(request, RESOURCES_CACHE)
    );
    return;
  }
  
  // ========== STRATÉGIE: Images - Cache First ==========
  if (request.method === 'GET' && (
      request.url.includes('.png') || 
      request.url.includes('.jpg') ||
      request.url.includes('.jpeg') ||
      request.url.includes('.gif') ||
      request.url.includes('.svg') ||
      request.url.includes('.webp')
  )) {
    event.respondWith(
      cacheFirst(request, RESOURCES_CACHE)
        .catch(() => new Response('', { status: 404 }))
    );
    return;
  }
  
  // ========== STRATÉGIE: GeoJSON & Données - Network First ==========
  if (request.method === 'GET' && (
      request.url.includes('.geojson') || 
      request.url.includes('data/')
  )) {
    event.respondWith(
      networkFirst(request, GEO_CACHE)
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // ========== STRATÉGIE: API & Tuiles - Network First avec fallback ==========
  if (request.method === 'GET' && (
      request.url.includes('tile.') || 
      request.url.includes('tiles') ||
      request.url.includes('nominatim') ||
      request.url.includes('api')
  )) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request) || new Response('Ressource non disponible hors-ligne', {
            status: 503,
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        })
    );
    return;
  }
  
  // ========== STRATÉGIE PAR DÉFAUT: Network First ==========
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
      .catch(() => {
        return caches.match(request) || new Response('Offline', {
          status: 503,
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});

// ========== Gestion des messages depuis les clients ==========
self.addEventListener('message', (event) => {
  console.log('[SW] Message reçu:', event.data);
  
  // Sauter l'attente (mettre à jour maintenant)
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Vider tous les caches
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
        .then(() => {
          event.ports[0].postMessage({ success: true });
          console.log('[SW] Caches vidés');
        });
    });
  }
  
  // Synchronisation en arrière-plan pour les données de géolocalisation
  if (event.data && event.data.type === 'SYNC_GEOLOCATION') {
    // Stocker la géolocalisation en cache pour utilisation hors-ligne
    const geoData = event.data.payload;
    caches.open(GEO_CACHE).then((cache) => {
      cache.put('localstorage://last-geolocation', 
        new Response(JSON.stringify(geoData), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
      console.log('[SW] Géolocalisation synchronisée');
    });
  }
});

// ========== Synchronisation en arrière-plan (Background Sync) ==========
self.addEventListener('sync', (event) => {
  console.log('[SW] Événement de synchronisation:', event.tag);
  
  if (event.tag === 'sync-geolocation') {
    event.waitUntil(
      // Syncer les données de géolocalisation si disponibles
      caches.open(GEO_CACHE).then((cache) => {
        return cache.match('localstorage://last-geolocation')
          .then((response) => {
            if (response) {
              console.log('[SW] Géolocalisation trouvée en cache');
              return response.json();
            }
          });
      }).catch((err) => {
        console.warn('[SW] Erreur de synchronisation:', err);
      })
    );
  }
});

// ========== Push Notifications (optionnel) ==========
self.addEventListener('push', (event) => {
  console.log('[SW] Notification push reçue');
  
  const options = {
    body: 'Nouvelle mise à jour disponible',
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    tag: 'sig-louga-notification',
    requireInteraction: false
  };
  
  event.waitUntil(
    self.registration.showNotification('SIG Louga', options)
  );
});

console.log('[SW] Service Worker chargé et prêt');

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
