const CACHE_NAME = 'propreel-v3';
const urlsToCache = [
  // HTML is deliberately NOT precached: a cached document replays its
  // original response headers, including a Content-Security-Policy from an
  // older deploy. Navigations always hit the network (see fetch handler).
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Take over open tabs immediately: an older worker may still be serving
  // cached HTML with pre-deploy headers (stale CSP), and waiting for every
  // tab to close could delay that fix by days.
  self.skipWaiting();
});

// Fetch event — strategy depends on the request:
//   • /assets/* (content-hashed, immutable) → cache-first (instant, safe)
//   • everything else (HTML navigations especially) → network-first with
//     cache fallback, so deploys reach users immediately instead of after
//     an indefinite cache-first stall
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls — always go to network
  if (event.request.url.includes('/api/')) return;

  // Navigations (HTML documents) go straight to the network. Serving a
  // cached document would replay its original response headers — including
  // a stale Content-Security-Policy from an older deploy — so the enforcing
  // policy and deploy freshness both depend on this bypass.
  if (event.request.mode === 'navigate') return;

  // Cross-origin (fonts, S3 media, analytics) — never intercept. The worker
  // scope carries our own CSP, whose connect-src would otherwise block these
  // passthrough fetch()es and fail the request outright when enforcing.
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/assets/')) {
    // Immutable hashed assets: cache-first
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML and other same-origin files: network-first, cache fallback for offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim(),
    ])
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'PropReel Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
