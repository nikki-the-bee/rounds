// Offline support: cache the app shell, serve from cache first.
const VERSION = 'rounds-v26';
const ASSETS = ['./', 'index.html', 'css/styles.css', 'js/util.js', 'js/catalog.js', 'js/store.js', 'js/ui.js', 'js/pages.js', 'js/forms.js', 'js/io.js', 'js/sync.js', 'js/main.js',
  'lib/xlsx.full.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
// cache: 'reload' skips the browser's HTTP cache so an update never mixes old and new files
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
