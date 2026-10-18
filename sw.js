const CACHE = 'lanatimohome-v7';
// Relative Pfade, damit es auch unter /lanatimohome/ auf GitHub Pages funktioniert
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Nur eigene Dateien cachen; Supabase, APIs und CDNs gehen immer direkt ans Netz
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;

  // Network-first: immer die neueste Version laden, Cache nur wenn offline
  e.respondWith(
    fetch(e.request).then(networkResponse => {
      if (networkResponse.ok) {
        const copy = networkResponse.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, copy));
      }
      return networkResponse;
    }).catch(() => caches.match(e.request).then(cached => cached || Response.error()))
  );
});
