/* Meditation Copilot service worker
 * Release checklist: bump CACHE_VERSION here AND the ?v= number on the css/js links in index.html. */
const CACHE_VERSION = 'v14';
const CACHE = 'meditation-copilot-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/quotes.js',
  './js/core.js',
  './js/diag.js',
  './js/challenge.js',
  './js/rewards.js',
  './js/roadmap.js',
  './js/sessions-ui.js',
  './js/timer.js',
  './js/insights.js',
  './js/home.js',
  './js/knowledge.js',
  './js/learn.js',
  './js/calendar.js',
  './js/vendor/qrcode.js',
  './js/events.js',
  './js/sync.js',
  './js/account.js',
  './js/profile.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('meditation-copilot-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // WhatsApp etc. go straight to the network

  // Pages: network first (so updates arrive), fall back to the cached app shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Scripts & styles: always revalidate with the server (bypassing a stale browser cache) so code
  // updates arrive together with the page; fall back to the cached copy offline.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Everything else (icons, manifest): cache first.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
