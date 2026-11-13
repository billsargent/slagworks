// Offline cache for the installed PWA (used on Xbox / Edge). Network first, cache fallback.
const CACHE = 'slagworks-v3';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  ...['main', 'util', 'data', 'state', 'world', 'sim', 'sprites', 'terrain', 'render', 'input', 'audio', 'ui', 'player', 'save', 'settings', 'mapview', 'blueprint', 'fluids', 'trains', 'robots', 'kv'].map(n => `src/${n}.js`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
