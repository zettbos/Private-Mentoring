const CACHE_NAME = 'zettbos-pwa-cache-v3.9.18';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  './apple-touch-icon.png'
];

// 1. Install Event: Cache Core Shell untuk Mode Offline / Sinyal Jelek
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

// 2. Activate Event: Bersihkan Cache Versi Lawas
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

// 3. Fetch Event: Network-First untuk API/HTML Terbaru, Fallback instan ke Cache saat Offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Jangan cache request langsung ke API eksternal (Supabase, Fonnte, Google Script)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('fonnte.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResp) => {
        if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone)).catch(() => {});
        }
        return networkResp;
      })
      .catch(() => {
        return caches.match(req).then((cachedResp) => {
          return cachedResp || caches.match('./index.html');
        });
      })
  );
});

// 4. Background Sync & Periodic Sync (Standar PWABuilder Microsoft)
self.addEventListener('sync', (event) => {
  if (event.tag === 'zettbos-offline-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }));
      })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'zettbos-live-check') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'PERIODIC_LIVE_CHECK' }));
      })
    );
  }
});

// 5. Push Notification & Notification Click Handler untuk APK PWABuilder
self.addEventListener('push', (event) => {
  let payload = {
    title: '🔔 Zettbos Private Mentoring',
    body: 'Ada pembaruan data antrean baru.',
    icon: './icon-192.png',
    badge: './icon-192.png'
  };
  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = Object.assign(payload, parsed);
    } catch (e) {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || './icon-192.png',
      badge: payload.badge || './icon-192.png',
      vibrate: [200, 100, 200],
      data: payload.data || { url: './index.html' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});
