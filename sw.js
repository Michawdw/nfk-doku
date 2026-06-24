/* Service Worker – Precache der App-Shell für vollständigen Offline-Betrieb.
   Cache-Version bei jeder Änderung der Asset-Liste erhöhen. */
const CACHE = 'nfk-doku-v2';

const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/app.js',
  './js/template.js',
  './js/photos.js',
  './js/overview.js',
  './js/export-zip.js',
  './js/bautagebuch.js',
  './lib/jszip.min.js',
  './lib/exceljs.min.js',
  './manifest.webmanifest',
  './assets/vorlage_bautagebuch.xlsx',
  './assets/beispiel_bilddoku_template.xlsx',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Cache-first für alle gleichherkünftigen statischen Assets.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Nur erfolgreiche, gleichherkünftige Antworten nachcachen.
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
