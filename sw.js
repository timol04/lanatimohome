const CACHE = 'lanatimohome-v13';
// Relative Pfade, damit es auch unter /lanatimohome/ auf GitHub Pages funktioniert
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './assets/hintergrund.jpg',
  './manifest.json',
  './js/config.js',
  './js/core.js',
  './js/edit.js',
  './js/dashboard.js',
  './js/screensaver.js',
  './js/main.js',
  './js/widgets/shopping.js',
  './js/widgets/todo.js',
  './js/widgets/info.js',
  './js/widgets/countdowns.js',
  './js/widgets/notes.js',
  './js/widgets/food.js',
  './js/widgets/chores.js',
  './js/widgets/packages.js',
  './js/widgets/wishlist.js',
  './js/widgets/budget.js'
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
